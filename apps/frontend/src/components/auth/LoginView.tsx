import { useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthContext.js";
import { Button } from "../ui/Button.js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "../ui/Card.js";
import { ApiError } from "../../lib/apiClient.js";

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Error inesperado";
}

export function LoginView() {
  const { pendingTotp, totpSetup, login, submitTotpCode } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLoginSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTotpSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await submitTotpCode(code);
    } catch (err) {
      setError(errorMessage(err));
      setCode("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 px-4 dark:bg-slate-950">
      <img src="/diktya-logo.png" alt="Diktya" className="h-16 w-auto" />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>NetBot</CardTitle>
          <CardDescription>
            {pendingTotp?.kind === "setup"
              ? "Configurá la autenticación en dos pasos para continuar"
              : pendingTotp?.kind === "login"
                ? "Ingresá el código de tu app authenticator"
                : "Iniciá sesión para continuar"}
          </CardDescription>
        </CardHeader>

        {!pendingTotp ? (
          <form onSubmit={handleLoginSubmit}>
            <CardContent className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm text-slate-700 dark:text-slate-300">
                Email
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700 dark:text-slate-300">
                Password
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
              </label>
              {error && <p className="text-xs text-status-critical">{error}</p>}
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full justify-center" disabled={submitting}>
                {submitting ? "Ingresando…" : "Ingresar"}
              </Button>
            </CardFooter>
          </form>
        ) : (
          <form onSubmit={handleTotpSubmit}>
            <CardContent className="flex flex-col gap-3">
              {pendingTotp.kind === "setup" && totpSetup && (
                <div className="flex flex-col gap-2 rounded-md border border-slate-200 p-3 text-xs dark:border-slate-800">
                  <p className="text-slate-600 dark:text-slate-300">
                    Tu rol requiere 2FA. Cargá este secret en una app authenticator (Google Authenticator, 1Password,
                    etc.) y confirmá con el código que te muestre:
                  </p>
                  <code className="break-all rounded bg-slate-100 px-2 py-1 dark:bg-slate-800">{totpSetup.secret}</code>
                  <code className="break-all rounded bg-slate-100 px-2 py-1 text-[10px] dark:bg-slate-800">
                    {totpSetup.otpauthUrl}
                  </code>
                </div>
              )}
              <label className="flex flex-col gap-1 text-sm text-slate-700 dark:text-slate-300">
                Código de 6 dígitos
                <input
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm tracking-widest dark:border-slate-700 dark:bg-slate-900"
                />
              </label>
              {error && <p className="text-xs text-status-critical">{error}</p>}
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full justify-center" disabled={submitting || code.length !== 6}>
                {submitting ? "Verificando…" : "Confirmar"}
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  );
}
