import { describe, expect, it } from "vitest";
import { example, makeRequest } from "./request";
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
