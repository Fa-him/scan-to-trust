ALTER TABLE events
  ADD COLUMN IF NOT EXISTS actor_price numeric(12,2);

-- keep it sane (optional, safe)
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER TABLE events ADD CONSTRAINT events_actor_price_nonneg CHECK (actor_price IS NULL OR actor_price >= 0)';
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;
