import type { ReactNode } from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./auth/AuthContext.js";
import { LoginView } from "./components/auth/LoginView.js";
import { LoadingState } from "./components/common/LoadingState.js";
import { AppShell } from "./components/layout/AppShell.js";
import { ChatView } from "./components/chat/ChatView.js";
import { NetworkView } from "./components/network/NetworkView.js";
import { TicketsView } from "./components/tickets/TicketsView.js";
import { TicketDetailView } from "./components/tickets/TicketDetailView.js";
import { PlanosView } from "./components/planos/PlanosView.js";
import { InfraView } from "./components/infra/InfraView.js";
import { ChatProvider } from "./chat/ChatContext.js";

function RequireAuth() {
  const { status } = useAuth();
  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Verificando sesión…" />
      </div>
    );
  }
  if (status === "unauthenticated") return <Navigate to="/login" replace />;
  return <Outlet />;
}

/** Bloquea la ruta por rol, no solo los botones dentro de ella — para vistas con contenido sensible (ej. infra core). */
function RequireRole({ roles }: { roles: string[] }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <Navigate to="/chat" replace />;
  return <Outlet />;
}

function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === "authenticated") return <Navigate to="/chat" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfAuthenticated>
            <LoginView />
          </RedirectIfAuthenticated>
        }
      />
      <Route element={<RequireAuth />}>
        <Route
          element={
            <ChatProvider>
              <AppShell />
            </ChatProvider>
          }
        >
          <Route index element={<Navigate to="/chat" replace />} />
          <Route path="/chat" element={<ChatView />} />
          <Route path="/red" element={<NetworkView />} />
          <Route path="/tickets" element={<TicketsView />} />
          <Route path="/tickets/:ticketId" element={<TicketDetailView />} />
          <Route path="/planos" element={<PlanosView />} />
          <Route element={<RequireRole roles={["ADMIN"]} />}>
            <Route path="/infra" element={<InfraView />} />
          </Route>
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
