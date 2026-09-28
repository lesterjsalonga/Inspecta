# Inspecta — MVP plan

Status: implementation authorized by the user; the original planning baseline is retained below. See README.md and docs/ for the implemented behavior and validation.

Confirmed choices: Inspecta as the project name, JavaScript as the implementation language, and public npm repositories as the initial target ecosystem. The user subsequently requested creation of the project.

## 1. Product purpose

Inspecta helps a QA reviewer investigate repository findings, record evidence, and verify resolutions.

Workflow: repository snapshot → findings → review task → investigation → decision → fix verification.

The portfolio should demonstrate requirements analysis, test design, API testing, evidence-based defect reporting, handling of uncertain results, and regression verification. The reviewer must be able to explain the rules and their limitations.

A finding is an observation that may justify investigation. It is not proof of a defect or malicious behavior. Inspecta does not declare repositories safe or assign safety scores. A recognized test file or command does not establish that tests ran or that their coverage is sufficient.

## 2. First-release scope

- One reviewer using a local web application, with saved data between sessions.
- Public repositories hosted on github.com.
- One root npm package; workspaces and monorepos are outside the supported scope.
- Repository URL and optional commit SHA. Without a SHA, resolve the default branch once and use that commit throughout the scan.
- Read selected files without installing dependencies, importing repository modules, loading executable configuration, or running repository code.
- Three deterministic checks, defined below.
- Findings with explanations, evidence, confidence reasons, limitations, and investigation suggestions.
- Manual grouping of related findings into a new or existing review task.
- Investigation notes, evidence excerpts and links, decisions, and verification attempts.
- Four screens: repository reviews, scan results, review tasks, and task detail.

Initial test conventions: recognize Vitest dependency/configuration names and conventional JavaScript/TypeScript test filenames as supporting signals. These signals do not prove a working test suite. Inspecta itself is written in JavaScript; inspected repositories may contain either JavaScript or TypeScript.

Deferred: documentation-quality checks, additional ecosystems and package managers, monorepos, private repositories, actual repository execution, vulnerability scanning, AI, automatic fixes, automatic cross-scan deduplication, GitHub issue/PR integration, accounts, collaboration, notifications, file uploads, report export, and public hosting.

## 3. Proposed stack

| Responsibility         | Choice                        | Reason                                                     |
| ---------------------- | ----------------------------- | ---------------------------------------------------------- |
| Language               | JavaScript                    | One language across application code and tests             |
| Interface              | React with Vite; ordinary CSS | Small forms and tables while practicing React              |
| Backend                | Node.js with Express          | Explicit HTTP routes that can be tested independently      |
| Persistence            | SQLite                        | Local storage without a separate database service          |
| Rule and backend tests | Vitest                        | Test rules, validation, persistence, and workflow behavior |
| Browser tests          | Playwright                    | Exercise the complete reviewer workflow                    |
| Inspecta CI            | GitHub Actions                | Run the project's own automated checks                     |

Use one source repository and one database. The frontend and backend may use separate development servers; the finished local app can serve the built interface from Express. A separate hosted frontend, worker service, and job queue are not required for the MVP.

Library versions and the SQLite client will be selected when implementation is authorized. TypeScript is deferred.

## 4. Check contracts

### INSTALL-01 — Download-and-execute pattern

Inspect only the root package.json scripts named preinstall, install, postinstall, and prepare. Recognize a literal command pipeline from curl or wget directly to sh or bash, using an explicitly documented set of supported forms.

Finding wording: “An installation-related script contains a recognized download-and-execute pattern.”

Show the script name, original command, file lines, and matched form. Suggest checking the source, purpose, integrity controls, and whether developer or security review is needed.

The presence of a lifecycle script alone does not trigger this finding. General shell interpretation, wrappers, aliases, dynamically constructed commands, external scripts, and dependency lifecycle scripts are outside this rule. A no-match result applies only to the listed patterns and inspected scripts.

### TEST-01 — Missing or placeholder test entry point

