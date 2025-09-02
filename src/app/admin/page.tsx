import { prisma } from "@/lib/prisma";

export default async function AdminPage() {
  const sites = await prisma.site.findMany({
    include: { pages: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-2xl font-bold">Admin</h1>
      <form className="flex gap-2" action={createSite}>
        <input className="border px-2 py-1 rounded" type="text" name="domain" placeholder="example.com" required />
        <input className="border px-2 py-1 rounded" type="url" name="startUrl" placeholder="https://example.com" />
        <button className="bg-black text-white px-3 py-1 rounded" type="submit">Add Site</button>
      </form>
      <div className="grid gap-6">
        {sites.map((s) => (
          <div key={s.id} className="border rounded p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">{s.domain}</div>
                <div className="text-sm text-gray-500">{s.pages.length} pages</div>
              </div>
              <form action={triggerCrawl}>
                <input type="hidden" name="siteId" value={s.id} />
                <input type="url" name="startUrl" placeholder="https://{s.domain}" className="border px-2 py-1 rounded mr-2" />
                <button className="bg-blue-600 text-white px-3 py-1 rounded" type="submit">Crawl</button>
              </form>
            </div>
            <PagesTable siteId={s.id} />
          </div>
        ))}
      </div>
    </div>
  );
}

async function PagesTable({ siteId }: { siteId: string }) {
  const pages = await prisma.page.findMany({ where: { siteId }, orderBy: { updatedAt: "desc" }, take: 100 });
  return (
    <table className="w-full text-left mt-4">
      <thead>
        <tr className="text-gray-500">
          <th className="py-1">Title</th>
          <th className="py-1">URL</th>
          <th className="py-1">Updated</th>
        </tr>
      </thead>
      <tbody>
        {pages.map((p) => (
          <tr key={p.id} className="border-t">
            <td className="py-1 pr-2 truncate max-w-[20rem]">{p.title}</td>
            <td className="py-1 pr-2 truncate max-w-[28rem]">
              <a className="text-blue-600 underline" href={p.url} target="_blank" rel="noreferrer">{p.url}</a>
            </td>
            <td className="py-1 pr-2">{new Date(p.updatedAt).toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

async function createSite(formData: FormData) {
  "use server";
  const domain = String(formData.get("domain") || "").trim();
  const startUrl = String(formData.get("startUrl") || "").trim() || null;
  if (!domain) return;
  await prisma.site.create({ data: { domain, startUrl } });
}

async function triggerCrawl(formData: FormData) {
  "use server";
  const siteId = String(formData.get("siteId") || "");
  const startUrl = String(formData.get("startUrl") || "");
  if (!siteId) return;
  const url = startUrl || (await prisma.site.findUnique({ where: { id: siteId } }))?.startUrl || `https://${(await prisma.site.findUnique({ where: { id: siteId } }))?.domain}`;
  if (!url) return;
  await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/crawl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ siteId, startUrl: url }),
  });
}


