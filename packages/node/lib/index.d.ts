import type { IncomingMessage, ServerResponse } from 'node:http';

export interface OpenAPI {
  openapi: string;
  info: { title: string; version: string; [key: string]: unknown };
  paths: object;
  [key: string]: unknown;
}
export interface RelayOptions {
  /** The backend's generated OpenAPI document. Defaults to /openapi.json. */
  openapi?: object | (() => object | Promise<object>);
  enabled?: boolean;
  /** Git repository, detected upward from cwd by default. false disables Git. */
  project?: string | false;
  syncStatus?: boolean;
  /** Local metadata folder. false keeps local workspace metadata in memory. */
  dataDir?: string | false;
  specPath?: string;
  /** Standalone CLI target. Native integrations discover their existing port. */
  target?: string;
}
export interface RelayMiddleware {
  (request: IncomingMessage, response: ServerResponse, next?: (error?: unknown) => void): Promise<void>;
  close(): Promise<void>;
}
export function relay(options?: RelayOptions): RelayMiddleware;
export function relayFastify(app: unknown, options: RelayOptions): Promise<void>;
export const version: string;
