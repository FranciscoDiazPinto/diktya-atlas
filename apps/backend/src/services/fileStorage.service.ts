import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MultipartFile } from "@fastify/multipart";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

const ALLOWED_EXTENSIONS = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp"]);

function safeExtension(filename: string): string | null {
  const ext = path.extname(filename).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext) ? ext : null;
}

/**
 * Guarda un plano subido (PDF o imagen) a disco con un nombre generado
 * (nunca el nombre original — evita path traversal y colisiones) y
 * devuelve la ruta relativa a `uploads/`, que es lo que se persiste en
 * Venue.planFilePath / EventDeployment.planFilePath.
 *
 * No hay object storage en este stack todavía — queda en disco local,
 * documentado como límite conocido (ver plan del módulo).
 */
export async function savePlanFile(file: MultipartFile): Promise<string> {
  const ext = safeExtension(file.filename);
  if (!ext) {
    throw new Error(`Formato de archivo no soportado: "${file.filename}" (usar PDF, PNG, JPG o WEBP)`);
  }

  await mkdir(UPLOADS_DIR, { recursive: true });
  const relativePath = `${randomUUID()}${ext}`;
  const buffer = await file.toBuffer();
  await writeFile(path.join(UPLOADS_DIR, relativePath), buffer);
  return relativePath;
}

export function uploadsDir(): string {
  return UPLOADS_DIR;
}
