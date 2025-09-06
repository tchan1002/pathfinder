import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { 
  AdvanceRequestSchema,
  AdvanceResponseSchema
} from "@/lib/sherpa-types";
import {
  createErrorResponse,
  pageScoreToPage
} from "@/lib/sherpa-utils";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validatedBody = AdvanceRequestSchema.parse(body);
    
    const { job_id, consumed_url } = validatedBody;
    
    const job = await prisma.crawlJob.findUnique({
      where: { id: job_id },
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
    
    if (job.status !== "done") {
      return NextResponse.json(
        createErrorResponse("INTERNAL_ERROR", "Job not completed"),
        { status: 400 }
      );
    }
    
    // Find the consumed page and get the next one
    const consumedPage = job.pageScores.find(p => p.url === consumed_url);
    if (!consumedPage) {
      return NextResponse.json(
        createErrorResponse("INTERNAL_ERROR", "Consumed URL not found in results"),
        { status: 400 }
      );
    }
    
    // Get the next page after the consumed one
    const nextPage = job.pageScores.find(p => p.rank === consumedPage.rank + 1);
    const remaining = Math.max(0, job.pageScores.length - (consumedPage.rank + 1));
    
    const response = AdvanceResponseSchema.parse({
      next: nextPage ? pageScoreToPage(nextPage) : null,
      remaining,
    });
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error("Results advance endpoint error:", error);
    
    return NextResponse.json(
      createErrorResponse("INTERNAL_ERROR", "Internal server error"),
      { status: 500 }
    );
  }
}
