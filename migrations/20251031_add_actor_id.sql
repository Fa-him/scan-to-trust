ALTER TABLE events
  ADD COLUMN IF NOT EXISTS actor_id text;

-- (optional but handy)
CREATE INDEX IF NOT EXISTS ix_events_actor ON events(actor_id);
