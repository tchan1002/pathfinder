import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

export type ExtractedContent = {
  title?: string | undefined;
  description?: string | undefined;
  text?: string | undefined;
  headers?: string[] | undefined;
  diverseClips?: string[] | undefined;
  metadata?: {
    h1?: string[];
    h2?: string[];
    h3?: string[];
    metaKeywords?: string | undefined;
    ogTitle?: string | undefined;
    ogDescription?: string | undefined;
  } | undefined;
};

export function extractMainContent(html: string): ExtractedContent {
  const dom = new JSDOM(html, { url: "https://example.com" });
  const doc = dom.window.document;
  
  // Extract header metadata first (priority)
  const headers = extractHeaders(doc);
  const metadata = extractMetadata(doc);
  
  // Get meta description
  const metaDesc = doc.querySelector('meta[name="description"]')?.getAttribute("content") ?? undefined;
  
  // Use Readability for main content
  const reader = new Readability(doc);
  const article = reader.parse();
  
  // Extract diverse text clips from across the page
  const diverseClips = extractDiverseTextClips(doc);
  
  return {
    title: article?.title ?? doc.title ?? undefined,
    description: metaDesc || undefined,
    text: article?.textContent ?? undefined,
    headers,
    diverseClips,
    metadata,
  };
}

function extractHeaders(doc: Document): string[] {
  const headers: string[] = [];
  const headerSelectors = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
  
  headerSelectors.forEach(selector => {
    const elements = doc.querySelectorAll(selector);
    elements.forEach(el => {
      const text = el.textContent?.trim();
      if (text && text.length > 0) {
        headers.push(text);
      }
    });
  });
  
  return headers;
}

function extractMetadata(doc: Document) {
  const h1Elements = Array.from(doc.querySelectorAll('h1')).map(el => el.textContent?.trim()).filter((text): text is string => Boolean(text));
  const h2Elements = Array.from(doc.querySelectorAll('h2')).map(el => el.textContent?.trim()).filter((text): text is string => Boolean(text));
  const h3Elements = Array.from(doc.querySelectorAll('h3')).map(el => el.textContent?.trim()).filter((text): text is string => Boolean(text));
  
  const metaKeywords = doc.querySelector('meta[name="keywords"]')?.getAttribute("content") ?? undefined;
  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content") ?? undefined;
  const ogDescription = doc.querySelector('meta[property="og:description"]')?.getAttribute("content") ?? undefined;
  
  return {
    h1: h1Elements,
    h2: h2Elements,
    h3: h3Elements,
    metaKeywords: metaKeywords || undefined,
    ogTitle: ogTitle || undefined,
    ogDescription: ogDescription || undefined,
  };
}

function extractDiverseTextClips(doc: Document): string[] {
  const clips: string[] = [];
  
  // Extract text from different types of content areas
  const contentSelectors = [
    'main', 'article', 'section', 
    '.content', '.main-content', '.post-content', '.entry-content',
    'p', 'div', 'span'
  ];
  
  contentSelectors.forEach(selector => {
    const elements = doc.querySelectorAll(selector);
    elements.forEach(el => {
      const text = el.textContent?.trim();
      if (text && text.length > 50 && text.length < 500) { // Reasonable clip size
        // Avoid duplicates and very short content
        if (!clips.some(clip => clip.includes(text) || text.includes(clip))) {
          clips.push(text);
        }
      }
    });
  });
  
  // Also extract from lists and tables for structured content
  const listElements = doc.querySelectorAll('ul, ol, dl');
  listElements.forEach(list => {
    const items = list.querySelectorAll('li, dt, dd');
    items.forEach(item => {
      const text = item.textContent?.trim();
      if (text && text.length > 20 && text.length < 300) {
        if (!clips.some(clip => clip.includes(text) || text.includes(clip))) {
          clips.push(text);
        }
      }
    });
  });
  
  // Limit to most diverse and informative clips
  return clips.slice(0, 20);
}


