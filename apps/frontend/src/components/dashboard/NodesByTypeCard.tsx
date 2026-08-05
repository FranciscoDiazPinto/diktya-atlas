import { Router, Network, Server, BatteryCharging, HelpCircle, type LucideIcon } from "lucide-react";
import { StatusDot, type StatusTone } from "../ui/StatusDot.js";
import { ExpandableCard } from "../ui/ExpandableCard.js";
import type { ApiDeviceType, ApiNetworkNode } from "../../types/api.js";

/** Mismos íconos que DeviceTypeIcon.tsx (vista de Red), pero con etiqueta
 * en plural — acá se muestra un conteo por tipo, no un solo dispositivo. */
const DEVICE_TYPE_ROW_CONFIG: Record<ApiDeviceType, { label: string; Icon: LucideIcon }> = {
  AP: { label: "APs", Icon: Router },
  SWITCH: { label: "Switches", Icon: Network },
  GATEWAY: { label: "Gateways", Icon: Server },
  UPS: { label: "UPS", Icon: BatteryCharging },
  OTRO: { label: "Otros", Icon: HelpCircle },
};

const DEVICE_TYPE_ORDER: ApiDeviceType[] = ["AP", "SWITCH", "GATEWAY", "UPS", "OTRO"];

/**
 * Antes el resumen general mezclaba todos los tipos de dispositivo bajo la
 * etiqueta "APs online/offline" (contaba switches, UPS, gateways como si
 * fueran AP) — acá se desglosa por `tipoDispositivo` real, tal como ya lo
 * clasifica el backend (ver integrations/unifi/normalize.ts::mapDeviceType).
 * Colapsado/expandido vía ExpandableCard (hover + foco).
 */
export function NodesByTypeCard({ nodos }: { nodos: ApiNetworkNode[] }) {
  const porTipo = DEVICE_TYPE_ORDER.map((tipo) => {
    const delTipo = nodos.filter((n) => n.tipoDispositivo === tipo);
    return {
      tipo,
      total: delTipo.length,
      online: delTipo.filter((n) => n.status === "ONLINE").length,
      offline: delTipo.filter((n) => n.status === "OFFLINE").length,
    };
  }).filter((fila) => fila.total > 0);

  const hayOffline = porTipo.some((fila) => fila.offline > 0);

  return (
    <ExpandableCard
      collapsed={
        <div className="flex items-center gap-2">
          {hayOffline && <StatusDot tone="critical" />}
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Nodos por tipo</p>
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {nodos.length} dispositivo{nodos.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      }
      expanded={
        <div className="flex flex-col gap-1.5">
          {porTipo.map(({ tipo, total, online, offline }) => {
            const { label, Icon } = DEVICE_TYPE_ROW_CONFIG[tipo];
            const tone: StatusTone = offline > 0 ? "critical" : "good";
            return (
              <div key={tipo} className="flex items-center gap-2 text-sm">
                <Icon className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden />
                <span className="w-20 shrink-0 text-slate-700 dark:text-slate-300">{label}</span>
                <StatusDot tone={tone} />
                <span className="text-slate-900 dark:text-slate-100">
                  {online}/{total} online{offline > 0 ? ` · ${offline} offline` : ""}
                </span>
              </div>
            );
          })}
        </div>
      }
    />
  );
}
