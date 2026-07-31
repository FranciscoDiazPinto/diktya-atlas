import { prisma } from "../db/client.js";

export interface AvailabilityParams {
  desde: Date;
  hasta: Date;
}

interface EventoOrdenado {
  createdAt: Date;
  status: string;
}

/**
 * Estado de un nodo en un momento dado, a partir de su lista de eventos ya
 * ordenada ascendente. `null` = todavía no había ningún registro (ni
 * `estadoInicial` ni eventos previos) — "sin datos", no "offline".
 */
function estadoEnMomento(eventos: EventoOrdenado[], estadoInicial: string | null, momento: Date): string | null {
  let estado = estadoInicial;
  for (const e of eventos) {
    if (e.createdAt.getTime() > momento.getTime()) break;
    estado = e.status;
  }
  return estado;
}

const BUCKETS_HISTOGRAMA = [
  { label: "< 1 min", maxMin: 1 },
  { label: "1–5 min", maxMin: 5 },
  { label: "5–15 min", maxMin: 15 },
  { label: "15–60 min", maxMin: 60 },
  { label: "> 1 h", maxMin: Infinity },
];

/**
 * Disponibilidad real por rango de fechas, a partir de NodeStatusEvent (un
 * registro por cambio de estado, no por poll — ver el modelo en
 * schema.prisma). Reemplaza lo que `activityDigest.service.ts` no podía
 * dar (`estadoActual` ahí es una foto de ahora, no histórico).
 */
export async function getAvailability(params: AvailabilityParams) {
  const { desde, hasta } = params;
  const nodos = await prisma.networkNode.findMany({ orderBy: { nombre: "asc" } });

  const porNodo: Array<{
    nodeId: string;
    nombre: string;
    tipoDispositivo: string;
    disponibilidadPct: number | null;
  }> = [];

  // Eventos + estado justo antes de `desde`, por nodo — para poder decir
  // qué estaba pasando ya al arrancar la ventana, no solo lo que cambió
  // dentro de ella.
  const eventosPorNodo = new Map<string, EventoOrdenado[]>();
  const estadoInicialPorNodo = new Map<string, string | null>();
  const outages: Array<{ nodeId: string; nombre: string; desde: Date; hasta: Date; duracionMin: number }> = [];

  for (const nodo of nodos) {
    const [ultimoAntes, enRango] = await Promise.all([
      prisma.nodeStatusEvent.findFirst({
        where: { nodeId: nodo.id, createdAt: { lt: desde } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.nodeStatusEvent.findMany({
        where: { nodeId: nodo.id, createdAt: { gte: desde, lte: hasta } },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const estadoInicial = ultimoAntes?.status ?? null;
    eventosPorNodo.set(nodo.id, enRango);
    estadoInicialPorNodo.set(nodo.id, estadoInicial);

    // % online: suma de los tramos "ONLINE" entre estadoInicial y hasta.
    const timeline = [{ createdAt: desde, status: estadoInicial }, ...enRango, { createdAt: hasta, status: null }];
    let msOnline = 0;
    let msConDatos = 0;
    for (let i = 0; i < timeline.length - 1; i++) {
      const actual = timeline[i]!;
      const siguiente = timeline[i + 1]!;
      if (actual.status === null) continue; // tramo "sin datos", no cuenta ni a favor ni en contra
      const dur = siguiente.createdAt.getTime() - actual.createdAt.getTime();
      msConDatos += dur;
      if (actual.status === "ONLINE") msOnline += dur;
    }
    porNodo.push({
      nodeId: nodo.id,
      nombre: nodo.nombre,
      tipoDispositivo: nodo.tipoDispositivo,
      disponibilidadPct: msConDatos > 0 ? Math.round((msOnline / msConDatos) * 1000) / 10 : null,
    });

    // Outages: cada tramo que arrancó en OFFLINE dentro del historial completo
    // (estadoInicial + eventos), recortado a la ventana [desde, hasta].
    const historialCompleto = [{ createdAt: desde, status: estadoInicial }, ...enRango];
    for (let i = 0; i < historialCompleto.length; i++) {
      const actual = historialCompleto[i]!;
      if (actual.status !== "OFFLINE") continue;
      const finTramo = historialCompleto[i + 1]?.createdAt ?? hasta;
      const inicioTramo = actual.createdAt < desde ? desde : actual.createdAt;
      const duracionMin = Math.round(((finTramo.getTime() - inicioTramo.getTime()) / 60_000) * 10) / 10;
      if (duracionMin <= 0) continue;
      outages.push({ nodeId: nodo.id, nombre: nodo.nombre, desde: inicioTramo, hasta: finTramo, duracionMin });
    }
  }

  const conDatos = porNodo.filter((n) => n.disponibilidadPct !== null);
  const disponibilidadPromedio =
    conDatos.length > 0
      ? Math.round((conDatos.reduce((acc, n) => acc + n.disponibilidadPct!, 0) / conDatos.length) * 10) / 10
      : null;

  // Serie temporal agregada (% de nodos con estado conocido que están
  // ONLINE en cada punto muestreado) — línea de "historial de conexión".
  const NUM_PUNTOS = 48;
  const pasoMs = (hasta.getTime() - desde.getTime()) / NUM_PUNTOS;
  const serieTemporal: Array<{ timestamp: string; porcentajeOnline: number | null }> = [];
  for (let i = 0; i <= NUM_PUNTOS; i++) {
    const momento = new Date(desde.getTime() + i * pasoMs);
    let online = 0;
    let conocidos = 0;
    for (const nodo of nodos) {
      const estado = estadoEnMomento(eventosPorNodo.get(nodo.id) ?? [], estadoInicialPorNodo.get(nodo.id) ?? null, momento);
      if (estado === null) continue;
      conocidos++;
      if (estado === "ONLINE") online++;
    }
    serieTemporal.push({
      timestamp: momento.toISOString(),
      porcentajeOnline: conocidos > 0 ? Math.round((online / conocidos) * 1000) / 10 : null,
    });
  }

  const histogramaOutages = BUCKETS_HISTOGRAMA.map((b, i) => {
    const min = i === 0 ? 0 : BUCKETS_HISTOGRAMA[i - 1]!.maxMin;
    return { label: b.label, cantidad: outages.filter((o) => o.duracionMin >= min && o.duracionMin < b.maxMin).length };
  });

  return {
    rango: { desde: desde.toISOString(), hasta: hasta.toISOString() },
    disponibilidadPromedio,
    porNodo,
    serieTemporal,
    histogramaOutages,
    totalOutages: outages.length,
  };
}