Inspect scripts.test in the root package.json. Produce a finding when the key is absent, its value is empty, or it matches the explicitly supported npm placeholder form: echo "Error: no test specified" && exit 1. Other placeholder variants require separate documented support.

Finding wording: “The root npm test entry point is missing or matches a recognized placeholder.”

Include recognizable test-file paths, Vitest declarations, and configuration filenames as context. Do not import configuration or infer that dependencies/configuration filenames prove tests work. An opaque custom command is recorded without claiming that it runs meaningful tests.

If package.json is unreadable or malformed, the result is inconclusive. A repository without a root package.json is unsupported, rather than automatically defective.

### CI-01 — No recognized direct test command

Inspect YAML files directly inside .github/workflows. Parse workflow structure as data and inspect run steps for direct npm test or npm run test invocations. Support a documented subset of literal commands; never infer execution from job names, comments, or step labels.

Finding wording: “No supported direct npm test invocation was detected in the inspected GitHub Actions workflows.”

If relevant files cannot be read or parsed, or possible test execution is delegated to unsupported custom/reusable mechanisms, return inconclusive with the reason. Ordinary setup actions can be recognized as setup; an arbitrary action must not be assumed to contain no tests.

A matched command is recorded as configuration evidence. Conditions, triggers, working directories, selected checkouts, and command behavior may affect actual execution and remain investigation context. Inspecta does not claim that the command ran, passed, or applied to the reviewed source commit.

### Shared result contract

Each check records: rule ID/version, outcome, inspected scope, supporting evidence, exclusions, explanation, limitations, and suggested next steps.

Outcomes: match, no match within inspected scope, inconclusive, or not applicable. For a gap rule, “match” means the defined gap condition was observed. Results that do not create findings remain visible in the scan report.

Confidence describes the strength of the observation, not the likelihood of malicious behavior or a confirmed defect. Use High, Moderate, or Low with a written reason. An inconclusive result has an explanation rather than a confidence score.

Positive evidence uses the captured path, line numbers, text, and commit. Negative evidence identifies the files, keys, and conventions actually inspected. Never invent a line number for an absent file or key.

## 5. Review workflow

| Status       | Meaning                                                            |
| ------------ | ------------------------------------------------------------------ |
| Review       | Investigation is pending or underway                               |
| Awaiting Fix | An issue is confirmed and needs a change                           |
| Verification | A proposed fix has a recorded target commit and is ready to assess |
| Closed       | A decision and required supporting evidence have been recorded     |

Decisions: Undecided, Confirmed issue, Expected behavior, False positive.

“Needs more information” is an investigation note describing the missing evidence. It does not close the task. External developer/security input can be recorded in notes; integration or assignment features are deferred.

Expected behavior means the observation is accurate and acceptable in context. False positive means the rule's reported observation was incorrect. Neither decision implies that the whole repository is safe.

Transition rules:

- New tasks start in Review with an Undecided decision.
- Review → Awaiting Fix requires Confirmed issue, a rationale, and verification criteria.
- Review → Closed requires Expected behavior or False positive and a rationale.
- Awaiting Fix → Verification requires a proposed-fix commit and a verification plan.
- Verification → Closed requires a Passed verification attempt with evidence covering the task's criteria.
- Failed verification returns the task to Awaiting Fix. Inconclusive verification leaves it in Verification.
- A task may return to Review for reassessment with a reason. A closed task may be reopened into Review with a reason.
- Preserve previous decisions, notes, evidence, transitions, and verification attempts.

Several findings may belong to one task when they concern the same underlying issue and can share a decision. Findings needing different decisions should use separate tasks. A finding may belong to at most one task at a time. The interface shows existing task links before grouping.

A task report contains a title, investigation/inspection steps, expected behavior, observed behavior, impact, evidence, decision rationale, and verification criteria. Evidence links include a short description and relevant commit; saved excerpts preserve important context.

## 6. Fix verification

Each attempt records the task, target commit, associated scan where applicable, method, expected result, observed result, evidence, outcome, and timestamp.

Outcomes: Passed, Failed, Inconclusive.

