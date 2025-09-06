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

// Background crawling function - uses real Pathfinder crawler
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
    
    // Create or find the Site record
    let site = await prisma.site.findUnique({
      where: { domain },
    });
    
    if (!site) {
      site = await prisma.site.create({
        data: {
          domain,
          startUrl,
        },
      });
    }
    
    // Use the real Pathfinder crawler
    const { crawlSite } = await import("@/lib/crawler");
    
    await crawlSite({
      siteId: site.id,
      startUrl,
      onEvent: async (event) => {
        if (event.type === "page" && event.ok && event.pageId) {
          // Create a page score for each crawled page
          const page = await prisma.page.findUnique({
            where: { id: event.pageId },
            select: { url: true, title: true, content: true }
          });
          
          if (page) {
            // Simple scoring based on content length and title quality
            const score = calculatePageScore({
              url: page.url,
              title: page.title || "",
              content: page.content || "",
              isHomePage: page.url === startUrl,
            });
            
            await prisma.pageScore.create({
              data: {
                jobId,
                url: page.url,
                title: (page.title || "Untitled").slice(0, 512),
                score,
                rank: 0, // Will be updated after all pages are processed
                signalsJson: {
                  reasons: generateReasons(score, page.url, page.title),
                },
              },
            });
          }
        }
      },
    });
    
    // Update ranks based on scores
    const pageScores = await prisma.pageScore.findMany({
      where: { jobId },
      orderBy: { score: 'desc' },
    });
    
    for (let i = 0; i < pageScores.length; i++) {
      await prisma.pageScore.update({
        where: { id: pageScores[i].id },
        data: { rank: i + 1 },
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

function calculatePageScore(args: {
  url: string;
  title: string;
  content: string;
  isHomePage: boolean;
}): number {
  const { url, title, content, isHomePage } = args;
  let score = 0;

  // Home page gets highest score
  if (isHomePage) {
    score += 0.4;
  }

  // Title quality
  if (title && title.length > 10) {
    score += 0.2;
  }

  // Content length (more content = higher score)
  const contentLength = content.length;
  if (contentLength > 1000) {
    score += 0.2;
  } else if (contentLength > 500) {
    score += 0.1;
  }

  // URL structure (shorter paths often better)
  const urlPath = new URL(url).pathname;
  const pathDepth = urlPath.split('/').length - 1;
  if (pathDepth <= 2) {
    score += 0.1;
  }

  // Ensure score is between 0 and 1
  return Math.min(Math.max(score, 0), 1);
}

function generateReasons(score: number, url: string, title?: string): string[] {
  const reasons: string[] = [];
  
  if (score >= 0.8) {
    reasons.push("High-quality content");
  }
  
  if (title && title.length > 10) {
    reasons.push("Clear page title");
  }
  
  if (url.endsWith('/') || url.split('/').length <= 3) {
    reasons.push("Main section page");
  }
  
  if (reasons.length === 0) {
    reasons.push("Standard page");
  }
  
  return reasons.slice(0, 3); // Max 3 reasons
}
