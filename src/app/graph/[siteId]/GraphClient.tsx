"use client";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type PageNode = {
  id: string;
  url: string;
  title: string | null;
  path: string;
  summary?: string | null;
  screenshotUrl?: string | null;
};

type TreeNode = { name: string; children: Record<string, TreeNode>; page: PageNode | null; collapsed?: boolean };

export default function GraphClient({ siteId }: { siteId: string }) {
  const [pages, setPages] = useState<PageNode[]>([]);
  const [selected, setSelected] = useState<PageNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [qLoading, setQLoading] = useState(false);
  const [qError, setQError] = useState<string | null>(null);
  const [_qAnswer, setQAnswer] = useState<string | null>(null); // kept for future use
  const [qResults, setQResults] = useState<Array<{ url: string; title?: string; snippet?: string; screenshotUrl?: string; similarity?: number | string; distance?: number | string | null }>>([]);
  const [qSearched, setQSearched] = useState<boolean>(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/site/${siteId}/pages`);
        if (!res.ok) {
          let detail = "";
          try { const j = await res.json(); detail = j?.error || ""; } catch {}
          throw new Error(`Failed to load pages (${res.status})${detail ? `: ${detail}` : ""}`);
        }
        const data: PageNode[] = await res.json();
        const safe = data.filter((p) => {
          try {
            new URL(p.url);
            return true;
          } catch {
            return false;
          }
        });
        setPages(safe);
      } catch (e) {
        setQError(e instanceof Error ? e.message : "Failed to load pages");
        setPages([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [siteId]);

  const tree = useMemo(() => buildTree(pages), [pages]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <h2 className="font-semibold mb-2">Site map</h2>
        <form
          className="mb-3 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setQError(null);
            if (!q.trim()) return;
            setQLoading(true);
            setQSearched(true);
            setQResults([]);
            setQAnswer(null);
            try {
              const res = await fetch(`/api/query`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ siteId, question: q }),
              });
              if (!res.ok) {
                let detail = "";
                try { const j = await res.json(); detail = j?.error || ""; } catch {}
                throw new Error(`Query failed (${res.status})${detail ? `: ${detail}` : ""}`);
              }
              const data = await res.json();
              setQAnswer(data?.answer || null);
              const src = (data?.sources || []).map((s: { url: string; title?: string; snippet?: string; screenshotUrl?: string; similarity?: number | string; distance?: number | string | null }) => ({
                ...s,
                similarity: Number(s.similarity ?? 0),
                distance: s.distance == null ? null : Number(s.distance),
              }));
              setQResults(src);
            } catch (err) {
              const message = err instanceof Error ? err.message : "Something went wrong";
              setQError(message);
            } finally {
              setQLoading(false);
            }
          }}
        >
          <input
            className="border px-2 py-1 rounded flex-1"
            placeholder="Ask a question about this site"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="bg-green-600 text-white px-3 py-1 rounded" disabled={qLoading}>
            {qLoading ? "Asking..." : "Ask"}
          </button>
        </form>
        {qError && <div className="text-sm text-red-600 mb-2">{qError}</div>}
        {(qLoading || qSearched) && (
          <div className="mb-3 space-y-3">
            {qLoading && <div className="text-sm text-gray-500">Searching…</div>}
            {qResults.length > 0 && (
              <div className="border border-white rounded p-3 bg-black text-white">
                <ul className="space-y-2">
                  {qResults.map((r, i) => (
                    <li key={`${r.url}-${i}`} className="text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <a href={r.url} target="_blank" rel="noreferrer" className="font-medium truncate max-w-[48ch] text-white hover:underline">{r.title || r.url}</a>
                        </div>
                        <div className="text-white/80 shrink-0">{(Number(r.similarity) * 100).toFixed(1)}%{r.distance != null ? ` (${Number(r.distance).toFixed(3)})` : ""}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {loading ? (
          <div>Loading...</div>
        ) : (
          <ul className="text-sm">
            <Tree node={tree} onSelect={setSelected} />
          </ul>
        )}
      </div>
      <div>
        <h2 className="font-semibold mb-2">Details</h2>
        {selected ? (
          <div className="space-y-3">
            <div className="text-lg font-medium">{selected.title || selected.url}</div>
            <a className="text-blue-600 underline" href={selected.url} target="_blank" rel="noreferrer">Open page</a>
            {selected.summary && <p className="text-sm text-gray-700 whitespace-pre-wrap">{selected.summary}</p>}
            {selected.screenshotUrl && (
              <Image src={selected.screenshotUrl} alt="screenshot" width={1280} height={720} className="rounded border w-full h-auto" />
            )}
          </div>
        ) : (
          <div className="text-sm text-gray-600">Select a page to see summary and screenshot.</div>
        )}
      </div>
    </div>
  );
}

function buildTree(pages: PageNode[]) {
  const root: TreeNode = { name: "/", children: {}, page: null };
  for (const p of pages) {
    const url = new URL(p.url);
    const segs = url.pathname.split("/").filter(Boolean);
    let cur = root;
    for (const s of segs) {
      cur.children[s] = cur.children[s] || { name: s, children: {}, page: null };
      cur = cur.children[s];
    }
    cur.page = p;
  }
  return root;
}

function Tree({ node, onSelect }: { node: TreeNode; onSelect: (p: PageNode) => void }) {
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const entries = Object.entries(node.children || {});
  return (
    <li>
      <div className="flex items-center gap-1">
        {entries.length > 0 && (
          <button className="text-xs px-1 rounded border" onClick={() => setCollapsed((v) => !v)}>{collapsed ? "+" : "–"}</button>
        )}
        {node.page ? (
          <button className="text-left hover:underline" onClick={() => onSelect(node.page!)}>
            {node.page.title || node.page.url}
          </button>
        ) : (
          <span className="text-gray-600">/{node.name}</span>
        )}
      </div>
      {!collapsed && entries.length > 0 && (
        <ul className="ml-4 border-l pl-2 mt-1 space-y-1">
          {entries.map(([k, child]) => (
            <Tree key={k} node={child} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  );
}


