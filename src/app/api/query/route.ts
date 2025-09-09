import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { embedText384 } from "@/lib/embeddings";
import { rewriteQueryForVectorSearch, findBestMatchingPage, generateAnswerFromPage, type SearchResult } from "@/lib/enhanced-search";

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

    // Step 1: Rewrite the query for better vector search
    const rewrittenQuery = await rewriteQueryForVectorSearch(question);

    let qVecLiteral: string | null = null;
    try {
      const qVec = await embedText384(rewrittenQuery);
      qVecLiteral = '[' + qVec.map((n) => Number(n).toFixed(6)).join(',') + ']';
    } catch {}

    // Step 2: Get top 10 ranked pages using vector search
    let candidates: Array<{ url: string; title: string | null; summary: string | null; screenshot: string | null; similarity: number; distance: number | null; content: string | null }>;
    if (qVecLiteral) {
      try {
        // Cast siteId parameter to ::uuid so types match (p."siteId" is a uuid column)
        candidates = await prisma.$queryRawUnsafe(
          `
          SELECT p.url, p.title, s.text as summary, sn."screenshotPath" as screenshot, 
                 (1 - (e.vector <=> $1::vector)) AS similarity,
                 (e.vector <=> $1::vector) AS distance,
                 p.content
          FROM "Embedding" e
          JOIN "Page" p ON p.id = e."pageId"
          LEFT JOIN "Summary" s ON s."pageId" = p.id
          LEFT JOIN LATERAL (
            SELECT * FROM "Snapshot" sn WHERE sn."pageId" = p.id ORDER BY sn."createdAt" DESC LIMIT 1
          ) sn ON true
          WHERE p."siteId" = $2::uuid
          ORDER BY e.vector <=> $1::vector
          LIMIT 10
          `,
          qVecLiteral,
          siteId,
        );
        // If vector query returns no rows (e.g., no embeddings yet), fall back to text query
        if (!Array.isArray(candidates) || candidates.length === 0) {
          candidates = await prisma.$queryRawUnsafe(
            `
            SELECT p.url, p.title, s.text as summary, sn."screenshotPath" as screenshot, 0.0 as similarity, NULL::float8 as distance, p.content
            FROM "Page" p
            LEFT JOIN "Summary" s ON s."pageId" = p.id
            LEFT JOIN LATERAL (
              SELECT * FROM "Snapshot" sn WHERE sn."pageId" = p.id ORDER BY sn."createdAt" DESC LIMIT 1
            ) sn ON true
            WHERE p."siteId" = $1::uuid
            ORDER BY p."createdAt" DESC
            LIMIT 10
            `,
            siteId,
          );
        }
      } catch {
        // Fallback to summary text query; cast siteId to ::uuid
        candidates = await prisma.$queryRawUnsafe(
          `
          SELECT p.url, p.title, s.text as summary, sn."screenshotPath" as screenshot, 0.0 as similarity, NULL::float8 as distance, p.content
          FROM "Page" p
          LEFT JOIN "Summary" s ON s."pageId" = p.id
          LEFT JOIN LATERAL (
            SELECT * FROM "Snapshot" sn WHERE sn."pageId" = p.id ORDER BY sn."createdAt" DESC LIMIT 1
          ) sn ON true
          WHERE p."siteId" = $1::uuid
          ORDER BY p."createdAt" DESC
          LIMIT 10
          `,
          siteId,
        );
      }
    } else {
      // No embedding available: use summary text query; cast siteId to ::uuid
      candidates = await prisma.$queryRawUnsafe(
        `
        SELECT p.url, p.title, s.text as summary, sn."screenshotPath" as screenshot, 0.0 as similarity, NULL::float8 as distance, p.content
        FROM "Page" p
        LEFT JOIN "Summary" s ON s."pageId" = p.id
        LEFT JOIN LATERAL (
          SELECT * FROM "Snapshot" sn WHERE sn."pageId" = p.id ORDER BY sn."createdAt" DESC LIMIT 1
        ) sn ON true
        WHERE p."siteId" = $1::uuid
        ORDER BY p."createdAt" DESC
        LIMIT 10
        `,
        siteId,
      );
    }

    // Convert to SearchResult format
    const searchResults: SearchResult[] = candidates.map((r) => ({
      url: r.url,
      title: r.title,
      summary: r.summary,
      screenshot: r.screenshot,
      similarity: Number(r.similarity),
      distance: r.distance === null ? null : Number(r.distance),
      content: r.content || "",
    }));

    // Step 3: Find the best matching page using OpenAI
    const bestPage = await findBestMatchingPage(question, searchResults);

    // Step 4: Generate final answer based on the chosen page
    let answer: string | null = null;
    if (bestPage) {
      answer = await generateAnswerFromPage(question, bestPage);
    }

    return NextResponse.json({
      answer: answer ?? undefined,
      sources: searchResults.map((r) => ({
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


