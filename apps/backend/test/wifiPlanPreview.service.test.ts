import { describe, expect, it } from "vitest";
import { MockUnifiClient } from "../src/integrations/unifi/mockClient.js";
import { previewWifiPlan, WifiPlanPreviewSchema } from "../src/services/wifiPlanPreview.service.js";

const inventory = {
  accessPoints: [{ id: "ap-a", name: "Recepción" }],
  networks: [{ id: "net-a", vlanId: 10 }, { id: "net-b", vlanId: 20 }, { id: "net-c", vlanId: 20 }],
  ssids: ["Existente"],
};

describe("Vista previa Wi-Fi", () => {
  it("resuelve AP y red existentes para un SSID nuevo", () => {
    const result = previewWifiPlan({
      sitio: "feria",
      apIds: ["ap-a"],
      filas: [{ fila: 3, ssid: "Stand 1", vlanId: 10 }],
    }, inventory);

    expect(result).toMatchObject({
      contractVersion: "11.0.104",
      valid: true,
      accessPoints: [{ id: "ap-a", nombre: "Recepción" }],
      filas: [{ fila: 3, networkId: "net-a", errores: [] }],
    });
  });

  it("reporta AP ajenos, redes ambiguas o ausentes y SSID existentes o repetidos", () => {
    const result = previewWifiPlan({
      sitio: "feria",
      apIds: ["ap-otro-sitio"],
      filas: [
        { fila: 4, ssid: "Existente", vlanId: 20 },
        { fila: 5, ssid: "Existente", vlanId: 30 },
      ],
    }, inventory);

    expect(result.valid).toBe(false);
    expect(result.unknownApIds).toEqual(["ap-otro-sitio"]);
    expect(result.filas.map(({ networkId, errores }) => [networkId, errores])).toEqual([
      [null, ["El SSID ya existe en este sitio.", "El SSID se repite en la importación.", "La VLAN corresponde a más de una red en este sitio."]],
      [null, ["El SSID ya existe en este sitio.", "El SSID se repite en la importación.", "La VLAN no existe en este sitio."]],
    ]);
  });

  it("mide el SSID en bytes y exige seleccionar AP", () => {
    const input = { sitio: "feria", apIds: ["ap-a"], filas: [{ fila: 2, ssid: "á".repeat(16), vlanId: 10 }] };
    expect(WifiPlanPreviewSchema.safeParse(input).success).toBe(true);
    expect(WifiPlanPreviewSchema.safeParse({ ...input, apIds: [] }).success).toBe(false);
    expect(WifiPlanPreviewSchema.safeParse({
      ...input,
      filas: [{ ...input.filas[0], ssid: "á".repeat(17) }],
    }).success).toBe(false);
  });

  it("aísla el inventario simulado por sitio", async () => {
    const client = new MockUnifiClient();
    client.seedWifiNetwork({
      id: "wifi-a", sitio: "feria", ssid: "Público", vlanId: 10, bandas: ["5GHz"], clientesConectados: 0,
    });
    expect(await client.getWifiPreviewInventory("feria")).toMatchObject({
      networks: [{ id: "mock-vlan-10", vlanId: 10 }],
      ssids: ["Público"],
    });
    expect(await client.getWifiPreviewInventory("otro")).toEqual({ accessPoints: [], networks: [], ssids: [] });
  });
});
