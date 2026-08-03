import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./Dialog.js";
import { Button } from "./Button.js";

/**
 * Confirmación en dos pasos explícitos para acciones que no se pueden deshacer
 * (reboot, etc.) — reemplaza `window.confirm()` (un solo click, sin estilo,
 * fácil de apretar por error en tablet). Paso 1 muestra el impacto; paso 2
 * exige un checkbox extra antes de habilitar el botón final.
 */
export function ConfirmDestructiveDialog({
  open,
  onOpenChange,
  title,
  impactMessage,
  confirmLabel,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  impactMessage: string;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [entendido, setEntendido] = useState(false);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setStep(1);
      setEntendido(false);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-status-critical">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {title}
          </DialogTitle>
          <DialogDescription>{impactMessage}</DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => setStep(2)}>
              Continuar
            </Button>
          </DialogFooter>
        ) : (
          <>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={entendido} onChange={(e) => setEntendido(e.target.checked)} />
              Entiendo el impacto y quiero continuar.
            </label>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(1)}>
                Atrás
              </Button>
              <Button variant="destructive" disabled={!entendido || pending} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
