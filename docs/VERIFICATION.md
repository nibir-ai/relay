# Release verification

## Python guided setup input bounds

Guided setup enforces the existing 512 KiB source limit throughout discovery and again before applying an edit. Files already above the limit are skipped during discovery. A regression test confirms that a source file that grows during inspection stops setup before it can edit the file. The full Python suite passed on Windows with 131 tests and two platform-dependent skips.

## Python report input bounds

The Python report opener now enforces its 32 MiB limit throughout the read and rejects non-regular inputs. A regression test grows a valid report after inspection and verifies that the opener rejects it before creating a cached copy. The full Python suite passed with 130 tests and two platform-dependent skips on Windows.

## Team-service body read deadline: 5 November 2026

An incomplete HTTP body previously kept the service reader waiting. REST input now has one 10-second receive deadline in addition to its 64 KiB cap. Stalled and slow-drip input returns a non-cacheable 408 before application parsing; cancellation, disconnects, normal application processing and response delivery retain their behavior. All 33 service tests passed. A fresh installed service wheel returned 408 for a real partial socket request without changing stored statuses, then passed authentication, writes, conflicts and restart persistence. The installed-wheel verifier runs this check in CI. Socket.IO's independent 16 KiB limit is unchanged; release and other security gates remain open.

## Native tester response-tab keyboard regression: 5 November 2026

The web tester's response tabs initially kept selection and focus on Body after Right Arrow. They now use one tab stop, wrap with Left/Right, support Home/End and link to a uniquely identified response panel. A component regression verifies focus, selection, panel linkage, mouse selection and no additional API execution. All 112 frontend tests passed. This establishes component behavior; installed-browser keyboard, theme/mobile and reviewed-download acceptance remain pending.

## Python Git-status input bounds: 5 November 2026

Python Git-status reads now inspect and read one file descriptor, enforce the 2 MiB limit throughout reading and reject non-regular inputs. Missing files still mean no shared statuses; invalid input retains the existing conflict response. The Python suite passed on Windows with 129 tests and two platform-dependent skips. Regression coverage includes growth after inspection, exact/oversized inputs, descriptor cleanup and pathname replacement where supported. CI also exercises the POSIX named-pipe case. This covers the Git-status reader; other input readers and release acceptance remain separately tracked.

## Automatic Git-mode upgrades: 5 November 2026

`python scripts/verify_upgrades.py --git-mode` passed on Windows with fresh public Python and npm 0.0.5 consumers upgraded in place to the candidate archives. Installed-module hashes matched those archives. Both native integrations retained shared status bytes across installation, loaded the existing note, fingerprint and Git updater, and published subsequent status changes to a local bare remote. Notes stayed local. The application commit, branch, index, working edits and Git configuration were unchanged. Python 3.12 CI also runs this check; it does not replace native browser/export acceptance or complete the 0.0.6 release gates.

Every release must pass the Python suite, frontend suite, strict production build, wheel/source metadata checks, independent wheel checks and fresh consumer installations with current and minimum supported dependencies. CI also checks Python 3.11, 3.12 and 3.13. Publication is followed by a fresh unpinned PyPI install; build success alone is insufficient.

## Realtime public-package upgrade: 4 November 2026

The native realtime verifier can now seed independent Python/npm 0.0.5 installations with a real shared service, then upgrade both peers and the service to candidate artifacts during an outage. The same workspace databases, caches, membership configuration and Git status file remain in place. This path runs in Python 3.12 CI alongside existing compatibility checks.

The local run passed reviewed Git import, acknowledgements, stale-update rejection, updater attribution, private local notes and offline API execution before upgrade. After installing the candidates, both peers restored the accepted revision/fingerprint/updater and their local notes from disk while the service remained offline. Reconnection and a new cross-runtime status write passed; membership configuration and the Git status file remained unchanged. Writer/read-only doctor checks passed without changing the service database. Browser exports, the remaining interaction gates and a complete release audit remain required; no package was published.

## Node setup source input: 4 November 2026

Guided setup now uses the bounded descriptor reader for candidate source files. Sources already larger than 512 KiB are still skipped; a file that grows beyond the bound while being read aborts setup before applying edits. The existing CJS/ESM preview and apply behavior remains covered.

