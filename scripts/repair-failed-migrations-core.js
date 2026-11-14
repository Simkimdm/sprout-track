/**
 * Pure helpers for repairing failed Prisma migrations (P3009/P3018) in a
 * SQLite database. Kept separate from the CLI wrapper so tests can drive them
 * with an in-memory better-sqlite3 database.
 *
 * A migration that crashed mid-run is recorded in _prisma_migrations with
 * finished_at = NULL; from then on `prisma migrate deploy` refuses to apply
 * anything new (P3009) and the schema drifts out of sync with the generated
 * client (e.g. "column FeedLog.quality does not exist"). The standard recovery
 * is `migrate resolve --rolled-back` + redeploy — SQLite migrations run inside
 * a transaction, so a failed one left no partial changes behind. Exception:
 * when the failed migration only does `ALTER TABLE ... ADD COLUMN` and that
 * column already exists (a table-rebuild migration created it earlier), retrying
 * fails again with "duplicate column name"; those are marked `--applied`
 * instead, because their effect is already in the database.
 */

const fs = require('fs');
const path = require('path');
const { resolveDatabaseUrl } = require('../prisma/prisma-adapter');

/**
 * Absolute filesystem path of a `file:` database URL, or null for non-SQLite
 * URLs (PostgreSQL deploys use `db push` and have no migrations table).
 *
 * @param {string | undefined} url
 * @returns {string | null}
 */
function sqlitePathFromUrl(url) {
  const resolved = resolveDatabaseUrl(url, '');
  if (!resolved || !resolved.startsWith('file:')) return null;
  return resolved.slice('file:'.length);
}

/**
 * Names of the migrations recorded as failed (started but never finished and
 * not yet resolved), oldest first.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {string[]}
 */
function findFailedMigrations(db) {
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_prisma_migrations'")
    .get();
  if (!table) return [];
  return db
    .prepare(
      `SELECT migration_name FROM _prisma_migrations
       WHERE finished_at IS NULL AND rolled_back_at IS NULL
       ORDER BY started_at, migration_name`
    )
    .all()
    .map((row) => row.migration_name);
}

/**
 * All `ALTER TABLE "T" ADD COLUMN "C"` statements of a migration script.
 *
 * @param {string} sql
 * @returns {{ table: string, column: string }[]}
 */
function parseAddColumns(sql) {
  return [...sql.matchAll(/ALTER\s+TABLE\s+"([^"]+)"\s+ADD\s+COLUMN\s+"([^"]+)"/gi)]
    .map((m) => ({ table: m[1], column: m[2] }));
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} table
 * @param {string} column
 * @returns {boolean}
 */
function tableHasColumn(db, table, column) {
  try {
    return db.prepare(`PRAGMA table_info("${table}")`).all().some((c) => c.name === column);
  } catch {
    return false;
  }
}

/**
 * How to resolve a failed migration: 'applied' when its only changes are ADD
 * COLUMN statements whose columns already exist in the database (retrying would
 * fail again with "duplicate column name"), 'rolled-back' otherwise so the next
 * `migrate deploy` retries it.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} migrationName
 * @param {string} migrationsDir
 * @returns {'applied' | 'rolled-back'}
 */
function classifyFailedMigration(db, migrationName, migrationsDir) {
  const sqlPath = path.join(migrationsDir, migrationName, 'migration.sql');
  if (!fs.existsSync(sqlPath)) return 'rolled-back';
  const adds = parseAddColumns(fs.readFileSync(sqlPath, 'utf8'));
  if (adds.length === 0) return 'rolled-back';
  const allExist = adds.every((a) => tableHasColumn(db, a.table, a.column));
  return allExist ? 'applied' : 'rolled-back';
}

module.exports = {
  sqlitePathFromUrl,
  findFailedMigrations,
  parseAddColumns,
  tableHasColumn,
  classifyFailedMigration,
};
