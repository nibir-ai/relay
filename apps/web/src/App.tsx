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
import MigrationPanel from "./MigrationPanel";
import type { NoteDraft } from "./Handoff";
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
  const [migrationOpen, setMigrationOpen] = useState(false);
  const [authEndpoint, setAuthEndpoint] = useState<Endpoint | null>(null);
  const [credentials, setCredentials] = useState<Record<string, EndpointAuth>>({});
  const [authFocus, setAuthFocus] = useState({ id: "", revision: 0 });
  const [autoSync, setAutoSync] = useState(false);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const [copied, setCopied] = useState(false);
  const [workspaceError, setWorkspaceError] = useState("");
  const [schemaState, setSchemaState] = useState("Checking");
  const [schemaChanges, setSchemaChanges] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const syncing = useRef(false);
  const statusRevision = useRef(0);
  const savingRef = useRef(false);
  const noteDrafts = useRef(new Map<string, NoteDraft>());
  const snapshotRef = useRef<Snapshot | null>(null);
  snapshotRef.current = snapshot;
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
    if (syncing.current || savingRef.current) return;
    syncing.current = true;
    if (!background) setLoading(true);
    setError("");
    setSchemaState("Checking");
    try {
      const session = await api.health();
      setHealth(session);
      const saved = await api.current();
      if (saved.snapshot)
        setSnapshot((previous) =>
          previous?.hash === saved.snapshot?.hash ? previous : saved.snapshot,
        );
      const data = await api.inspect(session.csrf_token);
      const previous = snapshotRef.current;
      if (previous) {
        const prior = new Map(previous.endpoints.map(endpoint => [endpoint.id, endpoint.fingerprint]));
        const next = new Set(data.endpoints.map(endpoint => endpoint.id));
        const added = data.endpoints.filter(endpoint => !prior.has(endpoint.id)).length;
        const changed = data.endpoints.filter(endpoint => prior.has(endpoint.id) && prior.get(endpoint.id) !== endpoint.fingerprint).length;
        const removed = previous.endpoints.filter(endpoint => !next.has(endpoint.id)).length;
        setSchemaChanges(`${added} added · ${changed} changed · ${removed} removed`);
      }
      setSnapshot((previous) =>
        previous?.hash === data.hash ? previous : data,
      );
      setSelected((previous) =>
        previous && !data.endpoints.some((e) => e.id === previous)
          ? ""
          : previous,
      );
      const revision = statusRevision.current;
      const nextWorkspace = await api.workspace();
      if (revision === statusRevision.current) setWorkspace(nextWorkspace);
      setWorkspaceError("");
      setSyncedAt(new Date());
      setSchemaState("Synced");
    } catch (err) {
      setSchemaState("Error");
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
        if (active && !syncing.current && revision === statusRevision.current) { setWorkspace(next); setWorkspaceError(""); }
      } catch { if (active) setWorkspaceError("Status refresh unavailable. Local testing remains usable; retry to reconnect."); }
      finally { pending = false; }
    }, workspace.status_sync?.mode === "realtime" ? 1000 : 5000);
    return () => { active = false; clearInterval(timer); };
  }, [health?.csrf_token, saving, workspace.status_sync?.mode]);
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
    try { await saveMetadata(endpoint, progress); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not save status. Try again."); }
  }
  async function saveMetadata(endpoint: Endpoint, progress?: Progress, note?: string) {
    if (!health || savingRef.current || syncing.current) throw new Error("A sync or save is in progress. Your edit is retained; try again shortly.");
    savingRef.current = true;
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
          note,
          workspace.endpoints[endpoint.id]?.team_revision,
        ),
      );
    } catch (err) {
      if (progress !== undefined) {
        try { setWorkspace(await api.workspace()); }
        catch { /* Preserve the last acknowledged workspace during an outage. */ }
      }
      throw err;
    } finally {
      savingRef.current = false;
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
  async function retryStatuses() {
    if (!health || savingRef.current || syncing.current) return;
    const revision = ++statusRevision.current;
    try {
      const next = await api.retrySync(health.csrf_token);
      if (revision === statusRevision.current) { setWorkspace(next); setWorkspaceError(""); }
    } catch { setWorkspaceError("Could not retry team status sync. Check the backend connection and project access."); }
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
        <div className="sync-status" aria-live="polite">
          <span>Schema: {schemaState}{schemaChanges && ` · ${schemaChanges}`}</span>
          <span>Team statuses{workspace.status_sync?.mode && workspace.status_sync.mode !== "local" ? ` (${workspace.status_sync.mode})` : ""}: {workspaceError ? "Unavailable" : workspace.status_sync?.enabled ? workspace.status_sync.state : "Automatic sync disabled"}
            {workspace.status_sync?.last_synced_at && ` · Last synced ${new Date(workspace.status_sync.last_synced_at).toLocaleTimeString()}`}</span>
          {workspace.status_sync?.mode === "realtime" && workspace.status_sync.can_write === true && <button className="text-button" disabled={loading || saving} onClick={()=>setMigrationOpen(true)}>Import Git statuses</button>}
          {workspace.status_sync?.can_write === false && <span>Read-only project access</span>}
          {(workspaceError || workspace.status_sync?.error) && <p className="auth-error">{workspaceError || workspace.status_sync?.error}</p>}
          {(schemaState === "Error" || workspaceError || workspace.status_sync?.error) && <button className="text-button" disabled={loading || saving} onClick={() => void sync()}>Retry refresh</button>}
          {workspace.status_sync?.enabled && <button className="text-button" disabled={loading || saving || workspace.status_sync.state === "syncing"} onClick={() => void retryStatuses()}>Sync team statuses</button>}
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
          noteDrafts={noteDrafts.current}
          saveNote={(endpoint, note) => saveMetadata(endpoint, undefined, note)}
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
                progress={workspace.endpoints[endpoint.id]?.progress ?? "done"}
                changedBy={workspace.endpoints[endpoint.id]?.updated_by?.name}
                authorize={focusToken}
                useToken={(token) => setAuth({ token, enabled: true })}
                draftCache={drafts.current}
                focusAuth={focusAuth}
                credentials={credentials[credentialKey(endpoint)]}
                changeCredentials={(value) => saveCredentials(endpoint, value)}
                quickAuthorize={() => openEndpointAuth(endpoint)}
                inline
                keyboardEnabled={!authOpen && !migrationOpen}
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
      {migrationOpen && health && <MigrationPanel token={health.csrf_token} close={()=>setMigrationOpen(false)} changed={async()=>{statusRevision.current++;setWorkspace(await api.workspace());}} />}
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