All 34 Node tests, TypeScript checks, production build and clean installed CJS/ESM/TypeScript/CLI consumers passed locally. Two new regressions cover source growth without edits and skipping an oversized source beside a valid entrypoint. This is a source fix for the next release; full release gates remain open.

## Node metadata input bounds: 3 November 2026

Workspace, Git status and realtime-cache reads now enforce their existing byte limits while reading through one inspected file descriptor. Regressions reproduced acceptance of growing, whitespace-padded JSON beyond the workspace and Git bounds. The shared reader rejects growth, preserves the opened file when its pathname is replaced and closes descriptors after read failures. Invalid realtime caches retain the existing offline fallback instead of restoring untrusted revisions. Formats, limits and normal restart behavior remain unchanged.

All 32 Node tests and TypeScript checks passed locally, including four new metadata regressions. This is a source fix for the next package; remaining source-scanning findings and full release gates remain open.

## Current public upgrade baseline: 3 November 2026

The upgrade verifier now seeds actual public Python and npm 0.0.5 installations by default, then installs the candidate artifacts into the same environments. Previously it still started from Python 0.0.4 and npm 0.0.3. Optional `--python-from` and `--node-from` arguments retain those older upgrade paths. Python replacement is forced while development artifacts retain the published version number; installed module hashes must match the wheel/tarball, rather than relying on a version string alone.

The current-baseline run passed locally: native FastAPI and Node HTTP discovery, separate user/admin authorization outcomes, execution, bundled assets and existing local status/note preservation. This does not complete the full 0.0.6 migration gate: Git/realtime configuration, contract metadata, browser exports and the other release gates remain separately required. No new version was published.

Additional contract-state coverage now saves each published consumer's fingerprint, review flag and changed-section list before upgrade. Both installed candidate consumers preserve those values with an unchanged contract. A subsequent response-contract edit changes the fingerprint and reports Responses for review while preserving the developer's in-progress status and local note. This current-public-baseline run passed for Python and Node. Git/realtime configuration and browser export acceptance remain open; this does not check off the complete migration gate.

## Node report input bounds: 3 November 2026

The report opener reads through one file descriptor, verifies a regular file and enforces its 32 MiB bound throughout reading. A pathname replacement does not switch the opened input, and growth beyond the bound is rejected before creating a cached report. File descriptors close on success and read errors. Supported version-1 reports remain portable. This addresses the report-reader file inspection finding; other source-scanning findings remain under separate review.

## Node framework test dependencies: 3 November 2026

The locked Fastify test dependency is now 5.12.7, with fast-uri 3.1.9/4.2.3 and qs 6.17.1 in its and Express's development dependency chains. All updates stay within their existing supported major versions. The full workspace audit fell from five low/seven moderate advisories to two moderate advisories in desktop packaging tools; no high or critical dependency advisories were reported. The remaining glob/minimatch entries need a separately verified upstream-compatible packaging update. Dependency audit results do not establish that source-scanning findings are resolved.

All 24 Node integration tests, TypeScript checks and a clean tarball installation passed locally. Installed CommonJS, ES module and TypeScript consumers, CLI commands, bundled assets and request execution passed without consumer build scripts. These framework packages are development dependencies; the distributed Node runtime dependency list is unchanged.

## Team service HTTP input bounds: source fix, 3 November 2026

A valid status mutation padded beyond 64 KiB previously reached JSON parsing and returned HTTP 200. The REST service now rejects oversized declared or streamed bodies with HTTP 413 before parsing. This also applies when `Content-Length` is absent or underreports the body. Accepted bodies remain intact; client disconnects do not invoke the parser. Socket.IO keeps its independent transport bound.

All 28 service tests passed locally, including real Socket.IO delivery, HTTP-to-socket updates, reconnect recovery and eight new input-limit regressions. Installed-wheel HTTP verification also checks rejection without a status change. This is a source fix for the next backend release; public 0.0.5 packages have not changed.

## 0.0.6 reviewed exports: source implementation, 2 November 2026

