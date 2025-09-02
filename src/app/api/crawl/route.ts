import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isSameOrigin, normalizeUrl } from "@/lib/url";
import { chromium } from "playwright";
import robotsParser from "robots-parser";
import crypto from "node:crypto";
import { extractMainContent } from "@/lib/extract";
import { embedText384, summarizeText } from "@/lib/embeddings";

export const runtime = "nodejs";

const BodySchema = z.object({
  siteId: z.string().min(1),
  startUrl: z.string().url(),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => undefined);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { siteId, startUrl } = parsed.data;

  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  if (!isSameOrigin(startUrl, `https://${site.domain}`) && !isSameOrigin(startUrl, `http://${site.domain}`)) {
    return NextResponse.json({ error: "Start URL must match site domain" }, { status: 400 });
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
  const results: { url: string; ok: boolean; reason?: string }[] = [];

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  try {
    while (visited.size < 200 && toVisit.size > 0) {
      const current = [...toVisit][0];
      toVisit.delete(current);
      if (visited.has(current)) continue;
      visited.add(current);

      if (robots && !robots.isAllowed(current, "*")) {
        results.push({ url: current, ok: false, reason: "Disallowed by robots.txt" });
        continue;
      }

      try {
        await page.goto(current, { waitUntil: "domcontentloaded", timeout: 30000 });
        const html = await page.content();
        const { title, description, text } = extractMainContent(html);
        const screenshot = await page.screenshot({ type: "jpeg", quality: 70 });

        // queue links
        const links = await page.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).href));
        for (const href of links) {
          try {
            if (isSameOrigin(href, current)) {
              toVisit.add(normalizeUrl(href));
            }
          } catch {}
        }

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

        // store screenshot as a snapshot (store to disk under public/snapshots)
        const snapPath = await storeScreenshot(savedPage.id, screenshot);
        await prisma.snapshot.create({ data: { pageId: savedPage.id, screenshotPath: snapPath } });

        // summary cache
        const existingSummary = await prisma.summary.findUnique({ where: { pageId_textHash: { pageId: savedPage.id, textHash: contentHash } } }).catch(() => null);
        let summaryText: string | undefined = existingSummary?.text;
        if (!summaryText && content) {
          summaryText = await summarizeText(content);
          await prisma.summary.create({ data: { pageId: savedPage.id, text: summaryText, textHash: contentHash, model: "gpt-4o-mini" } });
        }

        // embedding
        if (content) {
          const vec = await embedText384(content.slice(0, 8000));
          const v = '[' + vec.map((n) => Number(n).toFixed(6)).join(',') + ']';
          await prisma.$executeRawUnsafe(
            `INSERT INTO "Embedding" (id, "pageId", "createdAt", vector, model) VALUES ($1, $2, NOW(), $3::vector, $4)`,
            crypto.randomUUID(),
            savedPage.id,
            v,
            'text-embedding-3-small->384',
          );
        }

        results.push({ url: current, ok: true });
      } catch (err) {
        results.push({ url: current, ok: false, reason: (err as Error).message });
      }
    }
  } finally {
    await browser.close();
  }

  return NextResponse.json({ crawled: results });
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


