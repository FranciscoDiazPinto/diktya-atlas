import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { RoleSchema, type Role } from "@diktya-atlas/shared";

/**
 * Espejo de DEV_USER_IDS en apps/backend/src/auth/context.ts. El backend
 * no tiene login real todavía (Prompt 3 lo reemplaza), así que este
 * selector de rol es el único "auth" que existe hoy: persiste el rol
 * elegido en localStorage y lo manda como header x-role en cada request
 * (ver lib/apiClient.ts).
 */
const DEV_USER_IDS: Record<Role, string> = {
  ADMIN: "dev-admin",
  TECNICO: "dev-tecnico",
  VISUALIZADOR: "dev-visualizador",
};

const DEV_USER_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  TECNICO: "Técnico",
  VISUALIZADOR: "Visualizador",
};

const STORAGE_KEY = "netbot.devRole";

interface AuthContextValue {
  role: Role;
  userId: string;
  label: string;
  setRole: (role: Role) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadInitialRole(): Role {
  if (typeof window === "undefined") return "VISUALIZADOR";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  const parsed = RoleSchema.safeParse(stored);
  return parsed.success ? parsed.data : "VISUALIZADOR";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>(loadInitialRole);

  const setRole = useCallback((next: Role) => {
    setRoleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  return (
    <AuthContext.Provider value={{ role, userId: DEV_USER_IDS[role], label: DEV_USER_LABELS[role], setRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}

export { DEV_USER_LABELS };
