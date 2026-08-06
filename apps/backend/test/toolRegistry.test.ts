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
