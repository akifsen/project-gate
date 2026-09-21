import type { ReleasePacket } from "@projectgate/domain";
import { product } from "@projectgate/shared";
import fs from "node:fs";
import path from "node:path";

export interface RunStore {
  save(packet: ReleasePacket): void;
  get(runId: string): ReleasePacket | null;
  latest(): ReleasePacket | null;
  close(): void;
}

interface RunIndex {
  schemaVersion: 1;
  latest: string | null;
  runs: Record<string, { kind: string; createdAt: string; verdict: string }>;
}

export function openStore(root: string): RunStore {
  const dir = path.join(root, product.configDir, "runtime");
  fs.mkdirSync(dir, { recursive: true });
  const indexPath = path.join(dir, "index.json");
  return {
    save(packet) {
      const runDir = path.join(dir, "runs", packet.runId);
      fs.mkdirSync(runDir, { recursive: true });
      fs.writeFileSync(path.join(runDir, "packet.json"), `${JSON.stringify(packet, null, 2)}\n`);
      const index = readIndex(indexPath);
      index.runs[packet.runId] = { kind: packet.kind, createdAt: packet.generatedAt, verdict: packet.verdict.state };
      index.latest = packet.runId;
      fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
      fs.writeFileSync(path.join(dir, "latest.json"), `${JSON.stringify({ runId: packet.runId, verdict: packet.verdict.state }, null, 2)}\n`);
    },
    get(runId) {
      return readPacket(path.join(dir, "runs", runId, "packet.json"));
    },
    latest() {
      const index = readIndex(indexPath);
      if (index.latest) {
        const stored = readPacket(path.join(dir, "runs", index.latest, "packet.json"));
        if (stored) return stored;
      }
      const pointer = path.join(dir, "latest.json");
      if (!fs.existsSync(pointer)) return null;
      const latest = JSON.parse(fs.readFileSync(pointer, "utf8")) as { runId?: string };
      return latest.runId ? readPacket(path.join(dir, "runs", latest.runId, "packet.json")) : null;
    },
    close() {
      return undefined;
    },
  };
}

function readIndex(file: string): RunIndex {
  if (!fs.existsSync(file)) return { schemaVersion: 1, latest: null, runs: {} };
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<RunIndex>;
  return {
    schemaVersion: 1,
    latest: parsed.latest ?? null,
    runs: parsed.runs ?? {},
  };
}

function readPacket(file: string): ReleasePacket | null {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as ReleasePacket;
}
