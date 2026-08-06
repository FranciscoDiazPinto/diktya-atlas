import { describe, it, expect, vi, afterEach } from "vitest";
import { ApiError, createApiClient } from "./apiClient.js";

afterEach(() => vi.restoreAllMocks());

describe("createApiClient — retry en 401", () => {
  it("si el access token expiró, pide uno nuevo y reintenta la request una vez", async () => {
    const calls: Array<{ url: string; auth: string | null }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        calls.push({ url: String(input), auth: headers.get("authorization") });
        if (headers.get("authorization") === "Bearer old-token") {
          return new Response(JSON.stringify({ error: "jwt expired" }), { status: 401 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      })
    );

    const refreshAccessToken = vi.fn(async () => "new-token");
    const client = createApiClient({ accessToken: "old-token", refreshAccessToken });

    const result = await client.get<{ ok: boolean }>("/network/status");

    expect(result).toEqual({ ok: true });
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      { url: "http://localhost:3000/network/status", auth: "Bearer old-token" },
      { url: "http://localhost:3000/network/status", auth: "Bearer new-token" },
    ]);
  });

  it("si el refresh también falla, propaga el 401 original en vez de reintentar en loop", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "jwt expired" }), { status: 401 }))
    );

    const refreshAccessToken = vi.fn(async () => {
      throw new Error("refresh token también expiró");
    });
    const client = createApiClient({ accessToken: "old-token", refreshAccessToken });

    await expect(client.get("/network/status")).rejects.toThrow(ApiError);
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("una respuesta que no es 401 no dispara ningún refresh", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "boom" }), { status: 500 }))
    );

    const refreshAccessToken = vi.fn(async () => "new-token");
    const client = createApiClient({ accessToken: "old-token", refreshAccessToken });

    await expect(client.get("/network/status")).rejects.toThrow(ApiError);
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });
});
