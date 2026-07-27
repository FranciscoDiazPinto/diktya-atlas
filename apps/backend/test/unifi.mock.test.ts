import { describe, it, expect, beforeEach } from "vitest";
import { MockUnifiClient } from "../src/integrations/unifi/mockClient.js";

describe("MockUnifiClient", () => {
  let client: MockUnifiClient;

  beforeEach(() => {
    client = new MockUnifiClient();
  });

  it("devuelve null para una red que no existe todavía", async () => {
    const network = await client.getWifiNetwork("sitio-a", "ssid-inexistente");
    expect(network).toBeNull();
  });

  it("writeWifiNetwork crea la red si no existía, y una relectura la refleja", async () => {
    const written = await client.writeWifiNetwork({
      sitio: "sitio-a",
      ssid: "Oficina-5G",
      vlanId: 20,
      bandas: ["5GHz"],
    });
    expect(written.vlanId).toBe(20);

    const reread = await client.getWifiNetwork("sitio-a", "Oficina-5G");
    expect(reread).not.toBeNull();
    expect(reread?.vlanId).toBe(20);
    expect(reread?.bandas).toEqual(["5GHz"]);
  });

  it("writeWifiNetwork sobre una red existente actualiza la VLAN sin perder el id", async () => {
    const first = await client.writeWifiNetwork({
      sitio: "sitio-a",
      ssid: "Oficina-5G",
      vlanId: 20,
      bandas: ["5GHz"],
    });
    const second = await client.writeWifiNetwork({
      sitio: "sitio-a",
      ssid: "Oficina-5G",
      vlanId: 30,
      bandas: ["5GHz"],
    });
    expect(second.id).toBe(first.id);
    expect(second.vlanId).toBe(30);
  });

  it("listNodes filtra por sitio", async () => {
    client.seedNode({
      id: "ap-1",
      sitio: "sitio-a",
      nombre: "AP 1",
      status: "online",
      clientesConectados: 3,
      ultimaVezVisto: new Date().toISOString(),
      ssidsTransmitidos: [],
    });
    client.seedNode({
      id: "ap-2",
      sitio: "sitio-b",
      nombre: "AP 2",
      status: "offline",
      clientesConectados: 0,
      ultimaVezVisto: new Date().toISOString(),
      ssidsTransmitidos: [],
    });

    const soloSitioA = await client.listNodes("sitio-a");
    expect(soloSitioA).toHaveLength(1);
    expect(soloSitioA[0]?.id).toBe("ap-1");

    const todos = await client.listNodes();
    expect(todos).toHaveLength(2);
  });

  it("simulateExternalWrite permite simular que otro proceso ya escribió (para probar doble escritura)", async () => {
    client.seedWifiNetwork({
      id: "wlan-1",
      sitio: "sitio-a",
      ssid: "Oficina-5G",
      vlanId: 20,
      bandas: ["5GHz"],
      clientesConectados: 0,
    });

    client.simulateExternalWrite("sitio-a", "Oficina-5G", 99);

    const reread = await client.getWifiNetwork("sitio-a", "Oficina-5G");
    expect(reread?.vlanId).toBe(99);
  });
});
