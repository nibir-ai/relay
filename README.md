# Relay

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="apps/web/public/brand/relay-logo.svg" />
  <img src="apps/web/public/brand/relay-logo-light.svg" width="196" height="48" alt="Relay" />
</picture>

A local API tester for your backend: categorized endpoints, clear responses, quick authentication and one status control beside each API.

## Add Relay to FastAPI

![Install Relay, mount it on your FastAPI app, and open /relay on the existing backend port.](docs/assets/fastapi-quickstart.png)

### 1. Install

In your backend's Python environment (Python 3.11+):

```sh
python -m pip install relay-backend==0.0.2
```

### 2. Add two lines

In the file where you create `app = FastAPI()`:

```python
from relay_agent import install_relay
install_relay(app)
```

### 3. Open `/relay`

Restart your backend with its usual command. Open `/relay` on that backend's port. For example, a backend at `http://localhost:8000` gets Relay at `http://localhost:8000/relay`.

That's the setup. Relay includes the UI, fonts and assets, discovers your APIs from OpenAPI, and executes through your app's middleware and dependencies.

<details>
<summary>Optional settings and integration details</summary>

Use your development setting to control installation:

```python
install_relay(app, enabled=settings.DEBUG)
```

Install before wrapping FastAPI with Socket.IO. Application factories, custom OpenAPI generators, lifespan and proxy prefixes are covered in the [FastAPI integration guide](docs/FASTAPI.md). Alternatively, install the wheel attached to the [v0.0.2 release](https://github.com/nibir-ai/relay/releases/tag/v0.0.2).

The distribution name is **relay-backend**. The import is **relay_agent** and the CLI is **relay**. The `relay-agent` project on PyPI is unrelated.

</details>

## What Relay includes

- Inline APIs grouped by OpenAPI tags, method colors, search and editable request inputs. Endpoint definitions remain code-generated.
- Shared or per-endpoint authorization with explicit Authorize actions; advanced bearer, Basic and header API key settings.
- Request execution, response inspection, copy controls, response focus, optional line wrapping and code snippets.
- Manual statuses defaulting to Done, Git-shared status updates and native FastAPI handler attribution.
- Everblush, One Dark, Gruvbox, Nord and Paper themes with Relay branding.
- Per-endpoint `.relay` browser reports and structured JSON exports, plus a local report opener and Windows file association.
- A standalone CLI for loopback OpenAPI backends.

This first release is an alpha for local development. Multipart uploads, OAuth browser flows, YAML/external references, instant team synchronization and public hosting are outside its scope. A successful request does not automatically change status. Git collaboration uses normal commits, pushes and pulls.

Tokens and drafts stay in browser session memory. Explicit exports include request bodies, parameters and captured responses, which may contain secrets; inspect them before sharing. See the [export format and handling guide](docs/EXPORTS.md).

## Roadmap: v0.0.2

- [x] Ship the refined Relay branding consistently across the tester, reports and documentation.
- [x] Harden request testing for nested bodies, optional fields, arrays, path/query parameters, validation errors and empty responses.
- [x] Clarify effective authentication and keep shared and endpoint credentials independent, with quick switching.
- [x] Improve large-response inspection, truncation feedback and accurate copying and exports.
- [x] Verify seamless FastAPI integration with routers, application factories and Socket.IO; provide a small runnable example.
- [x] Finish illustrated setup guides, the package README and troubleshooting documentation.

Release gate: fresh package installation, endpoint discovery, authentication, execution, response inspection and both export formats verified without frontend tooling. See [verification notes](docs/VERIFICATION.md). Additional frameworks, cloud collaboration and premium tools remain outside this release.

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
