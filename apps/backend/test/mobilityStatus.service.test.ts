import { describe, it, expect, vi, beforeEach } from "vitest";
import { HttpError } from "../src/lib/errors.js";

const listWorkspaces = vi.fn();
const listDevices = vi.fn();
const getDeviceDetail = vi.fn();
const listDeviceClients = vi.fn();

const fakeClient = { listWorkspaces, listDevices, getDeviceDetail, listDeviceClients };

const getMobilityClient = vi.fn(() => fakeClient);

vi.mock("../src/integrations/mobility/client.js", () => ({ getMobilityClient: () => getMobilityClient() }));

const { getMobilityStatus, getMobilityDeviceDetail } = await import("../src/services/mobilityStatus.service.js");

describe("mobilityStatus.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMobilityClient.mockReturnValue(fakeClient);
  });

  describe("getMobilityStatus", () => {
    it("junta cada workspace con sus devices", async () => {
      listWorkspaces.mockResolvedValue([
        { workspace_id: "ws-1", workspace_name: "Diktya", is_owner: true, status: "ACTIVE" },
        { workspace_id: "ws-2", workspace_name: "Otro", is_owner: false, status: "ACTIVE" },
      ]);
      listDevices.mockImplementation((workspaceId: string) =>
        Promise.resolve(
          workspaceId === "ws-1"
            ? [{ id: "dev-1", name: "UMR-1", model: "UMR", state: "CONNECTED", firmware_version: "1.0", mac_address: "aa" }]
            : []
        )
      );

      const result = await getMobilityStatus();

      expect(result.workspaces).toHaveLength(2);
      expect(result.workspaces[0]!.workspace.workspace_id).toBe("ws-1");
      expect(result.workspaces[0]!.devices).toHaveLength(1);
      expect(result.workspaces[1]!.devices).toEqual([]);
      expect(listDevices).toHaveBeenCalledWith("ws-1");
      expect(listDevices).toHaveBeenCalledWith("ws-2");
    });

    it("tira 503 si no está configurada la API key (no 500 genérico)", async () => {
      getMobilityClient.mockReturnValue(null);

      await expect(getMobilityStatus()).rejects.toMatchObject({ statusCode: 503 });
      await expect(getMobilityStatus()).rejects.toBeInstanceOf(HttpError);
      expect(listWorkspaces).not.toHaveBeenCalled();
    });
  });

  describe("getMobilityDeviceDetail", () => {
    it("junta el detalle del device con sus clientes conectados", async () => {
      getDeviceDetail.mockResolvedValue({
        id: "dev-1",
        name: "UMR-1",
        model: "UMR",
        state: "CONNECTED",
        firmware_version: "1.0",
        mac_address: "aa",
        wan_source: "LTE",
        client_count: 2,
      });
      listDeviceClients.mockResolvedValue([
        { mac: "AA:BB", name: "laptop", type: "WIRELESS", connection_status: "ONLINE", ip_address: "10.0.0.5", is_blocked: false },
      ]);

      const result = await getMobilityDeviceDetail("ws-1", "dev-1");

      expect(getDeviceDetail).toHaveBeenCalledWith("ws-1", "dev-1");
      expect(listDeviceClients).toHaveBeenCalledWith("ws-1", "dev-1");
      expect(result.detail.wan_source).toBe("LTE");
      expect(result.clients).toHaveLength(1);
    });

    it("tira 503 si no está configurada la API key", async () => {
      getMobilityClient.mockReturnValue(null);

      await expect(getMobilityDeviceDetail("ws-1", "dev-1")).rejects.toMatchObject({ statusCode: 503 });
      expect(getDeviceDetail).not.toHaveBeenCalled();
    });
  });
});
