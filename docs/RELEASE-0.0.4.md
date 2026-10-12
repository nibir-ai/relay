# Relay v0.0.4 release plan

Status: Python 0.0.4 published on PyPI and GitHub, 12 October 2026. The verified Node 0.0.4 tarball is attached to GitHub; npm publication is awaiting account authentication. See [verification notes](VERIFICATION.md) for actual results.

Implemented scope follows the required features below. Automatic init edits support simple FastAPI/JavaScript Express entries; Fastify, TypeScript and ambiguous layouts receive manual instructions. Contract comparisons retain bounded section digests and show changed sections, rather than duplicate full contracts. Optional additions remain deferred.

## Release goal

Make Relay easier to install, troubleshoot and use for an API handoff while retaining its compact, local development workflow. Ship the same user-facing capabilities in the Python and Node distributions.

Recommended release theme: **easier setup, clearer handoffs, dependable sync**.

The existing release already includes native FastAPI/Express/Fastify/Node HTTP integration, real request execution, shared and endpoint auth, Git status exchange, response inspection, exports and themes. Build on those capabilities rather than expand into a general API platform.

## What the repository tells us

| Current behavior | Opportunity for 0.0.4 |
| --- | --- |
| Both CLIs run testers and open reports, but have no initialization command. | Guide developers through framework detection and integration. |
| Python and Node workspace models already contain notes and activity; the main endpoint UI does not expose an editor or activity view. | Make existing metadata useful in the endpoint handoff. |
| Contract fingerprints already invalidate Done when a contract changes. | Explain the invalidation and show a bounded contract summary. |
| Automatic Git sharing exists, including updater identity. | Make sync state and failures easier to understand and recover from. |
| Drafts and credentials live in session memory; large responses already have limits and exact-copy handling. | Preserve these guarantees while polishing inputs, errors and navigation. |
| The Windows legacy report entry point is restored in source but not yet released on PyPI. | Include the compatibility fix and verify upgrades. |
| Realtime collaboration is a proposal in REALTIME.md. | Give it a separate milestone with complete service requirements. |

These are source observations, not findings from a new runtime audit. Validate suspected UI or performance issues before calling them defects.

## Committed scope: proposed release requirements

### 1. Guided integration: `init`

Commands: `relay init` for Python and `npx relay-backend init` for Node.

- Detect FastAPI, Express and Fastify from a developer-selected project directory without importing or executing its application.
- Show the detected framework, proposed entry file, exact integration diff and backend start/open instructions.
- Preview by default; an explicit `--apply` writes only an unambiguous supported change. Make repeated initialization a no-op and preserve existing settings and formatting.
- For application factories, multiple app instances, unusual syntax or uncertain middleware ordering, produce tailored instructions instead of guessing a source edit. Keep Node HTTP integration guided/manual in this release.
- Explain that Express integration must precede body parsers and that Node needs a generated OpenAPI source.
- Do not install dependencies, change lockfiles, enable team sync or start applications as a side effect. Print the required package command if missing.

Acceptance: a clean FastAPI project and ordinary Express/Fastify projects reach `/relay` using generated instructions; applied changes are reviewable and repeatable; ambiguous projects receive useful guidance without source changes.

Likely files: both CLI modules, new framework detection/setup modules, CLI tests and integration guides.

### 2. Setup and sync diagnostics: `doctor`

Commands: `relay doctor` and `npx relay-backend doctor`.

- Report Relay/runtime versions, integration configuration, supplied loopback target reachability and OpenAPI availability/validity.
- When a project is supplied, inspect Git availability, remote configuration and status-sync configuration without pushing or changing branches.
- Distinguish missing package, wrong interpreter, missing mount, wrong schema path, unreachable backend and Git authentication problems where evidence permits. Explain what cannot be determined remotely.
- Give each failed check one concrete next step. Include a sanitized `--json` output for bug reports; exclude credentials, request/response bodies and Git URLs containing credentials.
- Use bounded timeouts and existing target/origin restrictions. Do not execute business endpoints or recursively scan the machine.

Acceptance: known good/bad fixture configurations produce actionable results on Python and Node; diagnostic output contains no planted credentials; checks do not mutate application or Git state.

Likely files: CLI/security/OpenAPI modules, diagnostics tests and TROUBLESHOOTING.md. Assess the existing mount diagnostic script before reusing its checks.

### 3. Endpoint notes and recent activity

