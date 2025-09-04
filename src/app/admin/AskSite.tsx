"use client";
import { useState } from "react";

export default function AskSite({ siteId }: { siteId: string }) {
        const [question, setQuestion] = useState("");
        const [loading, setLoading] = useState(false);
        const [error, setError] = useState<string | null>(null);
        const [results, setResults] = useState<
                Array<{ url: string; title?: string; snippet?: string; screenshotUrl?: string; similarity: number }>
        >([]);

	async function onAsk(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		if (!question.trim()) return;
		setLoading(true);
		try {
			const res = await fetch("/api/query", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ siteId, question }),
			});
			if (!res.ok) {
				let detail = "";
				try { const j = await res.json(); detail = j?.error || ""; } catch {}
				throw new Error(`Query failed (${res.status})${detail ? `: ${detail}` : ""}`);
			}
                        const data = await res.json();
                        setResults(
                                (data?.sources || []).map(
                                        (s: { url: string; title?: string; snippet?: string; screenshotUrl?: string; similarity?: number | string }) => ({
                                                ...s,
                                                similarity: Number(s.similarity ?? 0),
                                        })
                                )
                        );
		} catch (err) {
			const message = err instanceof Error ? err.message : "Something went wrong";
			setError(message);
		} finally {
			setLoading(false);
		}
	}

        return (
		<div className="mt-4 space-y-2 text-white">
			<form onSubmit={onAsk} className="flex gap-2">
				<input
					className="border border-white bg-transparent text-white placeholder-white/50 px-2 py-1 rounded flex-1"
					placeholder="Ask a question about this site"
					value={question}
					onChange={(e) => setQuestion(e.target.value)}
				/>
				<button className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 transition-colors" disabled={loading}>
					{loading ? "Asking..." : "Ask"}
				</button>
			</form>
			{error && <div className="text-sm text-red-400">{error}</div>}
                        {results.length > 0 && (
                                <div className="mt-2">
                                <ul className="space-y-2">
                                        <li className="border border-white rounded p-3 bg-transparent">
                                                <div className="space-y-2">
                                                        {results.map((r, i) => (
                                                                <div key={`${r.url}-${i}`} className="text-sm flex items-start justify-between gap-2">
                                                                        <div className="min-w-0">
                                                                                <a href={r.url} target="_blank" rel="noreferrer" className="font-medium truncate max-w-[48ch] text-white hover:underline">{r.title || r.url}</a>
                                                                        </div>
                                                                        <div className="text-white/80 shrink-0">{(r.similarity * 100).toFixed(1)}% ({r.similarity.toFixed(3)})</div>
                                                                </div>
                                                        ))}
                                                </div>
                                        </li>
                                </ul>
                                </div>
                        )}
		</div>
	);
}


