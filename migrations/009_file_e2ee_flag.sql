-- Migration 009: E2EE Flag for Files
-- Phase 13.7: E2EE Files

ALTER TABLE files ADD COLUMN IF NOT EXISTS is_e2ee BOOLEAN DEFAULT FALSE;

-- Record migration
INSERT INTO schema_migrations (version) VALUES ('009_file_e2ee_flag') ON CONFLICT (version) DO NOTHING;
