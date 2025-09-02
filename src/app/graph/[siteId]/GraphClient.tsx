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

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetch(`/api/site/${siteId}/pages`);
      const data = await res.json();
      setPages(data);
      setLoading(false);
    }
    load();
  }, [siteId]);

  const tree = useMemo(() => buildTree(pages), [pages]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <h2 className="font-semibold mb-2">Site map</h2>
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
          <button className="text-left hover:underline" onClick={() => onSelect(node.page)}>
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


