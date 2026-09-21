import type { ImportRef } from "@projectgate/policy-engine";
import fs from "node:fs";
import path from "node:path";
import phpParser from "php-parser";
import ts from "typescript";

export interface ParsedFile {
  imports: ImportRef[];
  calls: string[];
  source: "typescript-ast" | "php-ast";
}

export function parseSource(root: string, relativeFile: string, text: string): ParsedFile {
  if (relativeFile.endsWith(".php")) return { ...parsePhp(text), source: "php-ast" };
  return { ...parseTypeScript(root, relativeFile, text), source: "typescript-ast" };
}

export function parsesAs(relativeFile: string): boolean {
  return /\.(php|tsx?|jsx?|mjs|cjs)$/.test(relativeFile);
}

function parseTypeScript(root: string, relativeFile: string, text: string): Omit<ParsedFile, "source"> {
  const source = ts.createSourceFile(relativeFile, text, ts.ScriptTarget.Latest, true, scriptKind(relativeFile));
  const imports: ImportRef[] = [];
  const calls: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(resolveImport(root, relativeFile, node.moduleSpecifier.text));
    }
    if (ts.isCallExpression(node)) {
      const first = node.arguments[0];
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && first && ts.isStringLiteral(first)) {
        imports.push(resolveImport(root, relativeFile, first.text));
      } else if (ts.isIdentifier(node.expression)) {
        calls.push(node.expression.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { imports, calls };
}

function parsePhp(text: string): Omit<ParsedFile, "source"> {
  const loaded = loadPhpParser();
  const engine = new loaded({ parser: { extractDoc: false, php8: true }, ast: { withPositions: false } });
  const ast: unknown = engine.parseCode(text, "file.php");
  const imports: ImportRef[] = [];
  const calls: string[] = [];
  walk(ast, imports, calls, new WeakSet());
  return { imports, calls };
}

function walk(node: unknown, imports: ImportRef[], calls: string[], seen: WeakSet<object>): void {
  if (!node || typeof node !== "object") return;
  if (seen.has(node)) return;
  seen.add(node);
  const record = node as Record<string, unknown>;
  if (record["kind"] === "useitem") {
    const name = readName(record["name"]);
    if (name) imports.push({ specifier: name.replace(/^\\/, "") });
  }
  if (record["kind"] === "call") {
    const name = readName(record["what"]);
    if (name) calls.push(name.split("\\").pop() ?? name);
  }
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      for (const item of value) walk(item, imports, calls, seen);
    } else {
      walk(value, imports, calls, seen);
    }
  }
}

function readName(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record["name"] === "string") return record["name"];
  if (record["kind"] === "name") return readName(record["name"]);
  return undefined;
}

function resolveImport(root: string, fromFile: string, specifier: string): ImportRef {
  if (!specifier.startsWith(".")) return { specifier };
  const base = path.resolve(root, path.dirname(fromFile), specifier);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, path.join(base, "index.ts")];
  const resolved = candidates.find((candidate) => fs.existsSync(candidate));
  if (!resolved) return { specifier };
  return { specifier, resolvedPath: path.relative(root, resolved).replaceAll("\\", "/") };
}

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (file.endsWith(".ts")) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

type PhpEngine = new (options?: unknown) => { parseCode(code: string, filename?: string): unknown };

function loadPhpParser(): PhpEngine {
  const loaded = phpParser as unknown as { Engine?: PhpEngine; default?: { Engine?: PhpEngine } };
  const engine = loaded.Engine ?? loaded.default?.Engine;
  if (!engine) throw new Error("php-parser did not export Engine.");
  return engine;
}
