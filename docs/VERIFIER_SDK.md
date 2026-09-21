# Verifier SDK

A verifier is a small object:

```typescript
interface Verifier {
  id: string;
  version: string;
  supports(context: PlanningContext): boolean;
  plan(context: PlanningContext): VerificationCheck[];
  execute(check: VerificationCheck, context: ExecutionContext): Promise<VerificationResult>;
}
```

`supports` and `plan` are synchronous. `execute` is asynchronous. Planning receives the repository root, the contract, the project config, and the changed paths. It must not start browsers or mutate the tree.

Execution receives timeouts, the optional base URL, an optional `BrowserPool`, and the project config. Browser verifiers ask the pool for a page. They do not launch Playwright themselves. `verifiers/browser` implements the pool, axe collection, and layout measurement. The visual and accessibility verifiers interpret those results.

## Results

`VerificationResult` is JSON-serializable aside from artifact bodies, which the core writes to disk and replaces with paths. Status is `PASSED`, `FAILED`, `UNKNOWN`, or `ERROR`. Findings use the closed severity set. Evidence drafts name a class and artifact bodies.

`unavailable()` is the shared result for a check that cannot run because the app or browser did not start. The core records that as `UNKNOWN` with a limitation on the packet.

## Registration

`createDefaultRegistry` orders shell, architecture, api, playwright, visual, and accessibility. Tests pass their own registry. A duplicate check id is an internal error.

## Adding a verifier

1. Implement `Verifier` in a new workspace package.
2. Depend on `@projectgate/verifier-sdk`, not on `@projectgate/cli` or `@projectgate/mcp`.
3. Register it in `packages/core/src/registry.ts`.
4. Keep inferred output in the `INFERRED` evidence class.
