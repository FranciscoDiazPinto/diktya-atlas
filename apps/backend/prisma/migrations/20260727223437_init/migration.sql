-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'TECNICO', 'VISUALIZADOR');

-- CreateEnum
CREATE TYPE "NodeStatus" AS ENUM ('ONLINE', 'OFFLINE', 'ADOPTING', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'ADVERTENCIA', 'CRITICO');

-- CreateEnum
CREATE TYPE "VlanReservationStatus" AS ENUM ('RESERVADA', 'APLICADA', 'LIBERADA');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('ABIERTO', 'EN_PROGRESO', 'ESCALADO', 'RESUELTO');

-- CreateEnum
CREATE TYPE "TicketEventType" AS ENUM ('CREADO', 'NOTIFICADO', 'REMEDIACION_INTENTADA', 'ESCALADO', 'RESUELTO', 'REABIERTO');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_nodes" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "sitio" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "modelo" TEXT,
    "status" "NodeStatus" NOT NULL DEFAULT 'UNKNOWN',
    "senalDbm" INTEGER,
    "clientesConectados" INTEGER NOT NULL DEFAULT 0,
    "uptimeSegundos" INTEGER,
    "ultimaVezVisto" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "network_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wifi_networks" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT,
    "sitio" TEXT NOT NULL,
    "ssid" TEXT NOT NULL,
    "vlanId" INTEGER NOT NULL,
    "bandas" TEXT[],
    "clientesConectados" INTEGER NOT NULL DEFAULT 0,
    "throughputMbps" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wifi_networks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "sitio" TEXT NOT NULL,
    "nodeId" TEXT,
    "severidad" "AlertSeverity" NOT NULL,
    "mensaje" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ticketId" TEXT,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vlan_reservations" (
    "id" TEXT NOT NULL,
    "vlanId" INTEGER NOT NULL,
    "redSolicitada" TEXT NOT NULL,
    "sitio" TEXT NOT NULL,
    "estado" "VlanReservationStatus" NOT NULL DEFAULT 'RESERVADA',
    "reservadoPorId" TEXT NOT NULL,
    "planSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vlan_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "severidad" "AlertSeverity" NOT NULL,
    "estado" "TicketStatus" NOT NULL DEFAULT 'ABIERTO',
    "nodoAfectadoId" TEXT,
    "vlanReservationId" TEXT,
    "asignadoAId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_events" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "tipo" "TicketEventType" NOT NULL,
    "detalle" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "workerName" TEXT NOT NULL,
    "toolName" TEXT,
    "parametros" JSONB NOT NULL,
    "resultado" JSONB NOT NULL,
    "exitoso" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refreshTokenHash_key" ON "sessions"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "network_nodes_externalId_key" ON "network_nodes"("externalId");

-- CreateIndex
CREATE INDEX "network_nodes_sitio_idx" ON "network_nodes"("sitio");

-- CreateIndex
CREATE UNIQUE INDEX "wifi_networks_sitio_ssid_key" ON "wifi_networks"("sitio", "ssid");

-- CreateIndex
CREATE INDEX "alerts_sitio_idx" ON "alerts"("sitio");

-- CreateIndex
CREATE UNIQUE INDEX "vlan_reservations_vlanId_sitio_estado_key" ON "vlan_reservations"("vlanId", "sitio", "estado");

-- CreateIndex
CREATE INDEX "tickets_estado_idx" ON "tickets"("estado");

-- CreateIndex
CREATE INDEX "tickets_severidad_idx" ON "tickets"("severidad");

-- CreateIndex
CREATE INDEX "ticket_events_ticketId_idx" ON "ticket_events"("ticketId");

-- CreateIndex
CREATE INDEX "audit_logs_workerName_idx" ON "audit_logs"("workerName");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wifi_networks" ADD CONSTRAINT "wifi_networks_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "network_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "network_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vlan_reservations" ADD CONSTRAINT "vlan_reservations_reservadoPorId_fkey" FOREIGN KEY ("reservadoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_nodoAfectadoId_fkey" FOREIGN KEY ("nodoAfectadoId") REFERENCES "network_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_vlanReservationId_fkey" FOREIGN KEY ("vlanReservationId") REFERENCES "vlan_reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_asignadoAId_fkey" FOREIGN KEY ("asignadoAId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
