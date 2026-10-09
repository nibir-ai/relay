import { createRef, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Operations from "./Operations";
import type { Endpoint, Progress, Snapshot, Workspace } from "./types";

afterEach(cleanup);
const endpoints = ["GET", "POST", "PUT", "PATCH", "DELETE"].map((method) => ({
  id: `${method} /items`,
  method,
  path: "/items",
  summary: `${method} items`,
  description: "",
  tags: ["Items"],
  security: [],
  parameters: [],
  requestBody: null,
  responses: {},
  fingerprint: "a".repeat(64),
  deprecated: false,
})) satisfies Endpoint[];
const snapshot: Snapshot = {
  title: "Test API",
  version: "1",
  hash: "test",
  endpoints,
  securitySchemes: {},
};
function Harness({
  update = vi.fn(),
  authorize = vi.fn(),
  workspace = { endpoints: {}, activity: [] },
}: {
  update?: (endpoint: Endpoint, progress: Progress) => void;
  authorize?: (endpoint: Endpoint) => void;
  workspace?: Workspace;
}) {
  const [selected, select] = useState("");
  const [search, setSearch] = useState("");
  return (
    <Operations
      snapshot={snapshot}
      workspace={workspace}
      selected={selected}
      select={select}
      search={search}
      setSearch={setSearch}
      searchRef={createRef()}
      loading={false}
      busy={false}
      update={update}
      authorize={authorize}
      render={(e) => <span>Test {e.method} request</span>}
    />
  );
}
it("closes and reopens API categories from the toolbar", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "POST /items POST items" }));
  fireEvent.click(screen.getByRole("button", { name: "Close all" }));
  expect(screen.getByRole("button", { name: "Items 5" })).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("Test POST request")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Open all" }));
  expect(screen.getByRole("button", { name: "Items 5" })).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("button", { name: "Close all" })).toBeVisible();
});
it("opens APIs in place and keeps status changes separate from expansion and testing", () => {
  const update = vi.fn();
  render(<Harness update={update} />);
  const post = screen.getByRole("button", { name: "POST /items POST items" });
  fireEvent.click(post);
  expect(post).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("Test POST request")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Status for POST /items"), {
    target: { value: "done" },
  });
  expect(update).toHaveBeenCalledWith(endpoints[1], "done");
  expect(post).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(post);
  expect(screen.queryByText("Test POST request")).not.toBeInTheDocument();
});
it("filters by HTTP method with each operation retaining its method color class", () => {
  render(<Harness />);
  for (const endpoint of endpoints)
    expect(
      screen.getByRole("button", {
        name: `${endpoint.method} /items ${endpoint.summary}`,
      }),
    ).toHaveTextContent(endpoint.method);
  fireEvent.change(screen.getByLabelText("Filter by method"), {
    target: { value: "PATCH" },
  });
  expect(
    screen
      .getByRole("button", { name: "PATCH /items PATCH items" })
      .closest("article"),
  ).toHaveClass("method-patch");
  expect(
    screen.queryByRole("button", { name: "GET /items GET items" }),
  ).not.toBeInTheDocument();
});
it("offers authentication beside every endpoint without expanding it or updating status", () => {
  const update = vi.fn();
  const authorize = vi.fn();
  render(<Harness update={update} authorize={authorize} />);
  expect(screen.getAllByRole("button", { name: /^Configure auth for / })).toHaveLength(5);
  fireEvent.click(screen.getByRole("button", { name: "Configure auth for POST /items" }));
  expect(authorize).toHaveBeenCalledWith(endpoints[1]);
  expect(screen.queryByText("Test POST request")).not.toBeInTheDocument();
  expect(screen.queryByText("Test GET request")).not.toBeInTheDocument();
  expect(update).not.toHaveBeenCalled();
});

it("defaults to Done and displays Git creator separately from status updater", () => {
  const endpoint = endpoints[0];
  const workspace: Workspace = {activity: [], endpoints: {
    [endpoint.id]: {endpoint_id:endpoint.id, fingerprint:endpoint.fingerprint,
      progress:"done", note:"", active:1, updated_at:"2026-10-08T00:00:00Z",
      updated_by:{name:"Status Editor",email:"status@example.test"},
      source:{state:"tracked",file:"routes.py",line:4,
        created_by:{name:"API Creator",email:"creator@example.test"},
        last_changed_by:{name:"Code Editor",email:"code@example.test"}}
    }
  }};
  render(<Harness workspace={workspace} />);
  expect(screen.getByLabelText("Status for POST /items")).toHaveValue("done");
  expect(screen.queryByText("Introduced by API Creator")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Filter by progress"),{target:{value:"done"}});
  expect(screen.getAllByRole("button",{name:/^Configure auth for /})).toHaveLength(5);
  fireEvent.click(screen.getByRole("button",{name:"GET /items GET items"}));
  expect(screen.getByText("Introduced by API Creator")).toBeVisible();
  expect(screen.getByText("Last committed change by Code Editor")).toBeVisible();
  expect(screen.getByText("Status updated by Status Editor")).toBeVisible();
});
