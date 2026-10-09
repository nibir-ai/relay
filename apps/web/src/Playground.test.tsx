import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Playground from "./Playground";
import { api } from "./api";
import type { Endpoint, Health, Snapshot, PlaygroundDraft } from "./types";

vi.mock("./api", () => ({ api: { execute: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const endpoint: Endpoint = {
  id: "POST /login",
  method: "POST",
  path: "/login",
  summary: "Login",
  description: "",
  tags: ["Auth"],
  deprecated: false,
  parameters: [],
  security: [],
  fingerprint: "abc",
  responses: { "200": { description: "Success" } },
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            email: { type: "string", examples: ["alex@example.com"] },
          },
          required: ["email"],
        },
      },
    },
  },
};
const health: Health = {
  mode: "local",
  csrf_token: "token",
  base_url: "http://127.0.0.1:8000",
  spec_url: "http://127.0.0.1:8000/openapi.json",
  version: "0.1",
};
const snapshot: Snapshot = {
  title: "Demo",
  version: "0.1",
  endpoints: [endpoint],
  hash: "abc",
  securitySchemes: {},
};
it("renders generated inputs and inspects genuine non-2xx responses without marking Ready", async () => {
  vi.mocked(api.execute).mockResolvedValue({
    status: 401,
    reason: "Unauthorized",
    body: '{"detail":"Invalid credentials"}',
    headers: { "content-type": "application/json" },
    duration_ms: 2,
    bytes: 32,
    truncated: false,
    content_type: "application/json",
    url: "http://127.0.0.1:8000/login",
    method: "POST",
  });
  render(
    <Playground endpoint={endpoint} health={health} snapshot={snapshot} />,
  );
  expect(screen.getByLabelText("email")).toHaveValue("alex@example.com");
  fireEvent.click(screen.getByRole("button", { name: /Execute request/ }));
  expect(await screen.findByText("401 Unauthorized")).toBeInTheDocument();
  expect(screen.getByLabelText("Endpoint progress")).toHaveValue("done");
  fireEvent.click(screen.getByRole("button", { name: "Focus response" }));
  expect(screen.getByLabelText("email")).not.toBeVisible();
  expect(screen.getByRole("tabpanel", { name: "Body response" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Wrap lines" }));
  expect(screen.getByRole("tabpanel", { name: "Body response" })).toHaveClass("wrap-lines");
  fireEvent.click(screen.getByRole("button", { name: "Back to request" }));
  expect(screen.getByLabelText("email")).toBeVisible();
  expect(screen.getByLabelText("email")).toHaveValue("alex@example.com");
});
it("does not call execution for invalid JSON", async () => {
  render(
    <Playground endpoint={endpoint} health={health} snapshot={snapshot} />,
  );
  fireEvent.change(screen.getByLabelText("Request body"), {
    target: { value: "{" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Execute request/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Invalid JSON");
  expect(api.execute).not.toHaveBeenCalled();
});
it("keeps the last captured response when the next request has invalid inputs", async () => {
  vi.mocked(api.execute).mockResolvedValue({ status: 204, reason: "No Content", body: "", headers: {}, duration_ms: 1, bytes: 0, truncated: false, content_type: "", url: health.base_url + "/login", method: "POST" });
  render(<Playground endpoint={endpoint} health={health} snapshot={snapshot} />);
  fireEvent.click(screen.getByRole("button", { name: /Execute request/ }));
  await screen.findByText("204 No Content");
  expect(screen.getByText("Empty response body")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Request body"), { target: { value: "{" } });
  fireEvent.click(screen.getByRole("button", { name: /Execute request/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Invalid JSON");
  expect(screen.getByText("204 No Content")).toBeInTheDocument();
  expect(api.execute).toHaveBeenCalledTimes(1);
});
it("isolates endpoint credentials from shared auth and restores them after switching endpoints", async () => {
  const shared = { token: "user-token", enabled: true };
  const cache = new Map<string, PlaygroundDraft>();
  vi.mocked(api.execute).mockResolvedValue({
    status: 200, reason: "OK", body: "{}", headers: {}, duration_ms: 1,
    bytes: 2, truncated: false, content_type: "application/json",
    url: "http://127.0.0.1:8000/login", method: "POST",
  });
  const props = { health, snapshot, auth: shared, draftCache: cache };
  const first = render(<Playground {...props} endpoint={endpoint} />);
  fireEvent.change(screen.getByLabelText("Authentication"), { target: { value: "Bearer token" } });
  fireEvent.change(screen.getByLabelText("Endpoint bearer token"), { target: { value: "Bearer admin-token" } });
  fireEvent.click(screen.getByRole("button", { name: "Execute request" }));
  await screen.findByText("200 OK");
  expect(vi.mocked(api.execute).mock.calls[0][1].headers.Authorization).toBe("Bearer admin-token");
  first.unmount();
  const second = render(<Playground {...props} endpoint={{ ...endpoint, id: "GET /me", method: "GET", path: "/me", requestBody: null }} />);
  fireEvent.click(screen.getByRole("button", { name: "Execute request" }));
  await screen.findByText("200 OK");
  expect(vi.mocked(api.execute).mock.calls[1][1].headers.Authorization).toBe("Bearer user-token");
  second.unmount();
  render(<Playground {...props} endpoint={endpoint} />);
  expect(screen.getByLabelText("Authentication")).toHaveValue("Bearer token");
  expect(screen.getByLabelText("Endpoint bearer token")).toHaveValue("Bearer admin-token");
  expect(shared).toEqual({ token: "user-token", enabled: true });
});
