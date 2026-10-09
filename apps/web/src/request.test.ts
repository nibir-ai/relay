import { describe, expect, it } from "vitest";
import { example, formatted, makeRequest, parseHeaders, requestUrl, snippets } from "./request";
import type { Endpoint } from "./types";

const endpoint: Endpoint = {
  id: "GET /users/{id}",
  method: "GET",
  path: "/users/{id}",
  summary: "User",
  description: "",
  tags: ["Users"],
  deprecated: false,
  fingerprint: "abc",
  security: [],
  requestBody: null,
  responses: {},
  parameters: [
    { name: "id", in: "path", required: true, schema: { type: "integer" } },
    { name: "email", in: "query", schema: { type: "boolean" } },
  ],
};
describe("request configuration", () => {
  it("omits blank optional JSON bodies while rejecting blank required bodies", () => {
    const optional = { ...endpoint, path: "/optional", parameters: [], requestBody: { content: { "application/json": {} } } };
    expect(makeRequest(optional, {}, "", "application/json", {}).body_mode).toBe("none");
    expect(() => makeRequest({ ...optional, requestBody: { ...optional.requestBody, required: true } }, {}, "", "application/json", {})).toThrow("required request body");
  });
  it("sends FastAPI query arrays as repeated keys in requests, copied URLs and snippets", () => {
    const list = { ...endpoint, path: "/items", parameters: [{ name: "tag", in: "query" as const, schema: { type: "array", items: { type: "string" } } }] };
    const values = { "query:tag": '["a b", "c&d"]' };
    const request = makeRequest(list, values, "", "application/json", {});
    expect(request.query).toEqual({ tag: ["a b", "c&d"] });
    expect(requestUrl(list, values, "http://localhost")).toBe("http://localhost/items?tag=a+b&tag=c%26d");
    expect(snippets(request, "http://localhost").fetch).toContain("?tag=a+b&tag=c%26d");
    expect(() => makeRequest(list, { "query:tag": '[{}]' }, "", "application/json", {})).toThrow("array of strings");
  });
  it("enforces identical header rules for JSON and pasted lines", () => {
    expect(() => parseHeaders('{"X-Key":"one","x-key":"two"}')).toThrow("Duplicate header");
    expect(() => parseHeaders('{"X Bad":"one"}')).toThrow("valid names");
    expect(() => parseHeaders('{"X-Key":"one\\r\\ntwo"}')).toThrow("single-line");
    expect(parseHeaders("X-Key: one")).toEqual({ "X-Key": "one" });
  });
  it("formats original JSON tokens without rounding large integers or dropping duplicate keys", () => {
    const body = '{"id":9007199254740993,"amount":1e+30,"id":2,"label":"a:b,{c}","empty":[]}';
    const pretty = formatted(body);
    expect(pretty).toContain("9007199254740993");
    expect(pretty).toContain("1e+30");
    expect(pretty.match(/"id"/g)).toHaveLength(2);
    expect(JSON.parse(pretty)).toEqual(JSON.parse(body));
  });
  it("keeps large responses unformatted and bounds indentation for deeply nested JSON", () => {
    const large = JSON.stringify({ data: "x".repeat(200_000) });
    expect(formatted(large)).toBe(large);
    const deep = "[".repeat(200) + "0" + "]".repeat(200);
    expect(formatted(deep).length).toBeLessThan(40_000);
    expect(JSON.parse(formatted(deep))).toEqual(JSON.parse(deep));
  });
  it("leaves read-only fields out of editable request examples", () => {
    expect(example({ type: "object", properties: { id: { type: "integer", readOnly: true }, label: { type: "string", example: "name" } } })).toEqual({ label: "name" });
  });
  it("encodes path values and retains false query parameters", () => {
    const result = makeRequest(
      endpoint,
      { "path:id": "one/two", "query:email": "false" },
      "",
      "application/json",
      {},
    );
    expect(result.path).toBe("/users/one%2Ftwo");
    expect(result.query).toEqual({ email: "false" });
  });
  it("blocks missing required values", () =>
    expect(() => makeRequest(endpoint, {}, "", "application/json", {})).toThrow(
      "id",
    ));
  it("rejects invalid JSON before runner execution", () =>
    expect(() =>
      makeRequest(
        {
          ...endpoint,
          parameters: [],
          path: "/login",
          requestBody: { content: { "application/json": {} } },
        },
        {},
        "{",
        "application/json",
        {},
      ),
    ).toThrow("Invalid JSON"));
  it("generates nested body examples from schema", () =>
    expect(
      example({
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              email: { type: "string", examples: ["alex@example.com"] },
            },
          },
          roles: { type: "array", items: { enum: ["admin"] } },
        },
      }),
    ).toEqual({ user: { email: "alex@example.com" }, roles: ["admin"] }));
});
