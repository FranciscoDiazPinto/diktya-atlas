import { describe, it, expect } from "vitest";
import { atlasAlertToAlert, atlasEquipoToNetworkNode, atlasStatusToCoreNodes } from "../src/integrations/atlas/normalize.js";
import type { AtlasAlert, AtlasInventoryEquipo, AtlasStatus } from "../src/integrations/atlas/types.js";

function baseStatus(overrides: Partial<AtlasStatus> = {}): AtlasStatus {
  return {
    node: "atlas-mon-aa",
    ts: "2026-08-10T14:00:00+00:00",
    ha_ok: true,
    carp: {
      ok: true,
      evaluable: true,
      total: 44,
      emparejadas: 44,
      invertidas: [],
      titular_perdido: false,
      maestras: { C1: 44, C2: 0 },
      vistas: { C1: 44, C2: 44 },
      resumen: "44/44 VIP emparejadas",
      detalle: { resumen: "44/44 VIP emparejadas", total: 44, emparejadas: 44, problemas: 0, titular_perdido: false, vips: [] },
      problemas: [],
    },
    unifi_ok: true,
    network: {
      C1: { ok: true, ms: 174, carp_master: 44, carp_backup: 0, demotion: "0" },
      C2: { ok: true, ms: 318, carp_master: 0, carp_backup: 44, demotion: "0" },
      carp: {
        ok: true,
        evaluable: true,
        total: 44,
        emparejadas: 44,
        invertidas: [],
        titular_perdido: false,
        maestras: { C1: 44, C2: 0 },
        vistas: { C1: 44, C2: 44 },
        resumen: "44/44 VIP emparejadas",
        detalle: { resumen: "44/44 VIP emparejadas", total: 44, emparejadas: 44, problemas: 0, titular_perdido: false, vips: [] },
        problemas: [],
      },
    },
    unifi: { ok: true, ms: 509, total: 7, online: 7, devices: [] },
    ...overrides,
  };
}

describe("atlasEquipoToNetworkNode", () => {
  const casos: Array<[string, AtlasInventoryEquipo["model"], ReturnType<typeof atlasEquipoToNetworkNode>["tipoDispositivo"]]> = [
    ["gateway real", "Enterprise Fortress Gateway", "GATEWAY"],
    ["switch de agregación", "USW Pro Aggregation", "SWITCH"],
    ["switch PoE", "USW Pro Max 24 PoE", "SWITCH"],
    ["UPS", "UPS 2U", "UPS"],
    ["AP interior", "U6 IW", "AP"],
    ["modelo desconocido", "Algo Nuevo XYZ", "OTRO"],
  ];

  it.each(casos)("infiere el tipo de dispositivo desde el modelo — %s", (_label, model, esperado) => {
    const node = atlasEquipoToNetworkNode({ name: "x", model, state: "ONLINE", ip: "10.0.0.1", fw: "1.0", cpu_pct: 0, mem_pct: 0, uptime_s: 0 });
    expect(node.tipoDispositivo).toBe(esperado);
  });

  it("usa el name como id — la única clave que da /inventory", () => {
    const node = atlasEquipoToNetworkNode({ name: "DIKTYA-SW-AA", model: "USW Pro Max 48 PoE", state: "ONLINE", ip: "10.100.20.248", fw: "7.4.1", cpu_pct: 19.2, mem_pct: 15.7, uptime_s: 1_809_944 });
    expect(node.id).toBe("DIKTYA-SW-AA");
    expect(node.uptimeSegundos).toBe(1_809_944);
  });

  it("mapea GETTING_READY/UPDATING a adopting, no a offline — son transitorios", () => {
    const geting = atlasEquipoToNetworkNode({ name: "x", model: "U6 IW", state: "GETTING_READY", ip: "", fw: "", cpu_pct: 0, mem_pct: 0, uptime_s: 0 });
    const updating = atlasEquipoToNetworkNode({ name: "x", model: "U6 IW", state: "UPDATING", ip: "", fw: "", cpu_pct: 0, mem_pct: 0, uptime_s: 0 });
    expect(geting.status).toBe("adopting");
    expect(updating.status).toBe("adopting");
  });

  it("no inventa clientesConectados ni ssidsTransmitidos — /inventory no los da por equipo", () => {
    const node = atlasEquipoToNetworkNode({ name: "x", model: "U6 IW", state: "ONLINE", ip: "", fw: "", cpu_pct: 0, mem_pct: 0, uptime_s: 0 });
    expect(node.clientesConectados).toBe(0);
    expect(node.ssidsTransmitidos).toEqual([]);
  });
});

describe("atlasStatusToCoreNodes", () => {
  it("CORE-01/CORE-02 online cuando network.C1/C2.ok es true", () => {
    const [core01, core02] = atlasStatusToCoreNodes(baseStatus());
    expect(core01.status).toBe("online");
    expect(core02.status).toBe("online");
  });

  it("marca offline el core cuyo network.Cx.ok es false, sin tocar el otro", () => {
    const status = baseStatus();
    status.network.C2.ok = false;
    const [core01, core02] = atlasStatusToCoreNodes(status);
    expect(core01.status).toBe("online");
    expect(core02.status).toBe("offline");
  });
});

describe("atlasAlertToAlert", () => {
  it("usa carp.resumen cuando el detail viene en forma nueva", () => {
    const alert: AtlasAlert = { rule: "ha_carp", entity: "cores", severity: "crit", opened_at: "t1", closed_at: null, detail: { resumen: "43/44 VIP emparejadas", total: 44 } };
    expect(atlasAlertToAlert(alert).mensaje).toBe("HA CARP: 43/44 VIP emparejadas");
  });

  it("cae a master/backup cuando el detail viene en forma vieja (histórico)", () => {
    const alert: AtlasAlert = { rule: "ha_carp", entity: "cores", severity: "crit", opened_at: "t1", closed_at: null, detail: { master: 44, backup: 44 } };
    expect(atlasAlertToAlert(alert).mensaje).toBe("HA CARP: master=44 backup=44");
  });

  it("mapea severity crit/warn a CRITICO/ADVERTENCIA, nunca INFO", () => {
    const crit: AtlasAlert = { rule: "x", entity: "y", severity: "crit", opened_at: "t", closed_at: null, detail: {} };
    const warn: AtlasAlert = { rule: "x", entity: "y", severity: "warn", opened_at: "t", closed_at: null, detail: {} };
    expect(atlasAlertToAlert(crit).severidad).toBe("CRITICO");
    expect(atlasAlertToAlert(warn).severidad).toBe("ADVERTENCIA");
  });

  it("sintetiza un id determinístico a partir de rule+entity+opened_at (la API no da uno)", () => {
    const alert: AtlasAlert = { rule: "ups_alcanzable", entity: "ups", severity: "warn", opened_at: "2026-08-04T07:02:43.905573+00:00", closed_at: null, detail: {} };
    expect(atlasAlertToAlert(alert).id).toBe("ups_alcanzable-ups-2026-08-04T07:02:43.905573+00:00");
  });
});
