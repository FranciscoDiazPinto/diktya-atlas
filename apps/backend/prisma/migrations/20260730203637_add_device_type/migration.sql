-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('AP', 'SWITCH', 'GATEWAY', 'UPS', 'OTRO');

-- AlterTable
ALTER TABLE "network_nodes" ADD COLUMN     "tipoDispositivo" "DeviceType" NOT NULL DEFAULT 'OTRO';
