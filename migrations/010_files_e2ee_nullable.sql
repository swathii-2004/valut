-- Migration 010: Make server-side encryption columns nullable for E2EE zero-trust mode.
-- In E2EE mode the client encrypts files before upload; the server stores the raw
-- encrypted blob and never touches iv/auth_tag/name_iv/name_auth_tag.

ALTER TABLE files ALTER COLUMN iv            DROP NOT NULL;
ALTER TABLE files ALTER COLUMN auth_tag      DROP NOT NULL;
ALTER TABLE files ALTER COLUMN name_iv       DROP NOT NULL;
ALTER TABLE files ALTER COLUMN name_auth_tag DROP NOT NULL;
ALTER TABLE files ALTER COLUMN encrypted_name DROP NOT NULL;

-- key_version FK to encryption_keys can be NULL for pure-E2EE files
ALTER TABLE files ALTER COLUMN key_version   DROP NOT NULL;

-- Ensure at least one encryption_keys row exists so legacy fallback works
INSERT INTO encryption_keys (version, status) VALUES (1, 'active')
ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('010_files_e2ee_nullable') ON CONFLICT (version) DO NOTHING;
