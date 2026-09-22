import { formatFixPacket, toFixPacket } from "@projectgate/agent-adapter";
import { initProject } from "@projectgate/config";
import { loadContract, proposeContract } from "@projectgate/contracts";
import { audit, contractGuidance, createChangeContract, doctor, formatDoctor, formatInspect, inspectProject, latestPacket, planVerification, verify } from "@projectgate/core";
import { exitCodeForVerdict } from "@projectgate/domain";
import { modelFromEnv } from "@projectgate/model";
import { formatPlan, formatSummary } from "@projectgate/report";
import { EXIT_INTERNAL, EXIT_USAGE, product, ProjectGateError, UsageError } from "@projectgate/shared";
import { Command, CommanderError } from "commander";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

const defaultIo: CliIo = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
};

export async function runCli(argv: string[], io: CliIo = defaultIo): Promise<number> {
  const root = cwdFrom(argv);
  let exitCode = 0;
  const program = new Command();
  program
    .name(product.command)
    .description(`${product.name} decides whether a change is actually done.`)
    .exitOverride()
    .version(product.version)
    .configureOutput({
      writeOut: (text) => io.stdout(text),
      writeErr: (text) => io.stderr(text),
    });
  const cwd = (command: Command) => command.option("--cwd <dir>", "repository root");

  cwd(program.command("init").description("Discover the repository and create .projectgate configuration. Does not create an active change contract."))
    .option("--name <name>", "project name")
    .action((_options, command: Command) => {
      const directory = directoryOf(command, root);
      const name = String(command.opts().name ?? path.basename(directory));
      const result = initProject(directory, name);
      const detected = [result.discovery.frontend, result.discovery.backend, ...result.discovery.languages, result.discovery.packageManager].filter(Boolean);
      const lines = [
        `${product.name} initialized.`,
        "",
        "Detected:",
        "",
        ...(detected.length > 0 ? detected.map((item) => String(item)) : ["No framework manifest detected."]),
        ...(result.discovery.commands.length > 0 ? ["", "Commands:", ...result.discovery.commands.map((command) => `${command.title}: ${command.command} ${command.args.join(" ")}`.trim())] : []),
        "",
        result.created.length > 0 ? "Configuration created:" : "Configuration already exists.",
        ...result.created.map((file) => file),
        "",
        result.contractActive ? "An active Change Contract is already present." : "No active Change Contract.",
        "",
        "Next:",
        "",
        "projectgate doctor",
        "projectgate inspect",
        result.contractActive ? "projectgate audit" : "projectgate contract --task \"Describe your current change\"",
      ];
      io.stdout(`${lines.filter((line) => line !== undefined).join("\n")}\n`);
    });

  cwd(program.command("doctor").description("Check the local Project Gate installation and this repository."))
    .action(async (_options, command: Command) => {
      const report = await doctor(directoryOf(command, root));
      io.stdout(`${formatDoctor(report)}\n`);
      if (report.checks.some((check) => check.status === "fail")) exitCode = 5;
    });

  cwd(program.command("inspect").description("Show the detected stack, contract, and current change."))
    .option("--against <ref>", "git ref to compare")
    .option("--verbose", "include file classifications")
    .action(async (_options, command: Command) => {
      const result = await inspectProject(directoryOf(command, root), command.opts().against as string | undefined);
      io.stdout(`${formatInspect(result, Boolean(command.opts().verbose))}\n`);
    });

  cwd(program.command("contract").description("Show, validate, or create the active change contract."))
    .option("--task <text>", "create a contract from this description")
    .option("--from-file <path>", "create a contract from a requirement file")
    .option("--from-diff", "propose a contract from the current git diff")
    .option("--replace", "overwrite an existing active contract")
    .option("--against <ref>", "git ref used with --from-diff")
    .option("--propose", "ask the configured model for an inactive draft")
    .option("--from <path>", "requirement text used with --propose")
    .action(async (_options, command: Command) => {
      const directory = directoryOf(command, root);
      const opts = command.opts();
      if (opts.propose) {
        const model = modelFromEnv();
        if (!model) throw new ProjectGateError("No LLM provider is configured. Set PROJECTGATE_LLM_BASE_URL, PROJECTGATE_LLM_API_KEY, and PROJECTGATE_LLM_MODEL.", "CONFIG", 2);
        const from = opts.from as string | undefined;
        if (!from) throw new UsageError("--propose requires --from <file>.");
        const proposed = await proposeContract({
          description: fs.readFileSync(path.resolve(directory, from), "utf8"),
          model,
          outputPath: path.join(directory, product.configDir, "contract.proposed.yml"),
        });
        io.stdout(`${product.name}\n\nWrote ${path.relative(directory, proposed.outputPath)} with ${proposed.criteria.length} criteria. It is not active until you review it and save it as contract.yml.\n\nNext:\n\nprojectgate contract\n`);
        return;
      }
      if (opts.task || opts.fromFile || opts.fromDiff) {
        const draft = await createChangeContract({
          root: directory,
          ...(opts.task ? { task: String(opts.task) } : {}),
          ...(opts.fromFile ? { fromFile: String(opts.fromFile) } : {}),
          ...(opts.fromDiff ? { fromDiff: true } : {}),
          ...(opts.replace ? { replace: true } : {}),
          ...(opts.against ? { against: String(opts.against) } : {}),
        });
        const required = draft.contract.acceptance.filter((item) => item.required).length;
        io.stdout(
          [
            `${product.name}`,
            "",
            "Change Contract created.",
            "",
            `ID: ${draft.contract.change.id}`,
            `Title: ${draft.contract.change.title}`,
            `Criteria: ${draft.contract.acceptance.length}`,
            `Required: ${required}`,
            draft.inferred > 0 ? `${draft.inferred} criteria inferred from the implementation. Review before treating them as authoritative requirements.` : "Evidence class for the supplied criterion: EXECUTABLE, checked by the discovered test command when one exists.",
            draft.linkedTest ? "Linked the discovered test command to AC-001." : "",
            ...draft.warnings.map((warning) => warning),
            "",
            `Review: ${path.relative(directory, draft.filePath)}`,
            "",
            "Next:",
            "",
            "projectgate audit",
          ]
            .filter((line) => line !== "")
            .join("\n") + "\n",
        );
        return;
      }
      const file = path.join(directory, product.configDir, "contract.yml");
      if (!fs.existsSync(file)) {
        io.stdout(`${product.name}\n\n${contractGuidance()}\n`);
        return;
      }
      const contract = loadContract(file);
      io.stdout(
        [
          `${product.name}`,
          "",
          "Active Change Contract",
          "",
          `ID: ${contract.change.id}`,
          `Title: ${contract.change.title}`,
          "",
          `Criteria: ${contract.acceptance.length}`,
          `Required: ${contract.acceptance.filter((item) => item.required).length}`,
          `Optional: ${contract.acceptance.filter((item) => !item.required).length}`,
          `Invariants: ${contract.invariants.length}`,
          "",
          ...contract.acceptance.map((item) => `- ${item.id} ${item.origin} ${item.required ? "required" : "advisory"} ${item.evidence} ${item.description}`),
          "",
          "Contract valid",
          "",
          "Next:",
          "",
          "projectgate audit",
        ].join("\n") + "\n",
      );
    });

  cwd(program.command("plan").description("Print the verification plan without executing it."))
    .option("--against <ref>", "git ref to compare")
    .option("--contract <path>", "change contract")
    .option("--verbose", "include why each check exists")
    .action(async (_options, command: Command) => {
      const directory = directoryOf(command, root);
      const opts = command.opts();
      const plan = await planVerification({
        root: directory,
        ...(opts.against ? { against: String(opts.against) } : {}),
        ...(opts.contract ? { contractPath: path.resolve(directory, String(opts.contract)) } : {}),
      });
      io.stdout(`${formatPlan(plan.checks, Boolean(opts.verbose))}\n\nNext:\n\nprojectgate audit\n`);
    });

  for (const kind of ["audit", "verify"] as const) {
    cwd(
      program
        .command(kind)
        .description(kind === "audit" ? "Verify the current change and write a release packet." : "Re-run stale or failed checks from the latest run."),
    )
      .option("--against <ref>", "git ref to compare")
      .option("--contract <path>", "change contract")
      .option("--infer", "add LLM impact edges when a provider is configured")
      .option("--format <format>", "text or json", "text")
      .option("--verbose", "include check rationale in the summary limitations")
      .action(async (_options, command: Command) => {
        const directory = directoryOf(command, root);
        const opts = command.opts();
        const packet = await (kind === "audit" ? audit : verify)({
          root: directory,
          ...(opts.against ? { against: String(opts.against) } : {}),
          ...(opts.contract ? { contractPath: path.resolve(directory, String(opts.contract)) } : {}),
          ...(opts.infer ? { infer: true } : {}),
        });
        if (opts.verbose) {
          packet.limitations.push(...packet.checks.map((check) => `${check.id}: ${check.why}`));
        }
        const paths = outputPaths(packet.runId);
        if (opts.format === "json") io.stdout(`${JSON.stringify(packet, null, 2)}\n`);
        else io.stdout(`${formatSummary(packet, paths)}\n`);
        exitCode = exitCodeForVerdict(packet.verdict.state);
      });
  }

  cwd(program.command("report").description("Print the latest release packet."))
    .option("--format <format>", "text, json, html, or fix", "text")
    .action(async (_options, command: Command) => {
      const directory = directoryOf(command, root);
      const packet = latestPacket(directory);
      if (!packet) throw new UsageError("No release packet yet. Run an audit first.");
      const format = String(command.opts().format ?? "text");
      const paths = outputPaths(packet.runId);
      if (format === "json") io.stdout(`${JSON.stringify(packet, null, 2)}\n`);
      else if (format === "html") io.stdout(`${paths.html}\n`);
      else if (format === "fix") io.stdout(`${formatFixPacket(packet)}\n\nNext:\n\n${product.command} verify\n`);
      else if (format === "fix-json") io.stdout(`${JSON.stringify(toFixPacket(packet), null, 2)}\n`);
      else io.stdout(`${formatSummary(packet, paths)}\n`);
      exitCode = exitCodeForVerdict(packet.verdict.state);
    });

  try {
    await program.parseAsync(["node", product.command, ...argv], { from: "node" });
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.exitCode !== 0) io.stderr(`${error.message}\n`);
      return error.exitCode === 0 ? 0 : EXIT_USAGE;
    }
    if (error instanceof ProjectGateError) {
      io.stderr(`${error.message}\n`);
      return error.exitCode;
    }
    throw error;
  }
  return exitCode;
}

function cwdFrom(argv: string[]): string {
  const index = argv.indexOf("--cwd");
  const value = index >= 0 ? argv[index + 1] : undefined;
  return path.resolve(value ?? process.cwd());
}

function directoryOf(command: Command, fallback: string): string {
  const own = command.opts().cwd as string | undefined;
  return path.resolve(own ?? fallback);
}

function outputPaths(runId: string): { json: string; html: string; fix: string } {
  const dir = path.join(product.configDir, "runtime", "runs", runId);
  return {
    json: path.join(dir, "packet.json"),
    html: path.join(dir, "report.html"),
    fix: path.join(dir, "fix-packet.json"),
  };
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  try {
    return await runCli(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    if (error instanceof ProjectGateError) return error.exitCode;
    return EXIT_INTERNAL;
  }
}

const invoked = process.argv[1];
if (invoked && import.meta.url === pathToFileURL(invoked).href) {
  process.exitCode = await main();
}
