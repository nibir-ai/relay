import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, LockKeyhole, Search, X } from "lucide-react";
import { Method } from "./Explorer";
import { progressLabels, progressValues } from "./progress";
import type { Endpoint, Progress, Snapshot, Workspace } from "./types";

export default function Operations({
  snapshot,
  workspace,
  selected,
  select,
  search,
  setSearch,
  searchRef,
  loading,
  busy,
  update,
  render,
  authorize,
  authModes = {},
  authFocus = { id: "", revision: 0 },
}: {
  snapshot: Snapshot | null;
  workspace: Workspace;
  selected: string;
  select: (id: string) => void;
  search: string;
  setSearch: (value: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  loading: boolean;
  busy: boolean;
  update: (endpoint: Endpoint, progress: Progress) => void;
  render: (endpoint: Endpoint, focusAuth: number) => ReactNode;
  authorize: (endpoint: Endpoint) => void;
  authModes?: Record<string, string>;
  authFocus?: { id: string; revision: number };
}) {
  const [method, setMethod] = useState("all");
  const [progress, setProgress] = useState<Progress | "all">("all");
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const endpoints =
    snapshot?.endpoints.filter(
      (e) =>
        `${e.method} ${e.path} ${e.summary} ${e.tags.join(" ")}`
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (method === "all" || e.method === method) &&
        (progress === "all" ||
          (workspace.endpoints[e.id]?.progress ?? "done") === progress),
    ) ?? [];
  const groups = new Map<string, Endpoint[]>();
  for (const endpoint of endpoints) {
    const tag = endpoint.tags[0] ?? "Default";
    groups.set(tag, [...(groups.get(tag) ?? []), endpoint]);
  }
  const allClosed = groups.size > 0 && [...groups.keys()].every((tag) => collapsed.has(tag));
  function toggle(tag: string) {
    setCollapsed((previous) => {
      const next = new Set(previous);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  }
  return (
    <>
      <div className="operation-toolbar">
        <label className="search">
          <Search size={17} />
          <input
            ref={searchRef}
            aria-label="Search endpoints"
            placeholder="Search endpoints…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search ? (
            <button aria-label="Clear search" onClick={() => setSearch("")}>
              <X size={15} />
            </button>
          ) : (
            <kbd>/</kbd>
          )}
        </label>
        <select
          aria-label="Filter by method"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
        >
          <option value="all">All methods</option>
          {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map(
            (m) => (
              <option key={m}>{m}</option>
            ),
          )}
        </select>
        <select
          aria-label="Filter by progress"
          value={progress}
          onChange={(e) => setProgress(e.target.value as Progress | "all")}
        >
          <option value="all">All statuses</option>
          {progressValues.map((p) => (
            <option key={p} value={p}>
              {progressLabels[p]}
            </option>
          ))}
        </select>
        <span className="operation-count">{endpoints.length} endpoints</span>
        <button
          className="secondary-button collapse-all"
          disabled={!groups.size}
          title={allClosed ? "Open all API categories" : "Close all API categories"}
          onClick={() => {
            if (!allClosed) select("");
            setCollapsed((previous) => {
              const next = new Set(previous);
              for (const tag of groups.keys()) {
                if (allClosed) next.delete(tag);
                else next.add(tag);
              }
              return next;
            });
          }}
        >
          {allClosed ? <ChevronsUpDown size={16} /> : <ChevronsDownUp size={16} />}
          {allClosed ? "Open all" : "Close all"}
        </button>
      </div>
      {loading && !snapshot ? (
        <div className="list-skeleton" aria-label="Loading API">
          <span />
          <span />
          <span />
        </div>
      ) : !endpoints.length ? (
        <div className="empty-list">
          <h2>{snapshot ? "No matching endpoints" : "No API loaded"}</h2>
          <p>
            {snapshot
              ? "Try another search or clear the filters."
              : "Start your backend, then use Sync to load its OpenAPI contract."}
          </p>
          {snapshot && (
            <button
              className="secondary-button"
              onClick={() => {
                setSearch("");
                setMethod("all");
                setProgress("all");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        [...groups].map(([tag, routes]) => (
          <section className="api-category" key={tag}>
            <h2>
              <button
                className="category-heading"
                aria-expanded={!collapsed.has(tag)}
                onClick={() => toggle(tag)}
              >
                <span>
                  {tag}
                  <small>{routes.length}</small>
                </span>
                <ChevronDown
                  size={18}
                  className={collapsed.has(tag) ? "is-collapsed" : ""}
                />
              </button>
            </h2>
            {!collapsed.has(tag) &&
              routes.map((endpoint) => {
                const meta = workspace.endpoints[endpoint.id];
                const status = meta?.progress ?? "done";
                const open = selected === endpoint.id;
                return (
                  <article
                    className={`operation method-${endpoint.method.toLowerCase()} ${open ? "is-expanded" : ""}`}
                    key={endpoint.id}
                  >
                    <div className="operation-row">
                      <button
                        className="operation-toggle"
                        aria-expanded={open}
                        aria-controls={`operation-${encodeURIComponent(endpoint.id)}`}
                        onClick={() => {
                          select(open ? "" : endpoint.id);
                        }}
                      >
                        <Method method={endpoint.method} />
                        <span className="operation-heading" title={meta?.source?.created_by ? `Introduced by ${meta.source.created_by.name}` : undefined}>
                          <code>{endpoint.path}</code>
                        </span>
                        <span className="operation-summary">
                          {endpoint.summary}
                        </span>
                        <ChevronDown
                          size={17}
                          className={open ? "" : "is-collapsed"}
                        />
                      </button>
                      <button
                        className={`endpoint-auth-button ${authModes[endpoint.id] && authModes[endpoint.id] !== "Workspace bearer" ? "has-override" : ""}`}
                        aria-label={`Configure auth for ${endpoint.method} ${endpoint.path}`}
                        title={authModes[endpoint.id] ?? (endpoint.security.length ? "Authentication required" : "Use shared bearer or override for this endpoint")}
                        onClick={() => authorize(endpoint)}
                      >
                        <LockKeyhole size={14} />
                        {authModes[endpoint.id] === "None" ? "No auth" : authModes[endpoint.id] === "Bearer token" ? "Bearer" : authModes[endpoint.id] === "API key" ? "API key" : authModes[endpoint.id] === "Basic" ? "Basic" : "Auth"}
                      </button>
                      <label className={`progress-select ${status}`}>
                        <span className={`progress-dot ${status}`} />
                        <select
                          aria-label={`Status for ${endpoint.method} ${endpoint.path}`}
                          value={status}
                          disabled={busy}
                          onChange={(e) =>
                            update(endpoint, e.target.value as Progress)
                          }
                        >
                          {progressValues.map((p) => (
                            <option key={p} value={p}>
                              {progressLabels[p]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {open && (
                      <div
                        className="operation-content"
                        id={`operation-${encodeURIComponent(endpoint.id)}`}
                      >
                        <div className="operation-description">
                          <p>{endpoint.description || endpoint.summary}</p>
                          {meta?.updated_by && (
                            <small>
                              {meta.contract_changed
                                ? "Previous status by"
                                : "Status updated by"}{" "}
                              {meta.updated_by.name}
                            </small>
                          )}
                        </div>
                        {meta?.source && <div className="operation-source">
                          {meta.source.created_by && <span>Introduced by {meta.source.created_by.name}</span>}
                          {!meta.source.created_by && <span>{meta.source.state === "uncommitted" ? "Not committed" : "Git author unavailable"}</span>}
                          {meta.source.last_changed_by && <span>Last committed change by {meta.source.last_changed_by.name}</span>}
                          {meta.source.state === "uncommitted" && <span>Uncommitted changes</span>}
                          {meta.source.file && <code title={meta.source.commit}>{meta.source.file}:{meta.source.line}</code>}
                        </div>}
                        {render(endpoint, authFocus.id === endpoint.id ? authFocus.revision : 0)}
                      </div>
                    )}
                  </article>
                );
              })}
          </section>
        ))
      )}
    </>
  );
}
