ALTER TABLE transfer_tokens
  ADD COLUMN IF NOT EXISTS next_owner_id text;

-- helpful for lookups
CREATE INDEX IF NOT EXISTS ix_transfer_tokens_next_owner
  ON transfer_tokens(next_owner_id);
