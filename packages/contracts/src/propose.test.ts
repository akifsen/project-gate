import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { LanguageModel } from "@projectgate/model";
import { proposeContract } from "./propose.js";

const valid = `schema_version: 1
change:
  id: USER-1
  title: Example
intent:
  summary: Users can save a profile.
  users_can: []
acceptance:
  - id: AC-001
    description: The profile saves.
    required: true
    evidence: RUNTIME
ui_states: []
responsive: []
routes: []
invariants: []
fields: []
`;

describe("contract proposal", () => {
  it("writes a schema-valid proposal and refuses to overwrite it", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pg-contract-"));
    const output = path.join(dir, "contract.proposed.yml");
    const model: LanguageModel = {
      id: "fake",
      complete: async () => ({ text: valid, model: "fake" }),
    };
    const result = await proposeContract({ description: "save profile", model, outputPath: output });
    expect(result.criteria).toEqual(["AC-001"]);
    expect(fs.readFileSync(output, "utf8")).toContain("AC-001");
    await expect(proposeContract({ description: "again", model, outputPath: output })).rejects.toThrow(/Refusing to overwrite/);
  });

  it("does not write a file when the model response is invalid", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pg-contract-"));
    const output = path.join(dir, "contract.proposed.yml");
    const model: LanguageModel = {
      id: "fake",
      complete: async () => ({ text: "not a contract", model: "fake" }),
    };
    await expect(proposeContract({ description: "x", model, outputPath: output })).rejects.toThrow(/not valid YAML|did not match/);
    expect(fs.existsSync(output)).toBe(false);
  });
});
