# Relay for Windows

A free, open-source desktop API tester under Apache-2.0. The core workflow must work without an account, subscription, cloud workspace, backend integration, repository clone or consumer build step. Windows desktop development is a separate release track from Python/npm Relay. Existing native `/relay/` integrations remain supported and their code-discovered endpoints remain read-only.

## Product direction

Backend developers should open Relay, paste an address, add auth and send. The request editor sits above a wide response pane. Method colors, visible per-request auth, an always reachable Send/Cancel control, readable response text and predictable keyboard actions carry the interface. Inherit Relay's five themes and identity; avoid promotional UI, dashboard metrics and decorative panels. No fake collections, disabled placeholders or claims of feature parity.

The first supported target is Windows x64. ARM64 and other operating systems require separate consumer verification. Desktop release tags will use `desktop/v0.1.0` rather than changing backend package versions. This document defines scope; no desktop release is published yet and there is no launch date.

## Architecture

Electron with a React/TypeScript renderer reuses Relay's response renderer, exact JSON formatter, font and theme tokens. The main process owns network transport; a context-isolated, sandboxed renderer has only narrow execute/cancel/copy methods. Only bundled UI assets load through a custom protocol. Block navigation, popups, webviews and permissions. API HTML is displayed as text, never executed. Validate IPC sender/frame and every request payload. Preserve certificate verification and do not follow redirects implicitly. No cloud connection or telemetry is required.

Electron bundles the runtime in the distributed app. Developers build it here; end users should install and launch without Node, Python or a backend server. A portable development build is not a verified installer or signed release.

## Milestones

### M1: working desktop preview

- [x] Add an isolated desktop workspace with separate development versioning.
- [x] Implement validated HTTP/HTTPS transport, a bounded response preview, explicit timeout/cancellation and visible 3xx responses without automatic credential forwarding.
- [x] Exercise real local handlers for JSON/text, non-2xx and empty bodies, separate bearer values, cancellation, timeout, response limits and input rejection.
- [x] Build a typed request-above-response interface using Relay themes, visible bearer auth, editable standalone URLs/methods/headers/bodies and in-memory request drafts.
- [x] Launch the development and packaged Windows app, send real requests and verify response rendering; check user/admin bearer isolation, copying and fresh session state in the development app.
- [x] Verify cancellation through the packaged app and clear stale captures after failed or cancelled attempts.
- [x] Verify HTML response payloads display as inert text in the packaged app.
- [ ] Audit renderer isolation, IPC origin/frame rejection, navigation and permission boundaries through the packaged app.
- [x] Verify real HTTPS and certificate failure behavior, connection errors and interrupted response streams.
- [x] Produce and launch an unpacked Windows x64 build; verify sending with Ctrl+Enter and cancelling with the visible control.
- [ ] Inspect keyboard focus across all controls, all five themes and supported Windows display scaling.

Verification on 2026-11-02: eight transport tests and 100 shared web tests passed; TypeScript/Vite built successfully. The native development app returned separate user/admin responses and a real HTTPS response. The unpacked executable loaded its bundled UI and returned a real authenticated local response after a fresh launch. Packaging verification inspects the actual archive for its entry page, referenced assets and license notices; this caught and fixed an omitted entry page before sharing the preview. Windows CI builds and checks the unpacked artifact, but does not claim interactive or clean-machine installer verification.

Request-state verification on 2026-11-02: nine transport tests and 110 web tests passed, including four desktop regressions covering cancellation, connection refusal, certificate rejection and invalid-header attempts after a previous success. TypeScript and the unpacked package checks passed. Native packaged checks returned a real HTTPS 200, rejected a local self-signed certificate, reported connection refusal and interrupted responses, cancelled a delayed request and rendered an HTML/script payload as literal response text. A new request attempt clears the old body/status/copy action; errors appear in the response pane. Unsupported header characters are rejected before transport setup. Renderer isolation and the full focus/theme/scaling matrix remain pending.

