-- CreateTable
CREATE TABLE "node_status_events" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "status" "NodeStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "node_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "node_status_events_nodeId_createdAt_idx" ON "node_status_events"("nodeId", "createdAt");

-- AddForeignKey
ALTER TABLE "node_status_events" ADD CONSTRAINT "node_status_events_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "network_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
