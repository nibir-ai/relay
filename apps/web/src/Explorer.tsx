import {
  ChevronDown,
  Search,
  Radio,
  X,
  SlidersHorizontal,
  LockKeyhole,
} from "lucide-react";
import { useState } from "react";
import { progressLabels, progressValues } from "./progress";
import type {
  Endpoint,
  Health,
  Progress,
  RunSummary,
  Snapshot,
  Workspace,
} from "./types";

type Props = {
  snapshot: Snapshot | null;
  health: Health | null;
  workspace: Workspace;
  runs: Record<string, RunSummary>;
  selected: string;
  select: (id: string) => void;
  search: string;
  setSearch: (value: string) => void;
  filter: Progress | "all";
  setFilter: (value: Progress | "all") => void;
  loading: boolean;
  open: boolean;
  mobile: boolean;
  close: () => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
};
export function Method({ method }: { method: string }) {
  return (
    <span className={`method method-${method.toLowerCase()}`}>{method}</span>
  );
}
export default function Explorer({
  snapshot,
  health,
  workspace,
  runs,
  selected,
  select,
  search,
  setSearch,
  filter,
  setFilter,
  loading,
  open,
  mobile,
  close,
  searchRef,
}: Props) {
  const [method, setMethod] = useState("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const endpoints =
    snapshot?.endpoints.filter(
      (e) =>
        `${e.method} ${e.path} ${e.summary} ${e.tags.join(" ")}`
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (filter === "all" ||
          (workspace.endpoints[e.id]?.progress ?? "done") === filter) &&
        (method === "all" || e.method === method),
    ) ?? [];
  const groups = new Map<string, Endpoint[]>();
  for (const endpoint of endpoints)
    groups.set(endpoint.tags[0], [
      ...(groups.get(endpoint.tags[0]) ?? []),
      endpoint,
    ]);
  function toggle(tag: string) {
    setCollapsed((previous) => {
      const next = new Set(previous);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  }
  return (
    <aside
      inert={mobile && !open}
      aria-hidden={mobile && !open}
      className={`explorer ${open ? "is-open" : ""}`}
    >
      <div className="explorer-header">
        <div>
          <span className="eyebrow">LOCAL WORKSPACE</span>
          <strong>{snapshot?.title ?? "Connect an API"}</strong>
          <code>{health?.base_url ?? "127.0.0.1:8000"}</code>
        </div>
        <button
          className="icon-button mobile-only"
          aria-label="Close explorer"
          onClick={close}
        >
          <X size={18} />
        </button>
      </div>
      <label className="search">
        <Search size={16} />
        <input
          ref={searchRef}
          aria-label="Search endpoints"
          placeholder="Search endpoints"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <kbd>/</kbd>
      </label>
      <div className="explorer-filters">
        <SlidersHorizontal size={13} />
        <select
          aria-label="Filter by progress"
          value={filter}
          onChange={(e) => setFilter(e.target.value as Progress | "all")}
        >
          <option value="all">All progress</option>
          {progressValues.map((value) => (
            <option key={value} value={value}>
              {progressLabels[value]}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by method"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
        >
          <option value="all">All methods</option>
          {[...new Set(snapshot?.endpoints.map((e) => e.method))].map(
            (value) => (
              <option key={value}>{value}</option>
            ),
          )}
        </select>
      </div>
      <div className="nav-label">
        <span>Endpoints</span>
        <span>{endpoints.length}</span>
      </div>
      <div className="endpoint-groups">
        {loading && !snapshot ? (
          <div className="list-skeleton">
            <span />
            <span />
            <span />
          </div>
        ) : !endpoints.length ? (
          <div className="empty-list">
            <Search size={20} />
            <p>
              {snapshot
                ? "No matching endpoints."
                : "Your endpoints will appear here."}
            </p>
            {snapshot && (
              <button
                className="text-button"
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                  setMethod("all");
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          [...groups].map(([tag, routes]) => (
            <section key={tag}>
              <button
                className="tag-heading"
                aria-expanded={!collapsed.has(tag)}
                onClick={() => toggle(tag)}
              >
                <ChevronDown
                  size={14}
                  className={collapsed.has(tag) ? "is-collapsed" : ""}
                />
                <span>{tag}</span>
                <small>{routes.length}</small>
              </button>
              {!collapsed.has(tag) &&
                routes.map((endpoint) => (
                  <button
                    key={endpoint.id}
                    className={`endpoint-row ${selected === endpoint.id ? "selected" : ""}`}
                    aria-current={selected === endpoint.id ? "page" : undefined}
                    onClick={() => {
                      select(endpoint.id);
                      close();
                    }}
                  >
                    <div>
                      <Method method={endpoint.method} />
                      <code>{endpoint.path}</code>
                      {endpoint.security.length > 0 && (
                        <LockKeyhole size={11} />
                      )}
                    </div>
                    <div className="endpoint-row-bottom">
                      <small>{endpoint.summary}</small>
                      <span
                        className={`progress-dot ${workspace.endpoints[endpoint.id]?.progress ?? "done"}`}
                        role="img"
                        aria-label={
                          progressLabels[
                            workspace.endpoints[endpoint.id]?.progress ??
                              "done"
                          ]
                        }
                        title={
                          progressLabels[
                            workspace.endpoints[endpoint.id]?.progress ??
                              "done"
                          ]
                        }
                      />
                    </div>
                    {runs[endpoint.id] && (
                      <div className="endpoint-last-run">
                        <span
                          className={
                            runs[endpoint.id].status &&
                            runs[endpoint.id].status! < 400
                              ? "status-success"
                              : "status-error"
                          }
                        >
                          {runs[endpoint.id].status ?? "Network error"}
                        </span>
                        <span>
                          {runs[endpoint.id].duration_ms !== undefined
                            ? `${runs[endpoint.id].duration_ms} ms`
                            : "Check connection"}
                        </span>
                      </div>
                    )}
                  </button>
                ))}
            </section>
          ))
        )}
      </div>
      <div className="sidebar-foot">
        <Radio size={16} />
        <div>
          <strong>
            {health ? "Companion connected" : "Companion unavailable"}
          </strong>
          <small>Requests stay on this machine</small>
        </div>
        <span className={`connection-dot ${health ? "" : "offline"}`} />
      </div>
    </aside>
  );
}