M1 keeps requests, tokens and responses in memory only. No persistent collections, credential store, import/export or installer is claimed by this preview.

### M2: local workspaces and credentials

- [ ] Save named collections, folders and request drafts locally with explicit save state and atomic writes.
- [ ] Add environments and variable resolution with a visible final URL/request preview, unresolved-variable errors and project isolation.
- [ ] Add separate user/admin auth profiles, API keys and Basic auth. Encrypt remembered credentials through Windows-backed storage; fail closed when secure storage is unavailable.
- [ ] Keep secrets out of ordinary workspace files, search indexes, logs and history. Make remembering a credential explicit and provide clear/remove actions.
- [ ] Add bounded, redacted history; restore inputs without automatically sending or reviving old credentials.
- [ ] Verify restart, backup, corruption recovery and schema migrations without data loss.

### M3: seamless migration and Relay integration

- [ ] Import Postman collections/environments and cURL with a preview, validation and unsupported-feature report; never execute imported scripts.
- [ ] Import OpenAPI contracts as categorized, read-only endpoint definitions. Keep standalone requests editable.
- [ ] Connect explicitly to native FastAPI/Node Relay instances for code-discovered endpoints, statuses and attribution without weakening their loopback/CSRF boundaries.
- [ ] Reuse response checks and reviewed JSON/.relay exports. Preview exactly what will be shared and preserve large numbers and duplicate JSON keys.
- [ ] Verify separate auth profiles, custom headers, query arrays, empty/non-JSON/large responses, cancellation and offline use in fresh workspaces.

### M4: daily-use depth

- [ ] Support multipart/form data, file selection and binary response save with safe filenames and size feedback.
- [ ] Add cookie inspection and explicit cookie persistence controls without silently inheriting browser cookies.
- [ ] Add response search, formatting, line wrapping and full response focus, plus collection search and useful shortcuts.
- [ ] Document proxy/custom CA needs; never add a silent certificate-verification bypass.
- [ ] Test accessibility, long content, multiple displays and 100/125/150/200-percent scaling. Respect reduced motion and native window behavior.

### M5: Windows release

- [ ] Choose installer/update packaging and document install location, permissions and uninstall behavior. Prefer a per-user install without unnecessary administrator access.
- [ ] Verify a clean machine with no developer tools: install, launch, first request, restart, upgrade, rollback and uninstall.
- [ ] Finalize Windows icons, app identity, optional .relay association and consent for associations/update behavior.
- [ ] Verify installer integrity and signing status honestly. Resolve signing/account requirements before claiming a trusted signed build; do not bypass Windows security warnings.
- [ ] Run compatibility/security checks, inspect artifacts for secrets/private metadata, preserve notices and publish checksums with release notes.
- [ ] Verify the actual public download on a fresh Windows consumer before marking the release complete.

## Free core and boundaries

Request execution, local collections/environments, essential auth, response inspection, checks and reviewed import/export belong to the free core. No account gate or artificial request quota. Hosted collaboration, OAuth browser flows, scripting/collection runners, GraphQL and WebSocket tooling need separate scope and verification; they do not block the first useful REST client.

Coordinate changes to shared web modules with backend releases. A desktop milestone must not silently delay backend 0.0.6 or publish its packages. Update checks only with observed evidence and keep an explicit list of unverified release gates.

## Developer preview

```powershell
pnpm install
pnpm --filter @relay/desktop runtime:install
pnpm --filter @relay/desktop test
pnpm --filter @relay/desktop build
pnpm --filter @relay/desktop start
```

Create an unpacked development app with `pnpm --filter @relay/desktop package:dir`. These commands are for contributors; the intended user flow is a downloaded Windows app. Requests have a 30-second timeout and 2 MiB body/response-preview limits. Redirects are displayed rather than followed. GET/HEAD bodies, ambient proxies, implicit cookie jars and persisted credentials are not supported by M1.
