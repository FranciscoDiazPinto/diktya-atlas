import { Wifi, WifiOff, RefreshCw, HelpCircle, type LucideIcon } from "lucide-react";
import { StatusDot, type StatusTone } from "../ui/StatusDot.js";
import type { ApiNodeStatus } from "../../types/api.js";

const STATUS_CONFIG: Record<ApiNodeStatus, { tone: StatusTone; label: string; Icon: LucideIcon }> = {
  ONLINE: { tone: "good", label: "Online", Icon: Wifi },
  OFFLINE: { tone: "critical", label: "Offline", Icon: WifiOff },
  ADOPTING: { tone: "warning", label: "Adoptando", Icon: RefreshCw },
  UNKNOWN: { tone: "muted", label: "Desconocido", Icon: HelpCircle },
};

export function NodeStatusBadge({ status }: { status: ApiNodeStatus }) {
  const { tone, label, Icon } = STATUS_CONFIG[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
      <StatusDot tone={tone} />
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </span>
  );
}
