import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { embedText384 } from "@/lib/embeddings";

export const runtime = "nodejs";

// Validate siteId as a UUID so we only accept correctly-typed IDs
const BodySchema = z.object({
  siteId: z.string().uuid(),
  question: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => undefined);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    const { siteId, question } = parsed.data;

    let qVecLiteral: string | null = null;
    try {
      const qVec = await embedText384(question);
      qVecLiteral = '[' + qVec.map((n) => Number(n).toFixed(6)).join(',') + ']';
    } catch {}

  // Try vector search first if we have an embedding; otherwise fall back
  let candidates: Array<{ url: string; title: string | null; summary: string | null; screenshot: string | null; similarity: number; distance: number | null }>;
  if (qVecLiteral) {
    try {
      // Cast siteId parameter to ::uuid so types match (p."siteId" is a uuid column)
      candidates = await prisma.$queryRawUnsafe(
        `
        SELECT p.url, p.title, s.text as summary, sn."screenshotPath" as screenshot, 
               (1 - (e.vector <=> $1::vector)) AS similarity,
               (e.vector <=> $1::vector) AS distance
        FROM "Embedding" e
        JOIN "Page" p ON p.id = e."pageId"
        LEFT JOIN "Summary" s ON s."pageId" = p.id
        LEFT JOIN LATERAL (
          SELECT * FROM "Snapshot" sn WHERE sn."pageId" = p.id ORDER BY sn."createdAt" DESC LIMIT 1
        ) sn ON true
        WHERE p."siteId" = $2::uuid
        ORDER BY e.vector <=> $1::vector
        `,
        qVecLiteral,
        siteId,
      );
      // If vector query returns no rows (e.g., no embeddings yet), fall back to text query
      if (!Array.isArray(candidates) || candidates.length === 0) {
        candidates = await prisma.$queryRawUnsafe(
          `
          SELECT p.url, p.title, s.text as summary, sn."screenshotPath" as screenshot, 0.0 as similarity, NULL::float8 as distance
          FROM "Page" p
          LEFT JOIN "Summary" s ON s."pageId" = p.id
          LEFT JOIN LATERAL (
            SELECT * FROM "Snapshot" sn WHERE sn."pageId" = p.id ORDER BY sn."createdAt" DESC LIMIT 1
          ) sn ON true
          WHERE p."siteId" = $1::uuid
          ORDER BY p."createdAt" DESC
          `,
          siteId,
        );
      }
    } catch {
      // Fallback to summary text query; cast siteId to ::uuid
      candidates = await prisma.$queryRawUnsafe(
        `
        SELECT p.url, p.title, s.text as summary, sn."screenshotPath" as screenshot, 0.0 as similarity, NULL::float8 as distance
        FROM "Page" p
        LEFT JOIN "Summary" s ON s."pageId" = p.id
        LEFT JOIN LATERAL (
          SELECT * FROM "Snapshot" sn WHERE sn."pageId" = p.id ORDER BY sn."createdAt" DESC LIMIT 1
        ) sn ON true
        WHERE p."siteId" = $1::uuid
        ORDER BY p."createdAt" DESC
        `,
        siteId,
      );
    }
  } else {
    // No embedding available: use summary text query; cast siteId to ::uuid
    candidates = await prisma.$queryRawUnsafe(
      `
      SELECT p.url, p.title, s.text as summary, sn."screenshotPath" as screenshot, 0.0 as similarity, NULL::float8 as distance
      FROM "Page" p
      LEFT JOIN "Summary" s ON s."pageId" = p.id
      LEFT JOIN LATERAL (
        SELECT * FROM "Snapshot" sn WHERE sn."pageId" = p.id ORDER BY sn."createdAt" DESC LIMIT 1
      ) sn ON true
      WHERE p."siteId" = $1::uuid
      ORDER BY p."createdAt" DESC
      `,
      siteId,
    );
  }

  // Results are already ordered by vector distance (or recency in fallback)
  const ordered = candidates;

    // Re-enable LLM answer with graceful fallback
    let answer: string | null = null;
    try {
      if (process.env.OPENAI_API_KEY) {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const context = ordered
          .slice(0, 3)
          .map((r, i) => `[${i + 1}] ${r.title || r.url}\n${(r.summary || "").slice(0, 500)}`)
          .join("\n\n");
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You answer questions about a website using only the provided context. If the context is insufficient, say you don't know." },
            { role: "user", content: `Question: ${question}\n\nContext:\n${context}` },
          ],
          temperature: 0.2,
          max_tokens: 200,
        });
        answer = completion.choices[0]?.message.content?.trim() || null;
      }
    } catch {}

    return NextResponse.json({
      answer: answer ?? undefined,
      sources: ordered.map((r) => ({
        url: r.url,
        title: r.title ?? undefined,
        snippet: r.summary ?? undefined,
        screenshotUrl: r.screenshot ?? undefined,
        similarity: Number(r.similarity),
        distance: r.distance === null ? null : Number(r.distance),
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


