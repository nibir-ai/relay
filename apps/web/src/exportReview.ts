import type { endpointExport } from "./export";
import { redactJson } from "./jsonRedaction";
import { parseHeaders } from "./request";
type Export = ReturnType<typeof endpointExport>;
export type ReviewedExport = Export & { review: { omissions: string[]; note: string } };
export type ExportReviewOptions = {
  secrets?: string[];
  requestPointers?: string[];
  responsePointers?: string[];
  requestSuggestions?: boolean;
  responseSuggestions?: boolean;
  omitRequestBody?: boolean;
  omitResponseBody?: boolean;
  includeOpaque?: boolean;
};
const MASK = "[REDACTED]";
const sensitive = /password|passwd|authorization|cookie|token|secret|credential|api[-_]?key/i;
const cookieParts = (name: string, value: string) => /^set-cookie$/i.test(name)
  ? value.split(/,(?=\s*[^=;,\s]+=)/).map(cookie => cookie.split(";", 1)[0])
  : value.split(";");
const jsonType = (type: string) => /(?:^|\/)json(?:\s*;|$)|\+json(?:\s*;|$)/i.test(type);

export function requestHeaderSecrets(text: string): string[] {
  try {
    const result: string[] = [];
    for (const [name, value] of Object.entries(parseHeaders(text))) {
      if (!sensitive.test(name)) continue;
      result.push(value);
      if (/^authorization$/i.test(name)) result.push(value.replace(/^(?:Bearer|Basic)\s+/i, ""));
      if (/cookie/i.test(name)) for (const part of cookieParts(name, value)) {
        const index = part.indexOf("=");
        if (index >= 0 && part.slice(index + 1).trim()) result.push(part.slice(index + 1).trim());
      }
    }
    return result;
  } catch { return []; }
}

