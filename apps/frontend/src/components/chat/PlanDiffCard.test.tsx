import type { ReactNode } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { VlanPlan, Role } from "@diktya-atlas/shared";
import { PlanDiffCard } from "./PlanDiffCard.js";

// PlanDiffCard solo necesita el rol de useAuth() — mockeamos el hook
// directamente en vez de pasar por AuthProvider real (que ahora hace un
// POST /auth/refresh de verdad al montar).
let mockRole: Role = "TECNICO";
vi.mock("../../auth/AuthContext.js", () => ({
  useAuth: () => ({
    user: { id: "test-user", email: "test@example.com", role: mockRole, totpEnabled: true },
  }),
}));

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

function renderWithProviders(ui: ReactNode) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("PlanDiffCard", () => {
  it("renderiza el diff con las acciones correctas", () => {
    mockRole = "TECNICO";
    renderWithProviders(<PlanDiffCard plan={plan} onDismiss={() => {}} />);

    expect(screen.getByText("Crear")).toBeInTheDocument();
    expect(screen.getByText("Modificar")).toBeInTheDocument();
    expect(screen.getByText(/Red-A \(VLAN 10, 5GHz\)/)).toBeInTheDocument();
    expect(screen.getByText(/Red-B \(VLAN 5\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirmar/ })).toBeInTheDocument();
  });

  it("oculta los botones de confirmar/aplicar para rol VISUALIZADOR", () => {
    mockRole = "VISUALIZADOR";
    renderWithProviders(<PlanDiffCard plan={plan} onDismiss={() => {}} />);

    expect(screen.queryByRole("button", { name: /Confirmar/ })).not.toBeInTheDocument();
    expect(screen.getByText(/no puede reservar ni aplicar/)).toBeInTheDocument();
  });
});
