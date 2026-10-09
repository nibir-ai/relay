# Changelog

## 0.0.3 (in preparation)

- Canonical `relay_backend` import with compatibility for existing root `relay_agent` imports.
- Application-specific `Relay - <name>` browser titles and versioned bundled favicon refresh.
- Opt-in automatic team status exchange through a separate Git branch, with updater identity and concurrent-edit handling.
- Browser workspace refresh without manual Git commands or losing request drafts.
- Removed unused artwork and generation metadata; package checks compare bundled brand masters against source.
- Unpinned latest-version consumer installation checks and documented upgrades.

## 0.0.2 — 9 October 2026

Published on [PyPI](https://pypi.org/project/relay-backend/0.0.2/) and [GitHub](https://github.com/nibir-ai/relay/releases/tag/v0.0.2).

- Refined terminal mark, plain Relay browser title and consistent report branding.
- Array query serialization, blank optional-body support and consistent header validation.
- More accurate effective-auth feedback, validated endpoint credentials and independent explicit Authorization/API-key headers.
- Previous responses preserved after failed requests; empty bodies and truncated-copy/export boundaries made explicit.
- JSON formatting and reports preserve large integers and duplicate keys; large bodies avoid costly formatting.
- Runnable FastAPI factory/router example with user/admin auth, nested bodies and validation cases.
- Custom visual guides and simpler installation documentation.
- Clean-install verification exercises actual handlers and authentication outside the checkout; Socket.IO integration coverage added.

## 0.0.1 — 9 October 2026

Published on [PyPI](https://pypi.org/project/relay-backend/0.0.1/) as `relay-backend`, import `relay_agent`, under Apache-2.0.

- Bundled offline UI mounted at `/relay/`; `install_relay(app)` and optional `enabled=` development flag.
- Native schema discovery and execution through FastAPI middleware/dependencies/startup state.
- Categorized inline APIs, method colors, filters, manual status defaulting Done and Git workflow/source attribution.
- Shared/per-endpoint auth, request inputs, body/raw/header inspection, copy/snippets, response focus and wrapping.
- Five themes, custom Relay branding, terminal chrome and compact UI scale.
- Relay/JSON exports, offline opener and Windows user-level file association.
- Self-contained wheel/sdist, dependency notices, clean-install verification and Trusted Publishing workflow.

Python 3.11+; native FastAPI is the primary integration, with standalone local OpenAPI CLI also included. Multipart, OAuth browser flows, public deployment, realtime collaboration, YAML/external refs and macOS/Linux desktop associations are not included.
