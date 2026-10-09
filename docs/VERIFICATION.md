# Verification

## v0.0.2 release candidate: 9 October 2026

- Windows/Python 3.12: 82 Python tests and 40 frontend tests pass; strict TypeScript/Vite production build succeeds.
- Clean wheel installs outside the checkout pass with current and minimum runtime dependencies: bundled assets, factory/router discovery, user/admin authentication, nested and optional bodies, repeated query arrays, 422 validation details, empty 204 responses, default Done status and disabled mode.
- Socket.IO wrapper integration preserves host lifespan and serves Relay; native execution reaches the FastAPI host.
- The independently installed wheel verifies standalone and native UI/assets, discovery, execution, status and CLI. Twine validates wheel and source archive.
- Browser verification returned real 200 responses for a repeated query array and an admin endpoint authorized through the quick dialog. Copied URL preserved repeated keys. Downloaded JSON and Relay reports retained the tested response.
- Desktop and 390px mobile inspection has no page overflow. Formatting preserves large integer tokens and duplicate JSON keys, avoids formatting large bodies and caps indentation for deeply nested content.
- Design detection found the existing report's `RelayMono` alias missing from design metadata; this alias embeds the same JetBrains Mono font already used by the product. No report typography or palette was changed for this release.
- Public Python 3.11/3.12/3.13 CI and PyPI publication are pending; local validation alone does not establish publication.

## Earlier verification: 8 October 2026

Completed on Windows with Python 3.12 and Node 26.

- Python: 73 tests pass. Covers native and standalone FastAPI execution, origin/CSRF/path/header checks, limits and transport failures, contract normalization, local persistence, conflict handling, commit/clone sharing with updater identity, Git autodetection/source history, default-status migration, and native lifespan preservation/cleanup. One upstream Starlette HTTPX TestClient deprecation warning.
- UI: 26 tests pass. Covers request validation, auth normalization/overrides, token-dialog interactions, secret redaction, pasted header parsing, resolved URL copying, default Done, and source authors distinct from status updaters.
- Strict TypeScript and production build pass. Dependency audit reports no known vulnerabilities.
- Socket smoke passes: `/relay`, four discovered operations, login 200/401/422, path/query GET, protected auth 401/200, and origin rejection.
- Browser checks: real bearer login/adoption and protected 200; raw pasted headers execute successfully; response body and headers copy the selected data; URL copying includes entered path/query values; inline operation expansion, session draft restoration, sync preservation, manual progress, responsive stacking, and five named themes work. Execute is above the request fields; shared authorization opens a compact dialog; response Copy is outside the wrapping view tabs. Auth buttons appear beside every endpoint; browser execution with an invalid shared token and valid endpoint override returned protected200. Tests verify credential isolation and restoration after endpoint switches. Native popup colors are set in CSS, but browser screenshots do not capture the OS popup. No console errors/warnings observed.
- Python wheel builds and installs in an isolated temporary directory. Its UI, JS/CSS, and custom artwork serve without the source checkout. Package contents exclude stale build assets.

![Categorized testing workspace with an actual response](relay-v3.jpg)

Current visual evidence is under `.impeccable/review/`: desktop, narrow, mobile and the four alternative palettes. The package remains unpublished. Git tests use temporary repositories and synthetic identities. The demo is local-only, with manually selected demo statuses; it does not claim team verification or live collaboration.

Readability refinement: default browser size produces 17px endpoint paths, 15px inputs, 16px JSON/response text, 14px auth/status controls. Root uses 100% and rem-based roles. Browser checks at 1440, 837, 390 and 320px preserve layout; no horizontal overflow measured at mobile widths. Controls and row heights accommodate larger type. Current image: `relay-readability.jpg`.

Brand extension: original separated-R symbol and outlined lowercase wordmark replace the generic header icon/text. Native assets load and follow all five theme colors; Everblush and Paper captures are checked alongside 390px and 320px app layouts. The identity sheet loads its bundled external stylesheet under the existing CSP and fits a 390px viewport. A real GET /api/health returned 200 in the branded tester. The final wheel builds and the independent installed-wheel check verifies brand SVGs, favicon, identity HTML/CSS, UI assets and runner. Brand masters and favicon rebuild from scripts/brand_assets.py. Current evidence: relay-branded-ui.jpg and brand/relay-identity-sheet.jpg. Generated concept artwork retains its exact prompt; documentation screenshots carry origin metadata.

