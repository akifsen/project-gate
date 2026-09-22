import { spawn } from "node:child_process";

const STREAM_CAP = 512 * 1024;

export interface ProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  spawnError?: string;
}

export function runProcess(options: {
  command: string;
  args: readonly string[];
  cwd: string;
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
}): Promise<ProcessResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const finish = (result: ProcessResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    let child;
    try {
      child = spawnCommand(options);
    } catch (error) {
      finish({
        exitCode: null,
        stdout,
        stderr,
        durationMs: Date.now() - started,
        timedOut: false,
        spawnError: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      finish({
        exitCode: null,
        stdout,
        stderr,
        durationMs: Date.now() - started,
        timedOut: false,
        spawnError: error.message,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      finish({
        exitCode: code,
        stdout,
        stderr,
        durationMs: Date.now() - started,
        timedOut,
      });
    });
  });
}

const WINDOWS_SHIMS = new Set([
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "corepack",
  "composer",
  "flutter",
  "dart",
  "mvn",
  "gradle",
  "dotnet",
  "go",
  "cargo",
  "python",
  "py",
  "php",
  "pip",
  "poetry",
  "uv",
]);

function spawnCommand(options: { command: string; args: readonly string[]; cwd: string; env?: NodeJS.ProcessEnv }) {
  const stdio = {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    windowsHide: true,
  };
  const base = options.command.split(/[\\/]/).pop() ?? options.command;
  const windowsCommand = process.platform === "win32" && (WINDOWS_SHIMS.has(base) || /\.(cmd|bat)$/i.test(base));
  if (windowsCommand) {
    const line = [options.command, ...options.args].map(quoteCmd).join(" ");
    return spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", line], stdio);
  }
  return spawn(options.command, [...options.args], stdio);
}

function quoteCmd(value: string): string {
  if (value.length === 0) return "\"\"";
  if (!/[\s"&|<>^%]/.test(value)) return value;
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function append(current: string, chunk: Buffer): string {
  if (current.length >= STREAM_CAP) return current;
  return (current + chunk.toString("utf8")).slice(0, STREAM_CAP);
}

export async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const started = Date.now();
  let last = "no response";
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}: ${last}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
