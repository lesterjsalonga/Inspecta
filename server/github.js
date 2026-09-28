import { AppError, commitSha } from './errors.js';
import { WORKFLOW_PATH } from './rules.js';

export const LIMITS = Object.freeze({
  inventory: 5000,
  files: 30,
  fileBytes: 256 * 1024,
  totalBytes: 2 * 1024 * 1024,
  timeoutMs: 30000,
});
export function repositoryIdentity(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new AppError(
      'Enter a public repository URL such as https://github.com/owner/repository.',
    );
  }
  const match = url.pathname.match(/^\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'github.com' ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !match ||
    ['.', '..'].includes(match[2])
  ) {
    throw new AppError(
      'Use an HTTPS github.com repository URL without a branch, query, or credentials.',
    );
  }
  return {
    repository: match[1] + '/' + match[2],
    url: 'https://github.com/' + match[1] + '/' + match[2],
  };
}
export async function captureRepository(
  input,
  sha,
  { fetchImpl = fetch, token = process.env.GITHUB_TOKEN, limits = LIMITS } = {},
) {
  const identity = repositoryIdentity(input);
  const requested = sha ? commitSha(sha) : null;
  const signal = AbortSignal.timeout(limits.timeoutMs);
  async function get(suffix) {
    let response;
    try {
      response = await fetchImpl('https://api.github.com/repos/' + identity.repository + suffix, {
        signal,
        redirect: 'error',
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Inspecta-local',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
      });
      if (!response.ok) {
        if (response.status === 403 || response.status === 429)
          throw new AppError(
            'GitHub denied access or its rate limit was reached. Retry later or configure a backend GitHub token.',
            502,
          );
        if (response.status === 404)
          throw new AppError('Repository or commit was not found or is inaccessible.', 404);
        throw new AppError('GitHub returned HTTP ' + response.status + '.', 502);
      }
      const reader = response.body.getReader();
      const chunks = [];
      let bytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 8 * 1024 * 1024) {
          await reader.cancel();
          throw new AppError('GitHub response exceeded the 8 MiB transport limit.', 502);
        }
        chunks.push(Buffer.from(value));
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        signal.aborted
          ? 'The GitHub scan exceeded its time limit.'
          : 'Could not retrieve GitHub data. Check connectivity and use the canonical repository URL.',
        502,
      );
    }
  }
  const metadata = await get('');
  if (metadata.private !== false) throw new AppError('Only public repositories are supported.');
  const ref = requested || metadata.default_branch;
  if (!ref) throw new AppError('This repository has no readable default branch.');
  const commit = await get('/commits/' + encodeURIComponent(ref));
  const resolved = commitSha(commit.sha);
  const treeSha = commitSha(commit.commit?.tree?.sha);
  const tree = await get('/git/trees/' + treeSha + '?recursive=1');
  if (!Array.isArray(tree.tree))
    throw new AppError('GitHub returned an invalid file inventory.', 502);
  const entries = tree.tree.slice(0, limits.inventory);
  const inventoryComplete = tree.truncated === false && tree.tree.length <= limits.inventory;
  const inventory = entries.filter((e) => e.type !== 'tree').map((e) => e.path);
  const candidates = entries
    .filter((e) => e.path === 'package.json' || WORKFLOW_PATH.test(e.path))
    .sort((a, b) =>
      a.path === 'package.json' ? -1 : b.path === 'package.json' ? 1 : a.path.localeCompare(b.path),
    );
  const files = [],
    exclusions = [];
  if (!inventoryComplete)
    exclusions.push({
      path: '(inventory)',
      reason: 'Inventory truncated or over ' + limits.inventory + ' entries.',
    });
  let totalBytes = 0,
    requests = 0;
  for (const entry of candidates) {
    let reason;
    if (!['100644', '100755'].includes(entry.mode) || entry.type !== 'blob')
      reason = 'Not a regular file; links and submodules are not followed.';
    else if (entry.size > limits.fileBytes) reason = 'File exceeds 256 KiB.';
    else if (requests >= limits.files) reason = 'Relevant-file retrieval limit reached.';
    if (reason) {
      exclusions.push({ path: entry.path, reason });
      continue;
    }
    requests++;
    try {
      const blobSha = commitSha(entry.sha);
      const blob = await get('/git/blobs/' + blobSha);
      if (blob.encoding !== 'base64') throw new AppError('Unsupported blob encoding.');
      const bytes = Buffer.from(blob.content, 'base64');
      if (bytes.length > limits.fileBytes || totalBytes + bytes.length > limits.totalBytes)
        throw new AppError('File or total capture byte limit exceeded.');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (text.includes('\0') || text.startsWith('version https://git-lfs.github.com/spec/'))
        throw new AppError('Binary files and Git LFS content are not inspected.');
      totalBytes += bytes.length;
      files.push({ path: entry.path, blob: blobSha, text });
    } catch (error) {
      exclusions.push({
        path: entry.path,
        reason: error instanceof AppError ? error.message : 'File is not valid UTF-8 text.',
      });
    }
  }
  return {
    ...identity,
    commit: resolved,
    source: 'github',
    inventory,
    inventoryComplete,
    files,
    exclusions,
    limits,
    totalBytes,
    state: exclusions.length ? 'partial' : 'complete',
  };
}
