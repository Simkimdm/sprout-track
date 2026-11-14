#!/usr/bin/env node

/**
 * Repair failed Prisma migrations (P3009/P3018, SQLite only) and re-run
 * `migrate deploy` until it succeeds.
 *
 * Called by docker-startup.sh after a failed `prisma migrate deploy`: every
 * migration recorded as failed in _prisma_migrations is resolved — `--applied`
 * when its ADD COLUMN changes are already present (e.g. a table rebuild created
 * the column, so a retry would fail with "duplicate column name"), otherwise
 * `--rolled-back` so deploy retries it — then deploy runs again. A deploy can
 * fail on the *next* migration only after the current failed row is resolved,
 * so this loops a few rounds. Exits non-zero if migrations still fail, so the
 * caller can abort instead of starting with a drifted schema (missing columns
 * crash later startup steps, e.g. the solids conversion). Run from the project
 * root.
 *
 * Usage:
 *   node scripts/repair-failed-migrations.js
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const {
  sqlitePathFromUrl,
  findFailedMigrations,
  classifyFailedMigration,
} = require('./repair-failed-migrations-core');

const MIGRATIONS_DIR = path.join(process.cwd(), 'prisma', 'migrations');
const MAX_ROUNDS = 5;

function prisma(args) {
  execFileSync('npx', ['prisma', ...args], { stdio: 'inherit' });
}

function openDb(dbPath) {
  return new Database(dbPath, { readonly: true });
}

function main() {
  const dbPath = sqlitePathFromUrl(process.env.DATABASE_URL);
  if (!dbPath) {
    console.log('Not a SQLite database (no file: DATABASE_URL) - nothing to repair.');
    return 1;
  }
  if (dbPath !== ':memory:' && !fs.existsSync(dbPath)) {
    console.log(`Database file ${dbPath} does not exist - nothing to repair.`);
    return 1;
  }

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    let failed = [];
    {
      const db = openDb(dbPath);
      try {
        failed = findFailedMigrations(db);
        for (const name of failed) {
          const mode = classifyFailedMigration(db, name, MIGRATIONS_DIR);
          console.log(`Resolving failed migration ${name} as --${mode}...`);
          prisma(['migrate', 'resolve', `--${mode}`, name]);
        }
      } finally {
        db.close();
      }
    }

    console.log(`Running prisma migrate deploy (repair round ${round}/${MAX_ROUNDS})...`);
    try {
      prisma(['migrate', 'deploy']);
      if (failed.length > 0) {
        console.log(`Repair complete: ${failed.length} failed migration(s) resolved, all migrations applied.`);
      }
      return 0;
    } catch {
      console.log('migrate deploy still failing, checking for newly failed migrations...');
    }
  }

  console.error('ERROR: migrations still fail after automatic repair.');
  return 1;
}

try {
  process.exit(main());
} catch (error) {
  console.error('Failed to repair failed migrations:', error.message);
  process.exit(1);
}
