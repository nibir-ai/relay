import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  KeyRound,
  Palette,
  RefreshCw,
} from "lucide-react";
import { savedTheme, themes, themeNames, type Theme } from "./themes";
import { api } from "./api";
import Operations from "./Operations";
import Playground from "./Playground";
import AuthPanel from "./AuthPanel";
import type {
  Endpoint,
  Health,
  PlaygroundDraft,
  Progress,
  SessionAuth,
  Snapshot,
  Workspace,
  EndpointAuth,
} from "./types";

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [workspace, setWorkspace] = useState<Workspace>({
    endpoints: {},
    activity: [],
  });
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState<Theme>(savedTheme);
  const [auth, setAuth] = useState<SessionAuth>({ token: "", enabled: false });
  const [authOpen, setAuthOpen] = useState(false);
  const [authEndpoint, setAuthEndpoint] = useState<Endpoint | null>(null);
  const [credentials, setCredentials] = useState<Record<string, EndpointAuth>>({});
  const [authFocus, setAuthFocus] = useState({ id: "", revision: 0 });
  const [autoSync, setAutoSync] = useState(false);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const [copied, setCopied] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const syncing = useRef(false);
  const statusRevision = useRef(0);
  const drafts = useRef(new Map<string, PlaygroundDraft>());
  function focusToken() {
    setAuthEndpoint(null);
    setAuthOpen(true);
  }
  function credentialKey(endpoint: Endpoint) {
    return `${endpoint.id}:${endpoint.fingerprint}`;
  }
  function endpointCredentials(endpoint: Endpoint): EndpointAuth {
    const key = credentialKey(endpoint);
    return credentials[key] ?? drafts.current.get(key) ?? {authType:"Workspace bearer",secret:"",keyName:"X-API-Key"};
  }
  function saveCredentials(endpoint: Endpoint, value: EndpointAuth) {
    setCredentials((previous) => ({ ...previous, [credentialKey(endpoint)]: value }));
  }
  function openEndpointAuth(endpoint: Endpoint) {
    setAuthEndpoint(endpoint);
    setAuthOpen(true);
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("relay-color-scheme", theme);
    } catch {
      /* Theme still applies without storage. */
    }
  }, [theme]);
  async function sync(background = false) {
    if (syncing.current) return;
    syncing.current = true;
    if (!background) setLoading(true);
    setError("");
    try {
      const session = await api.health();
      setHealth(session);
      const saved = await api.current();
      if (saved.snapshot)
        setSnapshot((previous) =>
          previous?.hash === saved.snapshot?.hash ? previous : saved.snapshot,
        );
      const data = await api.inspect(session.csrf_token);
      setSnapshot((previous) =>
        previous?.hash === data.hash ? previous : data,
      );
      setSelected((previous) =>
        previous && !data.endpoints.some((e) => e.id === previous)
          ? ""
          : previous,
      );
      setWorkspace(await api.workspace());
      setSyncedAt(new Date());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not discover the API. Check your backend and sync again.",
      );
    } finally {
      setLoading(false);
      syncing.current = false;
    }
  }
  useEffect(() => {
    void sync();
  }, []);
  useEffect(() => {
    document.title = snapshot?.title?.trim() ? `Relay - ${snapshot.title.trim()}` : "Relay";
  }, [snapshot?.title]);
  useEffect(() => {
    if (!health) return;
    let active = true;
    let pending = false;
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible" || syncing.current || saving || pending) return;
      pending = true;
      const revision = statusRevision.current;
      try {
        const next = await api.workspace();
        if (active && !syncing.current && revision === statusRevision.current) setWorkspace(next);
      } catch { /* Sync exposes persistent storage failures without interrupting request testing. */ }
      finally { pending = false; }
    }, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [health?.csrf_token, saving]);
  const syncRef = useRef(sync);
  syncRef.current = sync;
  useEffect(() => {
    if (!autoSync) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void syncRef.current(true);
    }, 10000);
    return () => clearInterval(timer);
  }, [autoSync]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (
        event.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          (event.target as HTMLElement).tagName,
        )
      ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, []);
  async function update(endpoint: Endpoint, progress: Progress) {
    if (!health || saving) return;
    statusRevision.current++;
    setSaving(true);
    setError("");
    try {
      setWorkspace(
        await api.update(
          health.csrf_token,
          endpoint.id,
          endpoint.fingerprint,
          progress,
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save status. Try again.",
      );
    } finally {
      statusRevision.current++;
      setSaving(false);
    }
  }
  async function copyServer() {
    try {
      await navigator.clipboard.writeText(health?.base_url ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError(
        "Clipboard unavailable. Select the server URL and copy it manually.",
      );
    }
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to APIs
      </a>
      <header className="topbar">
        <a className="brand" href="/relay" aria-label="Relay API reference">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-wordmark" aria-hidden="true" />
        </a>
        <span className="topbar-purpose">API reference</span>
        <div className="topbar-actions">
          <label className="theme-switch">
            <Palette size={15} />
            <select
              aria-label="Color scheme"
              value={theme}
              onChange={(e) => setTheme(e.target.value as Theme)}
            >
              {themes.map((t) => (
                <option key={t} value={t}>
                  {themeNames[t]}
                </option>
              ))}
            </select>
            <span className="palette-preview" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
          </label>
          <button
            className="secondary-button sync-button"
            disabled={loading}
            onClick={() => void sync()}
          >
            <RefreshCw size={15} className={loading ? "spinning" : ""} />
            {loading ? "Syncing…" : "Sync"}
          </button>
          <button
            className={`authorize-button ${auth.enabled && auth.token ? "authorized" : ""}`}
            aria-label="Authorize workspace"
            onClick={focusToken}
          >
            <KeyRound size={16} />
            {auth.enabled && auth.token ? "Authorized" : "Authorize"}
            {auth.enabled && auth.token && <Check size={14} />}
          </button>
        </div>
      </header>
      <main id="main-content" className="reference-page">
        <div className="api-intro">
          <div className="api-title">
            <h1>{snapshot?.title ?? "API reference"}</h1>
            {snapshot && <span className="version">{snapshot.version}</span>}
          </div>
          <div className="server-strip">
            <span className={`connection-dot ${health ? "" : "offline"}`} />
            <span>Server</span>
            <code>{health?.base_url ?? "Companion unavailable"}</code>
            {health && (
              <button
                className="icon-button"
                aria-label="Copy server URL"
                onClick={() => void copyServer()}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            )}
            <label className="auto-sync">
              <input
                type="checkbox"
                checked={autoSync}
                onChange={(e) => setAutoSync(e.target.checked)}
              />
              Auto refresh
            </label>
            <span className="last-sync">
              {syncedAt
                ? `Synced ${syncedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : ""}
            </span>
          </div>
        </div>
        {error && (
          <div className="error" role="alert">
            <strong>Unable to complete the action</strong>
            <p>{error}</p>
            {snapshot && (
              <small>
                Your last successful API contract is still available.
              </small>
            )}
          </div>
        )}
        <Operations
          snapshot={snapshot}
          workspace={workspace}
          selected={selected}
          select={setSelected}
          search={search}
          setSearch={setSearch}
          searchRef={searchRef}
          loading={loading}
          busy={saving}
          update={update}
          authorize={openEndpointAuth}
          authFocus={authFocus}
          authModes={Object.fromEntries((snapshot?.endpoints ?? []).map((endpoint) => [endpoint.id, endpointCredentials(endpoint).authType]))}
          render={(endpoint, focusAuth) =>
            health &&
            snapshot && (
              <Playground
                key={`${endpoint.id}:${endpoint.fingerprint}`}
                endpoint={endpoint}
                health={health}
                snapshot={snapshot}
                auth={auth}
                authorize={focusToken}
                useToken={(token) => setAuth({ token, enabled: true })}
                draftCache={drafts.current}
                focusAuth={focusAuth}
                credentials={credentials[credentialKey(endpoint)]}
                changeCredentials={(value) => saveCredentials(endpoint, value)}
                quickAuthorize={() => openEndpointAuth(endpoint)}
                inline
              />
            )
          }
        />
        <details className="connection-details">
          <summary>Connection details</summary>
          <dl>
            <dt>OpenAPI source</dt>
            <dd>{health?.spec_url ?? "Unavailable"}</dd>
            <dt>Runner</dt>
            <dd>
              {health?.version ?? "Unavailable"} · 20s timeout · 1 MiB request
              limit
            </dd>
            <dt>Team status</dt>
            <dd>{workspace.status_sync?.enabled ? workspace.status_sync.error ?? workspace.status_sync.state : "Local / Git file sharing"}</dd>
          </dl>
          <p>Connect a different backend from the command line:</p>
          <pre>python -m relay_backend --target http://127.0.0.1:9000</pre>
        </details>
      </main>
      {authOpen && <AuthPanel
        auth={authEndpoint ? {token: endpointCredentials(authEndpoint).authType === "Bearer token" ? endpointCredentials(authEndpoint).secret : "", enabled:true} : auth}
        endpoint={authEndpoint ?? undefined}
        close={() => setAuthOpen(false)}
        save={(value) => {
          if (authEndpoint) saveCredentials(authEndpoint, { ...endpointCredentials(authEndpoint), authType:"Bearer token",secret:value.token });
          else setAuth(value);
        }}
        useShared={authEndpoint ? () => saveCredentials(authEndpoint, { ...endpointCredentials(authEndpoint), authType:"Workspace bearer",secret:"" }) : undefined}
        advanced={authEndpoint ? () => {
          setAuthOpen(false);
          setSelected(authEndpoint.id);
          setAuthFocus((previous) => ({id:authEndpoint.id,revision:previous.revision+1}));
        } : undefined}
      />}
    </div>
  );
}
