import jwt from "jsonwebtoken";
import { randomBytes, createHash } from "node:crypto";
import type { Role } from "@diktya-atlas/shared";
import { env } from "../config/env.js";

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

export type PurposeTokenPurpose = "2fa_setup" | "2fa_login";

export interface PurposeTokenPayload {
  sub: string;
  purpose: PurposeTokenPurpose;
}

const ACCESS_TOKEN_TTL = "15m";
const PURPOSE_TOKEN_TTL = "5m";

export class InvalidPurposeTokenError extends Error {}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

/** Lanza si el token expiró o la firma no matchea — el caller lo traduce a 401. */
export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
}

export function signPurposeToken(payload: PurposeTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: PURPOSE_TOKEN_TTL });
}

export function verifyPurposeToken(token: string, expectedPurpose: PurposeTokenPurpose): PurposeTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET) as PurposeTokenPayload;
  if (decoded.purpose !== expectedPurpose) {
    throw new InvalidPurposeTokenError(`esperaba propósito "${expectedPurpose}", llegó "${decoded.purpose}"`);
  }
  return decoded;
}

/** Refresh token opaco (no JWT): alta entropía random, no necesita estar firmado. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("hex");
}

/** sha256 alcanza para un token random de 256 bits — no es una password, no necesita argon2id. */
export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
