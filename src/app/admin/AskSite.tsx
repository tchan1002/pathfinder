"use client";
import { useState } from "react";

export default function AskSite({ siteId }: { siteId: string }) {
	const [question, setQuestion] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
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
			if (!res.ok) throw new Error("Query failed");
			const data = await res.json();
			setResults(data || []);
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
			{top && (
				<div className="border rounded p-3 bg-gray-50">
					<div className="text-sm text-gray-500">Best match ({Math.round(top.confidence * 100)}%)</div>
					<div className="font-medium">{top.title || top.url}</div>
					{top.snippet && <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{top.snippet}</p>}
					<a className="text-blue-600 underline text-sm mt-1 inline-block" href={top.url} target="_blank" rel="noreferrer">
						Open page
					</a>
				</div>
			)}
		</div>
	);
}


