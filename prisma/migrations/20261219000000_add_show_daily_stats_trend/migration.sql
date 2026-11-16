-- Add showDailyStatsTrend column to Settings table
ALTER TABLE "Settings" ADD COLUMN "showDailyStatsTrend" BOOLEAN NOT NULL DEFAULT true;
