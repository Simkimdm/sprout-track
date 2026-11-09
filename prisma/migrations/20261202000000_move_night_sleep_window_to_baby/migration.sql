-- Move nightSleepWindow from Settings to Baby (20261120000000_add_night_sleep_window already ran on existing databases, so it is kept as-is)
-- AlterTable
ALTER TABLE "Settings" DROP COLUMN "nightSleepWindow";
-- AlterTable
ALTER TABLE "Baby" ADD COLUMN "nightSleepWindow" TEXT;