export function reviewExport(original: Export, options: ExportReviewOptions = {}): {
  value: ReviewedExport | null;
  error: string | null;
  suggestions: { request: string[]; response: string[] };
} {
  const suggestions = { request: [] as string[], response: [] as string[] };
  try {
    const source = structuredClone(original);
    const omissions: string[] = [];
    const credentials = new Set((options.secrets ?? []).filter(value => value.trim()));
    for (const [name, value] of Object.entries(source.current_request.parameter_values)) {
      if (/^cookie:/i.test(name) || sensitive.test(name)) credentials.add(value);
    }
    for (const address of [source.api.server, source.current_request.url, source.latest_response?.url]) {
      if (!address) continue;
      for (const match of address.matchAll(/[?&]([^=&#]+)=([^&#]*)/g)) {
        try { if (sensitive.test(decodeURIComponent(match[1].replace(/\+/g, " ")))) credentials.add(decodeURIComponent(match[2].replace(/\+/g, " "))); }
        catch { /* Malformed URL fields are masked below. */ }
      }
    }

    // Custom request/response auth headers are part of the review boundary too.
    for (const headers of [source.current_request.headers, source.latest_response?.headers]) {
      for (const [name, value] of Object.entries(headers ?? {})) {
        if (!sensitive.test(name) || value === MASK) continue;
        credentials.add(value);
        if (/^authorization$/i.test(name)) credentials.add(value.replace(/^(?:Bearer|Basic)\s+/i, ""));
        if (/cookie/i.test(name)) for (const part of cookieParts(name, value)) {
          const index = part.indexOf("=");
          if (index >= 0 && part.slice(index + 1).trim()) credentials.add(part.slice(index + 1).trim());
        }
      }
    }
    for (const value of [...credentials]) {
      credentials.add(value.replace(/^(?:Bearer|Basic)\s+/i, ""));
      if (value.includes(":")) {
        const index = value.indexOf(":");
        credentials.add(value.slice(0, index)); credentials.add(value.slice(index + 1));
        try { credentials.add(btoa(value)); } catch { /* Non-Latin-1 values have no Basic encoding. */ }
      }
    }
    for (const value of [...credentials]) {
      credentials.add(encodeURIComponent(value));
      credentials.add(encodeURIComponent(value).replace(/%[0-9A-F]{2}/g, part => part.toLowerCase()));
      credentials.add(encodeURIComponent(value).replace(/%20/g, "+"));
    }
    credentials.delete("");
    const secrets = [...credentials];
    if (secrets.length > 32 || secrets.some(value => value.length > 8192)) throw Error("Credential review exceeds its limit. Omit custom credential headers or reduce configured profiles before exporting.");
    const containsSecret = (value: string) => secrets.some(secret => value.includes(secret));
    function body(text: string, type: string, side: "request" | "response", omit: boolean, truncated = false): string {
      if (omit || truncated) { omissions.push(`${side} body omitted${truncated ? ": capture is truncated" : ": selected in review"}.`); return "[OMITTED]"; }
      if (!text) return text;
      if (!jsonType(type)) {
        if (!options.includeOpaque) { omissions.push(`${side} body omitted: non-JSON content requires explicit inclusion.`); return "[OMITTED]"; }
        if (containsSecret(text)) return MASK;
        return text;
      }
      const result = redactJson(text, { secrets, pointers: side === "request" ? options.requestPointers : options.responsePointers, suggested: side === "request" ? options.requestSuggestions : options.responseSuggestions });
      if (result.body === null) { omissions.push(`${side} body omitted: JSON could not be reviewed within the supported limits.`); return "[OMITTED]"; }
      suggestions[side] = result.suggestions;
      if (result.suggestionsTruncated) omissions.push(`${side} suggestions limited to 256 paths; all detected sensitive fields were still masked.`);
      return result.body;
    }
    if (source.current_request.body !== null) source.current_request.body = body(source.current_request.body, source.current_request.content_type ?? "", "request", !!options.omitRequestBody);
    if (source.latest_response) source.latest_response.body = body(source.latest_response.body, source.latest_response.content_type, "response", !!options.omitResponseBody, source.latest_response.truncated);
    function url(value: string) {
      return value.replace(/(https?:\/\/)[^/?#]*@/gi, "$1[REDACTED]@").replace(/([?&])([^=&#]+)=([^&#]*)/g, (whole, separator: string, name: string) => {
        try { return sensitive.test(decodeURIComponent(name.replace(/\+/g, " "))) ? `${separator}${name}=${MASK}` : whole; }
        catch { return `${separator}${name}=${MASK}`; }
      });
    }
    source.current_request.url = url(source.current_request.url);
    source.api.server = url(source.api.server);
    if (source.latest_response) source.latest_response.url = url(source.latest_response.url);
    for (const [name] of Object.entries(source.current_request.parameter_values)) if (/^cookie:/i.test(name) || sensitive.test(name)) source.current_request.parameter_values[name] = MASK;
    for (const headers of [source.current_request.headers, source.latest_response?.headers]) for (const name of Object.keys(headers ?? {})) if (sensitive.test(name)) headers![name] = MASK;
    // Do not copy parser error excerpts into an export.
    if (source.current_request.header_error) source.current_request.header_error = "Request headers could not be parsed; omitted from export.";
    let nodes = 0;
    function sanitize(value: unknown, depth: number): unknown {
      if (depth > 128 || ++nodes > 100000) throw Error("Export metadata exceeds the review complexity limit.");
      if (typeof value === "string") return containsSecret(value) ? MASK : value;
      if (typeof value === "number" && containsSecret(String(value))) throw Error("A configured credential overlaps numeric export metadata. This export cannot be reviewed safely.");
      if (Array.isArray(value)) return value.map(item => sanitize(item, depth + 1));
      if (value && typeof value === "object") {
        const result: Record<string, unknown> = Object.create(null);
        let index = 0;
        for (const [key, child] of Object.entries(value)) {
          let name = key;
          if (containsSecret(key)) {
            do { name = `__redacted_field_${++index}__`; } while (Object.hasOwn(value, name) || Object.hasOwn(result, name));
          }
          result[name] = sensitive.test(key) ? MASK : sanitize(child, depth + 1);
        }
        return result;
      }
      return value;
    }
    const clean = sanitize(source, 0) as Export;
    if (clean.format !== "relay.endpoint" || clean.version !== 1) throw Error("A configured credential overlaps required export metadata. This export cannot be reviewed safely.");
    return { value: { ...clean, review: { omissions, note: "Reviewed copy. Recognized sensitive fields and configured credential matches are masked; review custom private fields before sharing." } }, error: null, suggestions };
  } catch (error) {
    return { value: null, error: error instanceof URIError ? "A configured credential cannot be encoded safely for review." : error instanceof Error ? error.message : "Export review failed. No file was created.", suggestions: { request: [], response: [] } };
  }
}
