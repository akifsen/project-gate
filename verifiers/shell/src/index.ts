import { brief, redactText, runProcess } from "@projectgate/shared";
import type { EvidenceDraft, ExecutionContext, PlanningContext, VerificationCheck, VerificationResult, Verifier } from "@projectgate/verifier-sdk";
import { sourcePatterns } from "@projectgate/verifier-sdk";

interface ShellInput {
  command: string;
  args: string[];
}

export class ShellVerifier implements Verifier {
  readonly id = "shell";
  readonly version = "1.0.0";

  supports(context: PlanningContext): boolean {
    return context.config.commands.length > 0;
  }

  plan(context: PlanningContext): VerificationCheck[] {
    return context.config.commands.map((command) => {
      const check: VerificationCheck = {
        id: `shell:${command.id}`,
        verifierId: this.id,
        title: command.title,
        why: command.criterionId
          ? `Run ${command.command} as the check linked to ${command.criterionId}.`
          : `Baseline command ${command.command} discovered or configured for this repository.`,
        group: command.group,
        expectedEvidence: command.evidence,
        execution: "deterministic",
        severityOnFail: "MAJOR",
        dependencyPatterns: sourcePatterns(command.invalidatesOn),
        reproduction: [`${command.command} ${command.args.join(" ")}`.trim()],
        suspects: [],
        input: { command: command.command, args: command.args } satisfies ShellInput,
      };
      if (command.criterionId) {
        check.criterionId = command.criterionId;
        check.requirement = context.contract.acceptance.find((item) => item.id === command.criterionId)?.description;
      }
      return check;
    });
  }

  async execute(check: VerificationCheck, context: ExecutionContext): Promise<VerificationResult> {
    const input = check.input as ShellInput;
    const result = await runProcess({
      command: input.command,
      args: input.args,
      cwd: context.root,
      timeoutMs: context.timeouts.commandMs,
    });
    const stdout = redactText(result.stdout).text;
    const stderr = redactText(result.stderr).text;
    const evidence: EvidenceDraft = {
      type: "command-output",
      evidenceClass: "EXECUTABLE",
      summary: result.spawnError
        ? `Could not start ${input.command}: ${result.spawnError}`
        : `${input.command} exited ${result.exitCode ?? "null"} in ${result.durationMs}ms${result.timedOut ? " (timed out)" : ""}.`,
      artifacts: [
        { filename: "stdout.log", mediaType: "text/plain", body: stdout },
        { filename: "stderr.log", mediaType: "text/plain", body: stderr },
      ],
    };
    const passed = result.exitCode === 0 && !result.timedOut && !result.spawnError;
    if (passed) return { status: "PASSED", evidence: [evidence], findings: [] };
    return {
      status: "FAILED",
      evidence: [evidence],
      findings: [
        {
          stableKey: `${check.id}:${result.exitCode ?? "spawn"}`,
          severity: check.severityOnFail,
          title: `${check.title} failed`,
          ...(check.requirement ? { requirement: check.requirement } : {}),
          observed: brief(result.spawnError || stderr || stdout || evidence.summary),
          expected: "Exit code 0.",
          actual: result.timedOut ? "The command timed out." : result.spawnError ?? `Exit code ${result.exitCode}.`,
          reproduction: check.reproduction,
          suspectedLocations: check.suspects,
          evidenceClass: "EXECUTABLE",
          reproducible: true,
          fingerprint: `${input.command}:${result.exitCode ?? "error"}`,
        },
      ],
    };
  }
}
