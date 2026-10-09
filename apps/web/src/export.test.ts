import { expect, it } from "vitest";
import { endpointExport, exportFilename, relayReport } from "./export";
import type { Endpoint, LiveResponse, Snapshot } from "./types";

const endpoint: Endpoint = {
  id: "POST /items/{id}", method: "POST", path: "/items/{id}", summary: "Update item", description: "Item details", tags: ["Items"], security: [], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
  requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } }, responses: { "400": { description: "Invalid item" } }, fingerprint: "abc", deprecated: false,
};
const snapshot: Snapshot = { title: "API", version: "1", hash: "abc", securitySchemes: {}, endpoints: [endpoint] };
const input = { endpoint, snapshot, baseUrl: "http://localhost:8000", values: { "path:id": "one/two" }, body: '{"title":"Changed"}', mediaType: "application/json", headerText: 'Authorization: Bearer private\nX-Trace: sample', progress: "done" as const, response: null, responseAt: null };

it("exports endpoint contract, current inputs and the exact latest non-2xx response separately", () => {
  const response: LiveResponse = { status: 400, reason: "Bad Request", body: 'not json\n', headers: { "content-type": "text/plain" }, duration_ms: 12, bytes: 9, truncated: true, content_type: "text/plain", url: "http://localhost:8000/items/previous", method: "POST" };
  const result = endpointExport({ ...input, response, responseAt: "2026-10-09T00:00:00Z" });
  expect(result.endpoint.responses).toEqual(endpoint.responses);
  expect(result.current_request.url).toBe("http://localhost:8000/items/one%2Ftwo");
  expect(result.current_request.body).toBe(input.body);
  expect(result.current_request.headers).toEqual({ Authorization: "[REDACTED]", "X-Trace": "sample" });
  expect(result.latest_response).toEqual({ ...response, captured_at: "2026-10-09T00:00:00Z" });
});
it("exports unfinished drafts without inventing a response or requiring valid JSON", () => {
  const result = endpointExport({ ...input, body: "{", headerText: "invalid" });
  expect(result.current_request.body).toBe("{");
  expect(result.current_request.headers).toBeNull();
  expect(result.current_request.header_error).toBeTruthy();
  expect(result.latest_response).toBeNull();
  expect(exportFilename(endpoint)).toBe("relay-post-items-id.json");
});
it("creates an offline Relay report and escapes API data instead of executing markup", () => {
  const html = relayReport(endpointExport({ ...input, body: '</pre><script>alert("test")</script>', endpoint: { ...endpoint, summary: '<img src=x onerror="test">' } }));
  expect(exportFilename(endpoint, "relay")).toBe("relay-post-items-id.relay");
  expect(html).toContain('name="relay-format" content="relay.endpoint.report.v1"');
  expect(html).toContain("font-src data:");
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain('<img src=x');
  expect(html).toContain("No request has been executed.");
});
it("preserves large numeric response values in JSON data and the browser report", () => {
  const body = '{"id":9007199254740993}';
  const value = endpointExport({ ...input, response: { status: 200, reason: "OK", body, headers: {}, duration_ms: 1, bytes: body.length, truncated: false, content_type: "application/json", url: input.baseUrl, method: "POST" } });
  expect(value.latest_response?.body).toBe(body);
  expect(relayReport(value)).toContain("9007199254740993");
  expect(relayReport(value)).not.toContain("9007199254740992");
});
