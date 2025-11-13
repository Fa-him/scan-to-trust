-- 1) users (each actor has their own API key hash)
CREATE TABLE IF NOT EXISTS users(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL CHECK (role IN ('producer','manufacturer','distributor','retailer')),
  name text NOT NULL,
  company text,
  phone text,
  api_key_hash text NOT NULL,  -- sha256(api_key)
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 2) batches: bind to owner user + public_id (unguessable)
ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS public_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES users(id);

-- backfill public_id for existing rows
UPDATE batches SET public_id = encode(gen_random_bytes(16),'hex') WHERE public_id IS NULL;

-- 3) transfer tokens: bind to owner & intended receiver user
CREATE TABLE IF NOT EXISTS transfer_tokens(
  id bigserial PRIMARY KEY,
  batch_id text NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES users(id),
  receiver_user_id uuid NOT NULL REFERENCES users(id),
  code text NOT NULL UNIQUE,
  not_before timestamptz,
  expires_at timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- tighten old columns (keep for display; ownership source of truth = owner_user_id)
ALTER TABLE batches DROP COLUMN IF EXISTS current_owner_api_key_hash;
ALTER TABLE batches RENAME COLUMN current_owner_role    TO current_owner_role_deprecated;
ALTER TABLE batches RENAME COLUMN current_owner_name    TO current_owner_name_deprecated;
ALTER TABLE batches RENAME COLUMN current_owner_company TO current_owner_company_deprecated;
ALTER TABLE batches RENAME COLUMN current_owner_phone   TO current_owner_phone_deprecated;

-- helpful indexes
CREATE INDEX IF NOT EXISTS ix_batches_owner ON batches(owner_user_id);
CREATE INDEX IF NOT EXISTS ix_tokens_batch ON transfer_tokens(batch_id);
CREATE EXTENSION IF NOT EXISTS pgcrypto;
