import type {
  Health,
  LiveResponse,
  RequestPayload,
  Snapshot,
  Workspace,
  Progress,
} from "./types";

async function request<T>(
  path: string,
  token?: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(new URL(`__relay/${path}`, document.baseURI), {
    method: token ? "POST" : "GET",
    headers: token
      ? { "Content-Type": "application/json", "X-Relay-CSRF": token }
      : {},
    ...(token ? { body: JSON.stringify(body ?? {}) } : {}),
  });
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error(
      "Relay is unavailable. Reload this page or check your backend logs.",
    );
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      typeof result.detail === "string"
        ? result.detail
        : "The runner rejected this request. Check your inputs.",
    );
  return result as T;
}
export const api = {
  health: () => request<Health>("health"),
  inspect: (token: string) => request<Snapshot>("sources/inspect", token),
  current: () => request<{ snapshot: Snapshot | null }>("sources/current"),
  execute: (token: string, payload: RequestPayload) =>
    request<LiveResponse>("execute", token, payload),
  workspace: () => request<Workspace>("workspace"),
  update: (
    token: string,
    endpoint_id: string,
    fingerprint: string,
    progress?: Progress,
    note?: string,
  ) =>
    request<Workspace>("endpoints/update", token, {
      endpoint_id,
      fingerprint,
      progress,
      note,
    }),
};