-- Phase 7: Chat tables
-- Run against: couple_vault DB as superuser or vault_app

CREATE TABLE IF NOT EXISTS messages (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id    UUID NOT NULL REFERENCES users(id),
  receiver_id  UUID NOT NULL REFERENCES users(id),
  type         VARCHAR(20) NOT NULL CHECK (type IN ('text','image','video','audio','file')),
  content      TEXT,
  content_iv   TEXT,
  content_tag  TEXT,
  file_id      UUID REFERENCES files(id),
  reply_to_id  UUID REFERENCES messages(id),
  is_deleted   BOOLEAN NOT NULL DEFAULT FALSE,
  is_read      BOOLEAN NOT NULL DEFAULT FALSE,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS message_reactions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id  UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  emoji       VARCHAR(10) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_chat    ON messages(sender_id, receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);

GRANT SELECT, INSERT, UPDATE ON messages TO vault_app;
GRANT SELECT, INSERT, DELETE ON message_reactions TO vault_app;
