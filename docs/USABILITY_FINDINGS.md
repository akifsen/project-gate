# Usability findings

These are the causes of the four failures seen on a real Windows install. The repairs stay inside the existing CLI, core, and verifier split.

## A — `projectgate` is not on PATH after `npm install`

Root `package.json` declares a `bin`, but npm does not put a package's own bin on the PATH when you install that package in place. `npm install` only links dependency bins into `node_modules/.bin`. `npm link` is what publishes the bin globally. The README told people to call `node packages/cli/dist/main.js` and never mentioned `npm link` or `npm run projectgate`.

## B — The contract had to be copied by hand

`projectgate init` wrote `contract.example.yml` and did not write `contract.yml`. `audit` then refused to run until that file existed. Nothing in the CLI created it. The example file was also a placeholder criterion, so copying it did not describe the user's change.

## C — Audit reported files changed and zero checks

Impact surfaces were only routes and contract-declared endpoints. Classified source files did not become surfaces, so a TypeScript diff with no route string showed `0 product surfaces`. `verification.yml` was initialized with `commands: []`, and no verifier invents commands. The placeholder criterion required `RUNTIME` evidence and had no linked check, so the verdict was `INCOMPLETE_EVIDENCE` with no explanation of what to configure.

## D — SQLite experimental warning

`packages/evidence` imported `node:sqlite`. Node emits `ExperimentalWarning` when that module loads, which is before `openStore` runs. The suppressor in `openStore` never saw the warning. Replacing the index with a JSON file removes the import. Packets stay on the filesystem.

## Repair direction

- Document `npm run build` and `npm link`, and keep `npm run projectgate` as the local entry.
- `init` discovers scripts and writes project configuration only. `contract --task`, `--from-file`, and `--from-diff` create `contract.yml`.
- Missing or placeholder contracts exit 5 (`CONFIGURATION`) and do not pretend verification ran.
- Discovered build, test, lint, and typecheck commands become baseline checks. Unknown criteria explain the missing evidence.
- File classification produces component, API, and backend surfaces. Unmapped application files are reported, and baseline checks still run.
- On Windows, `npm`, `npx`, `pnpm`, `yarn`, `corepack`, and `composer` are started through `cmd.exe /d /s /c` with a quoted command line. Spawning `npm.cmd` directly returns `EINVAL`, and `shell: true` with a separate argument list emits `DEP0190`. Other commands are spawned directly. Warnings are not filtered.
