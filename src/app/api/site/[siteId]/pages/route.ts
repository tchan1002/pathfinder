import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, context: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await context.params;
  const pages = await prisma.page.findMany({
    where: { siteId },
    orderBy: { url: "asc" },
    include: {
      summaries: { orderBy: { createdAt: "desc" }, take: 1 },
      snapshots: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  const data = pages
    .map((p: {
      id: string;
      url: string;
      title: string | null;
      summaries: Array<{ text: string }>;
      snapshots: Array<{ screenshotPath: string | null }>;
    }) => {
      try {
        const u = new URL(p.url);
        return {
          id: p.id,
          url: p.url,
          title: p.title,
          path: u.pathname,
          summary: p.summaries[0]?.text ?? null,
          screenshotUrl: p.snapshots[0]?.screenshotPath ?? null,
        } as const;
      } catch {
        return null;
      }
    })
    .filter((v: unknown): v is { id: string; url: string; title: string | null; path: string; summary: string | null; screenshotUrl: string | null } => v !== null);

  return NextResponse.json(data);
}


