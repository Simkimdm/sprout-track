# Database Migrations

## Overview

This project uses **Prisma** as the ORM for database management. All database schema changes must be made through **Prisma migrations** to ensure the database structure stays in sync with the code.

## Prisma Version

- **Prisma Client**: v7.10.0
- **Database Providers**: SQLite (default), PostgreSQL

## Migration Workflow

### 1. Modify the Prisma Schema

Edit `prisma/schema.prisma` to make your schema changes. For example, adding a new field:

```prisma
model Settings {
  // ... existing fields
  weekStartsOn String @default("Sunday") // "Sunday" | "Monday"
}
```

### 2. Create the Migration

#### Option A: Using Prisma CLI (Development)

```bash
# Install Prisma 7 CLI if not available
npm install @prisma/client@7 prisma@7 --save-dev

# Create a new migration
npx prisma migrate dev --name add_week_starts_on
```

This will:
- Generate the migration SQL file
- Apply it to your local database
- Update the `migration_lock.toml`

#### Option B: Manual Migration (Docker/Production)

If you cannot run Prisma CLI directly (e.g., in Docker environments):

1. Create a new migration folder with timestamp:
   ```bash
   mkdir -p prisma/migrations/YYYYMMDDHHMMSS_migration_name
   ```

2. Create `migration.sql` with your SQL commands:
   ```sql
   -- Add weekStartsOn column to Settings table
   ALTER TABLE Settings ADD COLUMN weekStartsOn TEXT DEFAULT 'Sunday';
   ```

3. Commit and push the migration folder to GitHub

### 3. Deploy the Migration

In this project, **migrations are automatically applied on container startup** via `docker-startup.sh`:

```bash
# For SQLite (default)
npx prisma migrate deploy

# For PostgreSQL
npx prisma db push --accept-data-loss
```

**To apply migrations, simply restart your container:**
```bash
docker compose down && docker compose up -d
```

## Docker Startup Process

The `docker-startup.sh` script handles database setup automatically:

1. **SQLite**: Runs `prisma migrate deploy`
2. **PostgreSQL**: Runs `prisma db push --accept-data-loss`
3. **Seeding**: Runs `prisma db seed`
4. **Legacy conversions**: Runs conversion scripts

## Migration File Structure

```
prisma/
├── schema.prisma          # Your schema definition
├── migrations/
│   ├── YYYYMMDDHHMMSS_name/
│   │   └── migration.sql  # SQL migration commands
│   └── migration_lock.toml
└── seed.ts                # Seed data
```

## Migration Naming Convention

Use the format: `YYYYMMDDHHMMSS_description`

Examples:
- `20261108120000_add_week_starts_on`
- `20260922000000_add_pump_warning_time`
- `20250216191108_add_security_pin`

## SQLite vs PostgreSQL

### SQLite
- Uses `prisma migrate deploy`
- Migrations are SQL files with `ALTER TABLE` statements
- Example: `ALTER TABLE Settings ADD COLUMN weekStartsOn TEXT DEFAULT 'Sunday';`

### PostgreSQL
- Uses `prisma db push --accept-data-loss`
- Schema is pushed directly (no migration files needed)
- Note: `db push` is **not** a migration - it syncs the schema directly

## Important Notes

### 1. Always Commit Migration Files
Migration folders (`prisma/migrations/YYYYMMDDHHMMSS_name/`) **must be committed to Git** so they are applied on all deployments.

### 2. Migration Order Matters
Migrations are applied in **alphabetical order** (by timestamp). Ensure your migration timestamp is **after** the last existing migration.

### 3. Default Values
When adding new columns, always specify a **DEFAULT** value for existing rows:
```sql
ALTER TABLE Settings ADD COLUMN weekStartsOn TEXT DEFAULT 'Sunday';
```

### 4. Schema Changes Only
- **DO** use migrations for: Adding/removing columns, tables, indexes
- **DON'T** use migrations for: Data changes (use seed scripts instead)

### 5. Testing Migrations
To test a migration locally before deploying:
```bash
# Apply the migration
npx prisma migrate dev

# Check the database
npx prisma studio

# Reset and reapply (if needed)
npx prisma migrate reset
```

## Troubleshooting

### "Column does not exist" Error
**Cause**: Migration was not applied to the database.

**Solution**:
1. Check if the migration folder exists in `prisma/migrations/`
2. Restart the container: `docker compose down && docker compose up -d`
3. If using SQLite, check the `_prisma_migrations` table in your database

### "Migration already applied" Error
**Cause**: Migration was already applied but you're trying to apply it again.

**Solution**: This is normal. The `migrate deploy` command is idempotent and will skip already-applied migrations.

### Migration Conflicts
**Cause**: Multiple developers created migrations with the same timestamp.

**Solution**: Ensure unique timestamps by using the current date/time in YYYYMMDDHHMMSS format.

## Example: Adding a New Column

### Step 1: Update Schema
```prisma
// prisma/schema.prisma
model Settings {
  // ... existing fields
  newFeatureEnabled Boolean @default(false)
}
```

### Step 2: Create Migration
```bash
mkdir -p prisma/migrations/20261108130000_add_new_feature_flag
```

```sql
-- prisma/migrations/20261108130000_add_new_feature_flag/migration.sql
ALTER TABLE Settings ADD COLUMN newFeatureEnabled BOOLEAN DEFAULT false;
```

### Step 3: Commit & Push
```bash
git add prisma/migrations/20261108130000_add_new_feature_flag/
git commit -m "migration: add newFeatureEnabled column to Settings"
git push origin main
```

### Step 4: Deploy
```bash
docker compose down && docker compose up -d
```

## References

- [Prisma Migration Documentation](https://pris.ly/d/prisma-schema)
- [Prisma Migrate CLI](https://pris.ly/d/prisma-migrate)
- [Docker Startup Script](../docker-startup.sh)
