import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { AppError, requireText, commitSha } from './errors.js';
import { RULESET_VERSION } from './rules.js';

const now = () => new Date().toISOString();
export function createStore(filename = 'data/inspecta.sqlite') {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
  db.exec(
    'CREATE TABLE IF NOT EXISTS scans (id TEXT PRIMARY KEY, repository TEXT NOT NULL, created TEXT NOT NULL, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS findings (id TEXT PRIMARY KEY, scan_id TEXT NOT NULL REFERENCES scans(id), data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS task_findings (finding_id TEXT PRIMARY KEY REFERENCES findings(id), task_id TEXT NOT NULL REFERENCES tasks(id));',
  );
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      db.exec('COMMIT');
      return value;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  function saveScan(snapshot, results = []) {
    const scan = {
      ...snapshot,
      id: randomUUID(),
      createdAt: now(),
      rulesetVersion: RULESET_VERSION,
      results,
    };
    transaction(() => {
      db.prepare('INSERT INTO scans VALUES (?, ?, ?, ?)').run(
        scan.id,
        scan.repository,
        scan.createdAt,
        JSON.stringify(scan),
      );
      for (const check of results.filter((r) => r.outcome === 'match')) {
        const finding = {
          ...check,
          id: randomUUID(),
          scanId: scan.id,
          commit: scan.commit,
          repository: scan.repository,
          source: scan.source,
        };
        db.prepare('INSERT INTO findings VALUES (?, ?, ?)').run(
          finding.id,
          scan.id,
          JSON.stringify(finding),
        );
      }
    });
    return getScan(scan.id);
  }
  function getFinding(id) {
    const row = db
      .prepare(
        'SELECT f.data, t.task_id FROM findings f LEFT JOIN task_findings t ON f.id=t.finding_id WHERE f.id=?',
      )
      .get(id);
    if (!row) throw new AppError('Finding not found.', 404);
    return { ...JSON.parse(row.data), taskId: row.task_id || null };
  }
  function getScan(id) {
    const row = db.prepare('SELECT data FROM scans WHERE id=?').get(id);
    if (!row) throw new AppError('Scan not found.', 404);
    return {
      ...JSON.parse(row.data),
      findings: db
        .prepare('SELECT id FROM findings WHERE scan_id=?')
        .all(id)
        .map((f) => getFinding(f.id)),
    };
  }
  function listScans() {
    return db
      .prepare('SELECT id FROM scans ORDER BY created DESC')
      .all()
      .map((row) => {
        const scan = getScan(row.id);
        const { files, inventory, findings, ...summary } = scan;
        return { ...summary, capturedFileCount: files?.length || 0, findingCount: findings.length };
      });
  }
  function getTask(id) {
    const row = db.prepare('SELECT data FROM tasks WHERE id=?').get(id);
    if (!row) throw new AppError('Task not found.', 404);
    return {
      ...JSON.parse(row.data),
      findings: db
        .prepare('SELECT finding_id FROM task_findings WHERE task_id=?')
        .all(id)
        .map((f) => getFinding(f.finding_id)),
    };
  }
  function validateFindings(ids, repository, allowTask) {
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 50 ||
      ids.some((id) => typeof id !== 'string')
    )
      throw new AppError('Select between 1 and 50 findings.');
    const found = [...new Set(ids)].map(getFinding);
    for (const finding of found) {
      if (repository && finding.repository !== repository)
        throw new AppError('Group findings from the same repository.');
      if (finding.taskId && finding.taskId !== allowTask)
        throw new AppError('A selected finding already belongs to another task.', 409);
    }
    if (new Set(found.map((f) => f.repository)).size !== 1)
      throw new AppError('Group findings from the same repository.');
    return found;
  }
  function writeTask(task) {
    const { findings, ...data } = task;
    db.prepare('UPDATE tasks SET data=? WHERE id=?').run(JSON.stringify(data), data.id);
  }
  function createTask(input) {
    const title = requireText(input.title, 'Task title', 160);
    return transaction(() => {
      const found = validateFindings(input.findingIds);
      const task = {
        id: randomUUID(),
        repository: found[0].repository,
        title,
        status: 'Review',
        decision: 'Undecided',
        createdAt: now(),
        updatedAt: now(),
        revision: 1,
        report: { steps: '', expected: '', actual: '', impact: '' },
        criteria: '',
        rationale: '',
        attempts: [],
        history: [
          {
            id: randomUUID(),
            at: now(),
            type: 'Created',
            text: 'Investigation opened with ' + found.length + ' finding(s).',
          },
        ],
      };
      db.prepare('INSERT INTO tasks VALUES (?, ?)').run(task.id, JSON.stringify(task));
      for (const finding of found)
        db.prepare('INSERT INTO task_findings VALUES (?, ?)').run(finding.id, task.id);
      return getTask(task.id);
    });
  }
  function act(id, input) {
    return transaction(() => {
      const task = getTask(id);
      if (input.revision !== task.revision)
        throw new AppError('This task changed. Reload it before saving.', 409);
      let event = { id: randomUUID(), at: now(), type: input.action, previousStatus: task.status };
      switch (input.action) {
        case 'note':
          event.type = 'Investigation note';
          event.text = requireText(input.text, 'Investigation note');
          break;
        case 'report':
          if (task.status === 'Closed')
            throw new AppError('Reopen the task before editing its report.');
          for (const key of ['steps', 'expected', 'actual', 'impact']) {
            if (typeof input[key] !== 'string' || input[key].length > 12000)
              throw new AppError('Report fields must be text of at most 12000 characters.');
            task.report[key] = input[key].trim();
          }
          event.type = 'Report updated';
          event.text = 'Expected behavior, observations, steps, and impact recorded.';
          event.report = { ...task.report };
          break;
        case 'attach': {
          if (task.status !== 'Review')
            throw new AppError('Return the task to Review before grouping additional findings.');
          const found = validateFindings(input.findingIds, task.repository, id);
          for (const finding of found)
            db.prepare('INSERT OR IGNORE INTO task_findings VALUES (?, ?)').run(finding.id, id);
          event.type = 'Findings linked';
          event.text = 'Linked findings to this investigation.';
          break;
        }
        case 'decide': {
          if (task.status !== 'Review') throw new AppError('Decisions can only be made in Review.');
          if (!['Confirmed issue', 'Expected behavior', 'False positive'].includes(input.decision))
            throw new AppError('Select a review decision.');
          task.rationale = requireText(input.rationale, 'Decision rationale');
          if (input.decision === 'Confirmed issue')
            task.criteria = requireText(input.criteria, 'Verification criteria');
          else task.criteria = '';
          task.decision = input.decision;
          task.status = input.decision === 'Confirmed issue' ? 'Awaiting Fix' : 'Closed';
          event.type = 'Decision';
          event.text = task.decision + ': ' + task.rationale;
          event.criteria = task.criteria;
          break;
        }
        case 'prepare': {
          if (task.status !== 'Awaiting Fix' || task.decision !== 'Confirmed issue')
            throw new AppError('Only a confirmed issue awaiting a fix can enter verification.');
          const targetCommit = commitSha(input.targetCommit);
          let scan = null;
          if (input.scanId) {
            scan = getScan(requireText(input.scanId, 'Scan ID', 60));
            if (scan.repository !== task.repository || scan.commit !== targetCommit)
              throw new AppError(
                'The verification scan must match this repository and target commit.',
              );
          }
          task.verification = {
            targetCommit,
            scanId: scan?.id || null,
            plan: requireText(input.plan, 'Verification plan'),
          };
          task.status = 'Verification';
          event.type = 'Verification prepared';
          event.text = task.verification.plan;
          event.targetCommit = targetCommit;
          break;
        }
        case 'verify': {
          if (task.status !== 'Verification' || task.decision !== 'Confirmed issue')
            throw new AppError('The task must be in Verification.');
          if (!['Passed', 'Failed', 'Inconclusive'].includes(input.outcome))
            throw new AppError('Select a verification outcome.');
          if (!['Static inspection', 'External execution evidence'].includes(input.method))
            throw new AppError('Select a verification method.');
          if (input.outcome === 'Passed' && input.criteriaCovered !== true)
            throw new AppError('Confirm that the evidence covers every verification criterion.');
          const attempt = {
            id: randomUUID(),
            at: now(),
            ...task.verification,
            method: input.method,
            outcome: input.outcome,
            expected: requireText(input.expected, 'Expected result'),
            actual: requireText(input.actual, 'Observed result'),
            evidence: requireText(input.evidence, 'Verification evidence'),
            criteria: task.criteria,
            criteriaCovered: input.criteriaCovered === true,
          };
          task.attempts.push(attempt);
          task.status =
            input.outcome === 'Passed'
              ? 'Closed'
              : input.outcome === 'Failed'
                ? 'Awaiting Fix'
                : 'Verification';
          event.type = 'Verification ' + input.outcome.toLowerCase();
          event.text = attempt.actual;
          event.attemptId = attempt.id;
          break;
        }
        case 'reopen':
          if (task.status === 'Review') throw new AppError('This task is already in Review.');
          event.type = 'Returned to review';
          event.text = requireText(input.reason, 'Reason for reassessment');
          task.status = 'Review';
          task.decision = 'Undecided';
          break;
        default:
          throw new AppError('Unknown task action.');
      }
      event.status = task.status;
      task.history.push(event);
      task.revision++;
      task.updatedAt = now();
      writeTask(task);
      return getTask(id);
    });
  }
  return {
    saveScan,
    getScan,
    listScans,
    createTask,
    getTask,
    act,
    listTasks: () =>
      db
        .prepare('SELECT id FROM tasks')
        .all()
        .map((r) => getTask(r.id))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    close: () => db.close(),
  };
}
