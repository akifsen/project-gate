import type { LanguageModel } from "@projectgate/model";
import { ProjectGateError } from "@projectgate/shared";
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { contractSchema } from "./schema.js";

const SYSTEM = `You draft a Project Gate change contract as YAML.
Return YAML only, schema_version 1, with change.id, change.title, intent.summary, and acceptance criteria.
Do not invent runtime results. Each acceptance item needs id, description, required, and evidence.
Use evidence RUNTIME for behavior that must be executed. Do not mark criteria verified.`;

export async function proposeContract(input: {
  description: string;
  model: LanguageModel;
  outputPath: string;
}): Promise<{ outputPath: string; criteria: string[] }> {
  if (fs.existsSync(input.outputPath)) {
    throw new ProjectGateError(`Refusing to overwrite ${input.outputPath}. Remove it or choose another path.`, "CONTRACT", 64);
  }
  const completion = await input.model.complete({
    system: SYSTEM,
    prompt: input.description,
  });
  const yamlText = stripFence(completion.text);
  let raw: unknown;
  try {
    raw = parse(yamlText);
  } catch (error) {
    throw new ProjectGateError(`Model contract was not valid YAML: ${error instanceof Error ? error.message : String(error)}`, "CONTRACT", 2);
  }
  const parsed = contractSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ProjectGateError(`Model contract did not match the schema: ${parsed.error.message}`, "CONTRACT", 2);
  }
  fs.mkdirSync(path.dirname(input.outputPath), { recursive: true });
  fs.writeFileSync(input.outputPath, yamlText.endsWith("\n") ? yamlText : `${yamlText}\n`);
  return { outputPath: input.outputPath, criteria: parsed.data.acceptance.map((item) => item.id) };
}

function stripFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:yaml)?\s*([\s\S]*?)```$/i.exec(trimmed);
  return fenced?.[1]?.trim() ?? trimmed;
}
