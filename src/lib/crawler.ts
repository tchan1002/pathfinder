import { prisma } from "@/lib/prisma";
import { isSameOrigin, normalizeUrl } from "@/lib/url";
import { extractMainContent } from "@/lib/extract";
import { chromium } from "playwright";
import { JSDOM } from "jsdom";
import robotsParser from "robots-parser";
import crypto from "node:crypto";

export type CrawlEvent =
  | { type: "status"; message: string }
  | { type: "page"; url: string; ok: boolean; reason?: string; pageId?: string; title?: string | null; summary?: string | null; screenshotUrl?: string | null }
  | { type: "done" };

export async function crawlSite(args: { siteId: string; startUrl: string; onEvent?: (ev: CrawlEvent) => void }) {
  const { siteId, startUrl, onEvent } = args;
  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) throw new Error("Site not found");
  if (!isSameOrigin(startUrl, `https://${site.domain}`) && !isSameOrigin(startUrl, `http://${site.domain}`)) {
    throw new Error("Start URL must match site domain");
  }

  const start = new URL(startUrl);
  const robotsUrl = `${start.origin}/robots.txt`;
  let robots: ReturnType<typeof robotsParser> | undefined;
  try {
    const res = await fetch(robotsUrl);
    const txt = res.ok ? await res.text() : "";
    robots = robotsParser(robotsUrl, txt);
  } catch {
    robots = robotsParser(robotsUrl, "");
  }

  const toVisit = new Set<string>([normalizeUrl(startUrl)]);
  const visited = new Set<string>();

  let browser: import("playwright").Browser | null = null;
  let context: import("playwright").BrowserContext | null = null;
  let page: import("playwright").Page | null = null;
  try {
    browser = await chromium.launch();
    context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    page = await context.newPage();
  } catch {
    browser = null;
    context = null;
    page = null;
    onEvent?.({ type: "status", message: "Playwright unavailable. Falling back to fetch-only crawl." });
  }

  try {
    while (visited.size < 200 && toVisit.size > 0) {
      const iter = toVisit.values();
      const current = iter.next().value as string | undefined;
      if (!current) break;
      toVisit.delete(current);
      if (visited.has(current)) continue;
      visited.add(current);

      if (robots && !robots.isAllowed(current, "*")) {
        onEvent?.({ type: "page", url: current, ok: false, reason: "Disallowed by robots.txt" });
        continue;
      }

      try {
        onEvent?.({ type: "status", message: `crawling ${current}` });
        let html = "";
        let screenshot: Buffer | null = null;
        if (page) {
          await page.goto(current, { waitUntil: "domcontentloaded", timeout: 30000 });
          html = await page.content();
          try {
            screenshot = await page.screenshot({ type: "jpeg", quality: 70 });
          } catch {
            screenshot = null;
          }
          const links = await page.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).href));
          for (const href of links) {
            try {
              if (isSameOrigin(href, current)) {
                toVisit.add(normalizeUrl(href));
              }
            } catch {}
          }
        } else {
          const res = await fetch(current, { redirect: "follow" });
          if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
          html = await res.text();
          const dom = new JSDOM(html, { url: current });
          const as = Array.from(dom.window.document.querySelectorAll("a[href]")) as HTMLAnchorElement[];
          for (const a of as) {
            const href = a.href;
            try {
              if (isSameOrigin(href, current)) {
                toVisit.add(normalizeUrl(href));
              }
            } catch {}
          }
        }

        const { title, description, text, headers, diverseClips, metadata } = extractMainContent(html);

        const urlNormalized = normalizeUrl(current);
        const content = text ?? "";
        const contentHash = sha256(content);

        const savedPage = await prisma.page.upsert({
          where: { siteId_urlNormalized: { siteId, urlNormalized } },
          create: {
            siteId,
            url: current,
            urlNormalized,
            title: title ?? null,
            metaDescription: description ?? null,
            content: content || null,
            contentHash,
            lastCrawledAt: new Date(),
          },
          update: {
            url: current,
            title: title ?? null,
            metaDescription: description ?? null,
            content: content || null,
            contentHash,
            lastCrawledAt: new Date(),
          },
          select: { id: true },
        });

        let snapPath: string | null = null;
        if (screenshot) {
          try {
            snapPath = await storeScreenshot(savedPage.id, screenshot);
            await prisma.snapshot.create({ data: { pageId: savedPage.id, screenshotPath: snapPath } });
          } catch {}
        }

        // Enhanced summary generation using diverse content
        const existingSummary = await prisma.summary
          .findUnique({ where: { pageId_textHash: { pageId: savedPage.id, textHash: contentHash } } })
          .catch(() => null);
        let summaryText: string | undefined = existingSummary?.text;
        if (!summaryText && content) {
          summaryText = generateEnhancedSummary({
            title: title || undefined,
            description: description || undefined,
            headers: headers || undefined,
            diverseClips: diverseClips || undefined,
            metadata: metadata || undefined,
            mainContent: content
          });
          await prisma.summary.create({ data: { pageId: savedPage.id, text: summaryText, textHash: contentHash, model: "enhanced-local" } });
        }

        // insert embedding with enhanced content (prioritize headers and diverse clips)
        try {
          const enhancedContent = createEnhancedEmbeddingContent({
            title: title || undefined,
            description: description || undefined,
            headers: headers || undefined,
            diverseClips: diverseClips || undefined,
            metadata: metadata || undefined,
            mainContent: content
          });
          
          const embedSource = enhancedContent.slice(0, 8000);
          if (embedSource) {
            const vec = await (await import("@/lib/embeddings")).embedText384(embedSource);
            const v = '[' + vec.map((n) => Number(n).toFixed(6)).join(',') + ']';
            await prisma.$executeRawUnsafe(
              `INSERT INTO "Embedding" (id, "pageId", content, vector, "createdAt", model) VALUES ($1::uuid, $2::uuid, $3, $4::vector, NOW(), $5)` ,
              crypto.randomUUID(),
              savedPage.id,
              embedSource,
              v,
              'text-embedding-3-small->384',
            );
          } else {
            onEvent?.({ type: 'status', message: `Skipping embedding (empty content) ${current}` });
          }
        } catch (err) {
          onEvent?.({ type: 'status', message: `Embedding failed for ${current}: ${(err as Error).message}` });
        }

        onEvent?.({ type: "status", message: `saved ${current}` });
        onEvent?.({ type: "page", url: current, ok: true, pageId: savedPage.id, title: title ?? null, summary: summaryText ?? null, screenshotUrl: snapPath ?? null });
      } catch (err) {
        onEvent?.({ type: "page", url: current, ok: false, reason: (err as Error).message });
      }
    }
  } finally {
    if (browser) await browser.close();
  }

  onEvent?.({ type: "done" });
}

