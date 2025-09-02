import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { embedText384 } from "@/lib/embeddings";

export const runtime = "nodejs";

const BodySchema = z.object({
  siteId: z.string().min(1),
  question: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => undefined);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { siteId, question } = parsed.data;

  const qVec = await embedText384(question);
  const qVecLiteral = '[' + qVec.map((n) => Number(n).toFixed(6)).join(',') + ']';

  // Try vector search first
  let candidates: Array<{ url: string; title: string | null; summary: string | null; screenshot: string | null; confidence: number }>;
  try {
    candidates = await prisma.$queryRawUnsafe(
      `
      SELECT p.url, p.title, s.text as summary, sn.screenshotPath as screenshot, 
             1 - (e.vector <=> $1::vector) AS confidence
      FROM "Embedding" e
      JOIN "Page" p ON p.id = e."pageId"
      LEFT JOIN "Summary" s ON s."pageId" = p.id
      LEFT JOIN LATERAL (
        SELECT * FROM "Snapshot" sn WHERE sn."pageId" = p.id ORDER BY sn."createdAt" DESC LIMIT 1
      ) sn ON true
      WHERE p."siteId" = $2
      ORDER BY e.vector <=> $1::vector
      LIMIT 20
      `,
      qVecLiteral,
      siteId,
    );
  } catch {
    // Fallback: basic text match on summaries when Embedding or pgvector is unavailable
    candidates = await prisma.$queryRawUnsafe(
      `
      SELECT p.url, p.title, s.text as summary, sn.screenshotPath as screenshot, 0.5 as confidence
      FROM "Page" p
      LEFT JOIN "Summary" s ON s."pageId" = p.id
      LEFT JOIN LATERAL (
        SELECT * FROM "Snapshot" sn WHERE sn."pageId" = p.id ORDER BY sn."createdAt" DESC LIMIT 1
      ) sn ON true
      WHERE p."siteId" = $1
      LIMIT 50
      `,
      siteId,
    );
  }

  // lightweight rerank: prefer entries whose summary shares tokens with the question
  const qTokens = new Set(question.toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean));
  const reranked = candidates
    .map((r) => {
      const s = (r.summary as string | null) ?? "";
      const sTokens = new Set(s.toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean));
      let overlap = 0;
      for (const t of qTokens) if (sTokens.has(t)) overlap++;
      const bonus = overlap / Math.max(3, qTokens.size);
      return { ...r, confidence: Math.min(1, Math.max(0, Number(r.confidence) + bonus * 0.2)) };
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 20);

  return NextResponse.json(
    reranked.map((r) => ({
      url: r.url,
      title: r.title ?? undefined,
      snippet: r.summary ?? undefined,
      screenshotUrl: r.screenshot ?? undefined,
      confidence: Number(r.confidence),
    })),
  );
}


