# ADR 0004: Inference cannot satisfy a pass

## Status

Accepted

## Decision

Evidence classes are ordered. `INFERRED` is the weakest and never satisfies a stronger requirement. `evidenceSatisfies` encodes that rule, and the verdict uses it.

The default audit path does not call a model. `--infer` may add impact edges tagged `inferred`. `contract --propose` writes a draft file and refuses to overwrite an existing proposal or the active contract. A model failure or unparseable response is a limitation or an ignored edge, not a passing check.

The same provider may be used by an implementation agent and by Project Gate. Auditing still runs in this process, which does not apply patches.