async function storeScreenshot(pageId: string, data: Buffer): Promise<string> {
  const fs = await import("node:fs/promises");
  const dir = `${process.cwd()}/public/snapshots`;
  await fs.mkdir(dir, { recursive: true });
  const ts = Date.now();
  const file = `${dir}/${pageId}-${ts}.jpg`;
  await fs.writeFile(file, data);
  return `/snapshots/${pageId}-${ts}.jpg`;
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

// Legacy function - kept for compatibility but not used in enhanced version
// function summarizeLocal(text: string): string {
//   const words = text.replace(/\s+/g, " ").trim().split(" ");
//   return words.slice(0, 45).join(" ");
// }

interface EnhancedContentData {
  title?: string | undefined;
  description?: string | undefined;
  headers?: string[] | undefined;
  diverseClips?: string[] | undefined;
  metadata?: {
    h1?: string[];
    h2?: string[];
    h3?: string[];
    metaKeywords?: string | undefined;
    ogTitle?: string | undefined;
    ogDescription?: string | undefined;
  } | undefined;
  mainContent?: string | undefined;
}

function generateEnhancedSummary(data: EnhancedContentData): string {
  const parts: string[] = [];
  
  // Prioritize title and description
  if (data.title) parts.push(data.title);
  if (data.description) parts.push(data.description);
  
  // Add key headers (H1, H2) for structure
  if (data.headers && data.headers.length > 0) {
    const keyHeaders = data.headers.slice(0, 5); // Top 5 headers
    parts.push(...keyHeaders);
  }
  
  // Add diverse clips for comprehensive coverage
  if (data.diverseClips && data.diverseClips.length > 0) {
    const selectedClips = data.diverseClips.slice(0, 8); // Top 8 clips
    parts.push(...selectedClips);
  }
  
  // Fallback to main content if needed
  if (parts.length === 0 && data.mainContent) {
    const words = data.mainContent.replace(/\s+/g, " ").trim().split(" ");
    return words.slice(0, 45).join(" ");
  }
  
  // Combine and limit to reasonable length
  const combined = parts.join(" ").replace(/\s+/g, " ").trim();
  const words = combined.split(" ");
  return words.slice(0, 60).join(" "); // Slightly longer than before
}

function createEnhancedEmbeddingContent(data: EnhancedContentData): string {
  const parts: string[] = [];
  
  // Prioritize metadata and headers for better vector search
  if (data.title) parts.push(`Title: ${data.title}`);
  if (data.description) parts.push(`Description: ${data.description}`);
  
  // Add structured metadata
  if (data.metadata) {
    if (data.metadata.ogTitle) parts.push(`OG Title: ${data.metadata.ogTitle}`);
    if (data.metadata.ogDescription) parts.push(`OG Description: ${data.metadata.ogDescription}`);
    if (data.metadata.metaKeywords) parts.push(`Keywords: ${data.metadata.metaKeywords}`);
    
    if (data.metadata.h1 && data.metadata.h1.length > 0) {
      parts.push(`H1: ${data.metadata.h1.join(", ")}`);
    }
    if (data.metadata.h2 && data.metadata.h2.length > 0) {
      parts.push(`H2: ${data.metadata.h2.slice(0, 5).join(", ")}`);
    }
  }
  
  // Add headers for context
  if (data.headers && data.headers.length > 0) {
    parts.push(`Headers: ${data.headers.slice(0, 10).join(", ")}`);
  }
  
  // Add diverse clips for comprehensive content coverage
  if (data.diverseClips && data.diverseClips.length > 0) {
    parts.push(`Content: ${data.diverseClips.slice(0, 10).join(" ")}`);
  }
  
  // Fallback to main content
  if (parts.length === 0 && data.mainContent) {
    return data.mainContent;
  }
  
  return parts.join(" ");
}


