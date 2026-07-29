-- Ticket -> EventDeployment (opcional): asociar incidentes a un evento para reportería.
ALTER TABLE "tickets" ADD COLUMN "eventDeploymentId" TEXT;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_eventDeploymentId_fkey"
  FOREIGN KEY ("eventDeploymentId") REFERENCES "event_deployments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "tickets_eventDeploymentId_idx" ON "tickets"("eventDeploymentId");

-- EventDeployment.fecha -> fechaInicio/fechaFin (rango, eventos reales duran varios días).
-- Backfill: fechaFin = fechaInicio para filas existentes (dato de prueba, no hay rango real que preservar).
ALTER TABLE "event_deployments" RENAME COLUMN "fecha" TO "fechaInicio";
ALTER TABLE "event_deployments" ADD COLUMN "fechaFin" TIMESTAMP(3);
UPDATE "event_deployments" SET "fechaFin" = "fechaInicio" WHERE "fechaFin" IS NULL;
ALTER TABLE "event_deployments" ALTER COLUMN "fechaFin" SET NOT NULL;
