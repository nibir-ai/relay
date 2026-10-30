# Relay 0.0.6 roadmap

Status: in progress; realtime diagnostics, session request history and response checks are implemented and verified in source. Baseline: Python and npm 0.0.5, published 27 October 2026. This document defines the next release scope; it does not claim that its features or checks are complete. There is no fixed release date.

## Outcome

Make repeated backend testing faster without changing the native integration or turning Relay into a project-management dashboard. A developer can restore a recent request, check its response and review an export before sharing it. Endpoint definitions still come from code; the manual status control remains beside each API.

No new required account, service, port, frontend build or repository clone. Local testing works without collaboration. Existing `install_relay(app)`, Express/Node middleware and Fastify plugin calls remain valid.

## Implementation order

Work through these milestones in order. Reproduce blocking regressions before adding features, keep changes focused, and update the README checkbox only after acceptance checks pass. The detailed checklist here tracks substeps; it does not authorize checking off unverified work.

### 1. Realtime diagnostics and baseline reliability

- [x] Extend `relay doctor` and `npx relay-backend doctor` to distinguish local, Git and realtime configuration, including competing modes and incomplete environment variables.
- [x] Use bounded, read-only checks to distinguish unavailable service, rejected credentials, unknown project/access and read-only membership when the protocol provides that evidence. Preserve deliberately generic authentication errors; do not expose membership details or invent a diagnosis.
- [x] Provide one concrete next step per failure and sanitized JSON output for bug reports. Never print tokens, authorization headers, request bodies or credential-bearing URLs.

Acceptance: good/bad fixtures pass in both runtimes; diagnostics do not execute business endpoints, change membership, write statuses, alter Git files or edit application setup. API execution remains usable during service outages. Any reproduced 0.0.5 regression blocks later milestones until fixed.

### 2. Session request history

- [x] Add a compact history control inside an expanded endpoint, closed by default, with time, HTTP result and duration.
- [x] Start with limits of 50 captures per browser tab, at most 10 per endpoint and 5 MiB of retained request-input data total. Evict oldest captures first and show any omission/truncation explicitly. These are data limits, not a claim about total browser memory usage.
- [x] Keep history in memory only; provide clear-one and clear-all actions. Page reload/tab closure clears it. No localStorage, backend persistence, Git or team-service synchronization. Response bodies/headers are not retained; history records outcome, status, timing and whether the original response was truncated.
- [x] Restore request inputs explicitly, without sending a request. Resolve auth from the current session/endpoint settings; do not copy authorization secrets into history. Explain any omitted sensitive inputs. Bodies containing known credentials, sensitive field names, write-only/unsupported schemas and opaque non-JSON bodies are omitted; restoration keeps the current body when omitted. Safe JSON stays byte-for-byte, including large integers and duplicate keys.
- [x] Keep current code-defined methods and paths authoritative. If a capture belongs to an older contract, show the mismatch and require review before applying compatible inputs. Do not silently overwrite unsaved inputs.

Acceptance: switching endpoints, failures and peer status updates preserve current request/response state. Restore never executes an API, never resurrects an old token and never mutates the captured response. Large responses respect budgets; failed and non-JSON responses remain understandable. Reload leaves no persisted history or credentials.

### 3. Lightweight response checks

Response checks are implemented in the source tester below the response, closed by default. Configuration stays in the existing bounded tab draft cache; explicit evaluation never sends a request. Python and Node installed-package browser checks produced matching exact large-number outcomes. Reviewed exports and complete release verification remain pending.

- [x] Support an expected HTTP status, JSON field existence/equality (for example `/data/role`) and an optional maximum response duration.
- [x] Evaluate checks against a captured result and show pass/fail, expected value and observed value beside the response. Configuration and results stay session-local for this release.
- [x] Handle missing fields, null, false, zero, arrays, invalid JSON, empty responses and truncated previews explicitly. Preserve accurate large-number comparisons; do not silently round values.
- [x] A failed check leaves the response available and does not change the manual Done/In progress/Needs fixing status. HTTP success alone still does not approve an endpoint.

Acceptance: the same inputs/results produce matching check outcomes in Python- and Node-backed testers. Timing checks report one observed request, not a performance guarantee. No arbitrary JavaScript, shell execution, scripting language, collection runner or background business requests.

### 4. Reviewed exports

- [ ] Add a preview showing endpoint details, current request and captured response before downloading `.relay` or JSON.
- [ ] Omit configured auth secrets and mask sensitive headers by default. Let the developer review and redact selected request/response fields, with common token/password field suggestions.
- [ ] Generate both formats from the same reviewed payload. Redaction changes only the exported copy; local drafts, auth and captured responses stay intact.
- [ ] Preserve untouched values and response semantics, including large integers and duplicate JSON keys. Do not use lossy parsing to claim a safe export. Explain unsupported/non-JSON content and incomplete captures clearly.
- [ ] Retain support for existing version-1 exports and the offline report opener. New fields must be backward-compatible or use an explicitly documented format revision.

Acceptance: planted user/admin tokens, cookies and selected nested secrets are absent from both downloaded files and embedded report data. Tests cover case-insensitive header names, arrays, non-JSON bodies, empty and truncated responses, cancel/reopen and existing report opening. Suggestions are a review aid, not a promise to detect every possible secret.

## Interaction constraints

Keep the response prominent, Execute easy to reach and Auth visible beside each endpoint. History/checks/export review should use the established themes and local controls without a new global navigation layer. Use keyboard-accessible actions, visible focus and specific error messages. No broad visual redesign is required by this roadmap.

## Release gates

- [ ] Python, Node, frontend and protocol regression suites pass, alongside the strict build and TypeScript consumer checks.
- [ ] Supported Python/Node compatibility matrices pass; fresh wheel/source/tarball installations need no consumer frontend build or repository checkout.
- [ ] Upgrade actual public 0.0.5 installations in place, preserving notes, statuses, contract metadata, Git/realtime configuration and existing native integration calls.
- [ ] Verify native FastAPI, Express, Fastify and Node HTTP discovery, separate user/admin auth, execution, response inspection and both export formats.
- [ ] Verify two independent realtime peers, reader permissions, project isolation, stale updates, offline API testing, restart/reconnect and reviewed Git migration remain correct.
- [ ] Browser checks cover history restore/limits, checks, reviewed exports, all five themes, keyboard access and 320/390-pixel layouts without document-level overflow.
- [ ] Inspect public source, artifacts and documentation for credentials, private paths and development metadata; preserve third-party licenses and required notices.
- [ ] Update illustrated guides, package READMEs, changelog and verification notes with observed results. Keep release ownership coordinated and inspect registry/tag state before publication.
- [ ] Publish only after every gate passes; verify fresh unpinned public PyPI/npm installations and the public realtime workflow afterward. Do not treat an accepted upload as completed consumer verification.

## Deferred

Multipart/file uploads, named auth profiles, persistent history, collections, CI runners, OAuth browser flows, hosted collaboration and repository-provider sign-in are separate future milestones. Do not add them to this release implicitly. Changes to scope require updating this plan and its acceptance criteria before implementation.
