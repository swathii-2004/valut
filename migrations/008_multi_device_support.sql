-- Migration 008: Multi-Device Support for E2EE
-- Phase 13.6: Device Management

-- 1. Create devices table
CREATE TABLE IF NOT EXISTS devices (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  identity_public_key TEXT      NOT NULL, -- Unique public key for this device
  device_name       TEXT,                 -- e.g., "iPhone 15", "Partner's Tablet"
  push_token        TEXT,                 -- Each device needs its own push token
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Update vault_keys to support per-device encryption
-- Add device_id column
ALTER TABLE vault_keys ADD COLUMN IF NOT EXISTS device_id UUID REFERENCES devices(id) ON DELETE CASCADE;

-- 3. Migration of existing vault_keys data is not possible yet as we don't have devices.
-- We will assume Phase 13 is a fresh start for E2EE keys.
-- If we had existing vault_keys, we would need to link them to a 'default' device.

-- 4. Change Primary Key of vault_keys
-- This requires dropping the old one first.
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vault_keys_pkey') THEN
        ALTER TABLE vault_keys DROP CONSTRAINT vault_keys_pkey;
    END IF;
END $$;

-- We will allow device_id to be NOT NULL after we have a way to register the first device.
-- For now, let's just add the column and index.
ALTER TABLE vault_keys ADD PRIMARY KEY (vault_id, user_id, device_id, key_version);

-- 5. Permissions
GRANT ALL PRIVILEGES ON TABLE devices TO vault_app;

-- Record migration
INSERT INTO schema_migrations (version) VALUES ('008_multi_device_support') ON CONFLICT (version) DO NOTHING;
