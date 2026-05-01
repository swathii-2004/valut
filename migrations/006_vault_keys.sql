-- Migration 006: Vault Keys for E2EE Handshake
-- Phase 13.2: Vault Key Sharing

CREATE TABLE IF NOT EXISTS vault_keys (
  vault_id          UUID        NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  encrypted_vault_key TEXT      NOT NULL, -- Vault key encrypted with user's Public Identity Key
  key_version       INTEGER     NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (vault_id, user_id, key_version)
);

-- Grant permissions to the app role
GRANT SELECT, INSERT, UPDATE ON vault_keys TO vault_app;

-- Record migration
INSERT INTO schema_migrations (version) VALUES ('006_vault_keys') ON CONFLICT (version) DO NOTHING;
