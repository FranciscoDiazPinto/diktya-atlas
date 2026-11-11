CREATE TABLE "conversations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "role" "Role" NOT NULL,
  "title" TEXT NOT NULL DEFAULT 'Nueva conversación',
  "version" INTEGER NOT NULL DEFAULT 0,
  "pendingTurn" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "conversations_userId_updatedAt_idx" ON "conversations"("userId", "updatedAt");
CREATE TABLE "chat_messages" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "conversationId" TEXT NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "sequence" INTEGER NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "chat_messages_conversationId_sequence_key" ON "chat_messages"("conversationId", "sequence");
