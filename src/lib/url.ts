export function normalizeUrl(input: string): string {
  try {
    const url = new URL(input);
    url.hash = "";
    // remove default ports
    if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) {
      url.port = "";
    }
    // remove trailing slash unless root
    if (url.pathname !== "/") {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    // sort query params
    const params = new URLSearchParams(url.search);
    const sorted = new URLSearchParams();
    Array.from(params.keys()).sort().forEach((k) => {
      const values = params.getAll(k).sort();
      for (const v of values) sorted.append(k, v);
    });
    url.search = sorted.toString() ? `?${sorted.toString()}` : "";
    return url.toString();
  } catch {
    return input;
  }
}

export function isSameOrigin(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.protocol === ub.protocol && ua.hostname === ub.hostname && (ua.port || defaultPort(ua.protocol)) === (ub.port || defaultPort(ub.protocol));
  } catch {
    return false;
  }
}

function defaultPort(protocol: string): string {
  return protocol === "https:" ? "443" : protocol === "http:" ? "80" : "";
}


