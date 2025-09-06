-- CreateTable
CREATE TABLE "public"."CrawlJob" (
    "id" UUID NOT NULL,
    "startUrl" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "user_id" TEXT,
    "max_pages" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrawlJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PageScore" (
    "id" BIGSERIAL NOT NULL,
    "job_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER NOT NULL,
    "signals_json" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Feedback" (
    "id" BIGSERIAL NOT NULL,
    "job_id" UUID NOT NULL,
    "landed_url" TEXT NOT NULL,
    "was_correct" BOOLEAN NOT NULL,
    "chosen_rank" INTEGER,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserPref" (
    "user_id" TEXT NOT NULL,
    "keywords" TEXT[],
    "auto_redirect" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPref_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "CrawlJob_domain_started_at_idx" ON "public"."CrawlJob"("domain", "started_at" DESC);

-- CreateIndex
CREATE INDEX "CrawlJob_status_started_at_idx" ON "public"."CrawlJob"("status", "started_at" DESC);

-- CreateIndex
CREATE INDEX "PageScore_job_id_rank_idx" ON "public"."PageScore"("job_id", "rank");

-- CreateIndex
CREATE INDEX "PageScore_job_id_score_idx" ON "public"."PageScore"("job_id", "score" DESC);

-- CreateIndex
CREATE INDEX "PageScore_url_idx" ON "public"."PageScore"("url");

-- CreateIndex
CREATE INDEX "Feedback_job_id_idx" ON "public"."Feedback"("job_id");

-- CreateIndex
CREATE INDEX "Feedback_user_id_created_at_idx" ON "public"."Feedback"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "public"."PageScore" ADD CONSTRAINT "PageScore_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."CrawlJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Feedback" ADD CONSTRAINT "Feedback_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."CrawlJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
