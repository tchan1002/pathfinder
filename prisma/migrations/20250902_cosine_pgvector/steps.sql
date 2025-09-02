-- Enable extension (no-op if already present)
CREATE EXTENSION IF NOT EXISTS vector;

-- One-time normalize existing vectors to unit length
-- vector <#> vector = inner product trick for squared norm; safer to compute in SQL:
UPDATE "Embedding"
SET vector = vector / sqrt((vector <#> vector))
WHERE (vector <#> vector) <> 0;

-- Cosine index (IVF-Flat)
CREATE INDEX IF NOT EXISTS embedding_vector_cosine_idx
  ON "Embedding" USING ivfflat (vector vector_cosine_ops)
  WITH (lists = 100);

ANALYZE "Embedding";
