import { Info, AlertCircle, AlertTriangle, type LucideIcon } from "lucide-react";
import { StatusDot, type StatusTone } from "../ui/StatusDot.js";
import type { ApiAlertSeverity } from "../../types/api.js";

const SEVERITY_CONFIG: Record<ApiAlertSeverity, { tone: StatusTone; label: string; Icon: LucideIcon }> = {
  INFO: { tone: "muted", label: "Info", Icon: Info },
  ADVERTENCIA: { tone: "warning", label: "Advertencia", Icon: AlertCircle },
  CRITICO: { tone: "critical", label: "Crítico", Icon: AlertTriangle },
};

export function SeverityBadge({ severidad }: { severidad: ApiAlertSeverity }) {
  const { tone, label, Icon } = SEVERITY_CONFIG[severidad];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
      <StatusDot tone={tone} />
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </span>
  );
}
