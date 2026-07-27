import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell.js";
import { ChatView } from "./components/chat/ChatView.js";
import { NetworkView } from "./components/network/NetworkView.js";
import { TicketsView } from "./components/tickets/TicketsView.js";
import { TicketDetailView } from "./components/tickets/TicketDetailView.js";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/chat" replace />} />
        <Route path="/chat" element={<ChatView />} />
        <Route path="/red" element={<NetworkView />} />
        <Route path="/tickets" element={<TicketsView />} />
        <Route path="/tickets/:ticketId" element={<TicketDetailView />} />
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Route>
    </Routes>
  );
}
