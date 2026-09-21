# Evidence model

Evidence is stored with the run, not reconstructed from logs.

Each evidence record has an id, type, evidence class, source verifier, timestamp, change id, criterion or check id, environment, artifact references, freshness, and the dependency snapshot of its check.

Artifact bodies are written under `.projectgate/runtime/runs/<run-id>/artifacts/<evidence-id>/`. The packet stores relative paths. Large HTTP bodies are not kept whole: the API verifier stores the exchange metadata and a truncated, redacted response.

## Classes

| Class | Meaning |
| --- | --- |
| OBSERVED | A measurement taken from a running page, such as layout metrics or a screenshot paired with those metrics. |
| RUNTIME | Browser or HTTP behavior, including axe results and Playwright assertions. |
| EXECUTABLE | A process exit, such as a unit-test command. |
| STATIC | An AST or policy inspection. |
| INFERRED | A model suggestion. It is labeled inferred and cannot verify a stronger criterion. |
| HUMAN | A recorded human decision. V1 does not invent these. |

## Freshness

Freshness is not a global timestamp. A check is fresh when its dependency hashes still match the tree and the contract has not changed. False freshness is treated as worse than an extra run: empty dependency lists are stale, and a contract edit reruns every check.

## Findings point at evidence

A finding lists evidence ids and the relative artifact paths a reviewer can open without rerunning the audit. The HTML report links those artifacts from the run directory. The fix packet given to an agent contains the finding id, severity, requirement, reproduction, expected, actual, evidence paths, suspected locations, and the verification condition. It does not include raw stdout dumps.
