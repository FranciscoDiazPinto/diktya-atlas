import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `UnifiLiveClient` carga `unifiOs/client.ts` (Integration API, X-API-KEY)
 * con import() perezoso — ver el comentario en liveClient.ts::getIntegrationClient.
 * Se mockea acá en vez de pegarle a undici de verdad: no hay infraestructura
 * real disponible en este entorno para validar contra un controller (mismo
 * motivo documentado en liveClient.ts).
 */
const listWifiBroadcasts = vi.fn();
const listNetworks = vi.fn();
const getWifiBroadcastDetail = vi.fn();
const updateWifiBroadcast = vi.fn();
const resolveSiteId = vi.fn();
const listDevices = vi.fn();
const listClients = vi.fn();
const getDeviceLatestStatistics = vi.fn();
const executeDeviceAction = vi.fn();

vi.mock("../src/integrations/unifiOs/client.js", () => ({
  UnifiOsClient: vi.fn().mockImplementation(() => ({
    listWifiBroadcasts,
    listNetworks,
    getWifiBroadcastDetail,
    updateWifiBroadcast,
    resolveSiteId,
    listDevices,
    listClients,
    getDeviceLatestStatistics,
    executeDeviceAction,
  })),
}));

const { UnifiLiveClient } = await import("../src/integrations/unifi/liveClient.js");
const { AutomatedWifiWriteNotSupportedError } = await import("../src/integrations/unifi/client.js");

function makeClient() {
  return new UnifiLiveClient({
    host: "controller.local",
    username: "admin",
    password: "secret",
    site: "default",
    verifyTls: true,
    integrationHost: "udm.local",
    integrationApiKey: "test-key",
    integrationVerifyTls: false,
  });
}

describe("UnifiLiveClient.writeWifiNetwork (Integration API)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveSiteId.mockResolvedValue("site-uuid");
  });

  it("reasigna la VLAN de un SSID existente reenviando el resto del broadcast intacto", async () => {
    listWifiBroadcasts.mockResolvedValue([{ id: "bc-1", name: "Oficina-5G", network: { type: "NATIVE" } }]);
    listNetworks.mockResolvedValue([
      { id: "net-default", name: "Default", vlanId: 1, default: true },
      { id: "net-20", name: "VLAN 20", vlanId: 20, default: false },
    ]);
    getWifiBroadcastDetail.mockResolvedValue({
      id: "bc-1",
      name: "Oficina-5G",
      enabled: true,
      securityConfiguration: { type: "WPA2_PERSONAL" },
      metadata: { source: "user" },
    });
    updateWifiBroadcast.mockResolvedValue({ id: "bc-1" });

    const client = makeClient();
    const written = await client.writeWifiNetwork({
      sitio: "default",
      ssid: "Oficina-5G",
      vlanId: 20,
      bandas: ["5GHz"],
    });

    expect(written).toEqual({
      id: "bc-1",
      sitio: "default",
      ssid: "Oficina-5G",
      vlanId: 20,
      bandas: ["5GHz"],
      clientesConectados: 0,
    });

    expect(updateWifiBroadcast).toHaveBeenCalledTimes(1);
    const [, , body] = updateWifiBroadcast.mock.calls[0];
    // La seguridad existente se reenvía intacta: nunca se inventa una.
    expect(body.securityConfiguration).toEqual({ type: "WPA2_PERSONAL" });
    expect(body.enabled).toBe(true);
    expect(body.network).toEqual({ type: "SPECIFIC", networkId: "net-20" });
    expect(body.broadcastingFrequenciesGHz).toEqual([5]);
    expect(body).not.toHaveProperty("id");
    expect(body).not.toHaveProperty("metadata");
  });

  it("rechaza crear un SSID nuevo en vez de inventar una seguridad WiFi", async () => {
    listWifiBroadcasts.mockResolvedValue([]);
    listNetworks.mockResolvedValue([{ id: "net-default", name: "Default", vlanId: 1, default: true }]);

    const client = makeClient();
    await expect(
      client.writeWifiNetwork({ sitio: "default", ssid: "SSID-Nuevo", vlanId: 1, bandas: ["5GHz"] })
    ).rejects.toBeInstanceOf(AutomatedWifiWriteNotSupportedError);

    expect(updateWifiBroadcast).not.toHaveBeenCalled();
  });

  it("rechaza reasignar a una VLAN cuya Network no existe todavía", async () => {
    listWifiBroadcasts.mockResolvedValue([{ id: "bc-1", name: "Oficina-5G", network: { type: "NATIVE" } }]);
    listNetworks.mockResolvedValue([{ id: "net-default", name: "Default", vlanId: 1, default: true }]);

    const client = makeClient();
    await expect(
      client.writeWifiNetwork({ sitio: "default", ssid: "Oficina-5G", vlanId: 99, bandas: ["5GHz"] })
    ).rejects.toBeInstanceOf(AutomatedWifiWriteNotSupportedError);

    expect(updateWifiBroadcast).not.toHaveBeenCalled();
  });
});

