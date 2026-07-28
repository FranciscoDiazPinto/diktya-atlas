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
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/chat" replace />} />
          <Route path="/chat" element={<ChatView />} />
          <Route path="/red" element={<NetworkView />} />
          <Route path="/tickets" element={<TicketsView />} />
          <Route path="/tickets/:ticketId" element={<TicketDetailView />} />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
