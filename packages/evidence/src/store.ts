import type { ReleasePacket } from "@projectgate/domain";
import { product } from "@projectgate/shared";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface RunStore {
  save(packet: ReleasePacket): void;
  get(runId: string): ReleasePacket | null;
  latest(): ReleasePacket | null;
  close(): void;
}

let sqliteWarningSuppressed = false;

export function openStore(root: string): RunStore {
  suppressSqliteWarning();
  const dir = path.join(root, product.configDir, "runtime");
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "projectgate.db"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      created_at TEXT NOT NULL,
      verdict TEXT NOT NULL,
      packet_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  const insert = db.prepare("INSERT INTO runs (id, kind, created_at, verdict, packet_json) VALUES (?, ?, ?, ?, ?)");
  const upsertLatest = db.prepare("INSERT INTO meta (key, value) VALUES ('latest', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  const selectRun = db.prepare("SELECT packet_json FROM runs WHERE id = ?");
  const selectLatest = db.prepare("SELECT value FROM meta WHERE key = 'latest'");
  return {
    save(packet) {
      db.exec("BEGIN");
      try {
        insert.run(packet.runId, packet.kind, packet.generatedAt, packet.verdict.state, JSON.stringify(packet));
        upsertLatest.run(packet.runId);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      const runDir = path.join(dir, "runs", packet.runId);
      fs.mkdirSync(runDir, { recursive: true });
      fs.writeFileSync(path.join(runDir, "packet.json"), `${JSON.stringify(packet, null, 2)}\n`);
      fs.writeFileSync(path.join(dir, "latest.json"), `${JSON.stringify({ runId: packet.runId, verdict: packet.verdict.state }, null, 2)}\n`);
    },
    get(runId) {
      const row = selectRun.get(runId) as { packet_json: string } | undefined;
      return row ? (JSON.parse(row.packet_json) as ReleasePacket) : null;
    },
    latest() {
      const row = selectLatest.get() as { value: string } | undefined;
      if (!row) return null;
      const stored = selectRun.get(row.value) as { packet_json: string } | undefined;
      return stored ? (JSON.parse(stored.packet_json) as ReleasePacket) : null;
    },
    close() {
      db.close();
    },
  };
}

function suppressSqliteWarning(): void {
  if (sqliteWarningSuppressed) return;
  sqliteWarningSuppressed = true;
  const original = process.emitWarning.bind(process);
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const text = typeof warning === "string" ? warning : warning.message;
    if (text.includes("SQLite is an experimental")) return;
    return original(warning, ...(rest as []));
  }) as typeof process.emitWarning;
}
