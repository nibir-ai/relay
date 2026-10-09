import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  LockKeyhole,
  Play,
  RotateCcw,
  Terminal,
  Zap,
  FileText,
  KeyRound,
  Code2,
  Maximize2,
  Minimize2,
  Download,
} from "lucide-react";
import { api } from "./api";
import ResponseText from "./ResponseText";
import { downloadExport, endpointExport, exportFilename } from "./export";
import { Method } from "./Explorer";
import {
  bodyExample,
  formatted,
  makeRequest,
  snippets,
  parseHeaders,
  requestUrl,
  parameterInput,
} from "./request";
import { authHeaders, authSummary, responseToken } from "./auth";
import { progressLabels, progressValues } from "./progress";
import type {
  Endpoint,
  Health,
  LiveResponse,
  Schema,
  Snapshot,
  Progress,
  SessionAuth,
  RunSummary,
  PlaygroundDraft,
  EndpointAuth,
} from "./types";

export default function Playground({
  endpoint,
  health,
  snapshot,
  auth = { token: "", enabled: false },
  authorize,
  useToken,
  progress = "done",
  updateProgress,
  progressBusy = false,
  changedBy,
  onRun,
  draftCache,
  keyboardEnabled = true,
  inline = false,
  focusAuth = 0,
  credentials,
  changeCredentials,
  quickAuthorize,
}: {
  endpoint: Endpoint;
  health: Health;
  snapshot: Snapshot;
  auth?: SessionAuth;
  authorize?: () => void;
  useToken?: (token: string) => void;
  progress?: Progress;
  updateProgress?: (progress: Progress) => void;
  progressBusy?: boolean;
  changedBy?: string;
  onRun?: (summary: RunSummary) => void;
  draftCache?: Map<string, PlaygroundDraft>;
  keyboardEnabled?: boolean;
  inline?: boolean;
  focusAuth?: number;
  credentials?: EndpointAuth;
  changeCredentials?: (value: EndpointAuth) => void;
  quickAuthorize?: () => void;
}) {
  const cacheKey = `${endpoint.id}:${endpoint.fingerprint}`;
  const draft = draftCache?.get(cacheKey);
  const [responseTab, setResponseTab] = useState("Body");
  const [responseFocused, setResponseFocused] = useState(false);
  const [wrapResponse, setWrapResponse] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(
    () =>
      draft?.values ??
      Object.fromEntries(
        endpoint.parameters.map((p) => [
          `${p.in}:${p.name}`,
          parameterInput(
            p.example ?? p.schema?.default ?? p.schema?.examples?.[0] ?? "",
          ),
        ]),
      ),
  );
  const mediaTypes = Object.keys(endpoint.requestBody?.content ?? {});
  const [mediaType, setMediaType] = useState(
    draft?.mediaType ?? mediaTypes[0] ?? "application/json",
  );
  const media = endpoint.requestBody?.content[mediaType];
  const [body, setBody] = useState(
    () => draft?.body ?? bodyExample(media, mediaType),
  );
  const [localAuthType, setLocalAuthType] = useState(
    draft?.authType ?? "Workspace bearer",
  );
  const authSelect = useRef<HTMLSelectElement>(null);
  const authDetails = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (focusAuth) {
      if (authDetails.current) authDetails.current.open = true;
      authSelect.current?.focus({ preventScroll: true });
      authSelect.current?.closest(".request-auth")?.scrollIntoView({ block: "center", behavior: "instant" });
    }
  }, [focusAuth]);
  const [localSecret, setLocalSecret] = useState(draft?.secret ?? "");
  const [localKeyName, setLocalKeyName] = useState(draft?.keyName ?? "X-API-Key");
  const authType = credentials?.authType ?? localAuthType;
  const secret = credentials?.secret ?? localSecret;
  const keyName = credentials?.keyName ?? localKeyName;
  function setAuthType(value: string) {
    if (changeCredentials) changeCredentials({ authType: value, secret, keyName });
    else setLocalAuthType(value);
  }
  function setSecret(value: string) {
    if (changeCredentials) changeCredentials({ authType, secret: value, keyName });
    else setLocalSecret(value);
  }
  function setKeyName(value: string) {
    if (changeCredentials) changeCredentials({ authType, secret, keyName: value });
    else setLocalKeyName(value);
  }
  const [headerText, setHeaderText] = useState(draft?.headerText ?? "{}");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [response, setResponse] = useState<LiveResponse | null>(
    draft?.response ?? null,
  );
  const [responseAt, setResponseAt] = useState<string | null>(
    draft?.responseAt ?? null,
  );
  const [codeType, setCodeType] = useState<"fetch" | "curl">("fetch");
  const [copied, setCopied] = useState("");
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exportMenu = useRef<HTMLDetailsElement>(null);
  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );
  const executeRef = useRef<() => void>(() => {});
  const executing = useRef(false);
  useEffect(() => {
    draftCache?.delete(cacheKey);
    draftCache?.set(cacheKey, {
      values,
      body,
      mediaType,
      authType,
      secret,
      keyName,
      headerText,
      response,
      responseAt,
    });
    if (draftCache && draftCache.size > 20) {
      const oldest = draftCache.keys().next().value;
      if (oldest) draftCache.delete(oldest);
    }
  }, [
    draftCache,
    cacheKey,
    values,
    body,
    mediaType,
    authType,
    secret,
    keyName,
    headerText,
    response,
    responseAt,
  ]);
  const keyboardRef = useRef(keyboardEnabled);
  keyboardRef.current = keyboardEnabled;
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if (
        keyboardRef.current &&
        !(event.target instanceof Element && event.target.closest('dialog')) &&
        (event.ctrlKey || event.metaKey) &&
        event.key === "Enter"
      ) {
        event.preventDefault();
        executeRef.current();
      }
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, []);
  const schema = media?.schema;
  const schemaUnsupported = (schema: Schema | undefined): boolean =>
    !!schema &&
    (!!schema.$ref ||
      !!schema["x-relay-warning"] ||
      !!schema.anyOf ||
      !!schema.allOf ||
      !!schema.oneOf ||
      Object.values(schema.properties ?? {}).some(schemaUnsupported) ||
      schemaUnsupported(schema.items));
  async function execute() {
    if (executing.current) return;
    setError("");
    try {
      const parsed = parseHeaders(headerText);
      const headers = authHeaders(
        parsed as Record<string, string>,
        authType,
        secret,
        keyName,
        auth,
      );
      const payload = makeRequest(endpoint, values, body, mediaType, headers);
      setRunning(true);
      executing.current = true;
      const result = await api.execute(health.csrf_token, payload);
      setResponse(result);
      const at = new Date().toISOString();
      setResponseAt(at);
      onRun?.({
        endpoint_id: endpoint.id,
        status: result.status,
        duration_ms: result.duration_ms,
        at,
        outcome: "response",
      });
      setResponseTab("Body");
    } catch (err) {
      if (executing.current)
        onRun?.({
          endpoint_id: endpoint.id,
          at: new Date().toISOString(),
          outcome: "network_error",
        });
      setError(
        err instanceof Error
          ? err.message
          : "Request failed. Please try again.",
      );
    } finally {
      setRunning(false);
      executing.current = false;
    }
  }
  executeRef.current = () => {
    void execute();
  };
  async function copy(text: string, control: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(control);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(""), 1800);
    } catch {
      setError("Clipboard access failed. Select and copy the text manually.");
    }
  }
  function updateField(name: string, value: unknown) {
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        setBody(JSON.stringify({ ...parsed, [name]: value }, null, 2));
    } catch {
      setError("Fix the JSON before editing generated fields.");
    }
  }
  let parsedBody: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      parsedBody = parsed;
  } catch {
    /* validation occurs before execution */
  }
  const fields = Object.entries(schema?.properties ?? {}).filter(([, field]) => !field.readOnly);
  let authentication = "Check request headers";
  try { authentication = authSummary(parseHeaders(headerText), authType, secret, keyName, auth); } catch { /* execution explains invalid headers */ }
  const headersCount = (() => {
    try { return Object.keys(parseHeaders(headerText)).length; } catch { return 0; }
  })();
  let code = "Fill in the required request inputs to generate a snippet.";
  try {
      const headers = authHeaders(
        parseHeaders(headerText),
        authType,
        secret,
        keyName,
        auth,
      );
      code = snippets(
        makeRequest(endpoint, values, body, mediaType, headers),
        health.base_url,
      )[codeType];
    } catch {
      /* execution provides actionable validation */
    }
  const foundToken =
    response && response.status >= 200 && response.status < 300
      ? responseToken(response.body)
      : null;
  const responseText = response
    ? responseTab === "Body"
      ? formatted(response.body)
      : responseTab === "Raw"
        ? response.body
        : responseTab === "Headers"
          ? JSON.stringify(response.headers, null, 2)
          : JSON.stringify(
              {
                method: response.method,
                url: response.url,
                duration_ms: response.duration_ms,
                environment: "Local API",
                runner: "This machine",
              },
              null,
              2,
            )
    : "";
  return (
    <>
      {!inline && (
        <div className="endpoint-heading">
          <div className="title-row">
            <h1>{endpoint.summary}</h1>
            <div className="endpoint-actions">
              <label className={`progress-select ${progress}`}>
                <span className={`progress-dot ${progress}`} />
                <select
                  aria-label="Endpoint progress"
                  disabled={progressBusy}
                  value={progress}
                  onChange={(e) => updateProgress?.(e.target.value as Progress)}
                >
                  {progressValues.map((value) => (
                    <option key={value} value={value}>
                      {progressLabels[value]}
                    </option>
                  ))}
                </select>
              </label>
              {changedBy && (
                <small
                  className="status-author"
                  title="Identity from local Git configuration"
                >
                  {changedBy}
                </small>
              )}
            </div>
          </div>
          <p>
            {endpoint.description ||
              "Explore the contract and send a request to your local API."}
          </p>
        </div>
      )}
      <div className="url-bar">
        <Method method={endpoint.method} />
        <code>
          <span>{health.base_url}</span>
          {endpoint.path}
        </code>
        <button
          className="icon-button"
          aria-label="Copy request URL"
          onClick={() => {
            try { void copy(requestUrl(endpoint, values, health.base_url), "url"); }
            catch (err) { setError(err instanceof Error ? err.message : "Check request parameters."); }
          }}
        >
          {copied === "url" ? <Check size={15} /> : <Copy size={15} />}
        </button>
        <details className="export-menu" ref={exportMenu} onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false;
        }} onKeyDown={(event) => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}>
          <summary className="secondary-button"><Download size={15} /> Export <ChevronDown size={13} /></summary>
          <div className="export-options">
            {(["relay", "json"] as const).map((format) => <button key={format} onClick={() => {
              try { downloadExport(exportFilename(endpoint, format), endpointExport({ endpoint, snapshot, baseUrl: health.base_url, values, body, mediaType, headerText, progress, response, responseAt }), format); }
              catch (err) { setError(err instanceof Error ? err.message : "Export failed. Please try again."); }
              if (exportMenu.current) exportMenu.current.open = false;
              exportMenu.current?.querySelector("summary")?.focus();
            }}><strong>{format === "relay" ? "Relay (.relay)" : "JSON (.json)"}</strong><span>{format === "relay" ? "Offline browser report" : "Structured export data"}</span></button>)}
          </div>
        </details>
        <button className="execute-button" onClick={() => void execute()} disabled={running} title="Ctrl / ⌘ + Enter">
          <Play size={14} fill="currentColor" />
          {running ? "Executing…" : "Execute request"}
        </button>
      </div>
      <div className={`tester-grid${responseFocused ? " response-focused" : ""}`}>
        <div className="request-column" hidden={responseFocused}>
          <div className="pane-label">
            <span>
              <Code2 size={15} />
              Request
            </span>
            <span>Request inputs</span>
          </div>
          <section className="request-panel">
            <div className="request-content">
              <section className="request-auth">
                <div className="request-auth-state">
                  <span><LockKeyhole size={14} /> {authentication}</span>
                  <button className="text-button" onClick={quickAuthorize ?? authorize}>Auth</button>
                </div>
                <details ref={authDetails} className="advanced-auth">
                  <summary>Advanced auth</summary>
                  <p className="muted">
                    {endpoint.security.length
                      ? `Contract requires: ${endpoint.security.map((group) => Object.keys(group).join(" + ") || "no authentication").join(" or ")}.`
                      : "No authentication required by this contract."}
                  </p>
                  <label className="auth-field">
                    Authentication
                    <select
                      ref={authSelect}
                      value={authType}
                      onChange={(e) => setAuthType(e.target.value)}
                    >
                      {[
                        "Workspace bearer",
                        "None",
                        "Bearer token",
                        "API key",
                        "Basic",
                      ].map((type) => (
                        <option key={type} value={type}>{type === "Workspace bearer" ? "Shared bearer" : type === "Bearer token" ? "Endpoint bearer" : type}</option>
                      ))}
                    </select>
                  </label>
                  {authType === "API key" && (
                    <label className="auth-field">
                      Header name
                      <input
                        value={keyName}
                        onChange={(e) => setKeyName(e.target.value)}
                      />
                    </label>
                  )}
                  {authType === "Workspace bearer" && (
                    <div className="request-auth-state">
                      <span>{auth.enabled && auth.token ? "Bearer token applied" : endpoint.security.length ? "Bearer token required" : "No bearer token"}</span>
                      <button className="text-button" onClick={authorize}>{auth.token ? "Edit token" : "Add token"}</button>
                    </div>
                  )}
                  {authType !== "None" && authType !== "Workspace bearer" && (
                    <label className="auth-field">
                      {authType === "Basic" ? "username:password" : authType === "Bearer token" ? "Endpoint bearer token" : "API key value"}
                      <input
                        type="password"
                        autoComplete="off"
                        value={secret}
                        onChange={(e) => setSecret(e.target.value)}
                      />
                    </label>
                  )}
                  {authType !== "Workspace bearer" && authType !== "None" && <p className="muted">Used only for this endpoint. The shared token stays unchanged.</p>}
                  {Object.keys(snapshot.securitySchemes).length > 0 && (
                    <details>
                      <summary>Security definitions</summary>
                      <pre>
                        {JSON.stringify(snapshot.securitySchemes, null, 2)}
                      </pre>
                    </details>
                  )}
                </details>
              </section>
              {endpoint.parameters.length > 0 && (
                <section className="request-section">
                  <h3>Parameters</h3>
                  {!endpoint.parameters.length ? (
                    <div className="inline-empty">No parameters</div>
                  ) : (
                    endpoint.parameters.map((param) => (
                      <label className="field-row" key={`${param.in}:${param.name}`}>
                        <div>
                          <code>{param.name}</code>
                          {param.required && <span className="required">required</span>}
                          <small>{param.in} · {param.schema?.type ?? param.schema?.anyOf?.find((s) => s.type !== "null")?.type ?? "string"}{param.description ? ` · ${param.description}` : ""}</small>
                        </div>
                        {param.schema?.type === "boolean" ? (
                          <select
                            aria-label={param.name}
                            value={values[`${param.in}:${param.name}`] ?? ""}
                            onChange={(e) =>
                              setValues({
                                ...values,
                                [`${param.in}:${param.name}`]: e.target.value,
                              })
                            }
                          >
                            <option value="">Unset</option>
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </select>
                        ) : (
                          <input
                            aria-label={param.name}
                            type={
                              param.schema?.type === "integer" ||
                              param.schema?.type === "number"
                                ? "number"
                                : "text"
                            }
                            placeholder={
                              (param.schema?.type === "array" || param.schema?.anyOf?.some((s) => s.type === "array")) ? '["one", "two"]' : param.required ? "Enter a value" : "Optional"
                            }
                            value={values[`${param.in}:${param.name}`] ?? ""}
                            onChange={(e) =>
                              setValues({
                                ...values,
                                [`${param.in}:${param.name}`]: e.target.value,
                              })
                            }
                          />
                        )}
                      </label>
                    ))
                  )}
                </section>
              )}
              {endpoint.requestBody && (
                <>
                  {!endpoint.requestBody ? (
                    <div className="inline-empty">
                      No request body is defined in this contract.
                    </div>
                  ) : (
                    <>
                      <div className="section-title">
                        <div>
                          <strong>Request body</strong>
                          <span className="subtle-label">
                            {endpoint.requestBody.required
                              ? "Required"
                              : "Optional"}
                          </span>
                        </div>
                        <select
                          aria-label="Request content type"
                          value={mediaType}
                          onChange={(e) => {
                            setMediaType(e.target.value);
                            setBody(
                              bodyExample(
                                endpoint.requestBody?.content[e.target.value],
                              ),
                            );
                          }}
                        >
                          {mediaTypes.map((type) => (
                            <option key={type}>{type}</option>
                          ))}
                        </select>
                      </div>
                      {mediaType.includes("json") && fields.length > 0 && (
                        <div className="schema-fields">
                          {fields.map(([name, field]) => (
                            <label className="field-row" key={name}>
                              <div>
                                <code>{name}</code>
                                {schema?.required?.includes(name) && (
                                  <span className="required">required</span>
                                )}
                                <small>
                                  {field.type ?? "value"}
                                  {field.description
                                    ? ` · ${field.description}`
                                    : ""}
                                </small>
                              </div>
                              {field.type === "boolean" ? (
                                <select
                                  aria-label={name}
                                  value={String(parsedBody[name] ?? false)}
                                  onChange={(e) =>
                                    updateField(name, e.target.value === "true")
                                  }
                                >
                                  <option value="true">true</option>
                                  <option value="false">false</option>
                                </select>
                              ) : ["object", "array"].includes(
                                  field.type ?? "",
                                ) ||
                                field.$ref ||
                                field.anyOf || field.oneOf || field.allOf ? (
                                <small className="muted">
                                  Edit in JSON below
                                </small>
                              ) : (
                                <input
                                  aria-label={name}
                                  type={
                                    field.format === "password"
                                      ? "password"
                                      : field.type === "integer" ||
                                          field.type === "number"
                                        ? "number"
                                        : "text"
                                  }
                                  value={String(parsedBody[name] ?? "")}
                                  onChange={(e) =>
                                    updateField(
                                      name,
                                      field.type === "integer" ||
                                        field.type === "number"
                                        ? e.target.value === ""
                                          ? ""
                                          : Number(e.target.value)
                                        : e.target.value,
                                    )
                                  }
                                />
                              )}
                            </label>
                          ))}
                        </div>
                      )}
                      {schemaUnsupported(schema) && (
                        <p className="schema-warning">
                          Some schema features need manual JSON editing. Inspect
                          the contract for the full definition.
                        </p>
                      )}
                      <div className="editor-header">
                        <span>
                          <Terminal size={13} />{" "}
                          {mediaType.includes("json")
                            ? "JSON editor"
                            : "Body editor"}
                        </span>
                        <button
                          className="text-button"
                          onClick={() => {
                            setBody(bodyExample(media, mediaType));
                            setError("");
                          }}
                        >
                          <RotateCcw size={12} />
                          Reset to spec example
                        </button>
                      </div>
                      <textarea
                        className="body-editor"
                        aria-label="Request body"
                        spellCheck={false}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                      />

                    </>
                  )}
                </>
              )}
              <details className="request-disclosure">
                <summary>Headers <span>{headersCount}</span></summary>
                  <div className="section-title">
                    <strong>Request headers</strong>
                    <button
                      className="text-button"
                      onClick={() => void copy(headerText, "headers")}
                      aria-label="Copy request headers"
                    >
                      {copied === "headers" ? (
                        <Check size={14} />
                      ) : (
                        <Copy size={14} />
                      )}{" "}
                      {copied === "headers" ? "Copied" : "Copy headers"}
                    </button>
                  </div>
                  <p className="muted">
                    Paste Name: value lines or a JSON object. The runner manages
                    Host and transport headers.
                  </p>
                  <textarea
                    className="body-editor"
                    aria-label="Request headers"
                    value={headerText}
                    onChange={(e) => setHeaderText(e.target.value)}
                    spellCheck={false}
                  />
              </details>
              <details className="request-disclosure code-disclosure">
                <summary>Code snippets</summary>
                  <div className="section-title">
                    <strong>Copy a request</strong>
                    <select
                      aria-label="Code language"
                      value={codeType}
                      onChange={(e) =>
                        setCodeType(e.target.value as "fetch" | "curl")
                      }
                    >
                      <option value="fetch">fetch</option>
                      <option value="curl">cURL</option>
                    </select>
                  </div>
                  <pre className="snippet">{code}</pre>
                  <button
                    className="secondary-button"
                    onClick={() => void copy(code, "snippet")}
                  >
                    <Copy size={13} />
                    {copied === "snippet" ? "Copied" : "Copy snippet"}
                  </button>
                  <p className="editor-caption">
                    Credentials are replaced with placeholders.
                  </p>
              </details>
            </div>

          </section>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <details className="contract-details">
            <summary>
              View OpenAPI response contract
              <ChevronDown size={14} />
            </summary>
            <pre>{JSON.stringify(endpoint.responses, null, 2)}</pre>
          </details>
        </div>
        <div className="response-column">
          <div className="pane-label">
            <span>
              <Terminal size={15} />
              Response
            </span>
            <span>
              {running ? "Executing…" : responseAt
                ? `Last run ${new Date(responseAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                : "Waiting for a request"}
            </span>
          </div>
          <section className="response-panel">
            <div className="terminal-titlebar">
              <span className="terminal-lights" aria-hidden="true"><i /><i /><i /></span>
              <code className="terminal-title" title={`${endpoint.method} ${endpoint.path}`}>{endpoint.method} {endpoint.path}</code>
              <button className="secondary-button response-focus" aria-pressed={responseFocused} onClick={() => setResponseFocused((value) => !value)}>
                {responseFocused ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                {responseFocused ? "Back to request" : "Focus response"}
              </button>
            </div>
            <div className="response-heading">
              {response ? (
                <div className="response-meta">

                  <strong
                    className={
                      response.status < 400 ? "status-success" : "status-error"
                    }
                  >
                    {response.status} {response.reason}
                  </strong>
                  <span>{response.duration_ms} ms</span>
                  <span>{(response.bytes / 1024).toFixed(2)} KB</span>
                </div>
              ) : (
                <span className="subtle-label">No request sent</span>
              )}
              {response && (
                  <button
                    className="text-button copy-response"
                    onClick={() => void copy(responseText, "response")}
                  >
                    {copied === "response" ? (
                      <Check size={13} />
                    ) : (
                      <Copy size={13} />
                    )}
                    {copied === "response" ? "Copied" : "Copy"}
                  </button>
              )}
            </div>
            {response ? (
              <>
                <div
                  className="tabs response-tabs"
                  role="tablist"
                  aria-label="Response views"
                >
                  {["Body", "Raw", "Headers", "Request"].map((name) => (
                    <button
                      key={name}
                      role="tab"
                      aria-selected={responseTab === name}
                      onClick={() => setResponseTab(name)}
                    >
                      {name}
                    </button>
                  ))}
                  <button className="response-wrap" aria-pressed={wrapResponse} onClick={() => setWrapResponse((value) => !value)}>Wrap lines</button>
                </div>
                {response.truncated && (
                  <p className="schema-warning">
                    Response preview truncated at 2 MiB. This is not the
                    complete body. Copy and export include only this preview.
                  </p>
                )}
                <pre className={`response-body${wrapResponse ? " wrap-lines" : ""}`} role="tabpanel" tabIndex={0} aria-label={`${responseTab} response`}>
                  {!responseText && <span className="muted">Empty response body</span>}
                  <ResponseText text={responseText} />
                </pre>

                {foundToken && useToken && (
                  <div className="token-result">
                    <div>
                      <KeyRound size={16} />
                      <span>Access token found in response</span>
                    </div>
                    <button
                      className="secondary-button"
                      onClick={() => useToken(foundToken)}
                    >
                      <Check size={14} />
                      Use as bearer token
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="response-empty">
                <Terminal size={23} />
                <h3>{running ? "Waiting for your API…" : "No response yet"}</h3>
                <p>
                  {running
                    ? "Request in progress."
                    : "Your response will appear here."}
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
