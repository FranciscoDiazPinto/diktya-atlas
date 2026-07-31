-- AlterTable
ALTER TABLE "network_nodes" ADD COLUMN     "lastAutoRemediationAt" TIMESTAMP(3),
ADD COLUMN     "macAddress" TEXT;