Export now captures a separate copy and opens a review before downloading. The preview supports body omission, explicit non-JSON inclusion and additional JSON Pointer selections; both formats use the same reviewed payload. Known workspace/endpoint auth, recognized manual credentials, cookies, sensitive parameters/query values and their recognized encoded forms are masked throughout the copy, including metadata. Common sensitive body fields are masked by default. Unsupported/truncated bodies have explicit omission notes. This remains a review aid rather than a promise to identify every private field or encoded secret.

All 100 frontend tests and the strict production build passed locally. Tests cover unchanged drafts/captures, cross-field secret echoes, combined cookies without cookie-attribute overmasking, duplicate keys, numeric precision, body omissions, exact shared download values, cancellation/reopening, pointer validation, download errors, metadata-key collisions and bounded credential failure. The installed wheel verifier and clean npm CJS/ESM/TypeScript/CLI consumer passed. The version-1 export envelope is retained with additive optional review notes; existing report escaping and exact numeric tests pass.

Native browser interaction, actual downloads/report opening, keyboard focus and desktop/theme/mobile acceptance for the review have not run. The reviewed-export milestone and release gates remain open. No 0.0.6 release or package has been published; complete release verification remains required and registries remain at 0.0.5.

## 0.0.6 lossless JSON redaction: source foundation, 31 October 2026

The pure redaction utility edits selected source spans rather than serializing parsed numeric values. Untouched text, whitespace, numeric exponents, large integers and duplicate keys remain exact. JSON Pointer selections cover every duplicate occurrence, and parent selections subsume child edits. Common credential-field suggestions are masked by default; configured exact secret values are detected in decoded strings, object keys and primitive lexemes. Suggestion metadata is capped with an explicit truncation flag while all detected fields are still masked. This is a review aid, not a guarantee to recognize every application's private fields or encoded credential representation.

All 85 frontend tests and the strict production build passed locally. Ten new tests cover nested arrays/objects, escaped and duplicate keys, root and overlapping selections, exact numeric preservation, secret-bearing keys, sanitized errors, prototype names and bounded size/depth/node/configuration work. Malformed or oversized JSON returns no partial body and directs the caller to omit or correct it.

This utility is not yet connected to downloads. Export preview, headers/URLs/contract metadata handling, shared reviewed payloads for both formats and native browser acceptance remain pending. No export roadmap checkbox or release gate is marked complete; public packages remain 0.0.5.

## 0.0.6 response checks: source milestone, 30 October 2026

Response checks now sit below the response, closed by default. The developer explicitly evaluates up to ten HTTP status, duration, JSON Pointer existence/equality checks against the current capture. Expected and observed values stay visible; editing configuration or receiving a new response invalidates old results. Evaluation never executes a request, changes manual progress or replaces the response. Configuration survives endpoint closure through the existing bounded tab draft cache and clears on reload; reopening requires evaluating results again.

All 75 frontend tests and the strict production build passed locally. Component/integration coverage includes explicit evaluation, invalidation, missing/unavailable values, configuration limits, focus after removal, cached drafts, fresh-session clearing and Ctrl/Cmd+Enter suppression inside checks. Installed FastAPI wheel and fresh native Node tarball browser checks both rejected 9007199254740992 and accepted 9007199254740993 against a captured id of 9007199254740993 without another execution. Browser checks also confirmed retained configuration after closing/reopening, response preservation, unchanged Done status, reload clearing, all five themes, 320/390-pixel layouts without document overflow and no console errors. The installed wheel verifier and clean CJS/ESM/TypeScript/npm consumer checks passed.

This source milestone does not publish 0.0.6. Reviewed exports and the full compatibility, upgrade and release sweep remain pending. Registry packages stay at 0.0.5.

## 0.0.6 response-check engine: source foundation, 29 October 2026

The shared frontend evaluator supports HTTP status, inclusive duration limits, JSON Pointer existence and structural equality. Decimal lexemes are compared without floating-point conversion or exponent expansion; large integers remain distinct. Missing fields differ from null, false, zero and empty strings. Duplicate keys, malformed/empty/non-JSON bodies, truncated responses and complexity limits produce explicit unavailable outcomes. Invalid expectations produce configuration errors. Evaluation reads a captured result only and does not mutate it or execute requests.

