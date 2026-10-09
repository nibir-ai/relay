# Troubleshooting

## Array query parameters or optional bodies fail

Array query inputs use JSON notation: `["one", "two"]`, not `one,two`. Clear an optional request body to omit it. For a required body, use the JSON editor to supply the schema's required fields. Backend HTTP 422 details identify the field that failed validation.

## Response still shows the previous run

Relay preserves the last captured response while you edit and when a new request fails before returning a response. Check the last-run timestamp and the request error. Execute successfully to replace it. An HTTP 401/403/422 is a captured backend response and does replace it.

## Large response is unformatted or incomplete

Bodies over 200,000 characters are displayed without formatting or syntax highlighting. Responses above the 2 MiB retention limit have a visible truncation notice; Copy and exports include the retained preview only. Use your backend's own logs or another streaming client when the full payload exceeds this limit.

## `/relay` is 404

Package installation alone does not mount routes. Confirm `install_relay(app)` runs on the served FastAPI instance, `enabled` is true, and the backend was restarted. Use its existing port. `/` may remain 404. In factories mount on the returned instance; for Socket.IO mount before wrapping.

## Wrong install/environment

If your backend cannot import Relay, run **`pip install relay-backend`** in that backend's environment. The absent package cannot customize Python's import error itself. To show a helpful startup message, guard the import in your server:

```python
try:
    from relay_backend import install_relay
except ModuleNotFoundError as error:
    if error.name != "relay_backend":
        raise
    raise SystemExit("Relay is not installed. Run: pip install relay-backend") from None
```

This preserves errors from missing dependencies inside Relay instead of misreporting them. The [runnable FastAPI example](../examples/fastapi/main.py) includes this guard. For Node backends, install the npm package with `npm install relay-backend`; see [Node setup](NODE.md).

Install `relay-backend`, import `relay_backend`; PyPI's `relay-agent` is unrelated. Use the backend's Python environment:

```sh
python -m pip show relay-backend
python -c "import relay_backend; print(relay_backend.__file__)"
```

Before publication, install the release-candidate wheel. Consumers should not need Node or a checkout.

## Missing assets

Use the bundled official wheel. Editable contributor checkouts need `python scripts/package.py`; custom `static_dir` is a contributor override. The canonical `/relay/` and emitted base URL keep assets under the mount.

## Relay returns 403

Use localhost/127.0.0.1 and a loopback client. Public/LAN hostnames and tunnels are out of scope. Refresh after restart for the current CSRF token. Do not disable Host/Origin/Fetch Metadata/CSRF checks to host this development tool publicly.

## Backend 401/403/422

These can be genuine responses. Submit the correct shared/endpoint auth explicitly; endpoint None suppresses shared tokens. Fill required inputs and inspect body/headers. Relay does not bypass backend validation/permissions.

## Missing new routes

Restart/reload, then Sync. Dynamic FastAPI route changes may need `app.openapi_schema = None`; Relay cannot bypass the host's schema cache.

## Git status or author unavailable

Run from the Git project or pass `project=Path(...)`. Commit source before expecting committed attribution. Expand for author details; they are absent from collapsed rows by design. Configure Git identity, pull shared status metadata, resolve conflicts and Sync. Shallow/squashed/untracked/wrapped source can limit attribution.

## Report does not double-click

Try `relay open "file.relay"`. On Windows run `relay associate` from the installed environment and inspect Open with defaults if needed. macOS/Linux desktop registration is not included. JSON renamed `.relay` is not a valid report.

## Compact UI seems unchanged

Live UI applies 90% scale. Reset browser zoom to 100% and refresh; browser zoom compounds it. Export reports use their own reading layout.

## Unsupported/incomplete data

Multipart, OAuth browser flows, external refs and YAML are unsupported. Complex schemas may need manual JSON. Requests are capped at 1 MiB, response/spec retention at 2 MiB, execution at 20 seconds. Truncation is explicit and preserved in exports.
