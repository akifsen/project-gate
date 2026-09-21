# Verification model

A verification plan is the list of checks produced by the enabled verifiers. Each check says what it verifies, why, which criterion it covers when it has one, what evidence class it expects, and whether execution is deterministic.

## Default verifiers

| Verifier | What it does |
| --- | --- |
| shell | Runs configured `command` plus `args` with no shell. Captures exit code, duration, stdout, and stderr. |
| architecture | Parses changed TypeScript with the TypeScript compiler API and changed PHP with php-parser. Applies forbidden imports, forbidden calls, and forbidden layer edges. A parse failure is a major finding. |
| api | Executes contract API checks and file-field adversarial cases declared in `fields.covers`. Captures status and a redacted exchange. |
| playwright | Runs contract and UI-state steps: navigation, click, fill, upload, reload, visibility, text, and image-load assertions. Page errors fail the check. HTTP 404 responses are kept as network evidence and do not fail the check by themselves. |
| visual | Measures horizontal overflow, off-screen controls, broken dialogs, tiny controls, and text overflow. Overflow, off-screen controls, and broken dialogs are major. Tiny targets under 24px and text overflow are minor. There is no design score. |
| accessibility | Runs axe-core through Playwright. Axe `critical` and `serious` map to `CRITICAL` and `MAJOR`. |

Browser checks share one Playwright browser per run and use a new browser context per check. The application under test is started from `environments.yml` `local.start` with `${PORT}` substitution, without a shell, and is stopped in a `finally` block.

## UI states

Contract `ui_states` become Playwright checks with ids `ui:<id>`. A failed state is `MISSING` in the state matrix. A passed or carried state is `VERIFIED`.

## Adversarial cases

V1 does not enumerate every adversarial input. File fields opt in through `covers`: accept, reject oversize, reject type, and reject empty. Other adversarial ideas belong in an explicit contract check.

## Selective re-verification

`verify` loads the latest packet and carries a check only when all of these hold:

- the contract hash is unchanged
- the dependency pattern list is unchanged
- the previous status was `PASSED` or `CARRIED`
- every previously hashed dependency still matches

`FAILED`, `UNKNOWN`, and `ERROR` always run again. A check with an empty dependency snapshot is stale.

## Evidence strength

From weakest to strongest: `INFERRED`, `HUMAN`, `STATIC`, `EXECUTABLE`, `RUNTIME`, `OBSERVED`.

`OBSERVED` satisfies `RUNTIME`. `EXECUTABLE` does not satisfy `RUNTIME`. `HUMAN` does not satisfy `STATIC` or `RUNTIME`. `INFERRED` satisfies only an `INFERRED` requirement.
