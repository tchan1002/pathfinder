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
    
    console.log("🔍 Results head endpoint called with jobId:", jobId);
    
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
    
    console.log("🔍 Job found:", job ? {
      id: job.id,
      status: job.status,
      pageScoresCount: job.pageScores.length,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt
    } : "null");
    
    if (!job) {
      return NextResponse.json(
        createErrorResponse("INTERNAL_ERROR", "Job not found"),
        { status: 404 }
      );
    }
    
    if (job.status !== "done") {
      console.log("❌ Job not completed, status:", job.status);
      return NextResponse.json(
        createErrorResponse("INTERNAL_ERROR", `Job not completed, status: ${job.status}`),
        { status: 400 }
      );
    }
    
    if (job.pageScores.length === 0) {
      console.log("❌ No page scores found for job");
      return NextResponse.json(
        createErrorResponse("INTERNAL_ERROR", "No results found"),
        { status: 404 }
      );
    }
    
    console.log("🔍 Page scores found:", job.pageScores.length);
    console.log("🔍 First page score:", job.pageScores[0]);
    
    try {
      const top = pageScoreToPage(job.pageScores[0]);
      const next = job.pageScores[1] ? pageScoreToPage(job.pageScores[1]) : null;
      const remaining = Math.max(0, job.pageScores.length - 2);
      
      console.log("✅ Successfully converted page scores to pages");
      console.log("🔍 Top page:", top);
      console.log("🔍 Next page:", next);
    
      const response = HeadResponseSchema.parse({
        top,
        next,
        remaining,
      });
      
      console.log("✅ Response created successfully:", response);
      return NextResponse.json(response);
    } catch (conversionError) {
      console.error("❌ Error converting page scores:", conversionError);
      return NextResponse.json(
        createErrorResponse("INTERNAL_ERROR", `Error converting results: ${conversionError.message}`),
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error("Results head endpoint error:", error);
    
    return NextResponse.json(
      createErrorResponse("INTERNAL_ERROR", "Internal server error"),
      { status: 500 }
    );
  }
}
