import { describe, expect, it } from "vitest";
import { matchGlob } from "./glob.js";
import { redactHeaders, redactText } from "./redact.js";

describe("redaction", () => {
  it("removes common credential shapes", () => {
    const input = "Authorization: Bearer abc.def token=supersecret AKIAIOSFODNN7EXAMPLE ghp_abcdefghijklmnopqrstuvwxyz";
    const { text, redactions } = redactText(input);
    expect(text).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(text).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz");
    expect(text).not.toContain("Bearer abc.def");
    expect(text).toContain("[REDACTED:");
    expect(redactions).toBeGreaterThan(0);
  });

  it("redacts authorization headers entirely", () => {
    expect(redactHeaders({ Authorization: "Bearer secret", Accept: "application/json" })).toEqual({
      Authorization: "[REDACTED]",
      Accept: "application/json",
    });
  });
});

describe("globs", () => {
  it("matches nested and exact paths", () => {
    expect(matchGlob("**/*.css", "public/styles.css")).toBe(true);
    expect(matchGlob("**/*.css", "styles.css")).toBe(true);
    expect(matchGlob("public/**", "public/styles.css")).toBe(true);
    expect(matchGlob("mime.mjs", "mime.mjs")).toBe(true);
    expect(matchGlob("mime.mjs", "other.mjs")).toBe(false);
    expect(matchGlob("**/*.mjs", "tests/mime.test.mjs")).toBe(true);
  });
});
