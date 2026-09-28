import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../server/store.js';
import { createApp } from '../server/app.js';
import { demoSnapshot } from '../server/demo.js';
import { analyze } from '../server/rules.js';
import { AppError } from '../server/errors.js';
let store, app, scan;
beforeEach(() => {
  store = createStore(':memory:');
  app = createApp({ store });
  const snapshot = demoSnapshot();
  scan = store.saveScan(snapshot, analyze(snapshot));
});
afterEach(() => store.close());
function create() {
  return store.createTask({
    title: 'Investigate missing CI test invocation',
    findingIds: [scan.findings[2].id],
  });
}
function act(task, action, data = {}) {
  return store.act(task.id, { action, revision: task.revision, ...data });
}
function ready() {
  let task = create();
  task = act(task, 'decide', {
    decision: 'Confirmed issue',
    rationale: 'Requirement requires a CI test invocation.',
    criteria: 'The workflow declares npm test.',
  });
  const snapshot = demoSnapshot('after'),
    fixed = store.saveScan(snapshot, analyze(snapshot));
  return act(task, 'prepare', {
    targetCommit: fixed.commit,
    scanId: fixed.id,
    plan: 'Inspect the workflow at the target commit.',
  });
}
const proof = {
  method: 'Static inspection',
  expected: 'Workflow declares npm test.',
  actual: 'The run step contains npm test.',
  evidence: 'Captured ci.yml lines 9–10 at the recorded target commit.',
  criteriaCovered: true,
};
describe('task workflow and persistence', () => {
  it('groups findings once and preserves all source links', () => {
    const task = store.createTask({
      title: 'Review related setup conditions',
      findingIds: scan.findings.map((f) => f.id),
    });
    expect(task.findings).toHaveLength(3);
    expect(() => create()).toThrow('already belongs');
    const updated = act(task, 'attach', { findingIds: [scan.findings[0].id] });
    expect(updated.findings).toHaveLength(3);
    expect(store.listTasks()).toHaveLength(1);
  });
  it('rejects cross-repository grouping atomically', () => {
    const other = { ...demoSnapshot(), repository: 'another/repo' };
    const otherScan = store.saveScan(other, analyze(other));
    expect(() =>
      store.createTask({
        title: 'Wrong group',
        findingIds: [scan.findings[0].id, otherScan.findings[0].id],
      }),
    ).toThrow('same repository');
    expect(store.listTasks()).toHaveLength(0);
  });
  it('requires a decision rationale and observable criteria', () => {
    const task = create();
    expect(() =>
      act(task, 'decide', { decision: 'Confirmed issue', rationale: 'Investigated' }),
    ).toThrow('criteria');
    expect(store.getTask(task.id).status).toBe('Review');
  });
  it('closes an expected-behavior decision with its rationale', () => {
    const task = act(create(), 'decide', {
      decision: 'Expected behavior',
      rationale: 'This fixture intentionally exercises setup review.',
    });
    expect(task.status).toBe('Closed');
    expect(task.attempts).toHaveLength(0);
  });
  it('does not accept direct arbitrary status changes or verification before preparation', async () => {
    const task = create();
    expect(() => act(task, 'verify', { outcome: 'Passed', ...proof })).toThrow('in Verification');
    const response = await request(app)
      .post('/api/tasks/' + task.id + '/actions')
      .send({ revision: task.revision, action: 'close', status: 'Closed' });
    expect(response.status).toBe(400);
    expect(store.getTask(task.id).status).toBe('Review');
  });
  it('requires explicit evidence and coverage before closing a confirmed issue', () => {
    const task = ready();
    expect(() => act(task, 'verify', { ...proof, outcome: 'Passed', evidence: '' })).toThrow(
      'evidence',
    );
    expect(() =>
      act(task, 'verify', { ...proof, outcome: 'Passed', criteriaCovered: false }),
    ).toThrow('every verification');
    const closed = act(task, 'verify', { ...proof, outcome: 'Passed' });
    expect(closed.status).toBe('Closed');
    expect(closed.decision).toBe('Confirmed issue');
    expect(closed.attempts[0].targetCommit).toBe(task.verification.targetCommit);
  });
  it.each([
    ['Failed', 'Awaiting Fix'],
    ['Inconclusive', 'Verification'],
  ])('records %s verification without closing', (outcome, status) => {
    const task = act(ready(), 'verify', { ...proof, outcome });
    expect(task.status).toBe(status);
    expect(task.attempts).toHaveLength(1);
  });
  it('keeps history on reopening and prevents stale saves', () => {
    const closed = act(ready(), 'verify', { ...proof, outcome: 'Passed' });
    const opened = act(closed, 'reopen', { reason: 'A new requirement needs investigation.' });
    expect(opened.status).toBe('Review');
    expect(opened.decision).toBe('Undecided');
    expect(opened.attempts).toHaveLength(1);
    expect(opened.history.some((h) => h.type === 'Decision')).toBe(true);
    expect(() => act(closed, 'note', { text: 'Stale draft' })).toThrow('changed');
  });
  it('rescans preserve original captures and do not close tasks', () => {
    const task = create();
    const original = store.getScan(scan.id);
    const fixed = demoSnapshot('after');
    store.saveScan(fixed, analyze(fixed));
    expect(store.getScan(scan.id)).toEqual(original);
    expect(store.getTask(task.id).status).toBe('Review');
  });
  it('rejects a verification scan from another commit', () => {
    const task = act(create(), 'decide', {
      decision: 'Confirmed issue',
      rationale: 'Evidence',
      criteria: 'Observable fix',
    });
    expect(() =>
      act(task, 'prepare', { targetCommit: 'f'.repeat(40), scanId: scan.id, plan: 'Inspect' }),
    ).toThrow('match');
  });
  it('persists investigation notes after closing and reopening SQLite', () => {
    const dir = mkdtempSync(join(tmpdir(), 'inspecta-test-'));
    let durable = createStore(join(dir, 'db.sqlite'));
    try {
      const snapshot = demoSnapshot(),
        captured = durable.saveScan(snapshot, analyze(snapshot));
      let task = durable.createTask({
        title: 'Persistence',
        findingIds: [captured.findings[0].id],
      });
      task = durable.act(task.id, {
        action: 'note',
        revision: task.revision,
        text: 'Evidence from the original snapshot.',
      });
      durable.close();
      durable = createStore(join(dir, 'db.sqlite'));
      expect(durable.getTask(task.id).history.at(-1).text).toBe(
        'Evidence from the original snapshot.',
      );
      expect(durable.getScan(captured.id).commit).toBe(snapshot.commit);
    } finally {
      durable.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
describe('HTTP behavior', () => {
  it('validates URL input and keeps capture errors distinct from findings', async () => {
    expect((await request(app).post('/api/scans').send({ url: 'invalid' })).status).toBe(400);
    const failedApp = createApp({
      store,
      capture: async () => {
        throw new AppError('GitHub rate limit reached.', 502);
      },
    });
    const response = await request(failedApp)
      .post('/api/scans')
      .send({ url: 'https://github.com/owner/repo' });
    expect(response.status).toBe(502);
    const failed = store.getScan(response.body.scanId);
    expect(failed.state).toBe('failed');
    expect(failed.results).toHaveLength(0);
  });
  it('only permits one capture at a time', async () => {
    let release, entered;
    const pending = new Promise((r) => {
      release = r;
    });
    const started = new Promise((r) => {
      entered = r;
    });
    const gated = createApp({
      store,
      capture: async () => {
        entered();
        await pending;
        return demoSnapshot();
      },
    });
    const first = request(gated)
      .post('/api/scans')
      .send({ url: 'https://github.com/owner/repo' })
      .then((r) => r);
    await started;
    expect(
      (await request(gated).post('/api/scans').send({ url: 'https://github.com/owner/repo' }))
        .status,
    ).toBe(409);
    release();
    expect((await first).status).toBe(201);
  });
  it('rejects foreign browser-origin writes and reports missing records', async () => {
    expect(
      (await request(app).post('/api/demo').set('Origin', 'https://untrusted.example').send({}))
        .status,
    ).toBe(403);
    expect((await request(app).get('/api/tasks/missing')).status).toBe(404);
  });
  it('requires string action input fields instead of coercing objects', async () => {
    const task = create();
    const response = await request(app)
      .post('/api/tasks/' + task.id + '/actions')
      .send({ revision: task.revision, action: 'note', text: { code: 'oops' } });
    expect(response.status).toBe(400);
  });
});
