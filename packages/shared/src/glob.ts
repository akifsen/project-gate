export function matchGlob(pattern: string, filePath: string): boolean {
  const target = normalize(filePath);
  const source = normalize(pattern);
  return globToRegExp(source).test(target);
}

export function matchAnyGlob(patterns: readonly string[], filePath: string): boolean {
  return patterns.some((pattern) => matchGlob(pattern, filePath));
}

function normalize(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function globToRegExp(pattern: string): RegExp {
  let expression = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index] ?? "";
    const next = pattern[index + 1];
    if (char === "*" && next === "*") {
      if (pattern[index + 2] === "/") {
        expression += "(?:.*/)?";
        index += 2;
        continue;
      }
      expression += ".*";
      index += 1;
      continue;
    }
    if (char === "*") {
      expression += "[^/]*";
      continue;
    }
    if (char === "?") {
      expression += "[^/]";
      continue;
    }
    if ("\\^$+.()|[]{}".includes(char)) {
      expression += `\\${char}`;
      continue;
    }
    expression += char;
  }
  return new RegExp(`^${expression}$`);
}
