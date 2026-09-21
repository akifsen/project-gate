# ADR 0005: Conservative evidence invalidation

## Status

Accepted

## Decision

A carried check must have a non-empty dependency snapshot whose hashes still match, the same dependency pattern list, and an unchanged contract hash. Anything else runs again.

This will repeat work. A fresh authorization result after a policy file changed would be a false pass, which is worse. V1 does not try to compute a perfect blast radius before deciding freshness. Impact edges inform the plan and the report. Freshness is the hash snapshot recorded when the evidence was produced.

Orphan findings, whose check is no longer in the plan, stay open. Resolving them silently would hide a criterion the new plan dropped.
