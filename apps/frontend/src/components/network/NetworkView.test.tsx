import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../auth/AuthContext.js";
import { RealtimeProvider } from "../../hooks/RealtimeProvider.js";
import { NetworkView } from "./NetworkView.js";
import type { ApiNetworkNode } from "../../types/api.js";

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

function renderView(path = "/red") {
  window.localStorage.setItem("netbot.devRole", "ADMIN");
  vi.stubGlobal("WebSocket", FakeWebSocket);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <RealtimeProvider>
            <NetworkView />
          </RealtimeProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/** Mock de `fetch` enrutado por path — cada endpoint que consume NetworkView
 * (status, wifi-networks, detalle de nodo, reboot) devuelve una respuesta
 * distinta en vez del mismo objeto para todos (a diferencia del mock plano
 * de arriba, que solo alcanza para los casos de loading/error/vacío). */
function mockFetchByPath(routes: Record<string, unknown>) {
  const rebootCalls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/reboot")) {
        rebootCalls.push(url);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      for (const [path, body] of Object.entries(routes)) {
        if (url.includes(path)) return new Response(JSON.stringify(body), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "no mockeado" }), { status: 404 });
    })
  );
  return rebootCalls;
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

function nodo(overrides: Partial<ApiNetworkNode>): ApiNetworkNode {
  return {
    id: "node-1",
    externalId: "ext-1",
    sitio: "sitio-a",
    nombre: "AP Recepción",
    modelo: "U6-Lite",
    tipoDispositivo: "AP" as const,
    status: "ONLINE" as const,
    senalDbm: -45,
    clientesConectados: 12,
    uptimeSegundos: 3600,
    ultimaVezVisto: new Date().toISOString(),
    ssidsTransmitidos: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const statusConNodos = {
  totalNodos: 2,
  online: 2,
  offline: 0,
  adoptando: 0,
  alertasPorSeveridad: { INFO: 0, ADVERTENCIA: 0, CRITICO: 0 },
  nodos: [nodo({ id: "node-1", nombre: "AP Recepción" }), nodo({ id: "node-2", nombre: "AP Bodega" })],
  alertasRecientes: [],
};

const wifiNetworksFixture = [
  {
    id: "wifi-1",
    sitio: "sitio-a",
    ssid: "DIKTYA-STAFF",
    vlanId: 10,
    bandas: ["2.4GHz", "5GHz"],
    clientesConectados: 8,
    throughputMbps: 42.5,
  },
];

const nodeDetailFixture = {
  ...statusConNodos.nodos[0],
  wifiNetworks: [],
  alerts: [],
};

describe("NetworkView — VLANs y búsqueda", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("VLANs es bajo demanda: no pega a /live hasta apretar 'Consultar ahora'", async () => {
    mockFetchByPath({
      "/network/wifi-networks/live": wifiNetworksFixture,
      "/network/status": statusConNodos,
    });
    renderView();
    await waitFor(() => expect(screen.getByText("Sin consultar todavía")).toBeInTheDocument());
    expect(screen.queryByText("DIKTYA-STAFF")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Consultar ahora" }));
    await waitFor(() => expect(screen.getByText("DIKTYA-STAFF")).toBeInTheDocument());
  });

  it("el buscador filtra la lista de nodos por nombre", async () => {
    mockFetchByPath({
      "/network/wifi-networks/live": [],
      "/network/status": statusConNodos,
    });
    renderView();
    await waitFor(() => expect(screen.getAllByText("AP Bodega").length).toBeGreaterThan(0));

    fireEvent.change(screen.getByPlaceholderText("Buscar nodo por nombre…"), {
      target: { value: "Recepción" },
    });

    // NodeList renderiza tabla (sm+) y cards (mobile) al mismo tiempo — jsdom no
    // aplica los media queries de Tailwind, así que ambas variantes conviven en el
    // DOM de test. Se comprueba con getAllByText/queryAllByText en vez de asumir un
    // único match.
    expect(screen.getAllByText("AP Recepción").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("AP Bodega")).toHaveLength(0);
  });
});

describe("NetworkView — confirmación doble de reinicio", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("no reinicia hasta completar los dos pasos del diálogo", async () => {
    // El botón "Reiniciar" solo se muestra a ADMIN/TECNICO (canDiagnose en
    // NodeDetailPanel.tsx) — hace falta que /auth/refresh "loguee" a alguien con
    // ese rol, la sesión no depende de localStorage.
    const rebootCalls = mockFetchByPath({
      "/auth/refresh": {
        status: "ok",
        accessToken: "fake-token",
        user: { id: "admin-1", email: "admin@test.local", role: "ADMIN", totpEnabled: true },
      },
      "/network/wifi-networks/live": [],
      "/network/status": statusConNodos,
      "/network/nodes/node-1": nodeDetailFixture,
    });
    renderView("/red?nodeId=node-1");

    const rebootButton = await screen.findByRole("button", { name: /reiniciar/i });
    fireEvent.click(rebootButton);

    // Paso 1: impacto + "Continuar" — todavía no debe haber pegado al backend.
    const continuarButton = await screen.findByRole("button", { name: "Continuar" });
    expect(rebootCalls).toHaveLength(0);
    fireEvent.click(continuarButton);

    // Paso 2: botón final deshabilitado hasta marcar el checkbox.
    const confirmarButton = await screen.findByRole("button", { name: "Reiniciar ahora" });
    expect(confirmarButton).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(confirmarButton).not.toBeDisabled();

    fireEvent.click(confirmarButton);
    await waitFor(() => expect(rebootCalls).toHaveLength(1));
  });
});
