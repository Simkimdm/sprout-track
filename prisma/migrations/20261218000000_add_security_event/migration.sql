-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "SecurityEvent_expiresAt_idx" ON "SecurityEvent"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityEvent_kind_key_key" ON "SecurityEvent"("kind", "key");
