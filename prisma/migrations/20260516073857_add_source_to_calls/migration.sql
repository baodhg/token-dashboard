-- AlterTable
ALTER TABLE "calls" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'claude_code';

-- CreateIndex
CREATE INDEX "calls_source_idx" ON "calls"("source");
