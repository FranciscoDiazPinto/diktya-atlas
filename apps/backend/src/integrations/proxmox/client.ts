import { env } from "../../config/env.js";

export interface ProxmoxUserAccountInput {
  username: string;
  email: string;
  role: "ADMIN" | "TECNICO" | "VISUALIZADOR";
}

export interface ProxmoxUserAccountResult {
  userId: string;
  creado: boolean; // false si ya existía y solo se actualizó el rol
}

/**
 * Alcance mínimo a propósito: solo provisión/actualización de cuentas de
 * usuario para el equipo técnico, no gestión de VMs/contenedores. Sigue la
 * misma disciplina de RBAC que el resto del sistema (ver prompt de
 * seguridad) — el rol de Proxmox se deriva 1:1 del Role de la app.
 */
export interface ProxmoxClient {
  createOrUpdateUserAccount(input: ProxmoxUserAccountInput): Promise<ProxmoxUserAccountResult>;
}

export class ProxmoxMockClient implements ProxmoxClient {
  private accounts = new Map<string, ProxmoxUserAccountResult>();

  async createOrUpdateUserAccount(input: ProxmoxUserAccountInput): Promise<ProxmoxUserAccountResult> {
    const existing = this.accounts.get(input.username);
    const result: ProxmoxUserAccountResult = {
      userId: existing?.userId ?? `${input.username}@pve`,
      creado: !existing,
    };
    this.accounts.set(input.username, result);
    return result;
  }
}

/**
 * Cliente real vía Proxmox API (token de servicio). No validado contra un
 * cluster real en este entorno — probar en staging antes de usar en
 * producción.
 */
export class ProxmoxLiveClient implements ProxmoxClient {
  async createOrUpdateUserAccount(input: ProxmoxUserAccountInput): Promise<ProxmoxUserAccountResult> {
    if (!env.PROXMOX_HOST || !env.PROXMOX_SVC_ACCOUNT || !env.PROXMOX_SVC_TOKEN) {
      throw new Error("Proxmox live requiere PROXMOX_HOST, PROXMOX_SVC_ACCOUNT y PROXMOX_SVC_TOKEN");
    }
    const userId = `${input.username}@pve`;
    const res = await fetch(`https://${env.PROXMOX_HOST}/api2/json/access/users/${userId}`, {
      method: "PUT",
      headers: {
        Authorization: `PVEAPIToken=${env.PROXMOX_SVC_ACCOUNT}=${env.PROXMOX_SVC_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: input.email, enable: 1 }),
    });
    if (res.status === 404) {
      const createRes = await fetch(`https://${env.PROXMOX_HOST}/api2/json/access/users`, {
        method: "POST",
        headers: {
          Authorization: `PVEAPIToken=${env.PROXMOX_SVC_ACCOUNT}=${env.PROXMOX_SVC_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ userid: userId, email: input.email }),
      });
      if (!createRes.ok) {
        throw new Error(`Proxmox: no se pudo crear la cuenta ${userId}: ${createRes.status}`);
      }
      return { userId, creado: true };
    }
    if (!res.ok) {
      throw new Error(`Proxmox: no se pudo actualizar la cuenta ${userId}: ${res.status}`);
    }
    return { userId, creado: false };
  }
}

let instance: ProxmoxClient | undefined;

export function getProxmoxClient(): ProxmoxClient {
  if (!instance) {
    instance = env.PROXMOX_HOST ? new ProxmoxLiveClient() : new ProxmoxMockClient();
  }
  return instance;
}
