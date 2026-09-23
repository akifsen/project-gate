import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runProcess } from "./process.js";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("runProcess", () => {
  it("captures stdout and stderr and returns a nonzero exit code", async () => {
    const result = await runProcess({
      command: process.execPath,
      args: ["-e", "process.stdout.write('out'); process.stderr.write('err'); process.exitCode = 7"],
      cwd: process.cwd(),
      timeoutMs: 5_000,
    });

    expect(result).toMatchObject({ exitCode: 7, stdout: "out", stderr: "err", timedOut: false, cancelled: false });
  });

  it("kills a hanging child when its timeout expires", async () => {
    const result = await runProcess({
      command: process.execPath,
      args: ["-e", "console.log('started'); setInterval(() => {}, 1000)"],
      cwd: process.cwd(),
      // Leave enough time for Node startup on a loaded CI worker before testing termination.
      timeoutMs: 1_000,
    });

    expect(result).toMatchObject({ exitCode: null, timedOut: true, cancelled: false });
    expect(result.stdout).toContain("started");
    expect(result.durationMs).toBeLessThan(3_000);
  });

  it("kills a child when its AbortSignal is cancelled", async () => {
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 100);
    try {
      const result = await runProcess({
        command: process.execPath,
        args: ["-e", "setInterval(() => {}, 1000)"],
        cwd: process.cwd(),
        timeoutMs: 5_000,
        signal: controller.signal,
      });

      expect(result).toMatchObject({ exitCode: null, timedOut: false, cancelled: true });
      expect(result.durationMs).toBeLessThan(3_000);
    } finally {
      clearTimeout(abortTimer);
    }
  });

  it("does not launch a side effect for a pre-aborted signal", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "projectgate-process-test-"));
    tempDirectories.push(directory);
    const marker = path.join(directory, "spawned.txt");
    const controller = new AbortController();
    controller.abort();

    const result = await runProcess({
      command: process.execPath,
      args: ["-e", "require('node:fs').writeFileSync(process.argv[1], 'spawned')", marker],
      cwd: directory,
      timeoutMs: 5_000,
      signal: controller.signal,
    });

    expect(result).toMatchObject({ exitCode: null, timedOut: false, cancelled: true });
    expect(fs.existsSync(marker)).toBe(false);
  });
});
