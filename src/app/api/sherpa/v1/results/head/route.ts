import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { 
  HeadResponseSchema
} from "@/lib/sherpa-types";
import {
  createErrorResponse,
  pageScoreToPage
} from "@/lib/sherpa-utils";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("job_id");
    
    if (!jobId) {
      return NextResponse.json(
        createErrorResponse("INTERNAL_ERROR", "Missing job_id parameter"),
        { status: 400 }
      );
    }
    
    const job = await prisma.crawlJob.findUnique({
      where: { id: jobId },
      include: {
        pageScores: {
          orderBy: { rank: "asc" },
          take: 2, // top + next
        },
      },
    });
    
    if (!job) {
      return NextResponse.json(
        createErrorResponse("INTERNAL_ERROR", "Job not found"),
        { status: 404 }
      );
    }
    
    if (job.status !== "done") {
      return NextResponse.json(
        createErrorResponse("INTERNAL_ERROR", "Job not completed"),
        { status: 400 }
      );
    }
    
    if (job.pageScores.length === 0) {
      return NextResponse.json(
        createErrorResponse("INTERNAL_ERROR", "No results found"),
        { status: 404 }
      );
    }
    
    const top = pageScoreToPage(job.pageScores[0]);
    const next = job.pageScores[1] ? pageScoreToPage(job.pageScores[1]) : null;
    const remaining = Math.max(0, job.pageScores.length - 2);
    
    const response = HeadResponseSchema.parse({
      top,
      next,
      remaining,
    });
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error("Results head endpoint error:", error);
    
    return NextResponse.json(
      createErrorResponse("INTERNAL_ERROR", "Internal server error"),
      { status: 500 }
    );
  }
}
