import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { 
  createErrorResponse,
  normalizeUrl,
  extractDomain
} from "@/lib/sherpa-utils";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url } = body;
    
    if (!url) {
      return NextResponse.json(
        createErrorResponse("INVALID_REQUEST", "Missing url parameter"),
        { status: 400 }
      );
    }
    
    // Normalize URL and extract domain
    const normalizedUrl = normalizeUrl(url);
    const domain = extractDomain(normalizedUrl);
    
    console.log("🔍 Checking domain in database:", domain);
    
    // Check if site exists in database
    const site = await prisma.site.findUnique({
      where: { domain },
      include: {
        pages: {
          select: {
            id: true,
            url: true,
            title: true,
            content: true,
            lastCrawledAt: true,
          },
          orderBy: { lastCrawledAt: "desc" },
        },
      },
    });
    
    if (!site) {
      console.log("❌ Site not found in database:", domain);
      return NextResponse.json({
        exists: false,
        domain,
        message: "Site not found in database. Please crawl this site first using Pathfinder admin.",
      });
    }
    
    if (site.pages.length === 0) {
      console.log("⚠️ Site exists but no pages found:", domain);
      return NextResponse.json({
        exists: true,
        domain,
        pages: [],
        message: "Site exists but no pages found. Crawling may not be complete.",
      });
    }
    
    console.log("✅ Site found with pages:", { domain, pageCount: site.pages.length });
    
    // Return the site data
    return NextResponse.json({
      exists: true,
      domain,
      siteId: site.id,
      pages: site.pages.map(page => ({
        id: page.id,
        url: page.url,
        title: page.title,
        content: page.content,
        lastCrawledAt: page.lastCrawledAt,
      })),
      pageCount: site.pages.length,
      message: `Found ${site.pages.length} pages for ${domain}`,
    });
    
  } catch (error) {
    console.error("❌ Check endpoint error:", error);
    
    return NextResponse.json(
      createErrorResponse("INTERNAL_ERROR", error instanceof Error ? error.message : "Internal server error"),
      { status: 500 }
    );
  }
}
