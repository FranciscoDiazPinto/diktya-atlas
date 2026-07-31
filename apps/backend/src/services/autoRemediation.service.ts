import { prisma } from "../db/client.js";
import { getUnifiClient } from "../integrations/unifi/index.js";
import { UnifiLiveClient } from "../integrations/unifi/liveClient.js";
import { withLock, LockAcquisitionError } from "./lock.service.js";
import { recordAudit } from "./audit.service.js";
import { createTicket, resolveTicket } from "./ticket.service.js";
import { publishRealtimeEvent } from "../realtime/hub.js";
import { env } from "../config/env.js";
import { triageQueue } from "../workers/queues.js";
import type { AutoRemediateJobData } from "../workers/queues.js";

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Resultado =
  | { tipo: "ya_recuperado"; pasos: string[] }
  | { tipo: "reset_exitoso"; pasos: string[] }
  /**
   * Volvió online durante la espera, pero el comando de reset había
   * fallado (confirmado contra hardware real: la Integration API devuelve
   * 422 al pedir RESTART de un device que ya figura offline — no hay canal
   * abierto para entregarle el comando). Sin este caso separado, un blip
   * de red coincidente con la ventana de espera se etiquetaba como
   * "reset exitoso" cuando el reset en realidad nunca funcionó.
   */
  | { tipo: "recuperado_solo"; pasos: string[] }
  | { tipo: "readopcion_exitosa"; pasos: string[]; nuevoExternalId: string }
  | { tipo: "fallido"; pasos: string[] };

/**
 * Intenta resetear y, si hace falta, re-adoptar un dispositivo offline
 * antes de escalar a un ticket para técnico — diseño acordado en
 * Atlas/Plataforma ATLAS (Codex).md § Decisión.
 *
 * Rompe a propósito la invariante que tenía `rebootNode` hasta ahora
 * ("nunca se dispara solo desde un worker") — mitigada por: alcance
 * acotado por tipo de dispositivo (política de Admin, ver
 * AUTO_REMEDIATE_DEVICE_TYPES en config/env.ts, no por rol de usuario —
 * acá no hay nadie autenticado ejecutando la acción), cooldown para no
 * reintentar en loop sobre un device flapping, y el mismo lock distribuido
 * que ya usa el reboot manual (para que un técnico y este worker no puedan
 * pisarse el mismo dispositivo a la vez).
 *
 * Re-adopción es la parte menos probada de las dos: no hay forma segura de
 * validarla contra hardware real sin desconectar un equipo a propósito
 * (ver conversación de diseño) — puede que el device no conserve su config
 * previa (SSIDs, VLAN) al re-adoptarse, por eso el ticket resultante
 * siempre pide revisión humana cuando esa rama se ejecutó, sin importar el
 * resultado.
 */
export async function processAutoRemediation(data: AutoRemediateJobData): Promise<void> {
  const node = await prisma.networkNode.findUnique({ where: { id: data.nodeId } });
  if (!node) {
    console.warn(`[worker-autoremediate] nodo ${data.nodeId} no encontrado`);
    return;
  }

  // Se marca ANTES de intentar, sin importar el resultado — el cooldown
  // (ver nodeSync.service.ts::isElegibleParaAutoRemediacion) tiene que
  // arrancar a correr desde el intento, no desde el éxito, o un device
  // flapping dispararía un intento por cada ciclo de offline/online.
  await prisma.networkNode.update({ where: { id: node.id }, data: { lastAutoRemediationAt: new Date() } });

  const client = getUnifiClient();

  let resultado: Resultado;
  try {
    resultado = await withLock(`reboot:${node.externalId}`, () => intentarRecuperar(node, client));
  } catch (err) {
    if (err instanceof LockAcquisitionError) {
      // Alguien (probablemente un técnico) ya está operando este device
      // ahora mismo — no competir, dejar que BullMQ reintente más tarde.
      console.warn(`[worker-autoremediate] ${err.message}, se reintentará`);
      throw err;
    }
    resultado = { tipo: "fallido", pasos: [`error inesperado: ${err instanceof Error ? err.message : String(err)}`] };
  }

  if (resultado.tipo === "fallido") {
    await recordAudit({
      workerName: "worker-autoremediate",
      parametros: data,
      resultado,
      exitoso: false,
    });
    await triageQueue.add("triage-alert", {
      alertId: data.alertId,
      notaPrevia: `Auto-remediación intentada sin éxito: ${resultado.pasos.join(" → ")}.`,
    });
    return;
  }

  const requiereRevisionConfig = resultado.tipo === "readopcion_exitosa";
  const tituloAccion = resultado.tipo === "recuperado_solo" ? "Recuperado (sin intervención efectiva)" : "Auto-remediado";
  const resumen =
    resultado.tipo === "recuperado_solo"
      ? `El dispositivo "${node.nombre}" (${node.sitio}) volvió a responder solo — el intento de reset automático falló, no fue lo que lo recuperó.`
      : `El dispositivo "${node.nombre}" (${node.sitio}) se recuperó automáticamente.`;
  const ticket = await createTicket({
    titulo: `${tituloAccion}: "${node.nombre}" en ${node.sitio}`,
    descripcion: [
      resumen,
      `Pasos: ${resultado.pasos.join(" → ")}.`,
      requiereRevisionConfig
        ? "Se re-adoptó el dispositivo — verificar manualmente que conservó su configuración (SSIDs, VLAN asignada); la re-adopción no está validada contra hardware real todavía."
        : null,
    ]
      .filter(Boolean)
      .join("\n\n"),
    severidad: "INFO",
    nodoAfectadoId: node.id,
  });
  await resolveTicket(ticket.id);
  await prisma.alert.update({ where: { id: data.alertId }, data: { ticketId: ticket.id } });
  await publishRealtimeEvent({ type: "ticket_updated", payload: ticket });

  await recordAudit({
    workerName: "worker-autoremediate",
    parametros: data,
    resultado,
    exitoso: true,
  });
}

