import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'fs';
import path from 'path';

// Guards the SQLite migration chain against "duplicate column name" deploy
// failures: simulate the migrations in name order, tracking the columns of
// every table (CREATE TABLE, table-rebuild via CREATE "new_X" + RENAME, DROP,
// ALTER TABLE ADD COLUMN), and fail when a migration adds a column the table
// already has. This is exactly what broke deploys: a table-rebuild migration
// named to sort *before* the migrations that add its new columns, so the
// rebuild already created them and the later ADD COLUMN crashed (P3018), which
// then blocked every later migration via P3009.

const MIGRATIONS_DIR = path.join(process.cwd(), 'prisma', 'migrations');

function listMigrations(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(path.join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8'),
    }));
}

/** Column names declared in the body of a CREATE TABLE "<table>" (...) statement. */
function columnsOfCreateTable(sql: string, createMatchEnd: number): string[] {
  const rest = sql.slice(createMatchEnd);
  const bodyMatch = rest.match(/^\s*\(([\s\S]*?)\n\);/);
  if (!bodyMatch) return [];
  return bodyMatch[1]
    .split('\n')
    .map((line) => line.match(/^\s*"([^"]+)"/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => m[1]);
}

describe('prisma migration chain', () => {
  it('every migration directory contains a migration.sql', () => {
    const names = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    for (const name of names) {
      expect(existsSync(path.join(MIGRATIONS_DIR, name, 'migration.sql')), name).toBe(true);
    }
  });

  it('never adds a column a table already has (no "duplicate column name" on deploy)', () => {
    const tables = new Map<string, Set<string>>();
    const rebuilt = new Map<string, Set<string>>(); // "new_X" -> columns, until RENAME

    const stmtRe = /CREATE\s+TABLE\s+"([^"]+)"|ALTER\s+TABLE\s+"([^"]+)"\s+RENAME\s+TO\s+"([^"]+)"|ALTER\s+TABLE\s+"([^"]+)"\s+ADD\s+COLUMN\s+"([^"]+)"|DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?"([^"]+)"/gi;

    for (const { name, sql } of listMigrations()) {
      let m: RegExpExecArray | null;
      stmtRe.lastIndex = 0;
      while ((m = stmtRe.exec(sql)) !== null) {
        if (m[1] !== undefined) {
          // CREATE TABLE "X"
          const cols = columnsOfCreateTable(sql, m.index + m[0].length);
          expect(new Set(cols).size, `${name}: duplicate column in CREATE TABLE "${m[1]}"`).toBe(cols.length);
          if (m[1].startsWith('new_')) rebuilt.set(m[1], new Set(cols));
          else tables.set(m[1], new Set(cols));
        } else if (m[2] !== undefined && m[3] !== undefined) {
          // ALTER TABLE "new_X" RENAME TO "X"
          const cols = rebuilt.get(m[2]);
          expect(cols, `${name}: rename of unknown table "${m[2]}"`).toBeDefined();
          tables.set(m[3], cols!);
          rebuilt.delete(m[2]);
        } else if (m[4] !== undefined && m[5] !== undefined) {
          // ALTER TABLE "X" ADD COLUMN "c"
          const cols = tables.get(m[4]) ?? new Set<string>();
          expect(cols.has(m[5]), `${name}: "${m[4]}" already has column "${m[5]}" (duplicate column name)`).toBe(false);
          cols.add(m[5]);
          tables.set(m[4], cols);
        } else if (m[6] !== undefined) {
          // DROP TABLE "X"
          tables.delete(m[6]);
        }
      }
    }
  });
});
