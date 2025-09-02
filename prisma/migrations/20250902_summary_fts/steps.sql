ALTER TABLE "Summary" ADD COLUMN IF NOT EXISTS tsv tsvector;

-- Backfill once
UPDATE "Summary"
SET tsv = to_tsvector('english', coalesce(text, ''));

CREATE INDEX IF NOT EXISTS summary_tsv_idx ON "Summary" USING GIN (tsv);
