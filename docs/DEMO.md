# Review-to-verification demo

The built-in checkout-kit fixtures are synthetic. No fixture script is executed. Requirement: the project must declare a real npm test entry point, and CI must invoke npm test directly.

1. Start Inspecta and select **Open demo review**.
2. Inspect the synthetic reference, three results, source lines, confidence reasons, and limitations.
3. Select TEST-01 and CI-01, then create **Investigate test configuration gaps**. They share one requirement. Keep INSTALL-01 separate because it needs a different investigation.
4. Fill the report: expected test command/CI invocation; actual placeholder/build-only workflow; affected paths; inspection steps; impact.
5. Add evidence with captured file lines and the fixture requirement. Record **Confirmed issue** with criteria: scripts.test is non-placeholder and CI declares npm test. The task moves to Awaiting Fix.
6. Open the original scan and click **Load proposed fix**. This creates a new snapshot without changing the original.
7. Return to the task. Select the new after snapshot, enter a static verification plan, and choose **Begin verification**.
8. Inspect the new manifest/workflow, record expected/observed results and source evidence, select **Passed**, and attest that every criterion was checked. The task closes while its decision stays Confirmed issue.
9. Explain that this proves configuration criteria only. No fixture tests ran. A test-pass claim needs execution evidence for the relevant commit.
10. Review original source links, notes, decisions, and verification history. Reload to demonstrate persistence.

For a separate expected-behavior example, investigate INSTALL-01 and explain why the intentionally seeded pattern is accepted for this demonstration. This does not mean arbitrary remote installation commands are safe.

Use **Load delegated CI** to demonstrate an inconclusive result. Identify the uninspected reusable workflow. Record Inconclusive verification while evidence is missing, or Failed when a criterion is unmet; neither closes the task.

## Interview discussion

- Why separate findings, decisions, and verification outcomes?
- Which absence claims require a complete inventory?
- How do commit pinning and saved excerpts preserve evidence?
- Why is expected behavior not automatically a detector false positive?
- How would you evaluate a new rule before expanding its scope?
