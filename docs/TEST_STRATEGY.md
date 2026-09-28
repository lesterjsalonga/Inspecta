# Test strategy

Prioritize evidence integrity and correct review decisions. Automated expectations come from documented contracts and workflow, not from copying implementation output.

## Layers

1. Rule tests cover seeded conditions, counterexamples, malformed/unsupported input, incomplete captures, physical evidence lines, and repeatability.
2. GitHub-reader tests control API responses to prove commit pinning, URL boundaries, public-only access, truncation, limits and error handling.
3. Store/API tests exercise real SQLite transactions, persistence, grouping, state validation, evidence requirements, stale writes and immutable snapshots.
4. Playwright tests exercise the complete journey, expected-behavior closure, failed/inconclusive verification, grouping, escaped text, and a narrow mobile layout check.
5. Fixture evaluation reports outcomes per rule and exposes unrecognized syntax. It does not replace real-repository sampling.

## Acceptance traceability

| Criterion                              | Primary coverage                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| AC-01 commit consistency               | github.test.js: immutable tree/blob identities, requested SHA                                  |
| AC-02 no repository execution          | Architectural rule isolation, text-only acquisition, restricted test discovery; inert fixtures |
| AC-03 deterministic results            | rules.test.js: deterministic/no mutation                                                       |
| AC-04 source accuracy                  | rules.test.js: CRLF physical lines and absent keys                                             |
| AC-05 incomplete/invalid distinctions  | Rule/reader tests; HTTP failed-scan test                                                       |
| AC-06 delegation uncertainty           | Reusable/custom action/command tests                                                           |
| AC-07 grouping                         | Store transactions and browser grouping                                                        |
| AC-08 transitions                      | API arbitrary-action rejection; decision/prepare guards                                        |
| AC-09 closure evidence                 | Required evidence/attestation tests and full browser journey                                   |
| AC-10 failed/inconclusive verification | Parameterized store tests and browser journey                                                  |
| AC-11 history                          | Rescan/reopening tests                                                                         |
| AC-12 persistence                      | Real SQLite close/reopen test                                                                  |
| AC-13 inert HTML text                  | Browser evidence-injection regression test                                                     |

AC-02 is also supported by source inspection: acquired files are decoded as text and passed to parsers only. Acquisition/rule modules import no command-execution API. This is an architectural argument, not a claim that every possible parser vulnerability has been eliminated.

## Fixtures and evaluation

Demo JSON stores repository files as strings; evaluation cases assign expected outcomes with reasons. Before/after fixtures contain intentional conditions and explicit requirements. Synthetic hashes must never be presented as real GitHub commits.

The evaluation was written after the first rule tests but is not blinded and overlaps development conditions. It distinguishes mismatches, inconclusive outcomes and broader-pattern misses. Future evaluation should use independently adjudicated real snapshots and a new holdout set.

## Exit criteria

- Unit/integration suite, production build, evaluation and browser suite pass locally.
- No open defect that loses history, falsely closes a confirmed issue, mixes commits, or converts failed inspection into a definitive gap claim.
- The walkthrough is reproducible and limitations are visible.
- Hosted GitHub Actions results are recorded separately after publication.

Not comprehensively covered: all browsers, screen readers, public deployment, hostile-load endurance, shell semantics, and real-world detection accuracy. The mobile check only verifies the initial workspace layout. No accessibility or security certification is claimed.
