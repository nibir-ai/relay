import { describe, expect, it } from "vitest";
import { authHeaders, normalizeToken, responseToken } from "./auth";
import { snippets } from "./request";

describe("local session auth", () => {
  it("accepts tokens with or without the Bearer prefix", () => {
    expect(normalizeToken(" Bearer abc ")).toBe("abc");
    expect(normalizeToken("abc")).toBe("abc");
  });
  it("inherits workspace auth and preserves explicit header overrides", () => {
    const shared = { enabled: true, token: "abc" };
    expect(authHeaders({}, "Workspace bearer", "", "", shared)).toEqual({
      Authorization: "Bearer abc",
    });
    expect(
      authHeaders(
        { authorization: "Basic override" },
        "Workspace bearer",
        "",
        "",
        shared,
      ),
    ).toEqual({ authorization: "Basic override" });
  });
  it("supports disabling inheritance and explicit overrides", () => {
    const shared = { enabled: true, token: "abc" };
    expect(authHeaders({}, "None", "", "", shared)).toEqual({});
    expect(authHeaders({}, "Bearer token", "Bearer other", "", shared)).toEqual(
      { Authorization: "Bearer other" },
    );
  });
  it("does not set empty authorization headers", () => {
    expect(
      authHeaders({}, "Workspace bearer", "", "", {
        enabled: false,
        token: "",
      }),
    ).toEqual({});
    expect(() =>
      authHeaders({}, "Bearer token", "", "", { enabled: false, token: "" }),
    ).toThrow("valid bearer");
  });
  it("detects response access tokens without adopting them automatically", () => {
    expect(responseToken('{"access_token":"abc"}')).toBe("abc");
    expect(responseToken('{"ok":true}')).toBeNull();
  });
  it("redacts auth, nested passwords and query tokens from snippets", () => {
    const code = snippets(
      {
        method: "POST",
        path: "/login",
        headers: { Authorization: "Bearer private-token" },
        query: { api_key: "query-secret" },
        body_mode: "json",
        body: '{"user":{"password":"body-secret"}}',
      },
      "http://127.0.0.1:8000",
    );
    for (const text of Object.values(code)) {
      expect(text).not.toContain("private-token");
      expect(text).not.toContain("query-secret");
      expect(text).not.toContain("body-secret");
      expect(text).toContain("YOUR_");
    }
  });
});
