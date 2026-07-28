import { describe, it, expect } from "vitest";
import { authenticator } from "otplib";
import { generateTotpSecret, totpProvisioningUri, verifyTotpCode } from "../src/auth/totp.js";

describe("totp", () => {
  it("genera un secret y valida un código correcto", () => {
    const secret = generateTotpSecret();
    const code = authenticator.generate(secret);
    expect(verifyTotpCode(code, secret)).toBe(true);
  });

  it("rechaza un código incorrecto", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode("000000", secret)).toBe(false);
  });

  it("genera una URI otpauth:// válida", () => {
    const secret = generateTotpSecret();
    const uri = totpProvisioningUri("user@example.com", secret);
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
  });
});
