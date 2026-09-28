import { describe, expect, it } from 'vitest';
import { captureRepository, repositoryIdentity, LIMITS } from '../server/github.js';
const commit = 'a'.repeat(40),
  tree = 'b'.repeat(40),
  blob = 'c'.repeat(40);
function github({ overrides = {}, entries, truncated = false } = {}) {
  const calls = [];
  const responses = {
    '': { private: false, default_branch: 'main' },
    '/commits/main': { sha: commit, commit: { tree: { sha: tree } } },
    ['/git/trees/' + tree + '?recursive=1']: {
      truncated,
      tree: entries || [
        { path: 'package.json', mode: '100644', type: 'blob', size: 50, sha: blob },
      ],
    },
    ['/git/blobs/' + blob]: {
      encoding: 'base64',
      content: Buffer.from('{"scripts":{"test":"vitest run"}}').toString('base64'),
    },
    ...overrides,
  };
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const key = url.replace('https://api.github.com/repos/owner/repo', '');
    const data = responses[key];
    if (data instanceof Response) return data;
    if (data === undefined) throw new Error('Unexpected request: ' + key);
    return Response.json(data);
  };
  return { calls, fetchImpl };
}
describe('GitHub snapshot acquisition', () => {
  it.each([
    'http://github.com/a/b',
    'https://evil.test/a/b',
    'https://github.com/a/b/tree/main',
    'https://user:secret@github.com/a/b',
    'https://github.com/a/b?ref=main',
    'https://github.com:8080/a/b',
  ])('rejects unsupported URL %s', (value) => {
    expect(() => repositoryIdentity(value)).toThrow();
  });
  it('normalizes a repository URL without allowing arbitrary targets', () => {
    expect(repositoryIdentity('https://github.com/owner/repo.git/').repository).toBe('owner/repo');
  });
  it('reads only immutable tree/blob identities after resolving a moving branch', async () => {
    const mock = github();
    const snapshot = await captureRepository('https://github.com/owner/repo', '', mock);
    expect(snapshot.commit).toBe(commit);
    expect(snapshot.state).toBe('complete');
    expect(mock.calls.map((c) => c.url)).toEqual([
      'https://api.github.com/repos/owner/repo',
      'https://api.github.com/repos/owner/repo/commits/main',
      'https://api.github.com/repos/owner/repo/git/trees/' + tree + '?recursive=1',
      'https://api.github.com/repos/owner/repo/git/blobs/' + blob,
    ]);
    expect(mock.calls.every((c) => c.options.redirect === 'error')).toBe(true);
  });
  it('validates commit input before any network access', async () => {
    const mock = github();
    await expect(captureRepository('https://github.com/owner/repo', 'main', mock)).rejects.toThrow(
      '40-character',
    );
    expect(mock.calls).toHaveLength(0);
  });
  it('honors a requested SHA instead of rereading the branch', async () => {
    const mock = github({
      overrides: { ['/commits/' + commit]: { sha: commit, commit: { tree: { sha: tree } } } },
    });
    expect((await captureRepository('https://github.com/owner/repo', commit, mock)).commit).toBe(
      commit,
    );
    expect(mock.calls[1].url).toContain('/commits/' + commit);
  });
  it('rejects private repositories even when backend credentials exist', async () => {
    const mock = github({ overrides: { '': { private: true } } });
    await expect(captureRepository('https://github.com/owner/repo', '', mock)).rejects.toThrow(
      'Only public',
    );
  });
  it('reports truncated inventory and does not silently claim completeness', async () => {
    const snapshot = await captureRepository(
      'https://github.com/owner/repo',
      '',
      github({ truncated: true }),
    );
    expect(snapshot.state).toBe('partial');
    expect(snapshot.inventoryComplete).toBe(false);
  });
  it('skips links, submodules, oversized files, and source code without fetching them', async () => {
    const entries = [
      { path: 'package.json', mode: '120000', type: 'blob', sha: blob },
      {
        path: '.github/workflows/large.yml',
        mode: '100644',
        type: 'blob',
        size: LIMITS.fileBytes + 1,
        sha: blob,
      },
      { path: 'source.test.js', mode: '100644', type: 'blob', size: 5, sha: blob },
      { path: 'submodule', mode: '160000', type: 'commit', sha: blob },
    ];
    const mock = github({ entries });
    const snapshot = await captureRepository('https://github.com/owner/repo', '', mock);
    expect(mock.calls).toHaveLength(3);
    expect(snapshot.files).toHaveLength(0);
    expect(snapshot.exclusions).toHaveLength(2);
  });
  it('turns individual file retrieval errors into explicit partial capture', async () => {
    const mock = github({
      overrides: { ['/git/blobs/' + blob]: new Response('', { status: 429 }) },
    });
    const snapshot = await captureRepository('https://github.com/owner/repo', '', mock);
    expect(snapshot.state).toBe('partial');
    expect(snapshot.exclusions[0].reason).toContain('rate limit');
  });
  it('bounds the number of captured files', async () => {
    const mock = github();
    const snapshot = await captureRepository('https://github.com/owner/repo', '', {
      ...mock,
      limits: { ...LIMITS, files: 0 },
    });
    expect(snapshot.files).toHaveLength(0);
    expect(snapshot.state).toBe('partial');
  });
  it('fails clearly on inaccessible repositories', async () => {
    const mock = github({ overrides: { '': new Response('', { status: 404 }) } });
    await expect(captureRepository('https://github.com/owner/repo', '', mock)).rejects.toThrow(
      'inaccessible',
    );
  });
});