describe("UnifiLiveClient.listNodes / rebootNode (Integration API)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveSiteId.mockResolvedValue("site-uuid");
  });

  it("arma NetworkNode combinando devices + clientes por uplink + SSIDs por device", async () => {
    listDevices.mockResolvedValue([
      { id: "dev-ap", name: "AP Recepción", model: "U6-Pro", state: "ONLINE", features: ["accessPoint"] },
      { id: "dev-sw", name: "SW Core", model: "USW-Pro-48", state: "OFFLINE", features: ["switching"] },
    ]);
    listClients.mockResolvedValue([
      { id: "c1", type: "WIRELESS", name: "laptop-1", macAddress: "aa:aa", connectedAt: "now", uplinkDeviceId: "dev-ap" },
      { id: "c2", type: "WIRELESS", name: "laptop-2", macAddress: "bb:bb", connectedAt: "now", uplinkDeviceId: "dev-ap" },
    ]);
    listWifiBroadcasts.mockResolvedValue([
      { id: "bc-1", name: "Oficina-5G", broadcastingDeviceFilter: null },
      { id: "bc-2", name: "Solo-un-AP", broadcastingDeviceFilter: { type: "DEVICES", deviceIds: ["dev-ap"] } },
    ]);
    getDeviceLatestStatistics.mockImplementation((_siteId: string, deviceId: string) =>
      deviceId === "dev-ap"
        ? Promise.resolve({ uptimeSec: 3600, lastHeartbeatAt: "2026-07-30T00:00:00.000Z" })
        : Promise.reject(new Error("device offline, sin stats"))
    );

    const client = makeClient();
    const nodes = await client.listNodes();

    const ap = nodes.find((n) => n.id === "dev-ap")!;
    expect(ap.status).toBe("online");
    expect(ap.clientesConectados).toBe(2);
    expect(ap.uptimeSegundos).toBe(3600);
    expect(ap.ultimaVezVisto).toBe("2026-07-30T00:00:00.000Z");
    expect(ap.ssidsTransmitidos.sort()).toEqual(["Oficina-5G", "Solo-un-AP"]);

    const sw = nodes.find((n) => n.id === "dev-sw")!;
    expect(sw.status).toBe("offline");
    expect(sw.clientesConectados).toBe(0);
    expect(sw.ssidsTransmitidos).toEqual([]);
    // switching no es accessPoint: no participa del filtro "sin restricción".
    // Y su llamada de stats falló: no debe tirar abajo el resto del listado.
    expect(sw.uptimeSegundos).toBeUndefined();
  });

  it("rebootNode llama a la Integration API con action RESTART, sin buscar MAC", async () => {
    const client = makeClient();
    await client.rebootNode("dev-ap");

    expect(executeDeviceAction).toHaveBeenCalledWith("site-uuid", "dev-ap", "RESTART");
  });
});
