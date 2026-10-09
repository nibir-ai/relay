import type { SessionAuth } from "./types";

export function normalizeToken(value: string) {
  return value
    .trim()
    .replace(/^Bearer\s+/i, "")
    .trim();
}
export function authHeaders(
  headers: Record<string, string>,
  mode: string,
  secret: string,
  keyName: string,
  shared: SessionAuth,
): Record<string, string> {
  const result = { ...headers };
  const explicit = Object.keys(result).find(
    (key) => key.toLowerCase() === "authorization",
  );
  if (
    mode === "Workspace bearer" &&
    (!shared.enabled || !shared.token || explicit)
  )
    return result;
  if (mode === "None") return result;
  if (explicit) delete result[explicit];
  if (mode === "Workspace bearer")
    result.Authorization = `Bearer ${normalizeToken(shared.token)}`;
  if (mode === "Bearer token") {
    const token = normalizeToken(secret);
    if (!token || /[\r\n]/.test(token))
      throw new Error("Enter a valid bearer token.");
    result.Authorization = `Bearer ${token}`;
  }
  if (mode === "API key") {
    if (!keyName.trim() || !secret.trim())
      throw new Error("Enter an API-key header name and value.");
    result[keyName.trim()] = secret;
  }
  if (mode === "Basic") {
    try {
      result.Authorization = `Basic ${btoa(secret)}`;
    } catch {
      throw new Error(
        "Basic auth currently accepts Latin-1 username:password values.",
      );
    }
  }
  return result;
}
export function responseToken(body: string): string | null {
  try {
    const parsed = JSON.parse(body);
    const value =
      parsed?.access_token ?? parsed?.token ?? parsed?.data?.access_token;
    return typeof value === "string" && value.trim()
      ? normalizeToken(value)
      : null;
  } catch {
    return null;
  }
}
