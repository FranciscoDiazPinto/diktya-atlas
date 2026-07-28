import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  MessageSquare,
  Network,
  Ticket as TicketIcon,
  Map,
  Router,
  Wifi,
  WifiOff,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "../../lib/cn.js";
import { useAuth } from "../../auth/AuthContext.js";
import { useNetworkStatus } from "../../hooks/useNetworkStatus.js";
import { useRealtime } from "../../hooks/RealtimeProvider.js";
import { StatusDot, type StatusTone } from "../ui/StatusDot.js";
import { Badge } from "../ui/Badge.js";
import { DashboardSummaryStrip } from "../dashboard/DashboardSummaryStrip.js";

const NAV_ITEMS = [
  { to: "/chat", label: "Chat", icon: MessageSquare },
  { to: "/red", label: "Red", icon: Network },
  { to: "/tickets", label: "Tickets", icon: TicketIcon },
  { to: "/planos", label: "Planos", icon: Map },
];

/** Solo ADMIN — infraestructura core (OPNsense/UniFi), no el despliegue de un evento. */
const ADMIN_NAV_ITEMS = [{ to: "/infra", label: "Infraestructura", icon: Router }];

const ROLE_LABEL: Record<string, string> = { ADMIN: "Admin", TECNICO: "Técnico", VISUALIZADOR: "Visualizador" };

const SIDEBAR_COLLAPSED_KEY = "atlas-sidebar-collapsed";

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
  const { user, logout } = useAuth();
  const { data: status } = useNetworkStatus();
  const { connected } = useRealtime();
  const health = globalHealth(status);

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <div className="flex min-h-screen">
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 dark:border-slate-800 dark:bg-slate-900",
          collapsed ? "w-16" : "w-60"
        )}
      >
        <div className={cn("flex items-center gap-3 px-4 py-5", collapsed && "justify-center px-0")}>
          <img src="/diktya-icon.png" alt="Diktya" className="h-10 w-10 shrink-0" />
          {!collapsed && (
            <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Atlas</span>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-2">
          {[...NAV_ITEMS, ...(user?.role === "ADMIN" ? ADMIN_NAV_ITEMS : [])].map(({ to, label: navLabel, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              title={collapsed ? navLabel : undefined}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  collapsed && "justify-center px-0",
                  isActive
                    ? "bg-brand-navy/10 text-brand-navy dark:bg-brand-cyan/10 dark:text-brand-cyan"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                )
              }
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && navLabel}
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expandir menú" : "Contraer menú"}
          className={cn(
            "m-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white",
            collapsed && "justify-center px-0"
          )}
        >
          {collapsed ? <PanelLeftOpen className="h-5 w-5 shrink-0" /> : <PanelLeftClose className="h-5 w-5 shrink-0" />}
          {!collapsed && "Contraer"}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-end gap-4 px-4 py-3">
            <div
              className="flex items-center gap-2 text-sm"
              title={connected ? "Conectado en tiempo real" : "Reconectando..."}
            >
              {connected ? (
                <Wifi className="h-4 w-4 text-status-good" aria-hidden />
              ) : (
                <WifiOff className="h-4 w-4 text-slate-400" aria-hidden />
              )}
              <StatusDot tone={health.tone} />
              <span className="text-slate-600 dark:text-slate-300">{health.label}</span>
            </div>

            {user && (
              <div className="flex items-center gap-2">
                <div className="flex flex-col items-end leading-tight">
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200">{user.email}</span>
                  <Badge variant="neutral">{ROLE_LABEL[user.role]}</Badge>
                </div>
                <button
                  type="button"
                  onClick={() => void logout()}
                  title="Cerrar sesión"
                  className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-6">
          <DashboardSummaryStrip />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
