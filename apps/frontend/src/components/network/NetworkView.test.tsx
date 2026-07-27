import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../auth/AuthContext.js";
import { RealtimeProvider } from "../../hooks/RealtimeProvider.js";
import { NetworkView } from "./NetworkView.js";

// NodeDetailPanel usa useRealtime() (para "actualizado hace Xs"), así que
// necesita <RealtimeProvider> en el árbol. Se reemplaza WebSocket global
// por un fake no-op para no intentar conectar de verdad en los tests.
class FakeWebSocket {
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  close() {}
}

function renderView() {
  window.localStorage.setItem("netbot.devRole", "ADMIN");
  vi.stubGlobal("WebSocket", FakeWebSocket);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/red"]}>
        <AuthProvider>
          <RealtimeProvider>
            <NetworkView />
          </RealtimeProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const emptyStatus = {
  totalNodos: 0,
  online: 0,
  offline: 0,
  adoptando: 0,
  alertasPorSeveridad: { INFO: 0, ADVERTENCIA: 0, CRITICO: 0 },
  nodos: [],
  alertasRecientes: [],
};

describe("NetworkView estados de carga/error/vacío", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("muestra loading mientras carga", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {}))
    );
    renderView();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("muestra el mensaje de error si la request falla", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "Error de red" }), { status: 500 }))
    );
    renderView();
    await waitFor(() => expect(screen.getByText("Error de red")).toBeInTheDocument());
  });

  it("muestra estado vacío cuando no hay nodos", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(emptyStatus), { status: 200 }))
    );
    renderView();
    await waitFor(() => expect(screen.getByText("Sin nodos todavía")).toBeInTheDocument());
  });
});
