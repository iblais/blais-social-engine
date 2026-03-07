---
name: migrate
description: Create and run Supabase database migrations safely
disable-model-invocation: true
allowed-tools: Bash, Read, Write, Edit, Glob
argument-hint: "[description of schema change]"
---

# Supabase Migration

Create and apply database migrations for Blais Social Engine.

## Steps

1. **Understand the change**: Parse `$ARGUMENTS` to understand what schema change is needed

2. **Check current schema**: Query the database to understand existing tables/columns
   ```
   POST https://api.supabase.com/v1/projects/mzwleneitsihjwfzfuho/database/query
   ```

3. **Create migration file**:
   - Path: `C:/Users/itsbl/projects/blais-social-engine/supabase/migrations/`
   - Filename: `YYYYMMDDHHMMSS_description.sql` (use current timestamp)
   - Write idempotent SQL (use `IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`)
   - Include RLS policies if adding new tables
   - Add comments explaining the migration

4. **Review**: Show the migration SQL to the user before applying

5. **Apply**: Run via Supabase CLI:
   ```bash
   cd C:/Users/itsbl/projects/blais-social-engine
   SUPABASE_ACCESS_TOKEN=sbp_... npx supabase db push
   ```

6. **Update types** if needed:
   - Update `src/types/database.ts` to reflect new columns/tables

7. **Verify**: Query the database to confirm the migration applied correctly

## Safety Rules
- ALWAYS use `IF NOT EXISTS` / `IF EXISTS` for idempotency
- NEVER drop tables or columns without explicit user confirmation
- ALWAYS include RLS policies for new tables (match existing patterns)
- Test migration SQL with a dry-run query first when possible

## Project Ref
Supabase project: `mzwleneitsihjwfzfuho`
