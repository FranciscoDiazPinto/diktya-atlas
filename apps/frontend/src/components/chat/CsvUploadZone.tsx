import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "../../lib/cn.js";
import { Button } from "../ui/Button.js";
import { useCsvUpload } from "../../hooks/useCsvUpload.js";
import type { CsvUploadResponse } from "../../types/api.js";
import { ApiError } from "../../lib/apiClient.js";

export function CsvUploadZone({ onResult }: { onResult: (result: CsvUploadResponse) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const upload = useCsvUpload();

  const handleFile = useCallback(
    (file: File) => {
      upload.mutate(file, { onSuccess: onResult });
    },
    [upload, onResult]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
      }}
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
        dragOver
          ? "border-slate-400 bg-slate-50 dark:border-slate-500 dark:bg-slate-800"
          : "border-slate-200 dark:border-slate-700"
      )}
    >
      <Upload className="h-5 w-5 text-slate-400" aria-hidden />
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Arrastrá el CSV de redes/VLAN acá (columnas: nombre_red, vlan_id, ssid, banda, sitio)
      </p>
      <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
        {upload.isPending ? "Subiendo…" : "Elegir archivo"}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      {upload.isError && (
        <p className="text-xs text-status-critical">
          {upload.error instanceof ApiError ? upload.error.message : "No se pudo subir el archivo"}
        </p>
      )}
    </div>
  );
}
