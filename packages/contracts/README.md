# Companion API contract

TypeScript payloads and results are defined in `apps/web/src/types.ts`; Python request validation lives in `apps/agent/relay_agent/app.py`.

- `GET /__relay/health`: runner mode, approved base/spec URLs, version, session CSRF token.
- `POST /__relay/sources/inspect`: fetch only the configured spec; return normalized contract and SHA-256 fingerprints. Empty JSON body.
- `GET /__relay/sources/current`: last successful in-memory snapshot and raw spec.
- `POST /__relay/execute`: method, relative path, string header/query maps, body mode, body string. Return actual status/reason, bounded text body, headers, elapsed ms, bytes, truncation flag, resolved URL, method.
- `GET /__relay/workspace`: endpoint status metadata, optional Git attribution, and local internal history.
- `POST /__relay/endpoints/update`: endpoint ID, current fingerprint, manual progress. Invalid or stale updates are rejected; this never edits the imported API definition.

Every POST requires `Origin: http://127.0.0.1:<runner-port>` and `X-Relay-CSRF` from health. Companion HTTP 4xx/5xx means an input, import, or transport failure; backend HTTP statuses are inside successful execution envelopes, including backend 4xx/5xx.