All 71 frontend tests and the strict production build passed locally. New coverage includes escaped pointer keys, canonical array indices, own-property lookup, nested structural equality, large/decimal/exponent values, duplicate escaped keys and size/depth/node/precision budgets. UI configuration, display and native browser checks remain pending. No response-check roadmap checkbox or release gate is marked complete; public packages remain 0.0.5.

## 0.0.6 session history: source milestone, 28 October 2026

The source tester now keeps bounded request history in tab memory, shared across expanded endpoints and retained when an endpoint closes. History records request inputs and response outcome/status/timing only; response bodies/headers and error details are not copied. Retained request-input data is capped at 5 MiB, 50 entries per tab and 10 per endpoint, with oldest-first eviction and visible notices. Safe JSON remains byte-for-byte; recognized credential-bearing/write-only/unsupported bodies are omitted and reported. Restoring an old contract requires explicit review, keeps the current body and applies only currently declared parameters. Restoration does not execute requests or replace current auth/response state.

All 64 frontend tests passed, including budget/eviction, immutable captures, encoded/duplicate-key credentials, exact large integers/duplicate keys, network failures, explicit restore with current auth, stale-contract review and clear actions. The strict production build passed. Browser checks against an installed native FastAPI wheel verified capture, unsaved-input preservation during review, explicit restore without replay, response preservation and reload clearing. Everblush and Paper were inspected; expanded history stays in the request column beside the response. Layout checks at 390/320 pixels showed no document-level horizontal overflow and no browser console errors.

This is unreleased 0.0.6 source work. Response checks, reviewed exports and complete release/upgrade gates remain pending; public packages remain 0.0.5.

## 0.0.6 realtime diagnostics: source milestone, 27 October 2026

The Python and Node doctor commands now accept explicit status-mode/Git flags and diagnose the environment-selected realtime service with bounded read-only health/access requests. The service access route returns authenticated permission only. Old-service 404, generic authentication rejection, reader/writer access, malformed responses, size limits, unavailable transport and conflicting/incomplete configuration have regression coverage. Responses and credentials are excluded from diagnostic output.

Local validation passed 145 Python tests, the Node suite including diagnostic regression tests, TypeScript consumer checks and the strict frontend build. An installed backend wheel and native Node tarball ran the cross-runtime consumer, including both installed doctor CLIs with separate writer and reader credentials. The shared SQLite file remained byte-identical across diagnostic reads; status delivery, migration, offline API execution, cached restart and reconnect recovery still passed. These are development artifacts; registry versions remain 0.0.5. Session history, response checks and reviewed exports remain pending, so no 0.0.6 publication is implied.

## Published 0.0.5 — 27 October 2026

