import type { Endpoint, Media, RequestPayload, Schema } from "./types";

export function parseHeaders(text: string): Record<string, string> {
  if (!text.trim()) return {};
  if (text.trim().startsWith("{")) {
    const value = JSON.parse(text);
    if (
      !value ||
      Array.isArray(value) ||
      typeof value !== "object" ||
      Object.values(value).some((v) => typeof v !== "string")
    )
      throw new Error("Headers must have string values.");
    return value;
  }
  const headers: Record<string, string> = {};
  const names = new Set<string>();
  for (const line of text.split(/\r?\n/).filter((line) => line.trim())) {
    const colon = line.indexOf(":");
    const name = line.slice(0, colon).trim();
    if (colon < 1 || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name))
      throw new Error("Paste headers as Name: value lines or a JSON object.");
    if (names.has(name.toLowerCase()))
      throw new Error(`Duplicate header: ${name}`);
    names.add(name.toLowerCase());
    headers[name] = line.slice(colon + 1).trim();
  }
  return headers;
}

export function requestUrl(
  endpoint: Endpoint,
  values: Record<string, string>,
  base: string,
) {
  let path = endpoint.path;
  const query = new URLSearchParams();
  for (const parameter of endpoint.parameters) {
    const value = values[`${parameter.in}:${parameter.name}`];
    if (value === undefined || value === "") continue;
    if (parameter.in === "path")
      path = path.replace(`{${parameter.name}}`, encodeURIComponent(value));
    if (parameter.in === "query") query.set(parameter.name, value);
  }
  return `${base}${path}${query.size ? `?${query}` : ""}`;
}

export function example(schema: Schema | undefined, depth = 0): unknown {
  if (!schema || depth > 8) return null;
  if (schema.example !== undefined) return schema.example;
  if (schema.examples?.length) return schema.examples[0];
  if (schema.default !== undefined) return schema.default;
  if (schema.enum?.length) return schema.enum[0];
  if (schema.anyOf)
    return example(
      schema.anyOf.find((s) => s.type !== "null"),
      depth + 1,
    );
  if (schema.type === "object" || schema.properties)
    return Object.fromEntries(
      Object.entries(schema.properties ?? {}).map(([k, v]) => [
        k,
        example(v, depth + 1),
      ]),
    );
  if (schema.type === "array") return [example(schema.items, depth + 1)];
  if (schema.type === "integer" || schema.type === "number") return 1;
  if (schema.type === "boolean") return false;
  return "";
}
export function bodyExample(media?: Media, mediaType = "application/json") {
  const value =
    media?.example ??
    Object.values(media?.examples ?? {})[0]?.value ??
    example(media?.schema);
  if (
    mediaType === "application/x-www-form-urlencoded" &&
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    return new URLSearchParams(
      Object.fromEntries(
        Object.entries(value).map(([key, value]) => [key, String(value ?? "")]),
      ),
    ).toString();
  if (!mediaType.includes("json"))
    return typeof value === "string" ? value : "";
  return JSON.stringify(value, null, 2);
}
export function makeRequest(
  endpoint: Endpoint,
  values: Record<string, string>,
  body: string,
  mediaType: string,
  headers: Record<string, string>,
): RequestPayload {
  let path = endpoint.path;
  const query: Record<string, string> = {};
  const cookies: string[] = [];
  const requestHeaders = { ...headers };
  for (const param of endpoint.parameters) {
    const value = values[`${param.in}:${param.name}`] ?? "";
    if (param.required && !value.trim())
      throw new Error(`Enter a value for ${param.name}.`);
    if (!value) continue;
    if (param.in === "path")
      path = path.replaceAll(`{${param.name}}`, encodeURIComponent(value));
    if (param.in === "query") query[param.name] = value;
    if (param.in === "header") requestHeaders[param.name] = value;
    if (param.in === "cookie")
      cookies.push(
        `${encodeURIComponent(param.name)}=${encodeURIComponent(value)}`,
      );
  }
  if (/\{[^}]+\}/.test(path))
    throw new Error("Fill in all path parameters before executing.");
  if (cookies.length) requestHeaders.Cookie = cookies.join("; ");
  const mode = !endpoint.requestBody
    ? "none"
    : mediaType.includes("json")
      ? "json"
      : mediaType === "application/x-www-form-urlencoded"
        ? "form"
        : "text";
  if (mediaType.includes("multipart"))
    throw new Error("Multipart upload is not supported in this milestone.");
  if (mode === "json") {
    try {
      JSON.parse(body);
    } catch {
      throw new Error("Invalid JSON. Fix the request body before executing.");
    }
  }
  if (mode !== "none") requestHeaders["Content-Type"] = mediaType;
  return {
    method: endpoint.method,
    path,
    query,
    headers: requestHeaders,
    body_mode: mode,
    body,
  };
}
export function formatted(body: string) {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

const sensitive =
  /authorization|cookie|password|secret|token|api[-_]?key|credential/i;
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        sensitive.test(key) ? "YOUR_SECRET" : redact(child),
      ]),
    );
  return value;
}
export function snippets(payload: RequestPayload, baseUrl: string) {
  const query = new URLSearchParams(
    Object.fromEntries(
      Object.entries(payload.query).map(([key, value]) => [
        key,
        sensitive.test(key) ? "YOUR_SECRET" : value,
      ]),
    ),
  );
  const url = baseUrl + payload.path + (query.size ? `?${query}` : "");
  const headers = Object.fromEntries(
    Object.entries(payload.headers).map(([key, value]) => [
      key,
      sensitive.test(key)
        ? value.startsWith("Bearer ")
          ? "Bearer YOUR_TOKEN"
          : "YOUR_SECRET"
        : value,
    ]),
  );
  let body = payload.body;
  if (payload.body_mode === "json") {
    try {
      body = JSON.stringify(redact(JSON.parse(body)));
    } catch {
      body = "{}";
    }
  }
  if (payload.body_mode === "form")
    body = new URLSearchParams(
      Object.fromEntries(
        [...new URLSearchParams(body)].map(([key, value]) => [
          key,
          sensitive.test(key) ? "YOUR_SECRET" : value,
        ]),
      ),
    ).toString();
  const options = {
    method: payload.method,
    headers,
    ...(payload.body_mode !== "none" ? { body } : {}),
  };
  const quote = (value: string) => `'${value.replaceAll("'", "'\"'\"'")}'`;
  return {
    fetch: `const response = await fetch(${JSON.stringify(url)}, ${JSON.stringify(options, null, 2)});\nconst data = await response.json();`,
    curl: [
      `curl -X ${payload.method} ${quote(url)}`,
      ...Object.entries(headers).map(
        ([key, value]) => `  -H ${quote(`${key}: ${value}`)}`,
      ),
      ...(payload.body_mode !== "none" ? [`  --data-raw ${quote(body)}`] : []),
    ].join(" \\\n"),
  };
}
