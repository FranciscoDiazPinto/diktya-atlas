import { describe, it, expect } from "vitest";
import { getToolsForRole, isToolAllowedForRole } from "../src/llm/tools/registry.js";

describe("llm/tools/registry — diagnose_node y get_node_history", () => {
  it("ADMIN y TECNICO las tienen disponibles", () => {
    expect(isToolAllowedForRole("ADMIN", "diagnose_node")).toBe(true);
    expect(isToolAllowedForRole("ADMIN", "get_node_history")).toBe(true);
    expect(isToolAllowedForRole("TECNICO", "diagnose_node")).toBe(true);
    expect(isToolAllowedForRole("TECNICO", "get_node_history")).toBe(true);
  });

  it("VISUALIZADOR no las tiene — mismo criterio que get_ap_detail (consulta activa/operativa, no solo lectura de resumen)", () => {
    expect(isToolAllowedForRole("VISUALIZADOR", "diagnose_node")).toBe(false);
    expect(isToolAllowedForRole("VISUALIZADOR", "get_node_history")).toBe(false);
  });

  it("el schema JSON que ve el LLM incluye las dos tools para un rol ADMIN", () => {
    const tools = getToolsForRole("ADMIN").map((t) => t.name);
    expect(tools).toContain("diagnose_node");
    expect(tools).toContain("get_node_history");
  });
});

describe("llm/tools/registry — get_activity_digest, get_availability, list_open_issues, assign_ticket", () => {
  it("get_activity_digest y list_open_issues: lectura abierta a los 3 roles, mismo criterio que sus REST (/reports/digest, /tickets GET)", () => {
    for (const role of ["ADMIN", "TECNICO", "VISUALIZADOR"] as const) {
      expect(isToolAllowedForRole(role, "get_activity_digest")).toBe(true);
      expect(isToolAllowedForRole(role, "list_open_issues")).toBe(true);
    }
  });

  it("get_availability: solo ADMIN, mismo criterio que el REST /reports/availability", () => {
    expect(isToolAllowedForRole("ADMIN", "get_availability")).toBe(true);
    expect(isToolAllowedForRole("TECNICO", "get_availability")).toBe(false);
    expect(isToolAllowedForRole("VISUALIZADOR", "get_availability")).toBe(false);
  });

  it("assign_ticket: ADMIN y TECNICO, nunca VISUALIZADOR — es una escritura", () => {
    expect(isToolAllowedForRole("ADMIN", "assign_ticket")).toBe(true);
    expect(isToolAllowedForRole("TECNICO", "assign_ticket")).toBe(true);
    expect(isToolAllowedForRole("VISUALIZADOR", "assign_ticket")).toBe(false);
  });
});
