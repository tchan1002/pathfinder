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
  const data = pages.map((p) => ({
    id: p.id,
    url: p.url,
    title: p.title,
    path: new URL(p.url).pathname,
    summary: p.summaries[0]?.text ?? null,
    screenshotUrl: p.snapshots[0]?.screenshotPath ?? null,
  }));
  return NextResponse.json(data);
}


