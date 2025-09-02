"use client";
import { useState } from "react";

export default function Home() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<string>("");
  type Ev = { type: "status"; message: string } | { type: "page"; url: string; ok: boolean; title?: string | null } | { type: "done" };
  const [events, setEvents] = useState<Ev[]>([]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("Creating site...");
    const domain = new URL(url).hostname;
    try {
      const res = await fetch("/api/site", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain, startUrl: url }) });
      if (!res.ok) {
        let detail = "";
        try { const j = await res.json(); detail = j?.error || ""; } catch {}
        throw new Error(`Create site failed (${res.status})${detail ? `: ${detail}` : ""}`);
      }
      const s = await res.json();
      setStatus("Crawling... (streaming updates)");
      const base = window.location.origin;
      const src = new EventSource(`${base}/api/crawl/stream?siteId=${encodeURIComponent(s.id)}&startUrl=${encodeURIComponent(url)}`);
      src.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          setEvents((prev) => [data, ...prev].slice(0, 1000));
          if (data.type === "done") {
            src.close();
            setStatus("Done. Redirecting...");
            window.location.href = `/graph/${s.id}`;
          }
        } catch {}
      };
      src.onerror = () => {
        setStatus("Stream error. Check server logs and port.");
        src.close();
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error creating site.";
      setStatus(msg);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Pathfinder</h1>
      <form className="flex gap-2" onSubmit={onSubmit}>
        <input className="border px-2 py-1 rounded w-full" type="url" placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} required />
        <button className="bg-black text-white px-3 py-1 rounded" type="submit">Crawl</button>
      </form>
      {status && <div className="text-sm text-gray-600">{status}</div>}
      {events.length > 0 && (
        <div className="border rounded p-3 max-h-[320px] overflow-auto text-sm">
          {events.map((e, i) => (
            <div key={i} className="py-1 border-b last:border-b-0">
              {e.type === "page" ? (
                <div>
                  <span className={e.ok ? "text-green-700" : "text-red-700"}>{e.ok ? "✓" : "✗"}</span> {e.url}
                  {e.title ? <span className="text-gray-500"> — {e.title}</span> : null}
                </div>
              ) : e.type === "status" ? (
                <div className="text-gray-500">{e.message}</div>
              ) : (
                <div className="text-gray-700">done</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
