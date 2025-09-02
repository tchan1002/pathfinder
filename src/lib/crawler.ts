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
      const current = [...toVisit][0];
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

        const { title, description, text } = extractMainContent(html);

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

        // naive summary cache
        const existingSummary = await prisma.summary
          .findUnique({ where: { pageId_textHash: { pageId: savedPage.id, textHash: contentHash } } })
          .catch(() => null);
        let summaryText: string | undefined = existingSummary?.text;
        if (!summaryText && content) {
          summaryText = summarizeLocal(content);
          await prisma.summary.create({ data: { pageId: savedPage.id, text: summaryText, textHash: contentHash, model: "local-naive" } });
        }

        // insert embedding if possible
        if (content) {
          try {
            const clipped = content.slice(0, 8000);
            const vec = await (await import("@/lib/embeddings")).embedText384(clipped);
            const v = '[' + vec.map((n) => Number(n).toFixed(6)).join(',') + ']';
            await prisma.$executeRawUnsafe(
              `INSERT INTO "Embedding" (id, "pageId", content, vector, "createdAt", model) VALUES ($1, $2, $3, $4::vector, NOW(), $5)` ,
              crypto.randomUUID(),
              savedPage.id,
              clipped,
              v,
              'text-embedding-3-small->384',
            );
          } catch {}
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

function summarizeLocal(text: string): string {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  return words.slice(0, 45).join(" ");
}