The reviewer decides whether the criteria are met. A disappeared finding does not automatically close a task: retrieval failure, reduced inspection scope, or a changed rule can also change scan output. Compare rule versions and inspection scope when using rescans as evidence.

Inspecta performs static verification only. A reviewer may attach external CI results or other evidence and label their source. Detecting a new test command verifies configuration only; a claim that tests passed needs execution evidence linked to the appropriate commit.

## 7. Architecture and data

React screens communicate with Express routes. The backend coordinates four modules:

1. GitHub reader: validate input, resolve the commit, retrieve a file inventory and selected text blobs, and record retrieval failures and exclusions.
2. Rule engine: accept captured files and scope metadata; return structured check results. No network, database access, or repository execution inside rules.
3. Review workflow: group findings, validate transitions, record decisions and verification.
4. Persistence: store scans, captured evidence, tasks, and history in SQLite.

Read all repository material through the resolved commit and its tree/blob identities. Completed scans and their findings are immutable. A rescan creates a new record; the reviewer can attach its relevant findings to an existing task manually.

| Record               | Main contents                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| Repository           | GitHub identity and canonical URL                                                                |
| Scan                 | Repository, commit, rule-set version, timestamps, completion state, inspection scope, exclusions |
| Captured file        | Scan, path, blob identity, captured text                                                         |
| Check result         | Scan, rule/version, outcome, explanation, confidence reason, limitations                         |
| Finding              | Check result, actionable observation, evidence references, investigation suggestions             |
| Review task          | Repository, title, status, decision, issue report and verification criteria                      |
| Task–finding link    | Task and finding, with unique assignment of each finding                                         |
| Review entry         | Timestamped notes, evidence, and status/decision history                                         |
| Verification attempt | Task, target commit/scan, method, evidence, expected/actual result, outcome                      |

Keep scan processing state separate from task status. A scan can finish complete, partial, or failed. “Complete” refers to the declared inspection scope, not a comprehensive assessment of the repository.

## 8. Retrieval and application boundaries

- Construct GitHub API requests from a validated github.com repository identity; do not fetch arbitrary URLs supplied in repository content.
- Apply explicit limits to file count, file size, total bytes, and request duration. Final values belong in the implementation requirements before retrieval is built.
- Report rate limits, inaccessible repositories, malformed input, skipped files, and incomplete inventories explicitly. Do not translate these into zero-finding success.
- No submodule traversal, symlink following, Git LFS downloads, binary analysis, or repository dependency installation.
- Parse JSON/YAML as data and display repository snippets as escaped text. Never import JavaScript configuration files.
- Optional GitHub credentials belong on the backend and are excluded from source control, browser responses, and logs.
- Inspecta's own test discovery must exclude fixture and downloaded repository files. They are test inputs, not executable tests for Inspecta.
- Support one active scan at a time. A bounded failure can be retried manually; a durable job queue is deferred.

## 9. Screens

| Screen             | Required behavior                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| Repository reviews | Enter a URL/optional SHA; start a scan; show progress/errors and saved reviews                       |
| Scan results       | Show commit, scope, completeness, all check outcomes, findings, evidence, and task-grouping actions  |
| Review tasks       | List and filter by repository, status, and decision                                                  |
| Task detail        | Show source findings and report; add investigation evidence; decide; record verification and history |

Use ordinary forms and tables. A Kanban board, charts, and visual dashboards are deferred.

## 10. Core acceptance criteria

