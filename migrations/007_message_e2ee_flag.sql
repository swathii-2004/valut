-- Migration 007: E2EE Flag for Messages
-- Phase 13.3: E2EE Messages (Text)

ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_e2ee BOOLEAN DEFAULT FALSE;

-- Record migration
INSERT INTO schema_migrations (version) VALUES ('007_message_e2ee_flag') ON CONFLICT (version) DO NOTHING;
