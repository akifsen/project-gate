# Security

V1 is local-first. Source is not uploaded to a Project Gate service. The runner, the application under test, the browser, and the evidence store stay on the machine.

An LLM call is the exception, and only when the operator sets all three of:

- `PROJECTGATE_LLM_BASE_URL`
- `PROJECTGATE_LLM_API_KEY`
- `PROJECTGATE_LLM_MODEL`

Those calls happen for `contract --propose` and for `audit --infer`. A normal audit does not contact a model. The API key is sent as a bearer token and is not written into evidence. Model errors are redacted before they are stored.

## What is not captured

Impact analysis skips `.env`, key, and certificate paths, plus `.projectgate/runtime`, `node_modules`, `.git`, and build output. Process environment is not dumped into artifacts.

## Redaction

Before persistence, text is scanned for private keys, AWS access keys, GitHub tokens, `sk-` style keys, bearer tokens, and assignments whose name looks like a password, secret, or API key. Authorization, cookie, and API-key headers are replaced with `[REDACTED]`.

Redaction is best-effort. It is not a guarantee that a novel secret shape will be caught. Do not point browser checks at pages that render live credentials.

## Auditor permissions

The auditor starts the configured command and can execute the shell checks listed in `verification.yml`. Those commands are chosen by the repository. Project Gate does not add a general remote shell. The application process is killed when the run finishes.

## Reports

Release packets can contain screenshots and response excerpts. They live under `.projectgate/runtime/`, which is gitignored. Treat that directory as sensitive if the app under test shows private data.
