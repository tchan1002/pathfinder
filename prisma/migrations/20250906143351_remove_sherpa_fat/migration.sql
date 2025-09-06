/*
  Warnings:

  - You are about to drop the column `max_pages` on the `CrawlJob` table. All the data in the column will be lost.
  - You are about to drop the column `user_id` on the `CrawlJob` table. All the data in the column will be lost.
  - You are about to drop the `Feedback` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PageScore` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserPref` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Feedback" DROP CONSTRAINT "Feedback_job_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."PageScore" DROP CONSTRAINT "PageScore_job_id_fkey";

-- AlterTable
ALTER TABLE "public"."CrawlJob" DROP COLUMN "max_pages",
DROP COLUMN "user_id";

-- DropTable
DROP TABLE "public"."Feedback";

-- DropTable
DROP TABLE "public"."PageScore";

-- DropTable
DROP TABLE "public"."UserPref";
