-- AlterTable
ALTER TABLE "Medicine" ADD COLUMN "expiryDate" DATETIME;

-- CreateIndex
CREATE INDEX "Medicine_expiryDate_idx" ON "Medicine"("expiryDate");
