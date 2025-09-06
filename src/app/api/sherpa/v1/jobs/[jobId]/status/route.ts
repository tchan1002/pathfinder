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
    });
    
    if (!job) {
      return NextResponse.json(
        createErrorResponse("INTERNAL_ERROR", "Job not found"),
        { status: 404 }
      );
    }
    
    // For running jobs, we can't easily show progress without PageScore
    // Just show the status
    let progress = undefined;
    if (job.status === "running") {
      progress = {
        pages_scanned: 0, // We don't track this anymore
        pages_total_est: null,
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
