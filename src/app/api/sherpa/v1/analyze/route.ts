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
    
    // Check if site already exists in the database
    console.log("🔍 Checking if site already exists...");
    let site = await prisma.site.findUnique({
      where: { domain },
    });
    console.log("🔍 Site found:", site ? { id: site.id, domain: site.domain } : "null");
    
    if (site) {
      // Site already exists - check if it has recent crawling activity
      console.log("🔍 Site exists, checking for recent job...");
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
      } else {
        // Site exists but no recent job - start new crawling
        console.log("🔍 Site exists but no recent job, starting new crawl...");
      }
    } else {
      // Site doesn't exist - will create it below
      console.log("🔍 Site doesn't exist, will create new site...");
    }
    
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
    console.log("🚀 Starting background crawling job...");
    
    // Use setTimeout to ensure the response is sent before starting the heavy crawling
    setTimeout(() => {
      startCrawlingJob(newJob.id, normalizedUrl, domain, site.id).catch(error => {
        console.error("❌ Background crawling job failed:", error);
        // Mark job as error if it fails
        prisma.crawlJob.update({
          where: { id: newJob.id },
          data: { 
            status: "error",
            finishedAt: new Date(),
          },
        }).catch(updateError => {
          console.error("❌ Failed to update job status to error:", updateError);
        });
      });
    }, 100); // Small delay to ensure response is sent first
    
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
    console.log("🔄 Starting crawling job:", { jobId, startUrl, domain, siteId });
    
    // Update job status to running (only once at start)
    console.log("🔄 Updating job status to running...");
    await prisma.crawlJob.update({
      where: { id: jobId },
      data: { 
        status: "running",
        startedAt: new Date(),
      },
    });
    console.log("✅ Job status updated to running");
    
    // Use the real Pathfinder crawler with the provided siteId
    console.log("📦 Importing crawler...");
    const { crawlSite } = await import("@/lib/crawler");
    console.log("✅ Crawler imported successfully");
    
    let pagesScanned = 0;
    console.log("🚀 Starting crawlSite with params:", { siteId, startUrl });
    
    await crawlSite({
      siteId: siteId,
      startUrl,
      onEvent: async (event) => {
        console.log("📡 Crawl event received:", event.type, "url" in event ? event.url : "no url");
        
        // Track basic progress and update database
        if (event.type === "page") {
          pagesScanned++;
          console.log(`📄 Page ${pagesScanned} processed: ${event.url}`);
          
          // Update progress in database every 5 pages
          if (pagesScanned % 5 === 0) {
            console.log(`💾 Would update database with ${pagesScanned} pages...`);
            // TODO: Uncomment after migration is applied
            // await prisma.crawlJob.update({
            //   where: { id: jobId },
            //   data: { pagesScanned },
            // });
            console.log(`✅ Database update skipped (migration pending)`);
          }
        } else if (event.type === "done") {
          console.log(`✅ Crawling completed, processed ${pagesScanned} pages`);
        } else if (event.type === "status") {
          console.log(`📊 Crawl status:`, event.message);
        }
      },
    });
    
    console.log("✅ crawlSite completed successfully");
    
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

