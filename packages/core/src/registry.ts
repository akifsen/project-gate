import { AccessibilityVerifier } from "@projectgate/accessibility-verifier";
import { ApiVerifier } from "@projectgate/api-verifier";
import { ArchitectureVerifier } from "@projectgate/architecture-verifier";
import { PlaywrightVerifier } from "@projectgate/playwright-verifier";
import { ShellVerifier } from "@projectgate/shell-verifier";
import { VerifierRegistry } from "@projectgate/verifier-sdk";
import { VisualVerifier } from "@projectgate/visual-verifier";

export function createDefaultRegistry(): VerifierRegistry {
  return new VerifierRegistry([
    new ShellVerifier(),
    new ArchitectureVerifier(),
    new ApiVerifier(),
    new PlaywrightVerifier(),
    new VisualVerifier(),
    new AccessibilityVerifier(),
  ]);
}
