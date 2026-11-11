CREATE TYPE "ChangeExecutionStatus" AS ENUM ('QUEUED', 'APPROVED', 'EXECUTING', 'APPLIED', 'BLOCKED', 'FAILED', 'UNCERTAIN');
CREATE TABLE "network_change_plans" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "ownerRole" "Role" NOT NULL,
  "version" INTEGER NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "network_change_plans_ownerId_createdAt_idx" ON "network_change_plans"("ownerId", "createdAt");
ALTER TABLE "vlan_reservations"
  ADD COLUMN "changePlanId" TEXT REFERENCES "network_change_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD COLUMN "approvalId" TEXT,
  ADD COLUMN "approvedById" TEXT REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD COLUMN "approvedRole" "Role",
  ADD COLUMN "approvedPlanVersion" INTEGER,
  ADD COLUMN "approvedFingerprint" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvalExpiresAt" TIMESTAMP(3),
  ADD COLUMN "executionStatus" "ChangeExecutionStatus";
CREATE UNIQUE INDEX "vlan_reservations_approvalId_key" ON "vlan_reservations"("approvalId");
