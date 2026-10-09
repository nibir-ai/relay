export type Schema = {
  type?: string;
  format?: string;
  description?: string;
  default?: unknown;
  example?: unknown;
  examples?: unknown[];
  enum?: unknown[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  anyOf?: Schema[];
  allOf?: Schema[];
  oneOf?: Schema[];
  readOnly?: boolean;
  $ref?: string;
  "x-relay-warning"?: string;
};
export type Parameter = {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  description?: string;
  schema?: Schema;
  example?: unknown;
  style?: string;
  explode?: boolean;
};
export type Media = {
  schema?: Schema;
  example?: unknown;
  examples?: Record<string, { value?: unknown }>;
};
export type Endpoint = {
  id: string;
  method: string;
  path: string;
  summary: string;
  description: string;
  tags: string[];
  deprecated: boolean;
  parameters: Parameter[];
  requestBody: { required?: boolean; content: Record<string, Media> } | null;
  responses: Record<
    string,
    { description?: string; content?: Record<string, Media> }
  >;
  security: Record<string, string[]>[];
  fingerprint: string;
};
export type Snapshot = {
  title: string;
  version: string;
  endpoints: Endpoint[];
  hash: string;
  securitySchemes: Record<
    string,
    {
      type: string;
      scheme?: string;
      name?: string;
      in?: string;
      description?: string;
    }
  >;
};
export type Health = {
  mode: "local";
  csrf_token: string;
  base_url: string;
  spec_url: string;
  version: string;
};
export type LiveResponse = {
  status: number;
  reason: string;
  body: string;
  headers: Record<string, string>;
  bytes: number;
  duration_ms: number;
  truncated: boolean;
  content_type: string;
  url: string;
  method: string;
};
export type RequestPayload = {
  method: string;
  path: string;
  headers: Record<string, string>;
  query: Record<string, string | string[]>;
  body_mode: "none" | "json" | "text" | "form";
  body: string;
};

export type Progress = "not_started" | "in_progress" | "done" | "needs_fixing";
export type EndpointMeta = {
  endpoint_id: string;
  fingerprint: string;
  progress: Progress;
  note: string;
  active: number;
  updated_at: string;
  updated_by?: { name: string; email: string };
  contract_changed?: boolean;
  source?: {
    state: "tracked" | "uncommitted" | "unavailable";
    file?: string;
    line?: number;
    created_by?: { name: string; email: string };
    created_commit?: string;
    created_at?: string;
    last_changed_by?: { name: string; email: string };
    commit?: string;
    changed_at?: string;
  };
};
export type ActivityEvent = {
  id: number;
  endpoint_id: string;
  kind: string;
  value: string;
  created_at: string;
};
export type Workspace = {
  endpoints: Record<string, EndpointMeta>;
  activity: ActivityEvent[];
};
export type SessionAuth = { token: string; enabled: boolean };
export type EndpointAuth = { authType: string; secret: string; keyName: string };
export type RunSummary = {
  endpoint_id: string;
  status?: number;
  duration_ms?: number;
  at: string;
  outcome: "response" | "network_error";
};
export type PlaygroundDraft = {
  values: Record<string, string>;
  body: string;
  mediaType: string;
  authType: string;
  secret: string;
  keyName: string;
  headerText: string;
  response: LiveResponse | null;
  responseAt: string | null;
};
