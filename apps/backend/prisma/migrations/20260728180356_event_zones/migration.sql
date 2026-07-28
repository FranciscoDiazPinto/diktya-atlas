/*
  Warnings:

  - You are about to drop the column `eventDeploymentId` on the `ap_placements` table. All the data in the column will be lost.
  - You are about to drop the column `pixelesPorMetro` on the `event_deployments` table. All the data in the column will be lost.
  - You are about to drop the column `planFilePath` on the `event_deployments` table. All the data in the column will be lost.
  - You are about to drop the column `venueId` on the `event_deployments` table. All the data in the column will be lost.
  - Added the required column `eventZoneId` to the `ap_placements` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "ap_placements" DROP CONSTRAINT "ap_placements_eventDeploymentId_fkey";

-- DropForeignKey
ALTER TABLE "event_deployments" DROP CONSTRAINT "event_deployments_venueId_fkey";

-- DropIndex
DROP INDEX "ap_placements_eventDeploymentId_idx";

-- DropIndex
DROP INDEX "event_deployments_venueId_idx";

-- AlterTable
ALTER TABLE "ap_placements" DROP COLUMN "eventDeploymentId",
ADD COLUMN     "eventZoneId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "event_deployments" DROP COLUMN "pixelesPorMetro",
DROP COLUMN "planFilePath",
DROP COLUMN "venueId";

-- CreateTable
CREATE TABLE "event_zones" (
    "id" TEXT NOT NULL,
    "eventDeploymentId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "nombreZona" TEXT NOT NULL,
    "planFilePath" TEXT,
    "pixelesPorMetro" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_zones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_zones_eventDeploymentId_idx" ON "event_zones"("eventDeploymentId");

-- CreateIndex
CREATE INDEX "event_zones_venueId_idx" ON "event_zones"("venueId");

-- CreateIndex
CREATE INDEX "ap_placements_eventZoneId_idx" ON "ap_placements"("eventZoneId");

-- AddForeignKey
ALTER TABLE "event_zones" ADD CONSTRAINT "event_zones_eventDeploymentId_fkey" FOREIGN KEY ("eventDeploymentId") REFERENCES "event_deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_zones" ADD CONSTRAINT "event_zones_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ap_placements" ADD CONSTRAINT "ap_placements_eventZoneId_fkey" FOREIGN KEY ("eventZoneId") REFERENCES "event_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
