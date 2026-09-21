import type { ProjectConfig } from "@projectgate/config";
import { redactText, waitForHttp } from "@projectgate/shared";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";

export interface RunningEnvironment {
  baseUrl?: string;
  startError?: string;
  stop: () => Promise<void>;
}

export async function startEnvironment(config: ProjectConfig): Promise<RunningEnvironment> {
  const environment = config.environment;
  if (!environment?.start) return { baseUrl: environment?.baseUrl, stop: async () => {} };
  const port = environment.portEnv || `${environment.readyUrl ?? ""}${environment.baseUrl ?? ""}`.includes("${PORT}") ? await freePort() : undefined;
  const replace = (value: string | undefined) => (value && port ? value.replaceAll("${PORT}", String(port)) : value);
  const args = environment.start.args.map((arg) => replace(arg) ?? arg);
  let stderr = "";
  const child: ChildProcess = spawn(environment.start.command, args, {
    cwd: config.root,
    env: {
      ...process.env,
      ...(port ? { PORT: String(port) } : {}),
      ...(environment.portEnv && port ? { [environment.portEnv]: String(port) } : {}),
    },
    windowsHide: true,
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr = (stderr + chunk.toString("utf8")).slice(0, 4_000);
  });
  const stop = async () => {
    if (!child.killed) child.kill();
  };
  const readyUrl = replace(environment.readyUrl);
  const baseUrl = replace(environment.baseUrl);
  if (!readyUrl) return { baseUrl, stop };
  try {
    await waitForHttp(readyUrl, 30_000);
    return { baseUrl, stop };
  } catch (error) {
    await stop();
    const message = redactText(`${error instanceof Error ? error.message : String(error)}\n${stderr}`).text;
    return { startError: message, stop: async () => {} };
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}
