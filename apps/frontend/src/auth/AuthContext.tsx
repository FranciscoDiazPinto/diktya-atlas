import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import * as authApi from "../lib/authApi.js";
import type { PublicUser, Setup2faResponse } from "../types/api.js";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface PendingTotp {
  /** "setup" = primer login de ADMIN/TECNICO sin 2FA todavía; "login" = ya tiene 2FA, falta el código. */
  kind: "setup" | "login";
  token: string;
}

interface AuthContextValue {
  status: AuthStatus;
  user: PublicUser | null;
  accessToken: string | null;
  pendingTotp: PendingTotp | null;
  totpSetup: Setup2faResponse | null;
  login: (email: string, password: string) => Promise<void>;
  submitTotpCode: (code: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * El access token vive SOLO en memoria (state de React), nunca en
 * localStorage — mitiga robo por XSS. La sesión persiste entre reloads
 * gracias a la cookie httpOnly de refresh: al montar, se intenta
 * `POST /auth/refresh` (la cookie viaja sola) para restaurarla en
 * silencio; si no hay cookie válida, queda "unauthenticated" y se muestra
 * el login.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [pendingTotp, setPendingTotp] = useState<PendingTotp | null>(null);
  const [totpSetup, setTotpSetup] = useState<Setup2faResponse | null>(null);

  useEffect(() => {
    authApi
      .refresh()
      .then((data) => {
        setAccessToken(data.accessToken);
        setUser(data.user);
        setStatus("authenticated");
      })
      .catch(() => setStatus("unauthenticated"));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await authApi.login(email, password);

    if (data.status === "ok") {
      setAccessToken(data.accessToken);
      setUser(data.user);
      setStatus("authenticated");
      setPendingTotp(null);
      setTotpSetup(null);
      return;
    }

    if (data.status === "2fa_setup_required") {
      setPendingTotp({ kind: "setup", token: data.setupToken });
      const setup = await authApi.setup2fa(data.setupToken);
      setTotpSetup(setup);
      return;
    }

    // "2fa_required"
    setPendingTotp({ kind: "login", token: data.loginToken });
    setTotpSetup(null);
  }, []);

  const submitTotpCode = useCallback(
    async (code: string) => {
      if (!pendingTotp) throw new Error("No hay un login con 2FA pendiente");
      const data =
        pendingTotp.kind === "setup"
          ? await authApi.confirm2fa(pendingTotp.token, code)
          : await authApi.verifyLoginTotp(pendingTotp.token, code);

      setAccessToken(data.accessToken);
      setUser(data.user);
      setStatus("authenticated");
      setPendingTotp(null);
      setTotpSetup(null);
    },
    [pendingTotp]
  );

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => {});
    setAccessToken(null);
    setUser(null);
    setPendingTotp(null);
    setTotpSetup(null);
    setStatus("unauthenticated");
  }, []);

  return (
    <AuthContext.Provider
      value={{ status, user, accessToken, pendingTotp, totpSetup, login, submitTotpCode, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
