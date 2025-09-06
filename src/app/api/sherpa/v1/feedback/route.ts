import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { 
  FeedbackRequestSchema,
  FeedbackResponseSchema
} from "@/lib/sherpa-types";
import {
  createErrorResponse
} from "@/lib/sherpa-utils";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validatedBody = FeedbackRequestSchema.parse(body);
    
    const { job_id, landed_url, was_correct, chosen_rank, user_id, timestamp } = validatedBody;
    
    // Verify job exists
    const job = await prisma.crawlJob.findUnique({
      where: { id: job_id },
    });
    
    if (!job) {
      return NextResponse.json(
        createErrorResponse("INTERNAL_ERROR", "Job not found"),
        { status: 404 }
      );
    }
    
    // Create feedback record
    await prisma.feedback.create({
      data: {
        jobId: job_id,
        landedUrl: landed_url,
        wasCorrect: was_correct,
        chosenRank: chosen_rank || null,
        userId: user_id || null,
      },
    });
    
    const response = FeedbackResponseSchema.parse({
      ok: true,
    });
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error("Feedback endpoint error:", error);
    
    return NextResponse.json(
      createErrorResponse("INTERNAL_ERROR", "Internal server error"),
      { status: 500 }
    );
  }
}
