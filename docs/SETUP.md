# Guided setup and diagnostics

Relay 0.0.4 adds local setup commands to both distributions. They inspect source without importing or executing your backend, installing dependencies, or enabling Git sync.

## Preview integration

Run from your backend directory, or select it with `--project`:

```sh
python -m relay_backend init --project ./backend
npx relay-backend init --project ./backend
```

The Python command detects direct FastAPI imports and previews a mount after one unambiguous top-level application assignment. The Node command detects Express/Fastify imports. Simple JavaScript Express entries receive a replacement preview that inserts Relay before body parsers. No files change during preview.

To apply a supported edit, add `--apply`:

```sh
python -m relay_backend init --project ./backend --apply
npx relay-backend init --project ./backend --apply
```

Review the preview first. Repeated initialization leaves existing Relay imports unchanged. Application factories, multiple applications, reassigned names, TypeScript, Fastify plugin ordering and unusual layouts receive manual instructions. Select a smaller project directory if a monorepo scan is ambiguous. Scans exclude dependency/build directories and symlinks, inspect at most 500 source files and cap each file at 512 KiB.

FastAPI: add `from relay_backend import install_relay` and `install_relay(app)` after creating your app, before Socket.IO wrapping. Fastify: register `@fastify/swagger` before `relayFastify`. Express: mount `relay()` before body parsers. Node requires generated OpenAPI; expose `/openapi.json` or pass `openapi` to the adapter. Restart with your normal backend command and open `/relay` on its existing port.

The commands print installation guidance if needed; they never run pip/npm install or modify lockfiles themselves.

## Diagnose a running backend

```sh
python -m relay_backend doctor --target http://127.0.0.1:8000
npx relay-backend doctor --target http://127.0.0.1:3000
```

Use `--spec-path /your-schema.json` for a custom schema route and `--project ./backend` for Git configuration checks. Without `--target`, only local runtime/package and Git configuration are checked.

Diagnostics fetch only the explicitly supplied local OpenAPI route and `/relay/__relay/health`, with response/time limits and no redirects. They never execute business endpoints or mutate Git state. A missing native mount is expected when you only use a standalone tester; the output explains that distinction. A mount check cannot verify all middleware ordering, factory configuration or proxy routing.

The Git check reports whether an origin remote is configured. It does not connect to the remote or prove write access. For automatic Git sharing, use `sync_status=True` on FastAPI or `syncStatus: true` on Node explicitly, then inspect the browser's team sync state. A Git name is attribution, not authenticated developer identity.

Use `--json` for a shareable diagnostic result. Output omits URLs, Git stderr, schema bodies, request/response traffic and health tokens. Errors return exit code 1; informational optional checks do not.

When Relay is unavailable, check the interpreter/package, backend start command, target port, schema route and native mount. [Troubleshooting](TROUBLESHOOTING.md) covers integration details.

## Realtime diagnostics: 0.0.6 development

These additions are implemented in source and are not part of the published 0.0.5 CLI yet. Use the same private backend environment as your running application; doctor does not import application code or load `.env` files automatically.

```sh
relay doctor --project ./backend --status-mode realtime --json
npx relay-backend doctor --project ./backend --status-mode realtime --json
```

`--status-mode local|git|realtime` and the optional Git `--sync-status` flag reproduce the selected backend authority for diagnosis. Explicit local/Git mode ignores realtime environment settings, matching native integration behavior. Realtime plus Git sync, incomplete credentials, invalid origins and invalid project IDs produce actionable errors without a network request. Without explicit flags, the three realtime environment variables select realtime; otherwise the output describes the doctor's local configuration, not a claim that it inspected the running app's options.

The realtime check makes bounded GET requests to the service health and access routes. It distinguishes reachability/protocol problems, generic rejected project access and verified reader/writer permission. Authentication failures intentionally do not distinguish an unknown project from an invalid credential. An older service without the access route is reported as reachable with access **not verified**, rather than assumed authorized. Upgrade the shared service to enable permission diagnosis.

Output omits tokens, response bodies and credential-bearing URLs, including in JSON. The check does not execute business endpoints, change membership, write statuses or modify Git/source files. `--target` still independently checks the local schema and Relay mount.
