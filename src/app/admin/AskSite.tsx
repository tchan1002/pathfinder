"use client";
import { useState } from "react";

export default function AskSite({ siteId }: { siteId: string }) {
        const [question, setQuestion] = useState("");
        const [loading, setLoading] = useState(false);
        const [error, setError] = useState<string | null>(null);
        const [answer, setAnswer] = useState<string | null>(null);
        const [results, setResults] = useState<
                Array<{ url: string; title?: string; snippet?: string; screenshotUrl?: string; confidence: number }>
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
                        setAnswer(data?.answer || null);
                        setResults(data?.sources || []);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Something went wrong";
			setError(message);
		} finally {
			setLoading(false);
		}
	}

        const top = results[0];

	return (
		<div className="mt-4 space-y-2">
			<form onSubmit={onAsk} className="flex gap-2">
				<input
					className="border px-2 py-1 rounded flex-1"
					placeholder="Ask a question about this site"
					value={question}
					onChange={(e) => setQuestion(e.target.value)}
				/>
				<button className="bg-green-600 text-white px-3 py-1 rounded" disabled={loading}>
					{loading ? "Asking..." : "Ask"}
				</button>
			</form>
			{error && <div className="text-sm text-red-600">{error}</div>}
                        {answer && (
                                <div className="border rounded p-3 bg-gray-50">
                                        <div className="font-medium">Answer</div>
                                        <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{answer}</p>
                                </div>
                        )}
                        {top && (
                                <div className="border rounded p-3 bg-gray-50">
                                        <div className="text-sm text-gray-500">Best match ({Math.round(top.confidence * 100)}%)</div>
                                        <div className="font-medium">{top.title || top.url}</div>
					{top.snippet && <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{top.snippet}</p>}
					<a className="text-white hover:underline text-sm mt-1 inline-block" href={top.url} target="_blank" rel="noreferrer">
						Open page
					</a>
				</div>
			)}
			{results.length > 1 && (
				<div className="mt-2">
					<div className="text-xs text-gray-500 mb-1">Other matches</div>
					<ul className="space-y-2">
						{results.slice(1, 6).map((r, i) => (
							<li key={`${r.url}-${i}`} className="text-sm">
								<div className="flex items-start justify-between gap-2">
									<div>
										<div className="font-medium">{r.title || r.url}</div>
										{r.snippet && <div className="text-gray-700 line-clamp-2">{r.snippet}</div>}
									</div>
									<div className="text-gray-500 shrink-0">{Math.round(r.confidence * 100)}%</div>
								</div>
								<a className="text-white hover:underline text-xs" href={r.url} target="_blank" rel="noreferrer">Open</a>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}


