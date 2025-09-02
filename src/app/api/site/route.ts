import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const BodySchema = z.object({
  domain: z.string().min(1),
  startUrl: z.string().url().optional(),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => undefined);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { domain, startUrl } = parsed.data;
  const site = await prisma.site.upsert({ where: { domain }, update: { startUrl: startUrl ?? null }, create: { domain, startUrl: startUrl ?? null } });
  return NextResponse.json(site);
}