- Add a small expandable handoff section inside an endpoint, with a plain-text note, explicit Save/Cancel, save feedback and recent status/contract events.
- Start with the existing 4,000-character note boundary; enforce the same limit in both distributions.
- Preserve unsaved notes on failed saves and endpoint switches. Reject updates against an outdated contract with a clear sync/review action.
- Show event time and updater where actually recorded. Do not invent identities for historical events or treat Git author details as authentication.
- Label notes as local in 0.0.4: existing Git status exchange does not share notes. Keep remote note sharing out of this slice.
- Keep the current status names and default Done behavior. A successful HTTP request must still never change team status automatically.

Acceptance: notes survive backend restart and schema refresh; status-only updates retain notes; failed saves retain edits; activity is scoped to the selected endpoint; existing workspaces open without losing metadata.

Likely files: Operations/App/API/types, both workspace implementations and workspace/UI tests. Use additive storage migrations and a bounded activity history.

### 4. Explain contract changes and sync state

- Show a visible `Contract changed - review required` explanation when Done becomes Needs fixing, independently of HTTP response success.
- Keep a bounded previous normalized contract per affected endpoint and summarize changed parameters, request body, response definitions and security requirements. Label this as a contract comparison, not a breaking-change verdict.
- Use the existing canonical fingerprint logic; test reordered equivalent definitions to prevent false invalidation. Handle resolved component changes as part of the endpoint contract.
- Show added/removed endpoint counts after schema sync. Preserve notes/history for removed endpoints and show removal in endpoint activity where accessible.
- Surface schema sync and Git status sync separately: disabled, checking, synced, offline/error, last successful update and a retry action. Do not report success before acknowledgement.
- Preserve the last good schema, active draft and captured response through transient refresh failures. Test schema refresh racing with status/note saves.

Acceptance: a meaningful contract edit explains the stale status; an equivalent reorder does not reset status; two Git peers converge after reconnect; stale updates cannot silently approve the new contract; failed sync retains usable local testing.

Likely files: OpenAPI/workspace/status-sync implementations in both runtimes, App/Operations/types and cross-runtime fixtures. Limit retained history and migrate old workspaces safely.

## Fine tuning included in the release

| Area | Planned refinement | Verification |
| --- | --- | --- |
| Request inputs | Better field-level required/invalid input feedback; select named OpenAPI request examples without silently replacing edited input; clear explanations for unsupported schema/media types. | JSON, optional bodies, arrays, enums, nullable/union schemas, invalid headers and example switching. |
| Status clarity | Explain that Done is manual workflow status; show recorded update time alongside the updater; distinguish status changes from local request results. | Fresh/default statuses, manual edits, failed requests and stale contracts. |
| Navigation/accessibility | Review keyboard focus, Escape behavior, dialog focus restoration, long paths and action labels; keep the current inline endpoint layout. | Keyboard-only flow, 320px/mobile layouts, desktop and all five themes. |
| Error handling | Separate backend HTTP errors from Relay transport/setup errors; give timeout, malformed schema and Git failures an actionable message. | Inspectable 401/422/500 responses versus unreachable/timeout failures. |
| Response performance | Measure a large endpoint list and near-limit response; optimize only demonstrated bottlenecks. Keep exact raw copying, large integer preservation and truncation labels. | Suggested fixtures: 1,000 endpoints and a response near the existing 2 MiB limit. Record measurements before/after changes. |
| Compatibility | Ship the pending Windows report association fix; retain legacy imports and report formats. | Old Windows command plus newly registered command, existing reports, old workspace data and native mounts. |
| Package consistency | Verify matching bundled UI behavior, version display, asset refresh and documented commands in wheel/sdist/npm. | Clean consumers outside the checkout, including CJS/ESM/TypeScript. |

The UI review is a validation task, not a redesign. Preserve the existing response focus, category collapse controls, auth controls and themes.

## Optional additions, in priority order

Only pull these into 0.0.4 after the required scope passes its checks. Otherwise carry them forward.

1. **Bounded session request history:** a small per-endpoint list of attempts with outcome, time and duration. Restoring inputs is explicit and never executes automatically. Keep it in memory; do not persist credentials or captured traffic. Clear on reload and expose Clear history.
2. **Basic response checks:** expected HTTP status and selected JSON field checks, displayed as local test outcomes. No arbitrary JavaScript evaluation and no automatic Done status. Label truncated/invalid JSON as unable to evaluate affected checks.
3. **Export review:** show an explicit summary of included bodies, parameters and responses before sharing, with an opt-in sanitized copy. Preserve exact exports as a clearly named option; do not claim automatic redaction finds every secret. Validate both report openers if formats change.

