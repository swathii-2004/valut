-- ============================================================
-- COUPLE VAULT — Migration 002: Multi-Couple Architecture
-- Run inside couple_vault database as postgres superuser
-- Prerequisites: Migration 001_initial_schema must be applied
-- ============================================================

-- ── Schema migrations tracking (idempotent) ──────────────────
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    VARCHAR(100) PRIMARY KEY,
  applied_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Guard: abort if this migration was already applied
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM schema_migrations WHERE version = '002_multi_couple') THEN
    RAISE EXCEPTION 'Migration 002_multi_couple already applied. Aborting.';
  END IF;
END $$;


-- ============================================================
-- STEP 1: New table — vaults
-- ============================================================
CREATE TABLE vaults (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  encrypted_key     TEXT        NOT NULL,         -- vault key encrypted with MASTER_SECRET
  key_iv            TEXT        NOT NULL,          -- AES-GCM IV for the encrypted_key
  key_tag           TEXT        NOT NULL,          -- AES-GCM auth tag for the encrypted_key
  invite_code_hash  TEXT,                          -- SHA-256 of the plain invite code; NULL after partner joins
  invite_expires_at TIMESTAMPTZ,                   -- NULL after invalidated
  status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'active', 'suspended')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- STEP 2: New table — vault_members
-- ============================================================
CREATE TABLE vault_members (
  vault_id  UUID        NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  user_id   UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (vault_id, user_id)
);

-- Enforce one-vault-per-user at the DB level
CREATE UNIQUE INDEX idx_vault_members_user ON vault_members(user_id);


-- ============================================================
-- STEP 3: Add vault_id to existing tables (nullable first)
-- ============================================================
ALTER TABLE messages          ADD COLUMN vault_id UUID REFERENCES vaults(id);
ALTER TABLE files             ADD COLUMN vault_id UUID REFERENCES vaults(id);
ALTER TABLE message_reactions ADD COLUMN vault_id UUID REFERENCES vaults(id);
ALTER TABLE special_dates     ADD COLUMN vault_id UUID REFERENCES vaults(id);


-- ============================================================
-- STEP 4: Add prev_hash column to access_logs (tamper-evident)
-- ============================================================
ALTER TABLE access_logs ADD COLUMN prev_hash TEXT;


-- ============================================================
-- STEP 5: Backfill — migrate existing couple into a legacy vault
-- ============================================================

-- 5a. Create the legacy vault (placeholder key — existing data uses env key V1)
INSERT INTO vaults (id, encrypted_key, key_iv, key_tag, status)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'LEGACY',
  'LEGACY',
  'LEGACY',
  'active'
);

-- 5b. Add every existing user to the legacy vault
INSERT INTO vault_members (vault_id, user_id)
SELECT 'aaaaaaaa-0000-0000-0000-000000000001', id FROM users;

-- 5c. Backfill all existing rows
UPDATE messages          SET vault_id = 'aaaaaaaa-0000-0000-0000-000000000001' WHERE vault_id IS NULL;
UPDATE files             SET vault_id = 'aaaaaaaa-0000-0000-0000-000000000001' WHERE vault_id IS NULL;
UPDATE message_reactions SET vault_id = 'aaaaaaaa-0000-0000-0000-000000000001' WHERE vault_id IS NULL;
UPDATE special_dates     SET vault_id = 'aaaaaaaa-0000-0000-0000-000000000001' WHERE vault_id IS NULL;


-- ============================================================
-- STEP 6: Enforce NOT NULL after backfill
-- ============================================================
ALTER TABLE messages          ALTER COLUMN vault_id SET NOT NULL;
ALTER TABLE files             ALTER COLUMN vault_id SET NOT NULL;
ALTER TABLE message_reactions ALTER COLUMN vault_id SET NOT NULL;
ALTER TABLE special_dates     ALTER COLUMN vault_id SET NOT NULL;


-- ============================================================
-- STEP 7: File storage migration
-- Existing files are in vault/  — move them to vault/{legacy_vault_id}/
-- Run this shell command ONCE manually before restarting the API:
--   mkdir -p vault/aaaaaaaa-0000-0000-0000-000000000001
--   find vault -maxdepth 1 -type f -exec mv {} vault/aaaaaaaa-0000-0000-0000-000000000001/ \;
-- ============================================================


-- ============================================================
-- STEP 8: Indexes
-- ============================================================
CREATE INDEX idx_messages_vault    ON messages(vault_id, created_at DESC);
CREATE INDEX idx_files_vault       ON files(vault_id)             WHERE is_deleted = FALSE;
CREATE INDEX idx_reactions_vault   ON message_reactions(vault_id);
CREATE INDEX idx_spec_dates_vault  ON special_dates(vault_id);
CREATE INDEX idx_vault_status      ON vaults(status);
CREATE INDEX idx_vault_invite_hash ON vaults(invite_code_hash)    WHERE invite_code_hash IS NOT NULL;


-- ============================================================
-- STEP 9: Grant privileges to vault_app role
-- ============================================================
GRANT SELECT, INSERT, UPDATE        ON vaults        TO vault_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON vault_members TO vault_app;


-- ============================================================
-- STEP 10: Record migration
-- ============================================================
INSERT INTO schema_migrations (version) VALUES ('002_multi_couple');

-- ============================================================
-- DONE
-- Verify with:
--   SELECT * FROM schema_migrations;
--   \d vaults
--   \d vault_members
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name IN ('messages','files','message_reactions','special_dates')
--     AND column_name = 'vault_id';
-- ============================================================
