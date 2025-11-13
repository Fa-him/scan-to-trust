ALTER TABLE transfer_tokens
  ADD COLUMN IF NOT EXISTS next_owner_name text;

-- (Optional but handy) keep both columns indexed for lookups
CREATE INDEX IF NOT EXISTS ix_transfer_tokens_next_owner_name
  ON transfer_tokens(next_owner_name);
