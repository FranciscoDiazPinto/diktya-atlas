import { describe, it, expect } from "vitest";
import { stripProxyPrefix } from "../src/integrations/unifiOs/client.js";

describe("stripProxyPrefix", () => {
  it("saca el /proxy inicial (el connector ya lo antepone del lado de la consola)", () => {
    expect(stripProxyPrefix("/proxy/network/integration/v1/sites")).toBe("/network/integration/v1/sites");
  });

  it("no toca un /proxy que no está al principio del path", () => {
    expect(stripProxyPrefix("/network/integration/v1/proxy/sites")).toBe("/network/integration/v1/proxy/sites");
  });

  it("deja intacto un path que ya no tiene /proxy", () => {
    expect(stripProxyPrefix("/network/integration/v1/sites")).toBe("/network/integration/v1/sites");
  });
});