Multipart uploads are valuable but should be a separate feature slice: binary transport, body limits, filename/content-type handling, native adapters, previews and exports all need coordinated work.

## Realtime collaboration: separate milestone

Recommend deferring implementation to 0.0.5 or a dedicated preview. The existing README lists it under Next release, but reliable collaboration is larger than adding a transport to local servers.

Before implementation, settle:

- The shared service deployment and durable storage model, with a self-hostable path.
- Authenticated developer identity and project membership; a Git-configured name is not sufficient.
- A common Python/Node event protocol with revisions, acknowledgements, conflicts and reconnect recovery.
- Explicit selection of local, Git or realtime status storage; avoid silently using multiple authorities.
- Offline behavior, migration from Git metadata and the exact metadata permitted to leave the local environment.

Keep local execution, tokens, request drafts and live responses local. Ship only after two independent developer environments, unauthorized clients, project isolation, concurrent edits, restart durability and reconnect recovery are verified. See [REALTIME.md](REALTIME.md).

Also defer OAuth browser flows, remote execution/public hosting, manual endpoint authoring, YAML/external references, full Postman imports, AI features and analytics dashboards.

## Delivery sequence and sizing

Rough estimate for one developer familiar with the repository: **12-18 focused development days**, subject to discovery in setup editing and contract storage. This is an effort estimate, not a promised release date. Avoid adding optional work to fill the estimate.

| Stage | Work | Exit condition | Estimate |
| --- | --- | --- | --- |
| 1 | Confirm fixtures, baseline existing checks, define CLI outputs and additive metadata changes. | Both runtimes agree on behavior and existing regressions are identified. | 1-2 days |
| 2 | Implement doctor, then init using its detection results. | Clean and ambiguous projects pass setup acceptance; no unintended edits. | 3-5 days |
| 3 | Expose notes/activity and add contract-change explanations. | Restart/migration, stale updates and schema comparisons pass in both runtimes. | 4-5 days |
| 4 | Refine sync/error states, request examples, accessibility and verified performance issues. | End-to-end testing and Git recovery checks pass. | 2-3 days |
| 5 | Freeze scope, update docs, build artifacts and run release verification. | Fresh wheel/sdist/npm consumers pass; release notes accurately match shipped behavior. | 2-3 days |

If setup application or contract history expands unexpectedly, keep init guidance-only for unsupported patterns and shorten the contract comparison to changed sections. Do not cut compatibility, migration or package verification to keep a date.

## Release gates

- Existing frontend, Python and Node tests, frontend build and TypeScript consumer checks pass, plus focused tests for the new behaviors above.
- FastAPI, Express, Fastify and Node HTTP continue to discover and execute real authenticated handlers through their existing integrations. Native Socket.IO wrapping, application factories and proxy prefixes retain their covered behavior.
- Old workspace metadata, Git status files, imports and `.relay` reports remain usable after upgrading. New required fields have safe defaults; initialization does not alter existing integrations.
- Two independent Git peers demonstrate status exchange, reconnect/retry and conflict handling; local testing works when sync is unavailable.
- Invalid schema refresh retains the last good snapshot. Auth/session data is not written by new setup, diagnostics, notes or history features.
- Keyboard/mobile/theme checks cover the complete find-authorize-execute-inspect-note-sync-export flow.
- Build and verify Python wheel/sdist and npm tarball outside the repository, using the existing package and clean-install verification scripts. Exercise CJS/ESM/TypeScript consumers and existing response-size boundaries.
- Use the repository's configured Python and Node CI matrices and inspect their actual results before claiming compatibility.
- During release preparation, update root/package/runtime versions and version-dependent assets, changelog, package READMEs and release instructions together. Keep Python `v0.0.4` and Node `npm-v0.0.4` publication triggers distinct.
- After authorized publication, verify fresh unpinned installs from each actual registry. If one publication fails, record each distribution's state explicitly; never label both released based only on tags/builds.

The plan's completion criterion is a developer setting up Relay in a clean project, testing a real endpoint, saving a useful note, understanding a contract invalidation and recovering from sync failure without losing work.