| ID    | Acceptance criterion                                                                                                        |
| ----- | --------------------------------------------------------------------------------------------------------------------------- |
| AC-01 | A branch changing after commit resolution cannot mix files from different commits in a scan.                                |
| AC-02 | Capturing or scanning repository files cannot execute their scripts, configuration, or test files.                          |
| AC-03 | The same captured input, rule version, and inspection settings produce the same rule outcomes.                              |
| AC-04 | Each reported file/line excerpt matches the captured content at the recorded commit.                                        |
| AC-05 | Missing, unreadable, malformed, unsupported, and partially retrieved input remain distinguishable.                          |
| AC-06 | Unsupported CI delegation does not become a definitive missing-test claim.                                                  |
| AC-07 | Selecting three related, unassigned findings creates one task with three links; repeating assignment cannot duplicate them. |
| AC-08 | Invalid status/decision combinations are rejected by the backend as well as prevented in the interface.                     |
| AC-09 | A confirmed issue cannot close without a Passed verification record covering its criteria.                                  |
| AC-10 | Failed and inconclusive verification preserve evidence and produce the defined task status.                                 |
| AC-11 | A rescan never overwrites the original scan, findings, or investigation history.                                            |
| AC-12 | Saved tasks, notes, decisions, and verification attempts remain available after restarting the application.                 |
| AC-13 | Repository text containing HTML/script markup is displayed as text without executing in the interface.                      |

## 11. QA evidence and evaluation

Maintain traceability from requirement → acceptance criterion → test case → result → defect, where applicable.

Automated layers:

- Rule tests: fixture inputs with independently specified expected outcomes; include matches, non-matches, benign lookalikes, malformed input, and unsupported cases.
- Integration/API tests: snapshot consistency, GitHub failures and rate limits, validation, persistence, grouping, and workflow transitions. Use controlled GitHub responses in the normal suite.
- Browser tests: one full confirmed-issue path, a no-issue closure, and failed/inconclusive verification behavior.
- Regression tests: reproduce meaningful defects discovered while building Inspecta and verify their fixes.

Keep fixtures small and inert. Record why each expected outcome is correct. Reserve some examples for evaluation after designing the rules, including variations that challenge initial assumptions. A small live-repository smoke check is supplemental; routine automated tests should not depend on GitHub availability.

Evaluate each rule separately. A false positive is a match where the rule's stated condition is not present. A missed finding is a supported condition that should match but was not detected. Report inconclusive and unsupported cases separately, including their counts; do not hide them or present them as successes. Report raw counts and corpus scope before interpreting percentages.

Keep detector accuracy separate from reviewer actionability: an accurate pattern that a reviewer accepts as expected behavior is not automatically a detector false positive. Document such cases as part of the rule's usefulness and limitations.

Portfolio deliverables: requirements and acceptance criteria, test strategy, labeled fixtures, automated test results, evaluation report, example defect reports, limitations, and a documented review-to-verification demonstration. Demonstration issues deliberately placed in fixtures must be identified as such; do not present them as discovered real-world defects.

## 12. Milestones and completion evidence

| Milestone                   | Deliverable and exit evidence                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1. Agree on the plan        | Scope, stack, rule contracts, terminology, and workflow reviewed; implementation explicitly authorized   |
| 2. One check with fixtures  | TEST-01 produces expected outcomes and accurate evidence on matching, non-matching, and malformed inputs |
| 3. Complete one review path | A fixture finding becomes a persistent task with investigation, decision, and verification history       |
| 4. Public GitHub input      | Commit-pinned retrieval works; partial/failure cases are tested; no repository execution                 |
| 5. Remaining checks         | INSTALL-01 and CI-01 have documented supported syntax, fixtures, limitations, and tests                  |
| 6. Portfolio release        | Inspecta's CI passes; evaluation and defect reports are complete; the demo can be reproduced             |

The demo should show a documented fixture requirement that CI runs tests, an initial workflow that only builds, a confirmed review task, and a corrected commit with verification evidence. Include a separate expected-behavior decision and an inconclusive investigation. Clearly distinguish static configuration evidence from externally supplied test-run evidence.

## 13. Reference documentation

- [Vite getting started](https://vite.dev/guide/)
- [Express overview](https://expressjs.com/en/resources/glossary/)
- [Vitest guide](https://vitest.dev/guide/)
- [Playwright introduction](https://playwright.dev/docs/intro)
- [GitHub tree API](https://docs.github.com/en/rest/git/trees)
- [GitHub REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- [GitHub Actions workflows](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflows)
- [npm scripts](https://docs.npmjs.com/misc/scripts/)
