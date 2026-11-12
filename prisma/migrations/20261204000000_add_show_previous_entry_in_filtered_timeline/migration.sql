-- Add showPreviousEntryInFilteredTimeline column to Settings table
ALTER TABLE "Settings" ADD COLUMN "showPreviousEntryInFilteredTimeline" BOOLEAN NOT NULL DEFAULT true;
