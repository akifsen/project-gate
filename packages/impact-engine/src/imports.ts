import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export interface ResolvedImport {
  specifier: string;
  resolvedPath?: string;
}

export function readImports(root: string, relativeFile: string, text: string): ResolvedImport[] {
  if (relativeFile.endsWith(".php")) return readPhpImports(text);
  if (!/\.(tsx?|jsx?|mjs|cjs)$/.test(relativeFile)) return [];
  const source = ts.createSourceFile(relativeFile, text, ts.ScriptTarget.Latest, true, scriptKind(relativeFile));
  const imports: ResolvedImport[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier = node.moduleSpecifier;
      if (specifier && ts.isStringLiteral(specifier)) imports.push(resolveImport(root, relativeFile, specifier.text));
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const first = node.arguments[0];
      if (first && ts.isStringLiteral(first)) imports.push(resolveImport(root, relativeFile, first.text));
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "require") {
      const first = node.arguments[0];
      if (first && ts.isStringLiteral(first)) imports.push(resolveImport(root, relativeFile, first.text));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return imports;
}

function readPhpImports(text: string): ResolvedImport[] {
  const imports: ResolvedImport[] = [];
  for (const match of text.matchAll(/\buse\s+([^;]+);/g)) {
    const clause = match[1] ?? "";
    for (const part of clause.split(",")) {
      const name = part.trim().split(/\s+as\s+/i)[0]?.trim().replace(/^\\/, "");
      if (name) imports.push({ specifier: name });
    }
  }
  return imports;
}

function resolveImport(root: string, fromFile: string, specifier: string): ResolvedImport {
  if (!specifier.startsWith(".")) return { specifier };
  const base = path.resolve(root, path.dirname(fromFile), specifier);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, `${base}.php`, path.join(base, "index.ts")];
  const resolved = candidates.find((candidate) => fs.existsSync(candidate));
  if (!resolved) return { specifier };
  return { specifier, resolvedPath: path.relative(root, resolved).replaceAll("\\", "/") };
}

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".ts")) return ts.ScriptKind.TS;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
}
