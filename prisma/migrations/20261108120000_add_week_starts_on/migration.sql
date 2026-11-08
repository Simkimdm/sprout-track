-- Add weekStartsOn column to Settings table
ALTER TABLE Settings ADD COLUMN weekStartsOn TEXT DEFAULT 'Sunday';
