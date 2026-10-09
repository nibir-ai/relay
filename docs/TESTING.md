# Testing APIs

## Find and execute

Endpoints are read-only definitions from OpenAPI, grouped by their first tag. Search matches method/path/summary/category; method and status filters narrow results. Open all/Close all controls visible categories, and APIs expand inline.

Enter path/query/header/cookie values and a request body. Execute request is above the inputs. `/` focuses search; `Ctrl+Enter`/`Cmd+Enter` executes the active endpoint.

Generated fields cover straightforward JSON objects; the JSON editor handles more complex schemas. JSON, text and URL-encoded form bodies are supported. Missing required inputs and invalid JSON are checked before execution. Multipart upload is not supported.

Native execution invokes real handlers, middleware, dependencies, validation and startup state. It can change development data. HTTP 401/404/422 responses are inspectable backend responses, not necessarily Relay transport errors.

## Auth

Header Authorize sets shared bearer auth. Paste with or without `Bearer`, then explicitly submit Authorize. Cancel/Escape discards unsubmitted edits.

Endpoint Auth beside status supports distinct admin/user credentials without expanding the API. Use shared auth resets the override. Advanced settings offers Shared bearer, Endpoint bearer, Basic, header API key and None. None suppresses shared auth. Backend permissions remain authoritative; Relay does not grant roles.

Credentials and request drafts remain in session memory across endpoint switches and clear on reload. A token found in a response can be applied with Use as bearer token. OAuth browser authorization flows are out of scope; manually obtained tokens work.

Headers accept JSON string values or `Name: value` lines. Duplicate names/invalid input are rejected. The runner manages Host and transport headers.

## Response inspection

The desktop response pane is wider. Focus response makes it full width; Back to request preserves inputs. Narrow screens stack panes. Body formats JSON where possible; Raw keeps captured text. Headers and Request expose metadata. Wrap lines is optional; default unwrapped lines preserve JSON structure.

Copy acts on the selected view. Copy request URL includes entered path/query values. Generated code snippets redact recognizable secrets. Export offers a browser report or structured JSON without executing a request.

Metadata shows status, duration and retained bytes. Requests cap at 1 MiB, response/spec retention at 2 MiB and execution at 20 seconds. Truncation is labeled and carried into exports. Redirects are shown without following; response cookies never become implicit auth on future runs.

## Sync and progress

Sync reloads schema; Auto sync checks every ten seconds. Invalid imports preserve the previous successful contract. FastAPI's schema cache still applies. Done is the default manual status; execution never changes it. A contract change can flag a previously Done API as Needs fixing.

## Execution boundaries

Relay enforces loopback Host/client checks, Origin, Fetch Metadata and CSRF. Native ASGI execution does not test network/TLS/DNS or middleware outside the FastAPI host. Standalone mode targets literal loopback HTTP origins, with redirects and ambient proxies disabled.