async function intentarRecuperar(
  node: { id: string; externalId: string; macAddress: string | null; sitio: string },
  client: ReturnType<typeof getUnifiClient>
): Promise<Resultado> {
  const pasos: string[] = [];

  const actual = await client.getNodeDetail(node.externalId);
  if (actual?.status === "online") {
    pasos.push("ya estaba online al momento de intentar (se recuperó solo)");
    return { tipo: "ya_recuperado", pasos };
  }

  let resetComandoExitoso = false;
  try {
    await client.rebootNode(node.externalId);
    pasos.push("reset enviado");
    resetComandoExitoso = true;
  } catch (err) {
    pasos.push(`reset falló: ${err instanceof Error ? err.message : String(err)}`);
  }

  await esperar(env.AUTO_REMEDIATE_WAIT_SECONDS * 1000);

  const trasReset = await client.getNodeDetail(node.externalId);
  if (trasReset?.status === "online") {
    if (resetComandoExitoso) {
      pasos.push("volvió online tras el reset");
      return { tipo: "reset_exitoso", pasos };
    }
    pasos.push("volvió online durante la espera, pero el comando de reset había fallado — no fue el reset lo que lo recuperó");
    return { tipo: "recuperado_solo", pasos };
  }
  pasos.push(`seguía sin responder tras esperar ${env.AUTO_REMEDIATE_WAIT_SECONDS}s`);

  if (!(client instanceof UnifiLiveClient)) {
    pasos.push("re-adopción no disponible (modo mock)");
    return { tipo: "fallido", pasos };
  }
  if (!node.macAddress) {
    pasos.push("re-adopción no intentada (sin MAC guardada para este nodo)");
    return { tipo: "fallido", pasos };
  }

  let pendientes;
  try {
    pendientes = await client.listPendingDevices();
  } catch (err) {
    pasos.push(`no se pudo listar pending-devices: ${err instanceof Error ? err.message : String(err)}`);
    return { tipo: "fallido", pasos };
  }

  const match = pendientes.find((d) => d.macAddress.toLowerCase() === node.macAddress!.toLowerCase());
  if (!match) {
    pasos.push("no apareció en pending-devices — no hay nada más que intentar automáticamente");
    return { tipo: "fallido", pasos };
  }
  pasos.push(`encontrado en pending-devices (estado ${match.state}), intentando re-adopción`);

  let readoptado;
  try {
    readoptado = await client.adoptDevice(node.macAddress);
    pasos.push(`re-adopción enviada (nuevo id ${readoptado.id})`);
  } catch (err) {
    pasos.push(`re-adopción falló: ${err instanceof Error ? err.message : String(err)}`);
    return { tipo: "fallido", pasos };
  }

  // El device tiene un id nuevo tras re-adoptarse (el viejo externalId ya
  // no existe del lado del proveedor) — re-apuntar nuestra fila existente
  // en vez de dejar que un futuro sync cree una fila duplicada.
  await prisma.networkNode.update({ where: { id: node.id }, data: { externalId: readoptado.id } });

  await esperar(Math.min(env.AUTO_REMEDIATE_WAIT_SECONDS, 30) * 1000);
  const trasAdopcion = await client.getNodeDetail(readoptado.id);
  if (trasAdopcion?.status === "online") {
    pasos.push("volvió online tras la re-adopción");
    return { tipo: "readopcion_exitosa", pasos, nuevoExternalId: readoptado.id };
  }
  pasos.push(`re-adoptado pero todavía no reporta online (estado: ${trasAdopcion?.status ?? "desconocido"}) — puede seguir aprovisionándose`);
  return { tipo: "fallido", pasos };
}
