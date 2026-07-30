import { describe, it, expect } from "vitest";
import { normalizeIntegrationDevice } from "../src/integrations/unifi/normalize.js";
import type { UnifiOsDevice } from "../src/integrations/unifiOs/client.js";

function makeDevice(overrides: Partial<UnifiOsDevice>): UnifiOsDevice {
  return {
    id: "dev-1",
    macAddress: "aa:bb",
    ipAddress: "10.0.0.1",
    name: "Dispositivo",
    model: "Modelo",
    state: "ONLINE",
    firmwareVersion: "1.0",
    features: [],
    ...overrides,
  };
}

describe("normalizeIntegrationDevice — tipoDispositivo", () => {
  it("clasifica AP por features", () => {
    const node = normalizeIntegrationDevice(
      makeDevice({ model: "U6 IW", features: ["switching", "accessPoint"] }),
      "default",
      undefined,
      0,
      []
    );
    expect(node.tipoDispositivo).toBe("AP");
  });

  it("clasifica switch por features", () => {
    const node = normalizeIntegrationDevice(
      makeDevice({ model: "USW Pro Max 48 PoE", features: ["switching"] }),
      "default",
      undefined,
      0,
      []
    );
    expect(node.tipoDispositivo).toBe("SWITCH");
  });

  it("clasifica UPS por nombre de modelo, aunque features diga switching (bug real confirmado contra hardware)", () => {
    const node = normalizeIntegrationDevice(
      makeDevice({ model: "UPS 2U", features: ["switching"] }),
      "default",
      undefined,
      0,
      []
    );
    expect(node.tipoDispositivo).toBe("UPS");
  });

  it("clasifica gateway por nombre de modelo aunque features venga vacío (bug real confirmado contra hardware: Enterprise Fortress Gateway)", () => {
    const node = normalizeIntegrationDevice(
      makeDevice({ model: "Enterprise Fortress Gateway", features: [] }),
      "default",
      undefined,
      0,
      []
    );
    expect(node.tipoDispositivo).toBe("GATEWAY");
  });

  it("cae a OTRO cuando no matchea ningún caso conocido", () => {
    const node = normalizeIntegrationDevice(makeDevice({ model: "Cosa Rara", features: [] }), "default", undefined, 0, []);
    expect(node.tipoDispositivo).toBe("OTRO");
  });
});
