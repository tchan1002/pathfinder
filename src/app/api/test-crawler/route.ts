import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    console.log("🧪 Testing crawler...");
    
    // Test if we can import the crawler
    const { crawlSite } = await import("@/lib/crawler");
    console.log("✅ Crawler imported successfully");
    
    // Test if we can find a site
    const sites = await prisma.site.findMany({ take: 1 });
    console.log("✅ Sites found:", sites.length);
    
    if (sites.length === 0) {
      return NextResponse.json({ 
        success: false, 
        message: "No sites found in database",
        sites: sites.length 
      });
    }
    
    const site = sites[0];
    console.log("✅ Using site:", site.domain);
    
    // Test crawler with a simple callback
    let eventCount = 0;
    await crawlSite({
      siteId: site.id,
      startUrl: site.startUrl,
      onEvent: (event) => {
        eventCount++;
        console.log(`📡 Event ${eventCount}:`, event.type, event.url || "no url");
      },
    });
    
    console.log("✅ Crawler test completed successfully");
    
    return NextResponse.json({ 
      success: true, 
      message: "Crawler test completed",
      events: eventCount,
      site: site.domain
    });
    
  } catch (error) {
    console.error("❌ Crawler test failed:", error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}
