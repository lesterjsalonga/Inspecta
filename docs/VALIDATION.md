# Local validation record

Validated on 2026-09-28 using Windows, Node.js 24.15.0, npm 11.12.1, and Playwright Chromium.

| Check                  | Observed result                                                          |
| ---------------------- | ------------------------------------------------------------------------ |
| `npm test`             | 58 tests passed across rules, acquisition, API, workflow and persistence |
| `npm run build`        | Production React build completed                                         |
| `npm run evaluate`     | All 18 labeled cases matched their expected outcomes                     |
| `npm run test:e2e`     | 5 browser journeys passed                                                |
| `npm run format:check` | Source/document formatting passed                                        |
| Runtime capture        | No page errors during workspace and demo navigation                      |
| Visual review          | Desktop workspace, demo findings, and mobile workspace inspected         |

Browser journeys cover confirmed issue closure with verification, expected-behavior closure and inert HTML evidence, inconclusive then failed verification, finding grouping, and the mobile workspace. Browser tests use an isolated in-memory database.

Two implementation defects were identified and corrected during browser testing: unrelated note drafts could be cleared after a report save, and implicit label text interfered with reliable field identification. See [defect reports](DEFECT_REPORTS.md).

## Live GitHub smoke check

- Public repository: [sindresorhus/is](https://github.com/sindresorhus/is).
- Resolved commit: `e9c026c611c1160eaad50da00be4e676b626018f`.
- Captured package.json and .github/workflows/main.yml.
- Capture completed with no exclusions.
- The three checks returned no_match within their supported scope.

This confirms one live acquisition path, not repository safety, test execution, or general detection accuracy. No repository dependencies or scripts were run.

## Reproducibility and remaining limits

The evaluation includes explicit inconclusive cases and a quoted-URL installation pipeline missed by the initial supported syntax. Its synthetic corpus does not establish real-world precision or recall.

The GitHub Actions workflow is configured but has not been run on a hosted repository. The app has not been publicly deployed. Only Chromium and the documented local, single-reviewer configuration were exercised.

Use the README commands to reproduce the checks. The browser suite also generates a local HTML report in playwright-report and screenshots under test-results; these transient outputs are excluded from source control.

## Graphite interface update — 2026-10-03

Applied the approved charcoal-and-mint design with Doto pixel headings, IBM Plex Mono labels and controls, and IBM Plex Sans body copy. The home screen now has top navigation and an investigation journal populated from saved tasks. Empty workspaces show an explanation and a fixture demo entry point rather than sample tasks presented as real data.

| Check                     | Observed result                                                                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production build          | Passed                                                                                                                                                    |
| Existing automated suite  | All 58 tests passed                                                                                                                                       |
| Existing browser journeys | All 5 passed, including confirmed issue closure and failed/inconclusive verification                                                                      |
| Formatting                | Passed                                                                                                                                                    |
| Local font loading        | All four bundled font files loaded with external browser requests blocked; no external requests were attempted                                            |
| Journal navigation        | A saved fixture task appeared in the journal and opened the matching investigation                                                                        |
| Keyboard navigation       | Skip-to-content moved focus into the main content without changing the application route                                                                  |
| Responsive layout         | Workspace, snapshot, investigation and task list had no page-level horizontal overflow at 390px and 320px; wide tables scroll within their own containers |
| Runtime/resources         | No browser page errors or missing resources during the visual checks                                                                                      |

The screenshots were captured using a separate in-memory database and synthetic fixture data. Visual review covered the empty and populated desktop workspace, demo findings, and desktop/mobile investigation screens. The user's saved workspace was not used for test data.

- [Workspace](images/workspace.png)
- [Populated journal](images/populated-workspace.png)
- [Demo findings](images/demo-review.png)
- [Investigation](images/investigation.png)
- [Mobile workspace](images/mobile-workspace.png)

Font sources and preserved licenses are documented in [public/fonts/README.md](../public/fonts/README.md). This update changes presentation and navigation; the capture and rule engine were unchanged. The earlier 18-case evaluation above was not rerun for the interface update.
