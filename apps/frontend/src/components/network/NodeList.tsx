import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../ui/Table.js";
import { NodeStatusBadge } from "./NodeStatusBadge.js";
import { DeviceTypeIcon } from "./DeviceTypeIcon.js";
import type { ApiNetworkNode } from "../../types/api.js";

function formatUptime(seconds: number | null): string {
  if (!seconds) return "—";
  const hours = Math.floor(seconds / 3600);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function NodeList({
  nodos,
  selectedId,
  onSelect,
}: {
  nodos: ApiNetworkNode[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Nodo</TableHead>
              <TableHead>Sitio</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Señal</TableHead>
              <TableHead>Clientes</TableHead>
              <TableHead>Uptime</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nodos.map((node) => (
              <TableRow
                key={node.id}
                onClick={() => onSelect(node.id)}
                className={
                  node.id === selectedId
                    ? "cursor-pointer bg-slate-100 dark:bg-slate-800"
                    : "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                }
              >
                <TableCell>
                  <DeviceTypeIcon tipo={node.tipoDispositivo} />
                </TableCell>
                <TableCell className="font-medium text-slate-900 dark:text-slate-100">{node.nombre}</TableCell>
                <TableCell>{node.sitio}</TableCell>
                <TableCell>
                  <NodeStatusBadge status={node.status} />
                </TableCell>
                <TableCell>{node.senalDbm !== null ? `${node.senalDbm} dBm` : "—"}</TableCell>
                <TableCell>{node.clientesConectados}</TableCell>
                <TableCell>{formatUptime(node.uptimeSegundos)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Cards apiladas en mobile/tablet angosto — la tabla es incómoda de leer con el dedo
          y sin scroll horizontal cómodo en pantallas chicas (staff en piso de feria). */}
      <ul className="flex flex-col gap-2 sm:hidden">
        {nodos.map((node) => (
          <li key={node.id}>
            <button
              type="button"
              onClick={() => onSelect(node.id)}
              className={
                "flex w-full flex-col gap-1.5 rounded-md border p-3 text-left text-sm " +
                (node.id === selectedId
                  ? "border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
                  : "border-slate-200 dark:border-slate-800")
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
                  <DeviceTypeIcon tipo={node.tipoDispositivo} />
                  {node.nombre}
                </span>
                <NodeStatusBadge status={node.status} />
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                <span>{node.sitio}</span>
                <span>{node.senalDbm !== null ? `${node.senalDbm} dBm` : "sin señal"}</span>
                <span>{node.clientesConectados} clientes</span>
                <span>uptime {formatUptime(node.uptimeSegundos)}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
