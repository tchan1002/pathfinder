import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createErrorResponse } from "@/lib/sherpa-utils";

export const runtime = "nodejs";

// Validate jobId as a UUID and question as non-empty string
const BodySchema = z.object({
  jobId: z.string().uuid(),
  question: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => undefined);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        createErrorResponse("INVALID_REQUEST", "Invalid body"),
        { status: 400 }
      );
    }
    const { jobId, question } = parsed.data;

    // Get the siteId from the job
    const job = await prisma.crawlJob.findUnique({
      where: { id: jobId },
      select: { id: true, domain: true }
    });

    if (!job) {
      return NextResponse.json(
        createErrorResponse("JOB_NOT_FOUND", "Crawl job not found"),
        { status: 404 }
      );
    }

    // Find the corresponding Site record
    const site = await prisma.site.findUnique({
      where: { domain: job.domain },
      select: { id: true }
    });

    if (!site) {
      return NextResponse.json(
        createErrorResponse("SITE_NOT_FOUND", "Site not found for job"),
        { status: 404 }
      );
    }

    // Use the real Pathfinder query logic
    console.log(`🔍 Querying site ${site.id} with question: "${question}"`);
    
    // Get pages for the site
    const pages = await prisma.page.findMany({
      where: { siteId: site.id },
      select: {
        id: true,
        url: true,
        title: true,
        content: true,
        lastCrawledAt: true,
      },
      orderBy: { lastCrawledAt: "desc" },
    });
    
    console.log(`🔍 Found ${pages.length} pages for query`);
    
    if (pages.length === 0) {
      return NextResponse.json({
        answer: "No pages found for this site. The crawling may not be complete yet.",
        sources: []
      });
    }
    
    // For now, do a simple text search across pages
    // TODO: Replace with proper AI/embedding search
    const searchResults = pages.filter(page => {
      const searchText = `${page.title || ''} ${page.content || ''}`.toLowerCase();
      return searchText.includes(question.toLowerCase());
    });
    
    if (searchResults.length === 0) {
      return NextResponse.json({
        answer: `I couldn't find information about "${question}" in the crawled pages. The site may not contain this information, or the crawling may not be complete yet.`,
        sources: pages.slice(0, 3).map(page => ({
          url: page.url,
          title: page.title || 'Untitled',
          snippet: (page.content || '').substring(0, 200) + '...',
          screenshotUrl: undefined,
        }))
      });
    }
    
    // Return the first matching result
    const bestMatch = searchResults[0];
    const answer = `Based on the crawled content, here's what I found about "${question}":\n\n${(bestMatch.content || '').substring(0, 500)}${(bestMatch.content || '').length > 500 ? '...' : ''}`;
    
    return NextResponse.json({
      answer,
      sources: searchResults.slice(0, 3).map(page => ({
        url: page.url,
        title: page.title || 'Untitled',
        snippet: (page.content || '').substring(0, 200) + '...',
        screenshotUrl: undefined,
      }))
    });
    
  } catch (e) {
    console.error("Sherpa query endpoint error:", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      createErrorResponse("INTERNAL_ERROR", message),
      { status: 500 }
    );
  }
}