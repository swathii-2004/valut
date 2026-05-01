-- ============================================================
-- COUPLE VAULT — Migration 003: Row Level Security
-- Run as postgres superuser inside couple_vault database
-- Prerequisites: 001_initial_schema + 002_multi_couple applied
-- ============================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    VARCHAR(100) PRIMARY KEY,
  applied_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM schema_migrations WHERE version = '003_rls') THEN
    RAISE EXCEPTION 'Migration 003_rls already applied. Aborting.';
  END IF;
END $$;


-- ============================================================
-- ENABLE RLS on all vault-scoped tables
-- vault_app is not the table owner so it is already subject
-- to RLS — no FORCE needed. postgres superuser is unaffected
-- which keeps backups and manual admin queries working.
-- ============================================================

ALTER TABLE messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE files             ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE special_dates     ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- POLICIES
-- Pattern: vault_id = NULLIF(current_setting('app.vault_id', true), '')::uuid
--
-- Why NULLIF?
--   current_setting returns '' (empty string) when not set.
--   Casting '' to uuid throws an error.
--   NULLIF converts '' to NULL so the cast succeeds and
--   the policy evaluates to FALSE — blocking all rows.
--   This means any route that bypasses vault middleware
--   sees zero rows instead of crashing or leaking data.
--
-- USING    = applies to SELECT, UPDATE, DELETE (existing rows)
-- WITH CHECK = applies to INSERT, UPDATE (new row values)
-- ============================================================

CREATE POLICY vault_isolation ON messages
  AS PERMISSIVE FOR ALL TO vault_app
  USING      (vault_id = NULLIF(current_setting('app.vault_id', true), '')::uuid)
  WITH CHECK (vault_id = NULLIF(current_setting('app.vault_id', true), '')::uuid);

CREATE POLICY vault_isolation ON files
  AS PERMISSIVE FOR ALL TO vault_app
  USING      (vault_id = NULLIF(current_setting('app.vault_id', true), '')::uuid)
  WITH CHECK (vault_id = NULLIF(current_setting('app.vault_id', true), '')::uuid);

CREATE POLICY vault_isolation ON message_reactions
  AS PERMISSIVE FOR ALL TO vault_app
  USING      (vault_id = NULLIF(current_setting('app.vault_id', true), '')::uuid)
  WITH CHECK (vault_id = NULLIF(current_setting('app.vault_id', true), '')::uuid);

CREATE POLICY vault_isolation ON special_dates
  AS PERMISSIVE FOR ALL TO vault_app
  USING      (vault_id = NULLIF(current_setting('app.vault_id', true), '')::uuid)
  WITH CHECK (vault_id = NULLIF(current_setting('app.vault_id', true), '')::uuid);


-- ============================================================
-- DONE
-- After running this migration you MUST update the vault
-- middleware (src/middleware/vault.js) to call:
--   await pool.query('SELECT set_config($1, $2, false)', ['app.vault_id', vault_id])
-- on every authenticated request — otherwise all vault-scoped
-- queries will return zero rows.
-- ============================================================

INSERT INTO schema_migrations (version) VALUES ('003_rls');