[Python publication](https://github.com/nibir-ai/relay/actions/runs/40491186153) and [npm publication](https://github.com/nibir-ai/relay/actions/runs/40491187326) succeeded for source commit `c924bca`. The existing PyPI trust and newly configured npm trust both used GitHub OIDC. The [GitHub release](https://github.com/nibir-ai/relay/releases/tag/v0.0.5) includes the CI-built wheel, source archive, npm tarball and SHA-256 checksums.

The release passed Python 3.11/3.12/3.13 and Node 22.13/24/26 compatibility CI. Coverage includes 132 Python, 56 frontend and 21 Node tests, strict build, TypeScript consumers, independent installed artifacts, current/minimum Python dependencies, actual public-package upgrades and the browser migration/theme/mobile/export sweep below. The publication workflow repeated native, upgrade and package checks before upload.

After registry propagation, fresh unpinned installs resolved 0.0.5 from both registries. The plain Python consumer passed native assets, factory/router discovery, separate user/admin auth, execution, nested/optional bodies, arrays, validation, empty responses and disabled mode. The npm consumer passed CommonJS/ESM, TypeScript, CLI, bundled assets and real request execution without Python or consumer build scripts. An independent fresh `relay-backend[realtime]` PyPI installation ran the bundled service through `relay team serve`; the cross-runtime consumer installed the unpinned public npm package and passed reviewed create-only migration, stale-preview rejection, updater attribution, conflicts, private notes, offline execution, durable caches and reconnect recovery. No repository checkout was needed by either consumer.

Both registries briefly served prior metadata after accepting upload. The npm registry verifier now uses an isolated cache and prefers online metadata, so previous local metadata cannot masquerade as a new consumer installation. Publication success is recorded only after the public consumer checks passed.

## 0.0.5 migration and upgrade candidate — 27 October 2026

Local validation passed 132 Python tests, 56 frontend tests, the strict production build and TypeScript consumer checks. Native Node coverage includes reviewed create-only import and retained Git metadata. Independent wheel/tarball consumers passed native discovery, execution, assets and status persistence; Python clean consumers passed with both current and minimum supported dependencies. Twine validated wheel/source metadata. The backend wheel bundles the optional service from its canonical source, verified byte-for-byte; consumers install only `relay-backend[realtime]` to run the service and bridge.

The upgrade gate installed the actual public Python 0.0.4 and npm 0.0.3 packages in fresh environments, saved notes/statuses, upgraded those same installations to the candidate and verified retained metadata, unchanged native mount calls, legacy Python root-import compatibility, discovery, separate user/admin auth, execution and branding. The installed cross-runtime check verified preview-first Git import, stale-preview rejection, authenticated attribution, bidirectional delivery, conflict handling, private notes, offline API execution, cached backend restarts and service recovery. Existing Git files were preserved.

Browser checks against installed candidate artifacts verified explicit migration selection and acknowledgement, exclusion of existing team statuses, peer delivery, endpoint auth, captured responses and both JSON/`.relay` downloads. Everblush, One Dark, Gruvbox, Nord and Paper were inspected. The import dialog and tester had no document-level horizontal overflow at 390 and 320 CSS pixels; no browser console errors were recorded. This is a single-browser smoke/visual check, not a cross-browser benchmark.

At this candidate milestone, the npm publisher for `nibir-ai/relay`, `publish-node.yml`, environment `npm` was configured and publication/public-registry checks remained pending. The publication follow-up above records their completion.

## 0.0.5 native realtime integrations — 27 October 2026

Local checks passed: 129 Python tests, 54 frontend tests, 18 Node tests, the strict production build and TypeScript consumer checks. The Python and Node source integrations now connect to the optional service through backend environment configuration, with explicit local/Git/realtime authority selection. A cross-runtime consumer installed the built Python wheel with its realtime extra and the Node tarball outside the checkout, then verified bidirectional status delivery, matching contract fingerprints, server-attributed updater names, stale revision rejection, private local notes, offline API execution and local note saving, cached backend restart and service reconnect recovery. Metadata caches and exports were checked for developer credential leakage; realtime mode created no Git status file.

Browser testing against those installed artifacts verified both directions of status changes with updater attribution, preservation of an expanded operation and captured response, separate endpoint API auth, JSON and `.relay` exports with the current team status, and the realtime connection label. The 390-pixel layout had no document-level horizontal overflow or console errors. Frontend regression coverage checks displayed-revision submission, accepted-peer refresh after conflicts and API testing for read-only membership. Package keywords and the public API-testing workflow guide describe the supported testing capabilities.

At this native-bridge milestone the source remained unreleased and migration/upgrade gates were pending; the publication and migration follow-ups above record their completion.

## 0.0.5 live service transport — 27 October 2026

The team service now broadcasts committed status records through authenticated project-scoped Socket.IO connections. All 19 service tests passed, including real Python WebSocket clients, reader rejection, project isolation, explicit stale-write acknowledgements, HTTP-to-socket delivery and full-snapshot recovery after polling reconnect. An installed service wheel passed the Node consumer check with independent Socket.IO clients and a separate Python HTTP writer; accepted revisions arrived in order, credentials remained project-scoped, and missed state recovered after reconnect. Service startup/shutdown and the existing HTTP/restart smoke check remain covered. CI runs the Node transport consumer against a fresh service wheel on every Python compatibility-matrix entry.

At this transport milestone, Python/Node bridges, collaboration UI, gap/conflict UX and migration remained pending; the native-integration follow-up above records subsequent progress. No package release was published; the npm 0.0.4 authentication blocker is unchanged.

## 0.0.5 service foundation — 27 October 2026

The standalone team-service development package passed 16 focused tests covering authentication, project isolation, read/write roles, server-assigned attribution, restart durability and revocation, concurrent and stale updates, independent endpoint edits, strict mutation fields and environment-based startup. A wheel and source archive built successfully and passed Twine metadata checks. A fresh isolated environment installed the wheel with current dependencies (FastAPI 0.162.0, Uvicorn 0.54.0 and Pydantic 2.14.1); the installed service started outside the checkout and passed real HTTP authentication, writes, conflict acknowledgement and restart persistence checks. The public Python matrix runs the same service suite and installed-wheel smoke check.

This verifies the service foundation only. At this foundation milestone, socket delivery, Python/Node bridges, collaboration UI, reconnect/conflict UX, migration and complete 0.0.5 release gates were pending; the transport follow-up above records subsequent progress. No 0.0.5 package or release has been published. The existing npm 0.0.4 authentication blocker is unchanged.

## Published Python 0.0.4 — 12 October 2026

Python 0.0.4 is published on PyPI and GitHub. Node 0.0.4 passed the publishing workflow verification job, and its CI-built tarball is attached to GitHub; the npm upload returned `ENEEDAUTH` and is awaiting account authentication. Local validation passed on Windows with Python 3.12 and Node 26.3: 103 Python tests, 16 Node tests, 51 frontend tests (including endpoint export status), strict frontend production build, Node consumer type checks, Twine metadata checks, and clean isolated Python wheel and Node tarball consumers. Python wheel consumers passed with current dependencies (FastAPI 0.143.0, Uvicorn 0.54.0, HTTPX 0.28.1) and minimum supported dependencies (FastAPI 0.115.0, Uvicorn 0.30.0, HTTPX 0.28.0). The clean consumers verified setup preview/apply and diagnostics as well as their existing integration checks.

The suite covers bounded project scans, conservative source editing, diagnostics that avoid exposing request data, schema-change summaries and explicit review, local note persistence, save/poll races, shared Git retry behavior and failed-write recovery. A local fixture verified OpenAPI and mounted-health diagnostics. A targeted Node grouping microbenchmark on 1,000 endpoints measured 0.038 ms per group operation after replacing repeated array copies (2.027 ms before); this measures the isolated grouping operation, not browser rendering.

Public [Python CI](https://github.com/nibir-ai/relay/actions/runs/38232693977) passed on Python 3.11, 3.12 and 3.13, and [Node CI](https://github.com/nibir-ai/relay/actions/runs/38232694004) passed on Node 22.13, 24 and 26 for source commit `9020572`. Browser interaction and visual checks were completed on 26 October 2026 using the bundled UI against an isolated native FastAPI example. The sweep covered endpoint search and keyboard expansion, separate user/admin bearer overrides (including rejection of a user token by the admin endpoint), nested JSON execution, malformed JSON feedback, HTTP 422 validation and HTTP 204 responses, response copying, response focus, local note saving, status updater identity and schema refresh. Both JSON and `.relay` downloads contained the selected endpoint and captured response. Everblush, One Dark, Gruvbox, Nord and Paper were inspected; layouts at 1440, 390 and 320 CSS pixels showed no document-level horizontal overflow, and the narrow authorization dialog remained usable. No browser console errors were recorded. This is a single-browser smoke and visual check, not a cross-browser or performance benchmark. npm public installation verification remains pending until account authentication and upload succeed. An existing FastAPI/Starlette TestClient deprecation warning appeared during the Python suite; all tests passed.

[Python publication](https://github.com/nibir-ai/relay/actions/runs/38234343186) succeeded for source commit `1a189a6`. A fresh environment installed the unpinned public `relay-backend` package as 0.0.4 and passed native assets, discovery, authenticated execution, request validation, notes/statuses and disabled-mode consumer checks. The CI-built wheel, source archive and verified Node tarball are attached to the [GitHub release](https://github.com/nibir-ai/relay/releases/tag/v0.0.4). [Node publication](https://github.com/nibir-ai/relay/actions/runs/38234362908) passed all verification steps but its upload requires npm account authentication.

## Published 0.0.3

This release adds the canonical import, application-specific titles and opt-in automatic status synchronization. Tests use two independent backend clones and a bare remote. They cover background propagation with updater identity, concurrent push retries, preservation of staged and uncommitted application code, unavailable remotes, invalid metadata, exclusion of non-status fields and native lifespan cleanup.

Package verification compares every bundled brand SVG and favicon with its source master. Consumer verification runs outside the checkout without Node or an editable install, exercising actual native handlers, separate user/admin authentication, routers, application factories, nested and optional bodies, query arrays, validation errors, empty responses, UI assets and disabled integration.

Local validation passed: 89 Python tests, 42 frontend tests, the strict build, independent wheel verification, Twine checks and clean consumer installs with current and minimum supported dependencies. [Public CI](https://github.com/nibir-ai/relay/actions/runs/37915243315) passed on Python 3.11, 3.12 and 3.13. An independent environment also received existing statuses and updater identities through a real GitHub remote. [Publication](https://github.com/nibir-ai/relay/actions/runs/37915487491) succeeded. After the index refreshed, an unpinned `pip install relay-backend` retrieved 0.0.3 in a fresh virtual environment and passed native consumer checks. A backend using Socket.IO was upgraded to the published package, with 65 discovered endpoints, native HTTP 200 execution, automatic remote status sync, application-specific title and bundled identity links verified. Both browser export downloads contained the endpoint and captured response. Cross-machine synchronization requires the existing Git remote's read/write credentials; tests use local independent repositories and do not claim verification of every credential provider.

## Published 0.0.2

- 82 Python tests and 40 frontend tests passed, along with the production build and package metadata checks.
- Clean consumer installs passed with current and minimum runtime dependencies.
- Public CI passed on Python 3.11, 3.12 and 3.13.
- Browser testing exercised protected requests, response inspection and both export formats at desktop and mobile widths.
- Trusted Publisher upload succeeded; a fresh PyPI installation of the published version passed native UI/assets, discovery, real handler execution, authentication and disabled mode.

[Release](https://github.com/nibir-ai/relay/releases/tag/v0.0.2) · [CI](https://github.com/nibir-ai/relay/actions/runs/37895317862) · [Publication](https://github.com/nibir-ai/relay/actions/runs/37895481789)

## Published 0.0.1

The first release passed local tests, clean package installation and public Linux CI on Python 3.11/3.12/3.13. Trusted Publishing succeeded and the actual PyPI package was verified outside the development checkout.


## Published Node npm 0.0.3

The npm package is published at [relay-backend 0.0.3](https://www.npmjs.com/package/relay-backend/v/0.0.3). An unpinned fresh `npm install relay-backend` resolved 0.0.3 and passed the clean-consumer checks. The existing Python 0.0.3 release remains published unchanged.

- Nine native Node tests passed against real Express/Fastify/Node HTTP servers and independent Git peers.
- CommonJS and ESM TypeScript consumers passed strict checks, including a clean Express installation without Fastify installed.
- Clean tarball installation with lifecycle scripts disabled passed UI asset loading, schema discovery, request execution and CLI checks. No Python or frontend build ran in the consumer directory.
- Browser verification on a native Node backend passed endpoint discovery, per-endpoint bearer authorization, real response inspection and both JSON/Relay exports.
- The existing 42 frontend tests passed.
- [Node CI](https://github.com/nibir-ai/relay/actions/runs/37919315565) passed on Node 22.13, 24 and 26. [Python CI](https://github.com/nibir-ai/relay/actions/runs/37919315577) passed on Python 3.11, 3.12 and 3.13 for the same implementation commit.
- Missing-package startup guidance was tested in isolated Python without site packages; transitive dependency errors remain visible.

Supported native Node adapters are Express, Fastify and Node HTTP at the application root. Other frameworks/runtimes and Node handler source-author inference are not verified support. Generated OpenAPI remains required.
