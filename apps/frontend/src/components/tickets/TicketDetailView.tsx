import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTicketDetail } from "../../hooks/useTicketDetail.js";
import { useResolveTicket } from "../../hooks/useResolveTicket.js";
import { useAuth } from "../../auth/AuthContext.js";
import { LoadingState } from "../common/LoadingState.js";
import { ErrorState } from "../common/ErrorState.js";
import { SeverityBadge } from "../common/SeverityBadge.js";
import { Badge } from "../ui/Badge.js";
import { Button } from "../ui/Button.js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "../ui/Card.js";
import { TicketTimeline } from "./TicketTimeline.js";
import type { ApiAlertSeverity } from "../../types/api.js";

// Espeja REMINDER_INTERVAL_MINUTES de apps/backend/src/workers/worker-ticket-followup.ts
const REMINDER_MINUTES: Record<ApiAlertSeverity, number> = { CRITICO: 15, ADVERTENCIA: 60, INFO: 24 * 60 };

function useCountdown(targetMs: number | null): string | null {
  const [, forceRender] = useState(0);
  useEffect(() => {
    if (targetMs === null) return;
    const id = setInterval(() => forceRender((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [targetMs]);

  if (targetMs === null) return null;
  const remainingSec = Math.max(0, Math.round((targetMs - Date.now()) / 1000));
  const minutes = Math.floor(remainingSec / 60);
  const seconds = remainingSec % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

export function TicketDetailView() {
  const { ticketId } = useParams();
  const { user } = useAuth();
  const role = user!.role;
  const { data: ticket, isLoading, isError, error, refetch } = useTicketDetail(ticketId);
  const resolveMutation = useResolveTicket();

  const lastEvent = ticket?.eventos.at(-1);
  const nextReminderAt =
    ticket && lastEvent && ticket.estado !== "RESUELTO"
      ? new Date(lastEvent.createdAt).getTime() + REMINDER_MINUTES[ticket.severidad] * 60_000
      : null;
  const countdown = useCountdown(nextReminderAt);

  if (isLoading) return <LoadingState label="Cargando ticket…" />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!ticket) return null;

  const canManage = role !== "VISUALIZADOR";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{ticket.titulo}</CardTitle>
          <div className="flex items-center gap-2">
            <SeverityBadge severidad={ticket.severidad} />
            <Badge variant="neutral">{ticket.estado}</Badge>
          </div>
        </div>
        <CardDescription>{ticket.descripcion}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {countdown && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Próximo recordatorio automático en{" "}
            <span className="font-medium text-slate-700 dark:text-slate-300">{countdown}</span>
          </p>
        )}
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Línea de tiempo
          </p>
          <TicketTimeline eventos={ticket.eventos} />
        </div>
      </CardContent>
      <CardFooter>
        {!canManage ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Tu rol (Visualizador) solo puede ver este ticket en modo lectura.
          </p>
        ) : ticket.estado === "RESUELTO" ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => resolveMutation.mutate({ ticketId: ticket.id, action: "reopen" })}
            disabled={resolveMutation.isPending}
          >
            Reabrir
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => resolveMutation.mutate({ ticketId: ticket.id, action: "resolve" })}
            disabled={resolveMutation.isPending}
          >
            Marcar resuelto
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
