-- =========================
-- Scan-to-Trust: schema.sql
-- Safe to run multiple times
-- =========================

-- 1) Core tables
CREATE TABLE IF NOT EXISTS batches(
  id                   text PRIMARY KEY,
  product_name         text NOT NULL,
  product_price        numeric(12,2) DEFAULT 0,
  created_at           timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events(
  id             bigserial PRIMARY KEY,
  batch_id       text REFERENCES batches(id) ON DELETE CASCADE,
  role           text NOT NULL,                -- producer / manufacturer / distributor / retailer
  location       text,
  doc_hash       text,                         -- 0x... (sha256 of doc text) optional
  event_hash     text NOT NULL,                -- canonical sha256 of the event payload
  occurred_at    timestamptz NOT NULL,
  recorded_at    timestamptz DEFAULT now(),
  actor_id       text,
  actor_name     text,
  actor_company  text,
  actor_phone    text,
  actor_price    numeric(12,2)
);

CREATE TABLE IF NOT EXISTS transfer_tokens(
  id               bigserial PRIMARY KEY,
  batch_id         text REFERENCES batches(id) ON DELETE CASCADE,
  code             text NOT NULL,              -- one-time code
  next_role        text NOT NULL,              -- role of receiver
  next_owner_id    text NOT NULL,              -- receiver’s id (must match at handoff)
  next_owner_name  text,                       -- optional human name (enforced if provided)
  not_before       timestamptz,
  expires_at       timestamptz,
  used             boolean DEFAULT false,
  revoked          boolean DEFAULT false,
  created_at       timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS day_roots(
  day     date PRIMARY KEY,
  root    text NOT NULL,                       -- 0x…32-byte merkle root
  tx_hash text                                 -- optional on-chain tx
);

-- 2) Snapshot / owner columns on batches (added safely if missing)
ALTER TABLE batches ADD COLUMN IF NOT EXISTS current_owner_id      text;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS current_owner_code    text;   -- owner’s private code (NOT an API key)
ALTER TABLE batches ADD COLUMN IF NOT EXISTS current_owner_role    text;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS current_owner_name    text;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS current_owner_company text;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS current_owner_phone   text;

-- Defaults / not-nulls applied safely
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='batches' AND column_name='current_owner_role'
  ) THEN
    -- (already added above; this block is for older PG versions if needed)
    NULL;
  END IF;
  -- Ensure NOT NULL + default for current_owner_role
  BEGIN
    EXECUTE 'ALTER TABLE batches ALTER COLUMN current_owner_role SET DEFAULT ''producer''';
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    -- Set any NULL existing rows to 'producer' to allow NOT NULL constraint
    EXECUTE 'UPDATE batches SET current_owner_role=''producer'' WHERE current_owner_role IS NULL';
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    EXECUTE 'ALTER TABLE batches ALTER COLUMN current_owner_role SET NOT NULL';
  EXCEPTION WHEN others THEN NULL;
  END;
END
$$;

-- Ensure product_name is NOT NULL (backfill blanks)
UPDATE batches SET product_name='Unknown' WHERE product_name IS NULL OR product_name='';
ALTER TABLE batches ALTER COLUMN product_name SET NOT NULL;

-- 3) Helpful indexes & constraints
CREATE INDEX IF NOT EXISTS ix_events_batch ON events(batch_id);
CREATE INDEX IF NOT EXISTS ix_events_day   ON events((date(recorded_at)));
CREATE UNIQUE INDEX IF NOT EXISTS ux_transfer_token_code ON transfer_tokens(batch_id, code);

-- Optional sanity checks (don’t break existing data)
DO $$
BEGIN
  -- Non-negative prices
  BEGIN
    EXECUTE 'ALTER TABLE batches ADD CONSTRAINT batches_price_nonneg CHECK (product_price IS NULL OR product_price >= 0)';
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    EXECUTE 'ALTER TABLE events  ADD CONSTRAINT events_actor_price_nonneg CHECK (actor_price IS NULL OR actor_price >= 0)';
  EXCEPTION WHEN others THEN NULL;
  END;
END
$$;
