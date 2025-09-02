import { NextRequest } from "next/server";
import { z } from "zod";
import { crawlSite, type CrawlEvent } from "@/lib/crawler";

export const runtime = "nodejs";

const Query = z.object({ siteId: z.string().min(1), startUrl: z.string().url() });

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = Query.safeParse({ siteId: searchParams.get("siteId"), startUrl: searchParams.get("startUrl") });
  if (!parsed.success) {
    return new Response("Bad Request", { status: 400 });
  }
  const { siteId, startUrl } = parsed.data;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      function send(ev: CrawlEvent) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(ev)}\n\n`));
      }
      const ping = setInterval(() => controller.enqueue(new TextEncoder().encode(`:\n\n`)), 15000);
      send({ type: "status", message: "starting" });
      crawlSite({ siteId, startUrl, onEvent: send })
        .then(() => { clearInterval(ping); controller.close(); })
        .catch((e) => { send({ type: "status", message: `error: ${e.message}` }); clearInterval(ping); controller.close(); });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}


