import { prisma } from "@/lib/prisma";

async function main() {
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
  const domain = process.env.SEED_DOMAIN || "example.com";
  const startUrl = process.env.SEED_START_URL || `https://${domain}`;
  const site = await prisma.site.upsert({
    where: { domain },
    create: { domain, startUrl },
    update: { startUrl },
  });
  console.log("Seeded site", site);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });


