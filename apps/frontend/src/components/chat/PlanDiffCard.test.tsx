import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { VlanPlan, Role } from "@diktya-atlas/shared";
import type { VlanPlanDetail } from "../../types/api.js";
import { PlanDiffCard } from "./PlanDiffCard.js";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../../hooks/useApiClient.js", () => ({ useApiClient: () => ({ get, post }) }));
let reservations: VlanPlanDetail["reservations"] = [];

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
  source: "mock", targetFingerprint: "b".repeat(64), version: 1, fingerprint: "a".repeat(64), expiresAt: new Date(Date.now() + 600000).toISOString(),
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
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
  return { ...view, queryClient };
}

beforeEach(() => {
  mockRole = "TECNICO";
  reservations = [];
  vi.resetAllMocks();
  get.mockImplementation(async () => structuredClone({ plan, reservations }));
});

describe("PlanDiffCard", () => {
  it("renderiza el diff con las acciones correctas", () => {
    mockRole = "TECNICO";
    renderWithProviders(<PlanDiffCard plan={plan} onDismiss={() => {}} />);

    expect(screen.getByText("Crear")).toBeInTheDocument();
    expect(screen.getByText("Modificar")).toBeInTheDocument();
    expect(screen.getByText(/Red-A \(VLAN 10, 5GHz\)/)).toBeInTheDocument();
    expect(screen.getByText(/Red-B \(VLAN 5\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reservar cambios/ })).toBeInTheDocument();
  });

  it("oculta los botones de confirmar/aplicar para rol VISUALIZADOR", () => {
    mockRole = "VISUALIZADOR";
    renderWithProviders(<PlanDiffCard plan={plan} onDismiss={() => {}} />);

    expect(screen.queryByRole("button", { name: /Reservar cambios/ })).not.toBeInTheDocument();
    expect(screen.getByText(/no puede reservar ni aplicar/)).toBeInTheDocument();
  });
  it("requiere confirmar la fila y distingue encolado de aplicado verificado", async () => {
    post.mockImplementation(async (path: string, body: Record<string, unknown>) => {
      if (path === "/vlan/reserve") {
        reservations = [{ id: "reservation", sitio: "sitio-a", redSolicitada: "Red-A", vlanId: 10, estado: "RESERVADA", approvalId: null, executionStatus: null, approvedAt: null, approvalExpiresAt: null }];
        return { planId: plan.id, results: [{ sitio: "sitio-a", ssid: "Red-A", vlanId: 10, ok: true, reservationId: "reservation" }] };
      }
      expect(body).toEqual({ reservationId: "reservation", version: plan.version, fingerprint: plan.fingerprint, confirm: true });
      reservations = reservations.map((row) => ({ ...row, approvalId: "approval", executionStatus: "QUEUED" }));
      return { encolado: true, approvalId: "approval", estado: "QUEUED", reservationId: "reservation" };
    });
    const { queryClient } = renderWithProviders(<PlanDiffCard plan={plan} onDismiss={() => {}} />);
    const reserve = screen.getByRole("button", { name: "Reservar cambios" });
    await waitFor(() => expect(reserve).toBeEnabled());
    fireEvent.click(reserve);
    fireEvent.click(await screen.findByRole("button", { name: "Revisar y aprobar" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("SSID: Red-A");
    expect(post).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(post).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Revisar y aprobar" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar y encolar" }));
    await screen.findByText("En cola");
    expect(screen.queryByText("Aplicado y verificado")).not.toBeInTheDocument();
    reservations = reservations.map((row) => ({ ...row, estado: "APLICADA", executionStatus: "APPLIED" }));
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ["vlan-plan", plan.id] }); });
    await screen.findByText("Aplicado y verificado");
  });
  it("impide reservar propuestas vencidas", async () => {
    const expired = { ...plan, expiresAt: new Date(Date.now() - 1000).toISOString() };
    renderWithProviders(<PlanDiffCard plan={expired} onDismiss={() => {}} />);
    expect(screen.getByRole("button", { name: "Reservar cambios" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("venció");
    expect(post).not.toHaveBeenCalled();
  });

});
