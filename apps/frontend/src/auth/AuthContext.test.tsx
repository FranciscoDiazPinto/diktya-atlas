import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import * as authApi from "../lib/authApi.js";
import { AuthProvider, useAuth } from "./AuthContext.js";

afterEach(() => vi.restoreAllMocks());

function Probe({ onReady }: { onReady: (refresh: () => Promise<string>) => void }) {
  const { status, refreshAccessToken } = useAuth();
  onReady(refreshAccessToken);
  return <span>status:{status}</span>;
}

/** Promise controlable desde afuera, para simular una respuesta de red en vuelo. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("AuthContext — refresh deduplicado", () => {
  it("dos refresh disparados en paralelo mandan un solo POST /auth/refresh", async () => {
    const refreshSpy = vi.spyOn(authApi, "refresh");
    // Mount llama refresh() una vez — se resuelve de entrada para no interferir.
    refreshSpy.mockResolvedValueOnce({
      status: "ok",
      accessToken: "mount-token",
      user: { id: "u1", email: "a@test.local", role: "ADMIN", totpEnabled: true },
    });

    let refreshAccessToken: (() => Promise<string>) | undefined;
    render(
      <AuthProvider>
        <Probe onReady={(fn) => (refreshAccessToken = fn)} />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText("status:authenticated")).toBeInTheDocument());
    expect(refreshSpy).toHaveBeenCalledTimes(1);

    // Segunda ronda de refresh (ej. dos requests golpeadas por un 401 al mismo
    // tiempo): mientras la red está "en vuelo", ambos llamados deben compartir
    // la misma promesa en vez de mandar el refresh token dos veces (el backend
    // trata un refresh token reusado como robo de sesión y revoca todo).
    const inFlight = deferred<Awaited<ReturnType<typeof authApi.refresh>>>();
    refreshSpy.mockReturnValueOnce(inFlight.promise);

    let first!: Promise<string>;
    let second!: Promise<string>;
    act(() => {
      first = refreshAccessToken!();
      second = refreshAccessToken!();
    });

    expect(refreshSpy).toHaveBeenCalledTimes(2); // 1 del mount + 1 de esta ronda (deduplicada)

    await act(async () => {
      inFlight.resolve({
        status: "ok",
        accessToken: "second-token",
        user: { id: "u1", email: "a@test.local", role: "ADMIN", totpEnabled: true },
      });
      await Promise.all([first, second]);
    });

    await expect(first).resolves.toBe("second-token");
    await expect(second).resolves.toBe("second-token");
    expect(refreshSpy).toHaveBeenCalledTimes(2);
  });
});
