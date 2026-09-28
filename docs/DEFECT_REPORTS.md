# Example defect reports

## FIXTURE-001 — CI does not declare the required test invocation

Type: deliberately seeded demonstration issue, not a discovered public-repository defect.

Requirement: checkout-kit must declare an npm test entry point and invoke it directly in CI.

Environment: Inspecta's synthetic before fixture; the UI records its content-derived reference.

Steps: capture the fixture; inspect package.json and .github/workflows/ci.yml; compare scripts and run steps with the fixture requirement.

Expected: a non-placeholder scripts.test and a direct npm test invocation.

Observed: scripts.test is the npm placeholder; CI invokes installation and build only.

Impact: the configuration does not meet the fixture's requirement. Actual runtime coverage is not assessed.

Evidence: package.json line 5 and the captured workflow run steps. Exact excerpts and snapshot identity are stored.

Decision: Confirmed issue. Criteria: replace the placeholder and declare npm test in CI.

Proposed fix: the after fixture. Verification: compare captured files, record static-inspection evidence, and link the target snapshot. Actual test execution remains unverified.

## INSPECTA-001 — Report save could erase a note being drafted

Type: actual implementation defect discovered during the first Playwright workflow run.

Steps: edit/save a task report; enter an investigation note while the request completes; observe the refresh.

Expected: unrelated unsaved note text survives a report save.

Observed: the note cleared because the task component remounted whenever its revision changed. The browser test could not find the intended saved note in history.

Impact: potential loss of investigation input.

Fix: key the task component by task identity only. Synchronize verification defaults separately when criteria change.

Regression: the full browser journey saves a report and adds a note immediately afterward, then checks it after closure and reload.

## INSPECTA-002 — Helper text polluted accessible field names

Type: actual implementation defect identified while diagnosing browser workflow failures.

Observed: helper text inside a label became part of the field's accessible name. A visually short label exposed a longer, inconsistent name.

Fix: use explicit label/control IDs and associate helper text through aria-describedby. This also prevents select-option text from affecting label lookup. Browser tests select fields by exact accessible labels.

Validation: decision and verification journeys locate and use the affected fields.
