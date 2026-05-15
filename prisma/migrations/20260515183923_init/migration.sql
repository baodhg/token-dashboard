-- CreateTable
CREATE TABLE "calls" (
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheTokens" INTEGER NOT NULL DEFAULT 0,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "sessionId" TEXT,
    "project" TEXT,

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_state" (
    "filePath" TEXT NOT NULL,
    "lastSize" BIGINT NOT NULL DEFAULT 0,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_state_pkey" PRIMARY KEY ("filePath")
);

-- CreateIndex
CREATE INDEX "calls_timestamp_idx" ON "calls"("timestamp");

-- CreateIndex
CREATE INDEX "calls_model_idx" ON "calls"("model");
