import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { tmpdir } from 'os';
import {
  sqlitePathFromUrl,
  findFailedMigrations,
  parseAddColumns,
  tableHasColumn,
  classifyFailedMigration,
} from '../scripts/repair-failed-migrations-core';

// A migration that crashed mid-run sits in _prisma_migrations with finished_at
// NULL; `prisma migrate deploy` then aborts with P3009 and never applies the
// migrations after it, so the schema drifts from the generated client (the
// "column FeedLog.quality does not exist" startup failure). Failed migrations
// whose ADD COLUMN change is already present (a table rebuild created the
// column) must be resolved --applied; a retry would fail again with
// "duplicate column name". All others are resolved --rolled-back for a retry.

function fixture() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE "_prisma_migrations" (
      "id" TEXT PRIMARY KEY,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL,
      "applied_steps_count" INTEGER NOT NULL
    );
    CREATE TABLE "Settings" ("id" TEXT PRIMARY KEY, "showCalendarEventsInTimeline" BOOLEAN NOT NULL DEFAULT false);
    INSERT INTO "_prisma_migrations" VALUES ('a', 'c', '2026-01-01', '20260101000000_init', NULL, NULL, '2026-01-01', 1);
    INSERT INTO "_prisma_migrations" VALUES ('b', 'c', NULL, '20261201000000_add_show_calendar_events_in_timeline', 'boom', NULL, '2026-11-14', 0);
    INSERT INTO "_prisma_migrations" VALUES ('c', 'c', NULL, '20261202000000_move_night_sleep_window_to_baby', 'boom', '2026-11-15', '2026-11-14', 0);
  `);
  return db;
}

describe('findFailedMigrations', () => {
  it('returns only failed, not-yet-resolved migrations', () => {
    expect(findFailedMigrations(fixture())).toEqual([
      '20261201000000_add_show_calendar_events_in_timeline',
    ]);
  });

  it('returns an empty list when the migrations table does not exist', () => {
    expect(findFailedMigrations(new Database(':memory:'))).toEqual([]);
  });

  it('returns an empty list when nothing failed', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE "_prisma_migrations" ("id" TEXT PRIMARY KEY, "finished_at" DATETIME, "migration_name" TEXT, "rolled_back_at" DATETIME, "started_at" DATETIME);
      INSERT INTO "_prisma_migrations" VALUES ('a', '2026-01-01', '20260101000000_init', NULL, '2026-01-01');
    `);
    expect(findFailedMigrations(db)).toEqual([]);
  });
});

describe('parseAddColumns', () => {
  it('extracts all ALTER TABLE ... ADD COLUMN statements', () => {
    expect(parseAddColumns(`
      -- comment
      ALTER TABLE "Settings" ADD COLUMN "showCalendarEventsInTimeline" BOOLEAN NOT NULL DEFAULT false;
      alter table "FeedLog" add column "quality" TEXT;
    `)).toEqual([
      { table: 'Settings', column: 'showCalendarEventsInTimeline' },
      { table: 'FeedLog', column: 'quality' },
    ]);
  });

  it('returns an empty list for migrations without ADD COLUMN', () => {
    expect(parseAddColumns('CREATE INDEX "idx" ON "Settings"("familyId");')).toEqual([]);
  });
});

describe('tableHasColumn', () => {
  it('detects existing and missing columns and unknown tables', () => {
    const db = fixture();
    expect(tableHasColumn(db, 'Settings', 'showCalendarEventsInTimeline')).toBe(true);
    expect(tableHasColumn(db, 'Settings', 'quality')).toBe(false);
    expect(tableHasColumn(db, 'Nope', 'x')).toBe(false);
  });
});

describe('classifyFailedMigration', () => {
  let migrationsDir: string;

  beforeAll(() => {
    migrationsDir = fs.mkdtempSync(path.join(tmpdir(), 'migrations-'));
    fs.mkdirSync(path.join(migrationsDir, '20261201000000_add_show_calendar_events_in_timeline'));
    fs.writeFileSync(
      path.join(migrationsDir, '20261201000000_add_show_calendar_events_in_timeline', 'migration.sql'),
      'ALTER TABLE "Settings" ADD COLUMN "showCalendarEventsInTimeline" BOOLEAN NOT NULL DEFAULT false;'
    );
    fs.mkdirSync(path.join(migrationsDir, '20261203000000_add_feed_quality'));
    fs.writeFileSync(
      path.join(migrationsDir, '20261203000000_add_feed_quality', 'migration.sql'),
      'ALTER TABLE "FeedLog" ADD COLUMN "quality" TEXT;'
    );
    fs.mkdirSync(path.join(migrationsDir, '20261202000000_move_night_sleep_window_to_baby'));
    fs.writeFileSync(
      path.join(migrationsDir, '20261202000000_move_night_sleep_window_to_baby', 'migration.sql'),
      'CREATE INDEX "idx" ON "Baby"("id");'
    );
  });

  afterAll(() => fs.rmSync(migrationsDir, { recursive: true, force: true }));

  it('marks a failed ADD COLUMN migration applied when the column already exists', () => {
    expect(classifyFailedMigration(fixture(), '20261201000000_add_show_calendar_events_in_timeline', migrationsDir)).toBe('applied');
  });

  it('marks it rolled-back when the column is still missing (retry will add it)', () => {
    expect(classifyFailedMigration(fixture(), '20261203000000_add_feed_quality', migrationsDir)).toBe('rolled-back');
  });

  it('marks migrations without ADD COLUMN rolled-back', () => {
    expect(classifyFailedMigration(fixture(), '20261202000000_move_night_sleep_window_to_baby', migrationsDir)).toBe('rolled-back');
  });

  it('marks migrations with no script on disk rolled-back', () => {
    expect(classifyFailedMigration(fixture(), '20990101000000_unknown', migrationsDir)).toBe('rolled-back');
  });
});

describe('sqlitePathFromUrl', () => {
  it('maps an absolute file: URL to its path and strips query params', () => {
    expect(sqlitePathFromUrl('file:/db/baby-tracker.db')).toBe('/db/baby-tracker.db');
    expect(sqlitePathFromUrl('file:/db/baby-tracker.db?connection_limit=1')).toBe('/db/baby-tracker.db');
  });

  it('resolves relative file: URLs against the prisma dir like the app does', () => {
    expect(sqlitePathFromUrl('file:../db/baby-tracker.db')).toBe(path.resolve(process.cwd(), 'db', 'baby-tracker.db'));
  });

  it('returns null for non-SQLite or missing URLs', () => {
    expect(sqlitePathFromUrl('postgresql://user:pass@host:5432/db')).toBeNull();
    expect(sqlitePathFromUrl('postgres://host/db')).toBeNull();
    expect(sqlitePathFromUrl(undefined)).toBeNull();
    expect(sqlitePathFromUrl('')).toBeNull();
  });
});
