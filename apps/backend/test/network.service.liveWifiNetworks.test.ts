import { describe, it, expect } from "vitest";
import { getLiveWifiNetworks } from "../src/services/network.service.js";

/**
 * Test de setup.ts fuerza UNIFI_MODE=mock — getUnifiClient() (singleton
 * lazy) se autopuebla con datos de demo la primera vez que se llama (ver
 * integrations/unifi/index.ts::seedDemoData), incluida una WifiNetwork
 * ("Oficina-5G", VLAN 10, sitio "oficina-central").
 */
describe("network.service getLiveWifiNetworks", () => {
  it("consulta al UnifiClient en vivo (no Postgres) y devuelve las redes del sitio", async () => {
    const redes = await getLiveWifiNetworks("oficina-central");
    expect(redes.find((r) => r.ssid === "Oficina-5G")).toMatchObject({ vlanId: 10, sitio: "oficina-central" });
  });

  it("un sitio sin redes devuelve un array vacío, no un error", async () => {
    const redes = await getLiveWifiNetworks("sitio-sin-nada");
    expect(redes).toEqual([]);
  });
});
