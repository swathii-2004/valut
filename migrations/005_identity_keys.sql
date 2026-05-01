-- Migration 005: Identity Keys for E2EE
-- Phase 9.1: Foundation

-- Add columns to users table for storing public keys
ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_public_key TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_key_type VARCHAR(20) DEFAULT 'X25519';

-- Record migration
INSERT INTO schema_migrations (version) VALUES ('005_identity_keys') ON CONFLICT (version) DO NOTHING;
