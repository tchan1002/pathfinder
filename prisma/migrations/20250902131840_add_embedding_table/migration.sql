-- Enable pgvector (safe if already present)
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "public"."Embedding" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "vector" vector(384) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Embedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (FK lookup)
CREATE INDEX "Embedding_pageId_idx" ON "public"."Embedding"("pageId");

-- AddForeignKey
ALTER TABLE "public"."Embedding"
  ADD CONSTRAINT "Embedding_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "public"."Page"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 🚀 Optional ANN index for fast similarity search (L2 distance)
-- Tweak `lists` depending on dataset size (e.g., 50–200 is common); higher = faster queries, slower inserts.
CREATE INDEX IF NOT EXISTS "Embedding_vector_ivfflat_idx"
  ON "public"."Embedding" USING ivfflat ("vector" vector_l2_ops)
  WITH (lists = 100);

-- (Nice to have so the planner knows about the new table)
ANALYZE "public"."Embedding";
