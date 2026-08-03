import { getSiteManagerClient } from "../integrations/siteManager/client.js";
import { HttpError } from "../lib/errors.js";

/** Ver GET /site-manager/hosts — sirve para descubrir el `id` a pegar en UNIFI_SITE_MANAGER_HOST_ID. */
export async function listSiteManagerHosts() {
  const client = getSiteManagerClient();
  if (!client) {
    throw new HttpError(503, "UniFi Site Manager no está configurado (falta UNIFI_SITE_MANAGER_API_KEY)");
  }
  return client.listHosts();
}
