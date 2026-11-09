-- Add showCalendarEventsInTimeline column to Settings table
ALTER TABLE "Settings" ADD COLUMN "showCalendarEventsInTimeline" BOOLEAN NOT NULL DEFAULT false;
