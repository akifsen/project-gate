import { describe, expect, it } from "vitest";
import { buildTaskContract } from "./author.js";

describe("task contracts", () => {
  it("keeps one sentence as one user-supplied criterion", () => {
    const contract = buildTaskContract("The widget component must not ship the broken marker.", "USER_SUPPLIED");
    expect(contract.acceptance).toHaveLength(1);
    expect(contract.acceptance[0]).toMatchObject({ id: "AC-001", evidence: "EXECUTABLE", origin: "USER_SUPPLIED" });
  });

  it("splits semicolon-separated requirements without calling them inferred", () => {
    const contract = buildTaskContract(
      "Toolbar mevcut fonksiyonlarını korumalı; mobil ekranlarda taşmamalı; etkileşimli kontroller erişilebilir kalmalı; mevcut kullanıcı akışlarında regresyon oluşmamalı.",
      "USER_SUPPLIED",
    );
    expect(contract.acceptance.map((item) => item.id)).toEqual(["AC-001", "AC-002", "AC-003", "AC-004"]);
    expect(contract.acceptance.every((item) => item.origin === "USER_SUPPLIED")).toBe(true);
    expect(contract.acceptance[0]?.description).toContain("Toolbar mevcut fonksiyonlarını korumalı");
    expect(contract.acceptance[1]?.evidence).toBe("RUNTIME");
    expect(contract.acceptance[2]?.evidence).toBe("RUNTIME");
    expect(contract.acceptance[3]?.description).toContain("regresyon oluşmamalı");
  });

  it("splits bullets and numbered lines", () => {
    const bullets = buildTaskContract("- verify the build\n- verify responsive behavior", "USER_SUPPLIED");
    expect(bullets.acceptance).toHaveLength(2);
    expect(bullets.acceptance[1]?.evidence).toBe("RUNTIME");
    const numbered = buildTaskContract("1. Keep the toolbar working.\n2. Keep controls accessible.", "FILE_SUPPLIED");
    expect(numbered.acceptance).toHaveLength(2);
    expect(numbered.acceptance[1]?.origin).toBe("FILE_SUPPLIED");
    expect(numbered.acceptance[1]?.evidence).toBe("RUNTIME");
  });

  it("splits plain newline requirements while keeping wrapped prose together", () => {
    const separate = buildTaskContract("Keep the toolbar working\nKeep controls accessible", "USER_SUPPLIED");
    expect(separate.acceptance.map((item) => item.description)).toEqual([
      "Keep the toolbar working",
      "Keep controls accessible",
    ]);

    const wrapped = buildTaskContract("Keep the toolbar usable on\nmobile devices.", "USER_SUPPLIED");
    expect(wrapped.acceptance.map((item) => item.description)).toEqual(["Keep the toolbar usable on mobile devices."]);
  });
});
