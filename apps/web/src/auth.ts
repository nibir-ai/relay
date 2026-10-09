import type { SessionAuth } from "./types";
import { validateHeaders } from "./request";

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
  const result = { ...validateHeaders(headers) };
  const explicit = Object.keys(result).find(
    (key) => key.toLowerCase() === "authorization",
  );
  if (
    mode === "Workspace bearer" &&
    (!shared.enabled || !shared.token || explicit)
  )
    return result;
  if (mode === "None") return result;
  if (explicit && mode !== "API key") delete result[explicit];
  if (mode === "Workspace bearer") {
    const token = normalizeToken(shared.token);
    if (!token || /\s/.test(token)) throw new Error("Enter a valid shared bearer token.");
    result.Authorization = `Bearer ${token}`;
  }
  if (mode === "Bearer token") {
    const token = normalizeToken(secret);
    if (!token || /\s/.test(token))
      throw new Error("Enter a valid bearer token.");
    result.Authorization = `Bearer ${token}`;
  }
  if (mode === "API key") {
    if (!keyName.trim() || !secret.trim())
      throw new Error("Enter an API-key header name and value.");
    for (const key of Object.keys(result))
      if (key.toLowerCase() === keyName.trim().toLowerCase()) delete result[key];
    result[keyName.trim()] = secret;
  }
  if (mode === "Basic") {
    if (!secret.includes(":") || !secret.split(":", 1)[0] || /[\r\n]/.test(secret))
      throw new Error("Enter Basic credentials as username:password.");
    try {
      result.Authorization = `Basic ${btoa(secret)}`;
    } catch {
      throw new Error(
        "Basic auth currently accepts Latin-1 username:password values.",
      );
    }
  }
  return validateHeaders(result);
}

export function authSummary(headers: Record<string, string>, mode: string, secret: string, keyName: string, shared: SessionAuth) {
  if ((mode === "Workspace bearer" || mode === "None") && Object.keys(headers).some((key) => key.toLowerCase() === "authorization"))
    return "Custom Authorization header";
  if (mode === "Workspace bearer") {
    if (!shared.enabled || !normalizeToken(shared.token)) return "No shared token";
    try { authHeaders(headers, mode, secret, keyName, shared); }
    catch { return "Shared bearer needs a valid token"; }
    return "Shared bearer applied";
  }
  if (mode === "None") return "No auth";
  try { authHeaders(headers, mode, secret, keyName, shared); }
  catch { return `${mode === "Bearer token" ? "Endpoint bearer" : mode} needs credentials`; }
  return mode === "Bearer token" ? "Endpoint bearer applied" : `${mode} applied`;
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
