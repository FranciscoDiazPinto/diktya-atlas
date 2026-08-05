-- AlterTable
ALTER TABLE "network_nodes" ADD COLUMN     "ssidsTransmitidos" TEXT[] DEFAULT ARRAY[]::TEXT[];
