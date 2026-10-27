# Test a backend with Relay

Relay is a local API client for testing REST endpoints from a backend's generated OpenAPI document. It provides categorized API operations, bearer authorization per endpoint, request execution, response inspection and copying, manual endpoint statuses and `.relay`/JSON exports. Endpoints remain defined by the backend code.

## FastAPI

Install the published package in the backend's Python environment:

```sh
python -m pip install --upgrade relay-backend
```

Mount Relay on the existing application, after creating it:

```python
from relay_backend import install_relay

install_relay(app)
```

Start the backend normally and open `/relay/` on its existing localhost port. Keep the mount in development configuration. Routers and application factories are supported; see [the FastAPI guide](FASTAPI.md).

## JavaScript and TypeScript

```sh
npm install relay-backend
```

Use `relay({openapi: generatedSchema})` for Express/Node HTTP, or `relayFastify(app, options)` with a generated OpenAPI schema. A schema already exposed at `/openapi.json` can be discovered without passing it. See [Node setup](NODE.md) for framework examples and the generated-schema requirement.

## Testing workflow

1. Open the backend's `/relay/` page and find an endpoint by category, method or path.
2. Use **Auth** beside an endpoint for an admin/user token override, or **Authorize** for shared authentication. Application API tokens remain separate from developer collaboration credentials.
3. Enter path/query values, headers and the request body, then execute the request.
4. Inspect status, response body, headers and timing; copy the response or request URL as needed. Validation errors and empty bodies are displayed explicitly.
5. Set a manual status if the endpoint needs review. HTTP success does not automatically approve an endpoint.
6. Export a captured endpoint as `.relay` or JSON when sharing a reproducible report. Inspect exports for sensitive request/response data before sharing them.

Relay executes requests locally against the selected backend. It does not require a hosted testing account or forward API traffic to a team-status server.

## Programmatic local testing

The local companion uses the backend's `/relay/__relay/` namespace. Read `health` to obtain the local CSRF token, then send same-origin POST requests with both `Origin` and `X-Relay-CSRF`. The browser UI uses the same routes:

| Route | Method | Purpose |
| --- | --- | --- |
| `health` | GET | Local session token, backend URL and package version. |
| `sources/inspect` | POST | Discover the generated OpenAPI contract. |
| `workspace` | GET | Endpoint metadata and team-sync connection state. |
| `execute` | POST | Execute a relative API method/path with explicit parameters, headers and body. |
| `endpoints/update` | POST | Save a local note or explicitly change an endpoint status. Realtime writes require the displayed `team_revision` as `expected_revision`. |

These are local companion routes, not public backend APIs. They require the same localhost/origin checks as the UI. See [testing and verification](TESTING.md) for runnable fixtures and consumer checks. Realtime integration is under development for 0.0.5; consult [team setup](REALTIME.md) before enabling it.
