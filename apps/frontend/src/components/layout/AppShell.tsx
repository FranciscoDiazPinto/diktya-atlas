import { NavLink, Outlet } from "react-router-dom";
import { MessageSquare, Network, Ticket as TicketIcon, Wifi, WifiOff } from "lucide-react";
import { cn } from "../../lib/cn.js";
import { useAuth, DEV_USER_LABELS } from "../../auth/AuthContext.js";
import { useNetworkStatus } from "../../hooks/useNetworkStatus.js";
import { useRealtime } from "../../hooks/RealtimeProvider.js";
import { StatusDot, type StatusTone } from "../ui/StatusDot.js";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../ui/Select.js";
import { DashboardSummaryStrip } from "../dashboard/DashboardSummaryStrip.js";
import type { Role } from "@diktya-atlas/shared";

const NAV_ITEMS = [
  { to: "/chat", label: "Chat", icon: MessageSquare },
  { to: "/red", label: "Red", icon: Network },
  { to: "/tickets", label: "Tickets", icon: TicketIcon },
];

function globalHealth(status?: { alertasPorSeveridad: { CRITICO: number; ADVERTENCIA: number } }): {
  tone: StatusTone;
  label: string;
} {
  if (!status) return { tone: "muted", label: "Sin datos" };
  if (status.alertasPorSeveridad.CRITICO > 0) return { tone: "critical", label: "Crítico" };
  if (status.alertasPorSeveridad.ADVERTENCIA > 0) return { tone: "warning", label: "Advertencia" };
  return { tone: "good", label: "Todo OK" };
}

export function AppShell() {
  const { role, label, setRole } = useAuth();
  const { data: status } = useNetworkStatus();
  const { connected } = useRealtime();
  const health = globalHealth(status);

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">NetBot</span>
            <nav className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              {NAV_ITEMS.map(({ to, label: navLabel, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                        : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                    )
                  }
                >
                  <Icon className="h-4 w-4" />
                  {navLabel}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm" title={connected ? "Conectado en tiempo real" : "Reconectando..."}>
              {connected ? (
                <Wifi className="h-4 w-4 text-status-good" aria-hidden />
              ) : (
                <WifiOff className="h-4 w-4 text-slate-400" aria-hidden />
              )}
              <StatusDot tone={health.tone} />
              <span className="text-slate-600 dark:text-slate-300">{health.label}</span>
            </div>

            <Select value={role} onValueChange={(value) => setRole(value as Role)}>
              <SelectTrigger aria-label="Rol de usuario (dev)">
                <SelectValue>{label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DEV_USER_LABELS).map(([value, roleLabel]) => (
                  <SelectItem key={value} value={value}>
                    {roleLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
        <DashboardSummaryStrip />
        <Outlet />
      </main>
    </div>
  );
}
