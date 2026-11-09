-- Add autoEndSleepOnFeed column to Settings table
ALTER TABLE "Settings" ADD COLUMN "autoEndSleepOnFeed" BOOLEAN NOT NULL DEFAULT false;
