import type { ReactNode } from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { VlanPlan } from "@diktya-atlas/shared";
import { AuthProvider } from "../../auth/AuthContext.js";
import { PlanDiffCard } from "./PlanDiffCard.js";

const plan: VlanPlan = {
  id: "plan-1",
  creadoEn: new Date().toISOString(),
  items: [
    { sitio: "sitio-a", redActual: null, redPropuesta: { ssid: "Red-A", vlanId: 10, banda: "5GHz" }, accion: "crear" },
    {
      sitio: "sitio-b",
      redActual: { ssid: "Red-B", vlanId: 5 },
      redPropuesta: { ssid: "Red-B", vlanId: 6, banda: "5GHz" },
      accion: "modificar",
    },
  ],
};

function renderWithProviders(ui: ReactNode, role: "ADMIN" | "TECNICO" | "VISUALIZADOR") {
  window.localStorage.setItem("netbot.devRole", role);
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthProvider>{ui}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("PlanDiffCard", () => {
  beforeEach(() => window.localStorage.clear());

  it("renderiza el diff con las acciones correctas", () => {
    renderWithProviders(<PlanDiffCard plan={plan} onDismiss={() => {}} />, "TECNICO");

    expect(screen.getByText("Crear")).toBeInTheDocument();
    expect(screen.getByText("Modificar")).toBeInTheDocument();
    expect(screen.getByText(/Red-A \(VLAN 10, 5GHz\)/)).toBeInTheDocument();
    expect(screen.getByText(/Red-B \(VLAN 5\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirmar/ })).toBeInTheDocument();
  });

  it("oculta los botones de confirmar/aplicar para rol VISUALIZADOR", () => {
    renderWithProviders(<PlanDiffCard plan={plan} onDismiss={() => {}} />, "VISUALIZADOR");

    expect(screen.queryByRole("button", { name: /Confirmar/ })).not.toBeInTheDocument();
    expect(screen.getByText(/no puede reservar ni aplicar/)).toBeInTheDocument();
  });
});
