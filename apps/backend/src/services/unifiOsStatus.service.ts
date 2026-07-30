import { getUnifiOsClient } from "../integrations/unifiOs/client.js";
import { HttpError } from "../lib/errors.js";

export async function getUnifiOsStatus() {
  const client = getUnifiOsClient();
  if (!client) {
    throw new HttpError(503, "UniFi OS no está configurado (falta UNIFI_OS_HOST y/o UNIFI_API_KEY)");
  }

  const sites = await client.listSites();
  const site = sites[0];
  if (!site) throw new HttpError(404, "UniFi OS no reporta ningún sitio");

  const [devices, clients] = await Promise.all([client.listDevices(site.id), client.listClients(site.id)]);

  return { site, devices, clients };
}
