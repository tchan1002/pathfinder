import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { 
  AnalyzeRequestSchema, 
  StartedResponseSchema
} from "@/lib/sherpa-types";
import {
  createErrorResponse,
  normalizeUrl,
  extractDomain,
  isWithinDomainLimit,
  isJobFresh
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
    if (!isWithinDomainLimit(normalizedUrl, domain_limit || null)) {
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
    });
    console.log("🔍 Recent job found:", recentJob ? { id: recentJob.id, status: recentJob.status } : "null");
    
    if (recentJob && isJobFresh(recentJob.createdAt)) {
      // Return cached response - just return the job info
      console.log("🔍 Returning cached response for job:", recentJob.id);
      
      const cachedResponse = {
        mode: "cached",
        job_id: recentJob.id,
        message: "Site already analyzed recently"
      };
      
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
      },
    });
    console.log("✅ Job created:", { id: newJob.id, status: newJob.status, domain: newJob.domain });
    
    // Start crawling in background (fire and forget)
    startCrawlingJob(newJob.id, normalizedUrl, domain, site.id);
    
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
async function startCrawlingJob(jobId: string, startUrl: string, domain: string, siteId: string) {
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
    
    let pagesScanned = 0;
    await crawlSite({
      siteId: siteId,
      startUrl,
      onEvent: async (event) => {
        // Track basic progress and update database
        if (event.type === "page") {
          pagesScanned++;
          console.log(`📄 Page ${pagesScanned} processed: ${event.url}`);
          
          // Update progress in database every 5 pages
          if (pagesScanned % 5 === 0) {
            await prisma.crawlJob.update({
              where: { id: jobId },
              data: { pagesScanned },
            });
          }
        } else if (event.type === "done") {
          console.log(`✅ Crawling completed, processed ${pagesScanned} pages`);
        }
      },
    });
    
    // Crawling completed - no need for page scoring in MVP
    console.log("✅ Crawling completed successfully");
    
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

