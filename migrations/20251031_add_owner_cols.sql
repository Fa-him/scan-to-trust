-- Add missing owner-centric columns (safe to run multiple times)
ALTER TABLE batches ADD COLUMN IF NOT EXISTS current_owner_id        text;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS current_owner_name      text;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS current_owner_company   text;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS current_owner_phone     text;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS current_owner_pass_hash text;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS current_price           numeric(12,2) DEFAULT 0;

-- Price per handoff on events
ALTER TABLE events  ADD COLUMN IF NOT EXISTS sale_price             numeric(12,2);

-- Optional helpful indexes (no-op if they exist)
CREATE INDEX IF NOT EXISTS ix_events_batch    ON events(batch_id);
CREATE INDEX IF NOT EXISTS ix_events_day      ON events((date(recorded_at)));
