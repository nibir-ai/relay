# Relay

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="apps/web/public/brand/relay-logo.svg" />
  <img src="apps/web/public/brand/relay-logo-light.svg" width="196" height="48" alt="Relay" />
</picture>

A local API tester for your backend: categorized endpoints, clear responses, quick authentication and one status control beside each API.

## Add Relay to FastAPI

Requires Python 3.11+. The v0.0.1 artifacts are prepared; **PyPI publication is pending**. After publication, install in your backend's Python environment:

```sh
python -m pip install relay-backend==0.0.1
```

Add these two lines after creating your FastAPI application:

```python
from relay_agent import install_relay

install_relay(app)
```

Start your backend normally and open `/relay` on its existing port. Relay includes the UI, fonts and assets. You need no repository clone, Node installation, frontend build, target URL or second server. It reads your app's OpenAPI and executes requests through its middleware and dependencies.

Use your development setting to control installation:

```python
install_relay(app, enabled=settings.DEBUG)
```

Install before wrapping FastAPI with Socket.IO. Application factories, custom OpenAPI generators, lifespan and proxy prefixes are covered in the [FastAPI integration guide](docs/FASTAPI.md). Until publication, install the built wheel from `dist/relay_backend-0.0.1-py3-none-any.whl`.

The distribution name is **relay-backend**. The import is **relay_agent** and the CLI is **relay**. The `relay-agent` project on PyPI is unrelated.

## What ships in v0.0.1

- Inline APIs grouped by OpenAPI tags, method colors, search and editable request inputs. Endpoint definitions remain code-generated.
- Shared or per-endpoint authorization with explicit Authorize actions; advanced bearer, Basic and header API key settings.
- Request execution, response inspection, copy controls, response focus, optional line wrapping and code snippets.
- Manual statuses defaulting to Done, Git-shared status updates and native FastAPI handler attribution.
- Everblush, One Dark, Gruvbox, Nord and Paper themes with Relay branding.
- Per-endpoint `.relay` browser reports and structured JSON exports, plus a local report opener and Windows file association.
- A standalone CLI for loopback OpenAPI backends.

This first release is an alpha for local development. Multipart uploads, OAuth browser flows, YAML/external references, instant team synchronization and public hosting are outside its scope. A successful request does not automatically change status. Git collaboration uses normal commits, pushes and pulls.

Tokens and drafts stay in browser session memory. Explicit exports include request bodies, parameters and captured responses, which may contain secrets; inspect them before sharing. See the [export format and handling guide](docs/EXPORTS.md).

## Documentation

Start with the [documentation index](docs/README.md).

- [FastAPI setup and configuration](docs/FASTAPI.md)
- [Testing requests, authentication and responses](docs/TESTING.md)
- [Git status and source attribution](docs/GIT.md)
- [Exports and opening `.relay` files](docs/EXPORTS.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Contributing and verification](docs/CONTRIBUTING.md)
- [Release and PyPI publishing](docs/RELEASING.md)
- [Brand identity](docs/BRAND.md)

## License

Relay is [Apache-2.0](LICENSE). Bundled frontend dependencies and font licenses are included in [third-party notices](THIRD_PARTY_NOTICES.md).
