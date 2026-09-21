import { toFixPacket } from "@projectgate/agent-adapter";
import { initProject } from "@projectgate/config";
import { loadContract, proposeContract } from "@projectgate/contracts";
import { audit, formatInspect, inspectProject, latestPacket, verify } from "@projectgate/core";
import { exitCodeForVerdict } from "@projectgate/domain";
import { modelFromEnv } from "@projectgate/model";
import { formatSummary } from "@projectgate/report";
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
    .configureOutput({
      writeOut: (text) => io.stdout(text),
      writeErr: (text) => io.stderr(text),
    });
  const cwd = (command: Command) => command.option("--cwd <dir>", "repository root");

  cwd(program.command("init").description("Create .projectgate configuration without overwriting existing files."))
    .option("--name <name>", "project name")
    .action((_options, command: Command) => {
      const directory = directoryOf(command, root);
      const name = String(command.opts().name ?? path.basename(directory));
      const created = initProject(directory, name);
      io.stdout(created.length ? `${product.name}\n\nCreated:\n${created.map((file) => `- ${file}`).join("\n")}\n` : `${product.name}\n\nConfiguration already exists.\n`);
    });

  cwd(program.command("inspect").description("Show the project, contract, and current change."))
    .option("--against <ref>", "git ref to compare")
    .action(async (_options, command: Command) => {
      const result = await inspectProject(directoryOf(command, root), command.opts().against as string | undefined);
      io.stdout(`${formatInspect(result)}\n`);
    });

  cwd(program.command("contract").description("Validate the active change contract, or propose one with a configured model."))
    .option("--file <path>", "contract file")
    .option("--propose", "ask the configured model for a contract draft")
    .option("--from <path>", "requirement text used with --propose")
    .action(async (_options, command: Command) => {
      const directory = directoryOf(command, root);
      const file = path.resolve(directory, (command.opts().file as string | undefined) ?? path.join(product.configDir, "contract.yml"));
      if (command.opts().propose) {
        const model = modelFromEnv();
        if (!model) throw new ProjectGateError("No LLM provider is configured. Set PROJECTGATE_LLM_BASE_URL, PROJECTGATE_LLM_API_KEY, and PROJECTGATE_LLM_MODEL.", "CONFIG", 2);
        const from = command.opts().from as string | undefined;
        if (!from) throw new UsageError("--propose requires --from <file>.");
        const proposed = await proposeContract({
          description: fs.readFileSync(path.resolve(directory, from), "utf8"),
          model,
          outputPath: path.join(directory, product.configDir, "contract.proposed.yml"),
        });
        io.stdout(`${product.name}\n\nWrote ${path.relative(directory, proposed.outputPath)} with ${proposed.criteria.length} criteria. It is not active until you review it and save it as contract.yml.\n`);
        return;
      }
      const contract = loadContract(file);
      io.stdout(
        `${product.name}\n\n${contract.change.id} — ${contract.change.title}\n${contract.acceptance
          .map((item) => `- ${item.id} ${item.required ? "required" : "advisory"} ${item.evidence} ${item.description}`)
          .join("\n")}\n`,
      );
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
      .action(async (_options, command: Command) => {
        const directory = directoryOf(command, root);
        const opts = command.opts();
        const packet = await (kind === "audit" ? audit : verify)({
          root: directory,
          ...(opts.against ? { against: String(opts.against) } : {}),
          ...(opts.contract ? { contractPath: path.resolve(directory, String(opts.contract)) } : {}),
          ...(opts.infer ? { infer: true } : {}),
        });
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
      else if (format === "fix") io.stdout(`${JSON.stringify(toFixPacket(packet), null, 2)}\n`);
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
