import { expect, it } from "vitest";
import { parseHeaders, requestUrl } from "./request";
import type { Endpoint } from "./types";

it("accepts pasted HTTP headers and JSON without losing colons in values", () => {
  expect(
    parseHeaders(
      "Authorization: Bearer demo\r\nX-Link: https://example.test:8080\r\n",
    ),
  ).toEqual({
    Authorization: "Bearer demo",
    "X-Link": "https://example.test:8080",
  });
  expect(parseHeaders('{"X-Test":"value"}')).toEqual({ "X-Test": "value" });
  expect(() => parseHeaders("X-Test: one\nx-test: two")).toThrow(
    "Duplicate header",
  );
  expect(() => parseHeaders("bad header: one")).toThrow("Paste headers");
  expect(() => parseHeaders('{"X-Test":123}')).toThrow("string values");
});

it("copies a resolved URL with encoded path and query inputs", () => {
  const endpoint = {
    path: "/users/{id}",
    parameters: [
      { in: "path", name: "id" },
      { in: "query", name: "search" },
    ],
  } as Endpoint;
  expect(
    requestUrl(
      endpoint,
      { "path:id": "a/b", "query:search": "a & b" },
      "http://127.0.0.1:8000",
    ),
  ).toBe("http://127.0.0.1:8000/users/a%2Fb?search=a+%26+b");
});
