import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createErrorResponse } from "@/lib/sherpa-utils";

export const runtime = "nodejs";

// Validate jobId as a UUID and question as non-empty string
const BodySchema = z.object({
  jobId: z.string().uuid(),
  question: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => undefined);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        createErrorResponse("INVALID_REQUEST", "Invalid body"),
        { status: 400 }
      );
    }
    const { jobId, question } = parsed.data;

    // Get the siteId from the job
    const job = await prisma.crawlJob.findUnique({
      where: { id: jobId },
      select: { id: true, domain: true }
    });

    if (!job) {
      return NextResponse.json(
        createErrorResponse("JOB_NOT_FOUND", "Crawl job not found"),
        { status: 404 }
      );
    }

    // Find the corresponding Site record
    const site = await prisma.site.findUnique({
      where: { domain: job.domain },
      select: { id: true }
    });

    if (!site) {
      return NextResponse.json(
        createErrorResponse("SITE_NOT_FOUND", "Site not found for job"),
        { status: 404 }
      );
    }

    // For now, return a simple response to test the flow
    return NextResponse.json({
      answer: `UPDATED: Test answer for question: "${question}" on site: ${job.domain}`,
      sources: [{
        url: `https://${job.domain}`,
        title: `Homepage of ${job.domain}`,
        snippet: "This is an updated test response",
        screenshotUrl: undefined,
      }]
    });
    
  } catch (e) {
    console.error("Sherpa query endpoint error:", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      createErrorResponse("INTERNAL_ERROR", message),
      { status: 500 }
    );
  }
}