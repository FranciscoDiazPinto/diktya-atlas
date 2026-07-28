import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../src/auth/password.js";

describe("password", () => {
  it("hashea y verifica correctamente", async () => {
    const hash = await hashPassword("Sup3rSecreto!");
    expect(hash).not.toBe("Sup3rSecreto!");
    expect(await verifyPassword("Sup3rSecreto!", hash)).toBe(true);
  });

  it("rechaza una password incorrecta", async () => {
    const hash = await hashPassword("Sup3rSecreto!");
    expect(await verifyPassword("otra-cosa", hash)).toBe(false);
  });

  it("usa argon2id", async () => {
    const hash = await hashPassword("Sup3rSecreto!");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });
});
