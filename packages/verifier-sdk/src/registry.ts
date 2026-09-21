import { ProjectGateError } from "@projectgate/shared";
import type { Verifier } from "./types.js";

export class VerifierRegistry {
  constructor(private readonly verifiers: readonly Verifier[]) {}

  all(): readonly Verifier[] {
    return this.verifiers;
  }

  get(id: string): Verifier {
    const found = this.verifiers.find((verifier) => verifier.id === id);
    if (!found) throw new ProjectGateError(`No verifier is registered for ${id}.`, "INTERNAL");
    return found;
  }
}
