import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AtlasHttpClient } from "../src/integrations/atlas/client.js";
import { MockAtlasClient } from "../src/integrations/atlas/mockClient.js";

describe("AtlasHttpClient", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok", node: "atlas-mon-aa", ts: "2026-08-10T14:00:00+00:00" }),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("arma la URL sobre HTTP plano, nunca HTTPS (ATLAS no tiene TLS)", async () => {
    const client = new AtlasHttpClient({ baseUrl: "10.100.25.245:8000" });
    await client.health();

    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((url as URL).toString()).toBe("http://10.100.25.245:8000/health");
  });

  it("manda las cabeceras configuradas — el punto de inserción para cuando la API pida credencial", async () => {
    const client = new AtlasHttpClient({ baseUrl: "10.100.25.245:8000", headers: { Authorization: "Bearer x" } });
    await client.health();

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers).toEqual({ Authorization: "Bearer x" });
  });

  it("serializa los query params de /events, incluido kind y limit", async () => {
    const client = new AtlasHttpClient({ baseUrl: "10.100.25.245:8000" });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ horas: 48, total: 0, eventos: [] }),
    });

    await client.events({ horas: 48, kind: "carp_change", limit: 10 });

    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const parsed = url as URL;
    expect(parsed.pathname).toBe("/events");
    expect(parsed.searchParams.get("horas")).toBe("48");
    expect(parsed.searchParams.get("kind")).toBe("carp_change");
    expect(parsed.searchParams.get("limit")).toBe("10");
  });

  it("no manda un param cuando no se pasa — no fuerza incluir_cerradas=false por defecto", async () => {
    const client = new AtlasHttpClient({ baseUrl: "10.100.25.245:8000" });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ total: 0, alertas: [] }) });

    await client.alerts();

    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((url as URL).searchParams.has("incluir_cerradas")).toBe(false);
  });

  it("interpola el MAC de clientTimeline directo en el path, sin escapar los dos puntos", async () => {
    const client = new AtlasHttpClient({ baseUrl: "10.100.25.245:8000" });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ mac: "00:e2:59:01:87:13", horas: 24, conectado_ahora: false, estado: null, roams: 0, reconexiones: 0, estabilidad: "estable", eventos: [] }),
    });

    await client.clientTimeline("00:e2:59:01:87:13");

    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((url as URL).pathname).toBe("/clients/00:e2:59:01:87:13/timeline");
  });

  it("tira un error explícito en HTTP no-ok, en vez de devolver el cuerpo de error como si fuera dato", async () => {
    const client = new AtlasHttpClient({ baseUrl: "10.100.25.245:8000" });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 422, statusText: "Unprocessable Entity" });

    await expect(client.events({ horas: 999 })).rejects.toThrow(/422/);
  });

  it("NO tira por un 200 con ok:false en el cuerpo — el contrato dice que eso es dato válido, no error", async () => {
    const client = new AtlasHttpClient({ baseUrl: "10.100.25.245:8000" });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false, error: "no implementado: hosts PVE inalcanzables desde VLAN 25 (por diseño)" }),
    });

    const result = await client.statusProxmox();
    expect(result.ok).toBe(false);
  });

  it("pasa un AbortSignal en cada llamada (timeout por categoría)", async () => {
    const client = new AtlasHttpClient({ baseUrl: "10.100.25.245:8000" });
    await client.energia();

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("MockAtlasClient", () => {
  it("status() por defecto reporta HA sano, 44/44 VIP emparejadas", async () => {
    const client = new MockAtlasClient();
    const status = await client.status();
    expect(status.ha_ok).toBe(true);
    expect(status.carp.resumen).toBe("44/44 VIP emparejadas");
  });

  it("events() filtra por kind cuando se pide, sin tocar los demás", async () => {
    const client = new MockAtlasClient();
    client.seedEvent({ ts: "2026-08-10T00:00:00+00:00", kind: "wan_change", entity: "WAN_901", detail: {}, severity: "crit" });
    client.seedEvent({ ts: "2026-08-10T00:01:00+00:00", kind: "client_new", entity: "aa:bb", detail: {}, severity: "info" });

    const filtered = await client.events({ kind: "wan_change" });
    expect(filtered.eventos).toHaveLength(1);
    expect(filtered.eventos[0].kind).toBe("wan_change");
  });

  it("alerts() sin incluirCerradas solo devuelve las abiertas (closed_at null)", async () => {
    const client = new MockAtlasClient();
    client.seedAlert({ rule: "ha_carp", entity: "cores", severity: "crit", opened_at: "t1", closed_at: "t2", detail: {} });
    client.seedAlert({ rule: "ups_alcanzable", entity: "ups", severity: "warn", opened_at: "t3", closed_at: null, detail: {} });

    const open = await client.alerts();
    expect(open.alertas).toHaveLength(1);
    expect(open.alertas[0].rule).toBe("ups_alcanzable");

    const all = await client.alerts({ incluirCerradas: true });
    expect(all.alertas).toHaveLength(2);
  });

  it("clientTimeline() de un MAC no sembrado da estado null, no un error", async () => {
    const client = new MockAtlasClient();
    const timeline = await client.clientTimeline("00:00:00:00:00:00");
    expect(timeline.estado).toBeNull();
    expect(timeline.conectado_ahora).toBe(false);
  });
});
