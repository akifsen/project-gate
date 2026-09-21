# Domain model

The records that cross package boundaries live in `packages/domain`. Configuration and the change contract are parsed in their own packages and then treated as immutable inputs.

## Change contract

A contract is schema version 1 YAML: change id and title, intent, acceptance criteria, optional API or Playwright verification, UI states, viewports, routes, invariants, and file fields. Each criterion has a required flag and a required evidence class. The default is required and `RUNTIME`. Invariants default to advisory.

The contract hash is the SHA-256 of its canonical JSON. Audit compares the file bytes before and after the run and fails internally if they differ.

## Impact

Changed files are observed facts from git. Edges are separate records with `observed`, `declared`, or `inferred` confidence. Route extraction and import statements are observed. Contract routes are declared. Test-file name proximity and LLM edges are inferred. Those confidences are stored on the edge and are not collapsed into one score.

## Check

A check has a stable id, verifier id, criterion link when one exists, expected evidence class, dependency patterns, reproduction steps, and suspects. After execution it also has a status (`PASSED`, `FAILED`, `UNKNOWN`, `ERROR`, `CARRIED`), a dependency hash snapshot, evidence ids, and duration.

## Finding

Severity is only `CRITICAL`, `MAJOR`, `MINOR`, or `INFO`. A finding records the check, the requirement, observed behavior, expected and actual text, reproduction, evidence paths, suspected locations, evidence class, and whether it is reproducible. Open findings are matched by stable key across runs. A later pass that no longer emits that key resolves the finding. A finding whose check disappeared from the plan stays open.

## Verdict

`computeVerdict` is deterministic:

- any open finding at a blocking severity (default `CRITICAL` and `MAJOR`), or any required criterion in `FAILED`, yields `BLOCKED`
- otherwise any required criterion in `UNKNOWN` yields `INCOMPLETE_EVIDENCE`
- otherwise a matching `security.yml` `human_review_when` glob yields `PASS_WITH_HUMAN_REVIEW`
- otherwise `PASS`

`MINOR` and `INFO` do not block. Advisory invariants do not.

## Release packet

One packet per run: change, contract hash, criteria counts, checks, evidence, open findings, resolved findings, impact, limitations, and verdict. `latest.json` points at the newest packet. Older run directories are left in place.
