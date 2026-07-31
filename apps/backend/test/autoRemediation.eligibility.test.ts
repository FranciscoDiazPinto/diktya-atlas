import { describe, it, expect } from "vitest";
import { isElegibleParaAutoRemediacion } from "../src/services/nodeSync.service.js";

// AUTO_REMEDIATE_DEVICE_TYPES/COOLDOWN no están en apps/backend/.env, así
// que corren con los defaults del schema (AP, 30 min) — ver config/env.ts.
describe("isElegibleParaAutoRemediacion", () => {
  it("elegible: tipo AP, sin intento previo", () => {
    expect(isElegibleParaAutoRemediacion({ tipoDispositivo: "AP", lastAutoRemediationAt: null })).toBe(true);
  });

  it("no elegible: tipo fuera de la política por defecto (SWITCH)", () => {
    expect(isElegibleParaAutoRemediacion({ tipoDispositivo: "SWITCH", lastAutoRemediationAt: null })).toBe(false);
  });

  it("no elegible: tipo GATEWAY tampoco por defecto", () => {
    expect(isElegibleParaAutoRemediacion({ tipoDispositivo: "GATEWAY", lastAutoRemediationAt: null })).toBe(false);
  });

  it("no elegible: intento reciente, todavía en cooldown", () => {
    const haceUnMinuto = new Date(Date.now() - 60_000);
    expect(isElegibleParaAutoRemediacion({ tipoDispositivo: "AP", lastAutoRemediationAt: haceUnMinuto })).toBe(false);
  });

  it("elegible de nuevo: intento pasó el cooldown (31 min > 30 min default)", () => {
    const hace31Minutos = new Date(Date.now() - 31 * 60_000);
    expect(isElegibleParaAutoRemediacion({ tipoDispositivo: "AP", lastAutoRemediationAt: hace31Minutos })).toBe(true);
  });
});
