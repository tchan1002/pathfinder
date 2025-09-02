import { describe, it, expect } from "vitest";
import { extractMainContent } from "../lib/extract";

describe("extractMainContent", () => {
  it("pulls title, meta description, and text", () => {
    const html = `<!doctype html><html><head><title>Page Title</title><meta name="description" content="Desc"></head><body><article><h1>H</h1><p>Hello world</p></article></body></html>`;
    const out = extractMainContent(html);
    expect(out.title).toBe("Page Title");
    expect(out.description).toBe("Desc");
    expect(out.text && out.text.toLowerCase()).toContain("hello");
  });
});


