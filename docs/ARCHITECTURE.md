# Implementation architecture

React + Vite → Express API → GitHub reader / deterministic rules / workflow store → SQLite.

The frontend uses hash navigation. The production Express server serves the Vite build and binds to 127.0.0.1.

## Boundaries

- `github.js` validates the repository URL, verifies public access, resolves the branch/commit once, then follows immutable tree/blob identities. It captures root package.json and direct workflow files; other names remain inventory signals.
- `rules.js` receives a snapshot and returns structured outcomes. It does not access the filesystem, network, database, or subprocesses.
- `store.js` stores scans, findings, tasks, and task–finding links in SQLite. Captured files/results are JSON inside immutable scan records; notes, report revisions and verification attempts are preserved in task history.
- Transactions make grouping and task actions atomic. A unique finding link prevents duplicate assignment. Revision checks reject stale writes.
- `app.js` exposes the API and preserves failed capture attempts as records. Only one live GitHub capture runs at a time.

## API

| Method     | Path                   | Purpose                                                        |
| ---------- | ---------------------- | -------------------------------------------------------------- |
| GET        | /api/health            | Health, scan activity, capture limits                          |
| GET / POST | /api/scans             | List or capture snapshots                                      |
| GET        | /api/scans/:id         | Snapshot, results and current finding links                    |
| POST       | /api/demo              | Capture an explicitly synthetic before/after/delegated fixture |
| GET / POST | /api/tasks             | List or create grouped review tasks                            |
| GET        | /api/tasks/:id         | Investigation, findings and history                            |
| POST       | /api/tasks/:id/actions | note, report, attach, decide, prepare, verify, reopen          |

Validation errors return 400; missing resources 404; stale writes/duplicate assignments/concurrent scans 409. GitHub failures retain an explanation and failed scan ID. JSON bodies have a 100 KiB limit.

Writes require the current task revision. The server enforces transitions even if the UI is bypassed. A Passed result is a reviewer attestation supported by required evidence fields, not automated proof of the evidence's truth.

SQLite and synchronous transactions suit this local single-reviewer release. Concurrent users, durable jobs, authentication and public hosting require another architecture review. This app is not configured as a public service.

The reviewer explicitly links the target commit/scan and records an outcome. A failed or incomplete scan can never silently resolve a task.
