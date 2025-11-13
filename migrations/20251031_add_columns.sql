ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS producer_name    text,
  ADD COLUMN IF NOT EXISTS producer_company text,
  ADD COLUMN IF NOT EXISTS producer_phone   text,
  ADD COLUMN IF NOT EXISTS current_owner_role text NOT NULL DEFAULT 'producer',
  ADD COLUMN IF NOT EXISTS current_owner_name text;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS actor_name    text,
  ADD COLUMN IF NOT EXISTS actor_company text,
  ADD COLUMN IF NOT EXISTS actor_phone   text;

CREATE TABLE IF NOT EXISTS day_roots(
  day date PRIMARY KEY,
  root   text NOT NULL,
  tx_hash text
);

CREATE TABLE IF NOT EXISTS transfer_tokens(
  id bigserial PRIMARY KEY,
  batch_id   text NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  code       text NOT NULL,
  next_role  text NOT NULL,
  next_name  text,
  not_before timestamptz,
  expires_at timestamptz NOT NULL,
  used       boolean NOT NULL DEFAULT FALSE,
  revoked    boolean NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_tokens_batch_code ON transfer_tokens(batch_id, code);
