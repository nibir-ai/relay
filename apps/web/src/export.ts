import { parseHeaders, requestUrl } from "./request";
import type { Endpoint, LiveResponse, Progress, Snapshot } from "./types";
import reportFont from "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?inline";
import reportLogo from "../public/brand/relay-logo.svg?raw";

export function endpointExport({ endpoint, snapshot, baseUrl, values, body, mediaType, headerText, progress, response, responseAt }: {
  endpoint: Endpoint;
  snapshot: Snapshot;
  baseUrl: string;
  values: Record<string, string>;
  body: string;
  mediaType: string;
  headerText: string;
  progress: Progress;
  response: LiveResponse | null;
  responseAt: string | null;
}) {
  let headers: Record<string, string> | null = null;
  let headerError: string | null = null;
  try {
    headers = Object.fromEntries(Object.entries(parseHeaders(headerText)).map(([name, value]) => [name, /authorization|cookie|token|secret|api[-_]?key/i.test(name) ? "[REDACTED]" : value]));
  } catch (error) {
    headerError = error instanceof Error ? error.message : "Invalid request headers";
  }
  return {
    format: "relay.endpoint",
    version: 1,
    exported_at: new Date().toISOString(),
    api: { title: snapshot.title, version: snapshot.version, server: baseUrl },
    endpoint: { ...endpoint, progress },
    current_request: {
      method: endpoint.method,
      url: requestUrl(endpoint, values, baseUrl),
      parameter_values: { ...values },
      content_type: endpoint.requestBody ? mediaType : null,
      headers,
      header_error: headerError,
      body: endpoint.requestBody ? body : null,
    },
    latest_response: response ? { ...response, captured_at: responseAt } : null,
  };
}

export function exportFilename(endpoint: Endpoint, format: "json" | "relay" = "json") {
  const path = endpoint.path.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "root";
  return `relay-${endpoint.method.toLowerCase()}-${path}.${format}`;
}

function escaped(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
function pretty(value: unknown) {
  if (typeof value !== "string") return JSON.stringify(value, null, 2);
  try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
}

export function relayReport(value: ReturnType<typeof endpointExport>) {
  const { endpoint, current_request: request, latest_response: response } = value;
  const block = (label: string, content: unknown) => `<section><h2>${escaped(label)}</h2><pre tabindex="0">${escaped(pretty(content))}</pre></section>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="relay-format" content="relay.endpoint.report.v1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; base-uri 'none'; form-action 'none'"><title>${escaped(endpoint.method)} ${escaped(endpoint.path)} · Relay</title><style>
@font-face{font-family:RelayMono;src:url('${reportFont}') format('woff2');font-weight:100 900;font-display:swap}*{box-sizing:border-box}body{margin:0;background:#10191d;color:#dadada;font:15px/1.65 RelayMono,monospace}header{border-bottom:1px solid #34454d;background:#192429;padding:16px 28px;display:flex;align-items:center;justify-content:space-between;gap:20px}header svg{width:148px;height:36px}main{max-width:1200px;margin:auto;padding:32px 28px}h1{font-size:24px;margin:8px 0;overflow-wrap:anywhere}h2{font-size:16px;margin:0;padding:12px 16px;background:#192429;border-bottom:1px solid #34454d}p{margin:8px 0 20px;overflow-wrap:anywhere}.muted{color:#a3b0b5;font-size:14px}.method{padding:5px 10px;border:1px solid #34454d;color:#67b0e8}.meta{display:flex;gap:20px;flex-wrap:wrap;margin:20px 0}.layout{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,3fr);gap:20px;align-items:start}section{border:1px solid #34454d;border-radius:3px;margin-bottom:20px;overflow:hidden}pre{font:inherit;margin:0;padding:20px;overflow:auto;max-height:75vh;tab-size:2}.response pre{min-height:280px}.status{color:${response && response.status >= 400 ? "#e57474" : "#8ccf7e"}}summary{padding:12px 16px;cursor:pointer;background:#192429}details{border:1px solid #34454d;margin:20px 0}::selection{background:#34454d;color:#dadada}@media(max-width:800px){.layout{grid-template-columns:1fr}main{padding:24px 16px}header{padding:12px 16px;flex-wrap:wrap}h1{font-size:20px}}@media print{body{background:white;color:#111}header,h2,summary{background:#eee;color:#111}.layout{display:block}pre{max-height:none;white-space:pre-wrap;overflow-wrap:anywhere}section{break-inside:avoid}}
</style></head><body><header>${reportLogo}<span class="muted">Endpoint export · ${escaped(value.api.title)}</span></header><main><span class="method">${escaped(endpoint.method)}</span><h1>${escaped(endpoint.path)}</h1><p>${escaped(endpoint.summary)}</p>${endpoint.description ? `<p class="muted">${escaped(endpoint.description)}</p>` : ""}<p class="muted">${escaped(request.url)}</p><div class="meta"><span>Status: ${escaped(endpoint.progress.replaceAll("_", " "))}</span><span class="muted">Exported ${escaped(value.exported_at)}</span></div><div class="layout"><div>${block("Current request body", request.body ?? "No request body")}${block("Request inputs", { parameter_values: request.parameter_values, content_type: request.content_type, headers: request.headers, ...(request.header_error ? { header_error: request.header_error } : {}) })}</div><div class="response"><section><h2>${response ? `<span class="status">${escaped(response.status)} ${escaped(response.reason)}</span> · ${escaped(response.duration_ms)} ms · ${escaped(response.bytes)} bytes` : "Response"}</h2>${response ? `<p class="muted" style="padding:0 20px">Captured ${escaped(response.captured_at)}${response.truncated ? " · Truncated preview" : ""}</p>` : ""}<pre tabindex="0">${escaped(response ? pretty(response.body) : "No request has been executed.")}</pre></section>${response ? block("Response headers", response.headers) : ""}</div></div><details><summary>Endpoint contract</summary><pre tabindex="0">${escaped(pretty(endpoint))}</pre></details><details><summary>Complete export data</summary><pre tabindex="0">${escaped(pretty(value))}</pre></details></main></body></html>`;
}

export function downloadExport(filename: string, value: ReturnType<typeof endpointExport>, format: "json" | "relay" = "json") {
  const content = format === "relay" ? relayReport(value) : JSON.stringify(value, null, 2) + "\n";
  const url = URL.createObjectURL(new Blob([content], { type: format === "relay" ? "text/html;charset=utf-8" : "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  try { link.click(); } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
