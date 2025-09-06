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
    console.log("🔍 Analyze endpoint called");
    const body = await req.json();
    console.log("🔍 Request body:", body);
    
    const validatedBody = AnalyzeRequestSchema.parse(body);
    console.log("✅ Request body validated successfully");
    
    const { start_url, domain_limit, user_id, max_pages } = validatedBody;
    console.log("🔍 Parsed parameters:", { start_url, domain_limit, user_id, max_pages });
    
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
    console.log("🔍 Checking for recent job...");
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
    console.log("🔍 Recent job found:", recentJob ? { id: recentJob.id, status: recentJob.status, pageScoresCount: recentJob.pageScores.length } : "null");
    
    if (recentJob && isJobFresh(recentJob.createdAt)) {
      // Return cached response
      console.log("🔍 Returning cached response for job:", recentJob.id);
      console.log("🔍 Page scores for cached job:", recentJob.pageScores.map(ps => ({ 
        url: ps.url, 
        rank: ps.rank, 
        score: ps.score 
      })));
      
      const top = pageScoreToPage(recentJob.pageScores[0]);
      const next = recentJob.pageScores[1] ? pageScoreToPage(recentJob.pageScores[1]) : null;
      const remaining = Math.max(0, recentJob.pageScores.length - 2);
      
      console.log("🔍 Converted top page:", top);
      console.log("🔍 Converted next page:", next);
      
      const cachedResponse = CachedResponseSchema.parse({
        mode: "cached",
        job_id: recentJob.id,
        top,
        next,
        remaining,
      });
      
      console.log("✅ Cached response created successfully");
      return NextResponse.json(cachedResponse);
    }
    
    // Create or find the Site record first
    console.log("🔍 Looking for existing site...");
    let site = await prisma.site.findUnique({
      where: { domain },
    });
    console.log("🔍 Site found:", site ? { id: site.id, domain: site.domain } : "null");
    
    if (!site) {
      console.log("🔍 Creating new site...");
      site = await prisma.site.create({
        data: {
          domain,
          startUrl: normalizedUrl,
        },
      });
      console.log("✅ Site created:", { id: site.id, domain: site.domain });
    }
    
    // Create new job
    console.log("🔍 Creating new crawl job...");
    const newJob = await prisma.crawlJob.create({
      data: {
        startUrl: normalizedUrl,
        domain,
        status: "queued",
        userId: user_id || null,
        maxPages: max_pages || null, // Let Pathfinder decide the crawl limit
      },
    });
    console.log("✅ Job created:", { id: newJob.id, status: newJob.status, domain: newJob.domain });
    
    // Start crawling in background (fire and forget)
    startCrawlingJob(newJob.id, normalizedUrl, domain, max_pages || null, site.id);
    
    // Return started response
    const startedResponse = StartedResponseSchema.parse({
      mode: "started",
      job_id: newJob.id,
      eta_sec: 120, // Estimate 2 minutes for full crawl (no page limit)
    });
    
    return NextResponse.json(startedResponse);
    
  } catch (error) {
    console.error("❌ Analyze endpoint error:", error);
    console.error("❌ Error stack:", error instanceof Error ? error.stack : "No stack trace");
    console.error("❌ Error message:", error instanceof Error ? error.message : "Unknown error");
    
    if (error instanceof Error && error.message.includes("Invalid URL")) {
      console.log("❌ Invalid URL error detected");
      return NextResponse.json(
        createErrorResponse("INVALID_URL", error.message),
        { status: 400 }
      );
    }
    
    console.log("❌ Returning generic internal error");
    return NextResponse.json(
      createErrorResponse("INTERNAL_ERROR", error instanceof Error ? error.message : "Internal server error"),
      { status: 500 }
    );
  }
}

// Background crawling function - uses real Pathfinder crawler
async function startCrawlingJob(jobId: string, startUrl: string, domain: string, maxPages: number | null, siteId: string) {
  try {
    // Update job status to running (only once at start)
    console.log("🔄 Starting crawling job:", jobId);
    await prisma.crawlJob.update({
      where: { id: jobId },
      data: { 
        status: "running",
        startedAt: new Date(),
      },
    });
    
    // Use the real Pathfinder crawler with the provided siteId
    const { crawlSite } = await import("@/lib/crawler");
    
    await crawlSite({
      siteId: siteId,
      startUrl,
      onEvent: async (event) => {
        // Don't do any database operations during crawling for performance
        // We'll create page scores after crawling is complete
        if (event.type === "done") {
          console.log("✅ Crawling completed, creating page scores...");
        }
      },
    });
    
    // Create page scores after crawling is complete for better performance
    console.log("🔍 Creating page scores after crawling...");
    const pages = await prisma.page.findMany({
      where: { siteId },
      select: { id: true, url: true, title: true, content: true }
    });
    
    console.log(`🔍 Found ${pages.length} pages to score`);
    
    // Create page scores in batch
    const pageScores = [];
    for (const page of pages) {
      const score = calculatePageScore({
        url: page.url,
        title: page.title || "",
        content: page.content || "",
        isHomePage: page.url === startUrl,
      });
      
      pageScores.push({
        jobId,
        url: page.url,
        title: (page.title || "Untitled").slice(0, 512),
        score,
        rank: 0, // Will be updated after all pages are processed
        signalsJson: {
          reasons: generateReasons(score, page.url, page.title),
        },
      });
    }
    
    // Batch create all page scores
    if (pageScores.length > 0) {
      await prisma.pageScore.createMany({
        data: pageScores,
      });
      console.log(`✅ Created ${pageScores.length} page scores`);
    }
    
    // Update ranks based on scores
    console.log("🔍 Updating page score ranks...");
    const rankedPageScores = await prisma.pageScore.findMany({
      where: { jobId },
      orderBy: { score: 'desc' },
    });
    
    console.log(`🔍 Found ${rankedPageScores.length} page scores to rank`);
    
    for (let i = 0; i < rankedPageScores.length; i++) {
      await prisma.pageScore.update({
        where: { id: rankedPageScores[i].id },
        data: { rank: i + 1 },
      });
    }
    
    console.log("✅ Page score ranks updated successfully");
    
    // Mark job as done
    console.log("✅ Crawling completed, marking job as done:", jobId);
    await prisma.crawlJob.update({
      where: { id: jobId },
      data: { 
        status: "done",
        finishedAt: new Date(),
      },
    });
    console.log("✅ Job marked as done successfully");
    
  } catch (error) {
    console.error("❌ Crawling job error:", error);
    
    // Mark job as error
    console.log("❌ Marking job as error:", jobId);
    await prisma.crawlJob.update({
      where: { id: jobId },
      data: { 
        status: "error",
        finishedAt: new Date(),
      },
    });
    console.log("❌ Job marked as error successfully");
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