Auth dialog refinement: endpoint Auth opens a native mini dialog without expanding the API. Submit/Enter applies normalized bearer credentials; Cancel/Escape leaves the previous token intact. Browser protected requests returned actual200 for both an endpoint override against an invalid shared token and a shared token after canceled edits. Tab wraps within the dialog, Escape restores trigger focus, and the request shortcut ignores dialog entry. Global inline token strip is removed; focus styling surrounds the input/reveal group. Advanced settings opens/focuses the inline Advanced auth disclosure. Tests verify submission, cancel, validation, credential isolation, mode reset and advanced settings. 25UItests in8files, strictbuild and independently installed wheel pass. Captures auth-dialog-* in .impeccable/review; current screenshot docs/relay-auth-dialog.jpg.

Native FastAPI integration: install_relay(app) mounts the tester, internal API, and assets under /relay on the backend's existing port. No child process or target/port configuration. Tests cover custom/disabled OpenAPI URLs, late route definitions, host middleware and yielded lifespan state, startup/shutdown and repeated lifespan, root_path execution, namespace conflicts/catch-all handling, remote-client rejection, encoded recursion/path escape, bounded response retention, HTTP 500/422/redirect handling, cookie isolation, and status persistence without automatic progress updates. UI tests (25) and strict production build pass. The rebuilt wheel installs outside the checkout and verifies both the standalone and native UI/assets, discovery, execution, and status writes. Browser at http://127.0.0.1:8000/relay/ discovered four operations and returned actual200 for health and protected /api/auth/me using the endpoint authorization dialog. Status stayed Not started. Evidence: relay-native-fastapi.jpg. This integration tests the app's ASGI behavior, not external network/proxy/TLS behavior; one development worker is supported and the package remains unpublished.

Default Done/source attribution extension: new discovery and untouched legacy defaults become Done; tests preserve manual Not started choices across migration and sync. Git history tests distinguish Alice introducing a handler from Bob editing it and Alex changing status, label local/untracked changes, and cover nested included-router prefixes with hidden routes excluded. Source metadata remains ephemeral and separate from OpenAPI fingerprints and Git status files. Live Ludo backend at localhost:8081 reports 65/65 Done and 65 inferred Git creators. Cached Sync measured 62ms after a cold history read around7.4seconds. Browser GET /health returned actual200 with source attribution visible; no status mutation from testing. Desktop and390/320 viewports checked with no horizontal overflow. Current evidence: relay-git-authors-desktop.jpg, relay-git-authors-mobile.jpg, relay-git-authors-small-mobile.jpg. 73 backend tests, 26 UI tests, strict build, and independently installed wheel verification pass.

## v0.0.1 release candidate — 9 October 2026

- Windows/Python 3.12: 79 Python tests and 30 UI tests pass; strict TypeScript/Vite build succeeds.
- `relay-backend` wheel and source archive build with bundled UI, fonts, Apache-2.0 license and third-party notices. Wheel is built from source archive.
- Independently installed wheel verifies native UI/assets, discovery, execution, status and CLI outside the editable checkout.
- A fresh virtual environment installs the wheel with current dependency resolution and verifies the default two-line FastAPI integration, bundled assets, real handler execution and disabled mode without source/Node requirements.
- Twine validates both artifacts. CI is configured for Python 3.11/3.12/3.13; those remote results must be inspected separately.
- PyPI publication is pending account-side Trusted Publisher configuration. Build/validation success is not publication.
- Fresh installation also passes with the declared minimum FastAPI 0.115.0, Uvicorn 0.30.0 and HTTPX 0.28.0 runtime versions.

Published 9 October 2026: release workflow build and Trusted Publisher upload succeeded. Public PyPI install of relay-backend==0.0.1 passed in a fresh virtual environment, including bundled UI/assets, native discovery, actual endpoint execution and disabled mode. Linux CI passed on Python 3.11/3.12/3.13.
