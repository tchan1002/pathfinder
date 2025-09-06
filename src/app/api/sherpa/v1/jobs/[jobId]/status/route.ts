import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { 
  JobStatusResponseSchema
} from "@/lib/sherpa-types";
import {
  createErrorResponse
} from "@/lib/sherpa-utils";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    
    const job = await prisma.crawlJob.findUnique({
      where: { id: jobId },
      include: {
        pageScores: {
          orderBy: { rank: "asc" },
        },
      },
    });
    
    if (!job) {
      return NextResponse.json(
        createErrorResponse("INTERNAL_ERROR", "Job not found"),
        { status: 404 }
      );
    }
    
    // Calculate progress if job is running
    let progress = undefined;
    if (job.status === "running") {
      const pagesScanned = job.pageScores.length;
      // No page limit - just show pages scanned
      progress = {
        pages_scanned: pagesScanned,
        pages_total_est: null, // No limit - let Pathfinder decide when to stop
      };
    }
    
    const response = JobStatusResponseSchema.parse({
      status: job.status as "queued" | "running" | "done" | "error",
      progress,
      error_code: job.status === "error" ? "CRAWL_FAILURE" : undefined,
      error_message: job.status === "error" ? "Crawling failed" : undefined,
    });
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error("Job status endpoint error:", error);
    
    return NextResponse.json(
      createErrorResponse("INTERNAL_ERROR", "Internal server error"),
      { status: 500 }
    );
  }
}
