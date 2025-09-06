import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { 
  AnalyzeRequestSchema, 
  CachedResponseSchema, 
  StartedResponseSchema
} from "@/lib/sherpa-types";
import {
  createErrorResponse,
  normalizeUrl,
  extractDomain,
  isWithinDomainLimit,
  isJobFresh,
  pageScoreToPage
} from "@/lib/sherpa-utils";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validatedBody = AnalyzeRequestSchema.parse(body);
    
    const { start_url, domain_limit, user_id, max_pages } = validatedBody;
    
    // Normalize URL and extract domain
    const normalizedUrl = normalizeUrl(start_url);
    const domain = extractDomain(normalizedUrl);
    
    // Check domain limit
    if (!isWithinDomainLimit(normalizedUrl, domain_limit)) {
      return NextResponse.json(
        createErrorResponse("DISALLOWED_DOMAIN", `URL domain not within limit: ${domain_limit}`),
        { status: 400 }
      );
    }
    
    // Check for fresh cached job (within 15 minutes)
    const recentJob = await prisma.crawlJob.findFirst({
      where: {
        domain,
        status: "done",
        createdAt: {
          gte: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
        },
      },
      orderBy: { createdAt: "desc" },
      include: {
        pageScores: {
          orderBy: { rank: "asc" },
          take: 2, // top + next
        },
      },
    });
    
    if (recentJob && isJobFresh(recentJob.createdAt)) {
      // Return cached response
      const top = pageScoreToPage(recentJob.pageScores[0]);
      const next = recentJob.pageScores[1] ? pageScoreToPage(recentJob.pageScores[1]) : null;
      const remaining = Math.max(0, recentJob.pageScores.length - 2);
      
      const cachedResponse = CachedResponseSchema.parse({
        mode: "cached",
        job_id: recentJob.id,
        top,
        next,
        remaining,
      });
      
      return NextResponse.json(cachedResponse);
    }
    
    // Create new job
    const newJob = await prisma.crawlJob.create({
      data: {
        startUrl: normalizedUrl,
        domain,
        status: "queued",
        userId: user_id || null,
        maxPages: max_pages || 75,
      },
    });
    
    // Start crawling in background (fire and forget)
    // TODO: Implement actual crawling logic
    startCrawlingJob(newJob.id, normalizedUrl, domain, max_pages || 75);
    
    // Return started response
    const startedResponse = StartedResponseSchema.parse({
      mode: "started",
      job_id: newJob.id,
      eta_sec: 30, // Estimate 30 seconds for now
    });
    
    return NextResponse.json(startedResponse);
    
  } catch (error) {
    console.error("Analyze endpoint error:", error);
    
    if (error instanceof Error && error.message.includes("Invalid URL")) {
      return NextResponse.json(
        createErrorResponse("INVALID_URL", error.message),
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      createErrorResponse("INTERNAL_ERROR", "Internal server error"),
      { status: 500 }
    );
  }
}

// Background crawling function (placeholder)
async function startCrawlingJob(jobId: string, startUrl: string, domain: string, maxPages: number) {
  try {
    // Update job status to running
    await prisma.crawlJob.update({
      where: { id: jobId },
      data: { 
        status: "running",
        startedAt: new Date(),
      },
    });
    
    // TODO: Implement actual crawling logic here
    // For now, create a mock result
    await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate work
    
    // Create mock page scores
    const mockPages = [
      {
        url: startUrl,
        title: "Home Page",
        score: 0.95,
        rank: 1,
        signalsJson: { reasons: ["Main landing page", "High traffic"] },
      },
      {
        url: `${new URL(startUrl).origin}/about`,
        title: "About Us",
        score: 0.85,
        rank: 2,
        signalsJson: { reasons: ["About page", "Good content"] },
      },
    ];
    
    // Save page scores
    for (const page of mockPages) {
      await prisma.pageScore.create({
        data: {
          jobId,
          url: page.url,
          title: page.title,
          score: page.score,
          rank: page.rank,
          signalsJson: page.signalsJson,
        },
      });
    }
    
    // Mark job as done
    await prisma.crawlJob.update({
      where: { id: jobId },
      data: { 
        status: "done",
        finishedAt: new Date(),
      },
    });
    
  } catch (error) {
    console.error("Crawling job error:", error);
    
    // Mark job as error
    await prisma.crawlJob.update({
      where: { id: jobId },
      data: { 
        status: "error",
        finishedAt: new Date(),
      },
    });
  }
}
