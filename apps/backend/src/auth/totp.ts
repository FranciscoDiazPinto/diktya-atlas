import { authenticator } from "otplib";

const ISSUER = "NetBot (Diktya Atlas)";

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function totpProvisioningUri(email: string, secret: string): string {
  return authenticator.keyuri(email, ISSUER, secret);
}

export function verifyTotpCode(code: string, secret: string): boolean {
  try {
    return authenticator.check(code, secret);
  } catch {
    // código con formato inválido (no numérico, longitud rara, etc.)
    return false;
  }
}
