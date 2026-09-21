import { product, ProjectGateError } from "@projectgate/shared";
import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import { verificationFileSchema } from "./schema.js";

export function linkCommandCriterion(root: string, commandId: string, criterionId: string): boolean {
  const file = path.join(root, product.configDir, "verification.yml");
  if (!fs.existsSync(file)) return false;
  const parsed = verificationFileSchema.safeParse(parse(fs.readFileSync(file, "utf8")));
  if (!parsed.success) {
    throw new ProjectGateError(`Invalid configuration in ${file}: ${parsed.error.message}`, "CONFIG", 64);
  }
  const command = parsed.data.commands.find((item) => item.id === commandId);
  if (!command || command.criterion) return false;
  command.criterion = criterionId;
  fs.writeFileSync(file, stringify(parsed.data));
  return true;
}
