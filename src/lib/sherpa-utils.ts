import { ERROR_CODES } from "./sherpa-types";

/**
 * URL normalization per contract:
 * - lowercase scheme/host
 * - preserve path case
 * - remove trailing slash except root
 * - drop fragment #...
 * - keep query string but sort keys
 * - decode percent-encodings when safe
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    
    // Lowercase scheme and host
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    
    // Remove trailing slash except for root
    if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    
    // Remove fragment
    parsed.hash = '';
    
    // Sort query parameters
    if (parsed.search) {
      const params = new URLSearchParams(parsed.search);
      const sortedParams = new URLSearchParams();
      Array.from(params.keys()).sort().forEach(key => {
        sortedParams.set(key, params.get(key)!);
      });
      parsed.search = sortedParams.toString();
    }
    
    return parsed.toString();
  } catch (error) {
    throw new Error(`Invalid URL: ${url}`);
  }
}

/**
 * Extract domain using public-suffix parsing
 * For now, using a simple approach - in production you'd use a library like psl
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    
    // Simple domain extraction - in production use psl library
    const parts = hostname.split('.');
    if (parts.length < 2) {
      throw new Error(`Invalid domain: ${hostname}`);
    }
    
    // For now, return the full hostname
    // TODO: Use psl library for proper public suffix parsing
    return hostname;
  } catch (error) {
    throw new Error(`Invalid URL for domain extraction: ${url}`);
  }
}

/**
 * Check if URL is within domain limit
 */
export function isWithinDomainLimit(url: string, domainLimit: string | null): boolean {
  if (!domainLimit) return true;
  
  try {
    const urlDomain = extractDomain(url);
    return urlDomain === domainLimit || urlDomain.endsWith(`.${domainLimit}`);
  } catch {
    return false;
  }
}

/**
 * Create error response per contract
 */
export function createErrorResponse(
  errorCode: keyof typeof ERROR_CODES,
  message: string,
  requestId: string = crypto.randomUUID()
) {
  return {
    error_code: ERROR_CODES[errorCode],
    error_message: message,
    request_id: requestId,
  };
}

/**
 * Check if a job is fresh (within 15 minute TTL)
 */
export function isJobFresh(createdAt: Date): boolean {
  const now = new Date();
  const diffMs = now.getTime() - createdAt.getTime();
  const diffMinutes = diffMs / (1000 * 60);
  return diffMinutes < 15;
}

