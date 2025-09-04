-- Ensure pgvector extension exists
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "public"."Site" (
    "id" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "startUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Page" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "urlNormalized" TEXT NOT NULL,
    "title" TEXT,
    "metaDescription" TEXT,
    "content" TEXT,
    "contentHash" TEXT,
    "lastCrawledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Summary" (
    "id" UUID NOT NULL,
    "pageId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "textHash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Summary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Snapshot" (
    "id" UUID NOT NULL,
    "pageId" UUID NOT NULL,
    "screenshotPath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Embedding" (
    "id" UUID NOT NULL,
    "pageId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "vector" vector NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Embedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Site_domain_key" ON "public"."Site"("domain");

-- CreateIndex
CREATE INDEX "Page_siteId_idx" ON "public"."Page"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "Page_siteId_urlNormalized_key" ON "public"."Page"("siteId", "urlNormalized");

-- CreateIndex
CREATE INDEX "Summary_pageId_idx" ON "public"."Summary"("pageId");

-- CreateIndex
CREATE UNIQUE INDEX "Summary_pageId_textHash_key" ON "public"."Summary"("pageId", "textHash");

-- CreateIndex
CREATE INDEX "Snapshot_pageId_idx" ON "public"."Snapshot"("pageId");

-- CreateIndex
CREATE INDEX "Embedding_pageId_idx" ON "public"."Embedding"("pageId");

-- AddForeignKey
ALTER TABLE "public"."Page" ADD CONSTRAINT "Page_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "public"."Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Summary" ADD CONSTRAINT "Summary_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "public"."Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Snapshot" ADD CONSTRAINT "Snapshot_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "public"."Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Embedding" ADD CONSTRAINT "Embedding_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "public"."Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
