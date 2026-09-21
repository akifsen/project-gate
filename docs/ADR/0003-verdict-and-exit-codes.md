# ADR 0003: Verdict states and exit codes

## Status

Accepted

## Decision

The verdict is an enum, not a score. Exit codes:

| Code | State |
| --- | --- |
| 0 | PASS |
| 1 | BLOCKED |
| 2 | INCOMPLETE_EVIDENCE |
| 3 | Internal error |
| 4 | PASS_WITH_HUMAN_REVIEW |
| 64 | Usage error |

The brief's CI set was 0 through 3. `PASS_WITH_HUMAN_REVIEW` is not a pass and not a block, so it has its own code. Usage errors use 64 so CI can tell a bad invocation from a product verdict. Missing configuration that prevents a verdict, including a missing contract, uses 2 because the evidence is incomplete.

Blocking severities default to `CRITICAL` and `MAJOR`. That default is the code path in `computeVerdict`.
