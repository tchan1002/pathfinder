import OpenAI from "openai";
let openai: OpenAI | null = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function embedText384(text: string): Promise<number[]> {
  const target = 384;
  // Local fallback if no API key: hashed bag-of-words with L2 normalization
  if (!openai) {
    const buckets = new Float32Array(target);
    const tokens = text.toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean);
    for (const tok of tokens) {
      let h = 2166136261;
      for (let i = 0; i < tok.length; i++) h = (h ^ tok.charCodeAt(i)) * 16777619;
      const idx = Math.abs(h | 0) % target;
      if (idx >= 0 && idx < buckets.length) {
        buckets[idx] = (buckets[idx] ?? 0) + 1;
      }
    }
    let norm = 0;
    for (let i = 0; i < target; i++) {
      const v = buckets[i] ?? 0;
      norm += v * v;
    }
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < target; i++) {
      const v = buckets[i] ?? 0;
      buckets[i] = v / norm;
    }
    return Array.from(buckets);
  }

  // OpenAI path
  const embedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  const vec = embedding.data[0]?.embedding ?? [];
  if (vec.length === target) return vec;
  const buckets: number[] = new Array<number>(target).fill(0);
  const counts: number[] = new Array<number>(target).fill(0);
  for (let i = 0; i < vec.length; i++) {
    const idx = Math.floor((i / vec.length) * target);
    buckets[idx] = (buckets[idx] ?? 0) + Number(vec[i] ?? 0);
    counts[idx] = (counts[idx] ?? 0) + 1;
  }
  for (let i = 0; i < target; i++) {
    const c = counts[i] ?? 0;
    if (c > 0) buckets[i] = (buckets[i] ?? 0) / c;
  }
  return buckets;
}

export async function summarizeText(text: string): Promise<string> {
  if (!openai) return text.replace(/\s+/g, " ").trim().slice(0, 220);
  const prompt = `Summarize the following page in <= 45 words. Imperative mood, no fluff, no preamble.\n\n${text.slice(0, 8000)}`;
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You summarize web pages concisely." },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
    max_tokens: 120,
  });
  return res.choices[0]?.message.content?.trim() ?? "";
}


