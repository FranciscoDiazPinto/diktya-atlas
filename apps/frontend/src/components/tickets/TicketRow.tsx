import { useNavigate } from "react-router-dom";
import { TableRow, TableCell } from "../ui/Table.js";
import { Badge } from "../ui/Badge.js";
import { SeverityBadge } from "../common/SeverityBadge.js";
import type { ApiTicket } from "../../types/api.js";

const ESTADO_VARIANT: Record<ApiTicket["estado"], "warning" | "info" | "danger" | "success"> = {
  ABIERTO: "warning",
  EN_PROGRESO: "info",
  ESCALADO: "danger",
  RESUELTO: "success",
};

export function TicketRow({ ticket }: { ticket: ApiTicket }) {
  const navigate = useNavigate();

  return (
    <TableRow className="cursor-pointer" onClick={() => navigate(`/tickets/${ticket.id}`)}>
      <TableCell className="font-medium text-slate-900 dark:text-slate-100">{ticket.titulo}</TableCell>
      <TableCell>
        <SeverityBadge severidad={ticket.severidad} />
      </TableCell>
      <TableCell>
        <Badge variant={ESTADO_VARIANT[ticket.estado]}>{ticket.estado}</Badge>
      </TableCell>
      <TableCell>{ticket.asignadoAId ?? "—"}</TableCell>
      <TableCell>{new Date(ticket.createdAt).toLocaleString("es-CL")}</TableCell>
    </TableRow>
  );
}
