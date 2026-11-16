-- Add feedTileTrendByDuration column to Settings table
ALTER TABLE "Settings" ADD COLUMN "feedTileTrendByDuration" BOOLEAN NOT NULL DEFAULT true;
