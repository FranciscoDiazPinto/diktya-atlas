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
  );
}
