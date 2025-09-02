import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

export type ExtractedContent = {
  title?: string;
  description?: string;
  text?: string;
};

export function extractMainContent(html: string): ExtractedContent {
  const dom = new JSDOM(html, { url: "https://example.com" });
  const doc = dom.window.document;
  const metaDesc = doc.querySelector('meta[name="description"]')?.getAttribute("content") ?? undefined;
  const reader = new Readability(doc);
  const article = reader.parse();
  return {
    title: article?.title ?? doc.title ?? undefined,
    description: metaDesc,
    text: article?.textContent ?? undefined,
  };
}


