-- ============================================================
-- COUPLE VAULT — COMPLETE DATABASE SETUP
-- Run as postgres superuser
-- PostgreSQL v18 | Windows
-- ============================================================
-- HOW TO CONNECT:
--   $env:PATH += ";C:\Program Files\PostgreSQL\18\bin"
--   psql -U postgres -d postgres
-- ============================================================


-- STEP 1: Create database
CREATE DATABASE couple_vault;

-- STEP 2: Create app role
CREATE ROLE vault_app WITH LOGIN ENCRYPTED PASSWORD 'Vault@2026!SecurePass';

-- STEP 3: Grant connect
GRANT CONNECT ON DATABASE couple_vault TO vault_app;
GRANT USAGE ON SCHEMA public TO vault_app;

-- STEP 4: Switch to couple_vault database
-- Run this command: \c couple_vault
-- (you will be prompted for postgres password again)


-- ============================================================
-- FROM HERE, YOU ARE INSIDE couple_vault DATABASE
-- ============================================================

-- STEP 5: Schema permissions
GRANT USAGE ON SCHEMA public TO vault_app;
REVOKE ALL ON SCHEMA public FROM PUBLIC;

-- STEP 6: UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- TABLES
-- ============================================================

-- TABLE 1: users
CREATE TABLE users (
  id                   UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  email                VARCHAR(255) UNIQUE NOT NULL,
  password_hash        TEXT         NOT NULL,
  display_name         VARCHAR(100),
  role                 VARCHAR(20)  NOT NULL DEFAULT 'member'
                       CHECK (role IN ('owner', 'member')),
  is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
  failed_attempts      INTEGER      NOT NULL DEFAULT 0,
  locked_until         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_login           TIMESTAMPTZ,
  last_password_change TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- TABLE 2: encryption_keys
CREATE TABLE encryption_keys (
  version     INTEGER     PRIMARY KEY,
  status      VARCHAR(20) NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'retiring', 'retired')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retired_at  TIMESTAMPTZ
);

-- Seed initial key version
INSERT INTO encryption_keys (version, status) VALUES (1, 'active');

-- TABLE 3: files
CREATE TABLE files (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id         UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stored_filename  TEXT         NOT NULL,
  iv               TEXT         NOT NULL,
  auth_tag         TEXT         NOT NULL,
  key_version      INTEGER      NOT NULL REFERENCES encryption_keys(version),
  encrypted_name   TEXT         NOT NULL,
  name_iv          TEXT         NOT NULL,
  name_auth_tag    TEXT         NOT NULL,
  mime_type        VARCHAR(100) NOT NULL,
  file_size_bytes  BIGINT       NOT NULL,
  is_deleted       BOOLEAN      NOT NULL DEFAULT FALSE,
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- TABLE 4: refresh_tokens
CREATE TABLE refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,
  is_revoked  BOOLEAN     NOT NULL DEFAULT FALSE,
  family_id   UUID        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  device_hint TEXT
);

-- TABLE 5: access_logs
CREATE TABLE access_logs (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  action     VARCHAR(50) NOT NULL
             CHECK (action IN (
               'login_success', 'login_failure', 'logout',
               'token_refresh', 'token_revoked',
               'file_upload', 'file_view', 'file_delete',
               'key_rotation_started', 'key_rotation_complete',
               'account_locked', 'password_changed'
             )),
  file_id    UUID,
  ip_address INET,
  user_agent TEXT,
  success    BOOLEAN,
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_files_owner       ON files(owner_id)     WHERE is_deleted = FALSE;
CREATE INDEX idx_files_created     ON files(created_at DESC);
CREATE INDEX idx_files_key_version ON files(key_version);
CREATE INDEX idx_refresh_token     ON refresh_tokens(token_hash) WHERE is_revoked = FALSE;
CREATE INDEX idx_logs_user         ON access_logs(user_id, created_at DESC);
CREATE INDEX idx_logs_action       ON access_logs(action, created_at DESC);
CREATE UNIQUE INDEX idx_users_email ON users(LOWER(email));


-- ============================================================
-- GRANT PRIVILEGES TO vault_app
-- ============================================================

GRANT SELECT, INSERT, UPDATE ON users TO vault_app;
GRANT SELECT, INSERT, UPDATE ON files TO vault_app;
GRANT SELECT ON encryption_keys TO vault_app;
GRANT SELECT, INSERT, UPDATE ON refresh_tokens TO vault_app;
GRANT SELECT, INSERT ON access_logs TO vault_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vault_app;


-- ============================================================
-- VERIFY — run this to confirm all 5 tables exist
-- ============================================================
-- \dt


-- ============================================================
-- IF YOU NEED TO RESET EVERYTHING (start fresh)
-- ============================================================
-- DROP DATABASE couple_vault;
-- DROP ROLE vault_app;
-- Then run this entire file again from STEP 1
-- ============================================================
