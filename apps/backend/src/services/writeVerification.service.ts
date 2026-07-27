import type { UnifiClient, WriteWifiNetworkInput } from "../integrations/unifi/client.js";
import type { WifiNetwork } from "../domain/network.js";

export interface VerificationResult {
  verified: boolean;
  rollback?: {
    attempted: boolean;
    succeeded: boolean;
  };
}

function sameBands(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((band, i) => band === sortedB[i]);
}

function matchesExpected(reread: WifiNetwork | null, input: WriteWifiNetworkInput): boolean {
  if (!reread) return false;
  return reread.ssid === input.ssid && reread.vlanId === input.vlanId && sameBands(reread.bandas, input.bandas);
}

/**
 * Después de CADA escritura real: releer inmediatamente y comparar campo a
 * campo contra lo enviado. Si no coincide, intentar rollback a la config
 * anterior. Si el rollback también falla, el llamador (worker-remediation)
 * debe crear un ticket CRÍTICO — el recurso puede haber quedado en un
 * estado inconsistente y requiere intervención humana inmediata.
 */
export async function verifyWriteAndRollbackIfNeeded(params: {
  client: UnifiClient;
  input: WriteWifiNetworkInput;
  previous: WifiNetwork | null;
}): Promise<VerificationResult> {
  const { client, input, previous } = params;

  const reread = await client.getWifiNetwork(input.sitio, input.ssid);
  if (matchesExpected(reread, input)) {
    return { verified: true };
  }

  if (!previous) {
    // Era una creación nueva (no había config anterior a la que volver):
    // no hay rollback posible, solo dejar constancia clara del fallo.
    return { verified: false, rollback: { attempted: false, succeeded: false } };
  }

  try {
    await client.writeWifiNetwork({
      sitio: previous.sitio,
      ssid: previous.ssid,
      vlanId: previous.vlanId,
      bandas: previous.bandas,
    });
    const rerereadAfterRollback = await client.getWifiNetwork(previous.sitio, previous.ssid);
    const rollbackSucceeded =
      rerereadAfterRollback !== null &&
      rerereadAfterRollback.vlanId === previous.vlanId &&
      sameBands(rerereadAfterRollback.bandas, previous.bandas);
    return { verified: false, rollback: { attempted: true, succeeded: rollbackSucceeded } };
  } catch {
    return { verified: false, rollback: { attempted: true, succeeded: false } };
  }
}
