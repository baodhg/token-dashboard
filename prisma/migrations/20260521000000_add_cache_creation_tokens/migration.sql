-- AlterTable: add cacheCreationTokens to calls
ALTER TABLE "calls" ADD COLUMN "cacheCreationTokens" INTEGER NOT NULL DEFAULT 0;
