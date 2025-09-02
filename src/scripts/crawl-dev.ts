import "dotenv/config";

async function main() {
  const siteId = process.env.CRAWL_SITE_ID;
  const startUrl = process.env.CRAWL_START_URL;
  if (!siteId || !startUrl) {
    console.error("Set CRAWL_SITE_ID and CRAWL_START_URL in env");
    process.exit(1);
  }
  const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const res = await fetch(`${base}/api/crawl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ siteId, startUrl }),
  });
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });


