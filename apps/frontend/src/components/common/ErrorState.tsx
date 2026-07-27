import { AlertTriangle } from "lucide-react";
import { Button } from "../ui/Button.js";
import { ApiError } from "../../lib/apiClient.js";

/** Nunca falla en silencio: siempre visible, con el mensaje del backend cuando existe (403, 409, etc.). */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Error inesperado";

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-red-200 bg-red-50 py-10 text-center dark:border-red-900/40 dark:bg-red-950/20">
      <AlertTriangle className="h-5 w-5 text-status-critical" aria-hidden />
      <p className="text-sm text-slate-700 dark:text-slate-300">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}
