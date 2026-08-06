import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
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
  refreshAccessToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * El access token dura 15 min (ACCESS_TOKEN_TTL en backend/src/auth/tokens.ts)
 * — se renueva 1 min antes de eso para que una sesión dejada abierta (ej. un
 * dashboard en una pantalla todo un evento) no llegue nunca a pisar el borde.
 * El retry reactivo en apiClient.ts cubre el resto (laptop dormida, timer que
 * no llegó a disparar, etc).
 */
const PROACTIVE_REFRESH_INTERVAL_MS = 14 * 60 * 1000;

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

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshInFlightRef = useRef<Promise<string> | null>(null);

  const clearProactiveRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const scheduleProactiveRefresh = useCallback(() => {
    clearProactiveRefresh();
    refreshTimerRef.current = setTimeout(() => {
      performRefresh().catch(() => {});
    }, PROACTIVE_REFRESH_INTERVAL_MS);
  }, [clearProactiveRefresh]);

  /**
   * Único punto que llama POST /auth/refresh — deduplicado con
   * refreshInFlightRef para que varias requests golpeadas por un 401 al
   * mismo tiempo (ej. las 6 stat tiles del dashboard) no manden el mismo
   * refresh token dos veces: el backend trata un refresh token reusado
   * como robo de sesión y revoca TODAS las sesiones del usuario (ver
   * session.service.ts::rotateSession). Usado tanto por el timer proactivo
   * de arriba como por el retry reactivo de apiClient.ts en un 401.
   */
  const performRefresh = useCallback((): Promise<string> => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const p = authApi
      .refresh()
      .then((data) => {
        setAccessToken(data.accessToken);
        setUser(data.user);
        setStatus("authenticated");
        scheduleProactiveRefresh();
        return data.accessToken;
      })
      .catch((err) => {
        clearProactiveRefresh();
        setAccessToken(null);
        setUser(null);
        setStatus("unauthenticated");
        throw err;
      })
      .finally(() => {
        refreshInFlightRef.current = null;
      });

    refreshInFlightRef.current = p;
    return p;
  }, [scheduleProactiveRefresh, clearProactiveRefresh]);

  useEffect(() => {
    performRefresh().catch(() => {});
    return clearProactiveRefresh;
  }, [performRefresh, clearProactiveRefresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await authApi.login(email, password);

      if (data.status === "ok") {
        setAccessToken(data.accessToken);
        setUser(data.user);
        setStatus("authenticated");
        setPendingTotp(null);
        setTotpSetup(null);
        scheduleProactiveRefresh();
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
    },
    [scheduleProactiveRefresh]
  );

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
      scheduleProactiveRefresh();
    },
    [pendingTotp, scheduleProactiveRefresh]
  );

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => {});
    clearProactiveRefresh();
    setAccessToken(null);
    setUser(null);
    setPendingTotp(null);
    setTotpSetup(null);
    setStatus("unauthenticated");
  }, [clearProactiveRefresh]);

  return (
    <AuthContext.Provider
      value={{
        status,
        user,
        accessToken,
        pendingTotp,
        totpSetup,
        login,
        submitTotpCode,
        logout,
        refreshAccessToken: performRefresh,
      }}
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
