import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function embedText384(text: string): Promise<number[]> {
  // Use a 384-dim model (e.g., text-embedding-3-small is 1536). For 384-dim, swap to a provider/model you prefer.
  // For MVP, we can down-project via averaging chunks to 384 for storage; simple PCA-like reduction.
  const embedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  const vec = embedding.data[0]?.embedding ?? [];
  // Down-project to 384 by evenly averaging buckets.
  const target = 384;
  if (vec.length === target) return vec;
  const buckets: number[] = new Array(target).fill(0);
  const counts: number[] = new Array(target).fill(0);
  for (let i = 0; i < vec.length; i++) {
    const idx = Math.floor((i / vec.length) * target);
    buckets[idx] += vec[i];
    counts[idx] += 1;
  }
  for (let i = 0; i < target; i++) {
    if (counts[i] > 0) buckets[i] /= counts[i];
  }
  return buckets;
}

export async function summarizeText(text: string): Promise<string> {
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


