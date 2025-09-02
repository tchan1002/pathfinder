import { describe, it, expect } from "vitest";
import { normalizeUrl, isSameOrigin } from "../lib/url";

describe("normalizeUrl", () => {
  it("removes hash, sorts query, removes trailing slash", () => {
    const u = normalizeUrl("https://example.com/path/?b=2&a=1#hash");
    expect(u).toBe("https://example.com/path?a=1&b=2");
  });
  it("removes default ports", () => {
    expect(normalizeUrl("http://example.com:80/")) .toBe("http://example.com/");
    expect(normalizeUrl("https://example.com:443/")) .toBe("https://example.com/");
  });
});

describe("isSameOrigin", () => {
  it("compares host, protocol, and effective port", () => {
    expect(isSameOrigin("https://a.com/x", "https://a.com/y")).toBe(true);
    expect(isSameOrigin("https://a.com", "http://a.com")).toBe(false);
  });
});


