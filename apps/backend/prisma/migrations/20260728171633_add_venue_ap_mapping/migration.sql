-- CreateEnum
CREATE TYPE "ApModel" AS ENUM ('U6_MESH', 'U7_CAMPUS', 'PRO_MAX_24', 'FLEX_MINI', 'FLEX', 'FLEX_ULTRA');

-- CreateEnum
CREATE TYPE "DeploymentEstado" AS ENUM ('PLANIFICACION', 'EN_CURSO', 'FINALIZADO');

-- CreateTable
CREATE TABLE "venues" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "planFilePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_deployments" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "planFilePath" TEXT,
    "pixelesPorMetro" DOUBLE PRECISION,
    "estado" "DeploymentEstado" NOT NULL DEFAULT 'PLANIFICACION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ap_placements" (
    "id" TEXT NOT NULL,
    "eventDeploymentId" TEXT NOT NULL,
    "modelo" "ApModel" NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "radioMetros" DOUBLE PRECISION NOT NULL,
    "rackLabel" TEXT,
    "networkNodeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ap_placements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_deployments_venueId_idx" ON "event_deployments"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "ap_placements_networkNodeId_key" ON "ap_placements"("networkNodeId");

-- CreateIndex
CREATE INDEX "ap_placements_eventDeploymentId_idx" ON "ap_placements"("eventDeploymentId");

-- AddForeignKey
ALTER TABLE "event_deployments" ADD CONSTRAINT "event_deployments_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ap_placements" ADD CONSTRAINT "ap_placements_eventDeploymentId_fkey" FOREIGN KEY ("eventDeploymentId") REFERENCES "event_deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ap_placements" ADD CONSTRAINT "ap_placements_networkNodeId_fkey" FOREIGN KEY ("networkNodeId") REFERENCES "network_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
