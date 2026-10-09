<picture>
  <source media="(prefers-color-scheme: dark)" srcset="apps/web/public/brand/relay-logo.svg" />
  <img src="apps/web/public/brand/relay-logo-light.svg" width="240" height="59" alt="Relay" />
</picture>

Test your API where it runs. Relay adds a testing workspace at **`/relay`** on your backend: generated endpoints, explicit authorization, readable responses and one status control beside each API.

[![npm](https://img.shields.io/npm/v/relay-backend?label=npm&color=67b0e8)](https://www.npmjs.com/package/relay-backend)
[![PyPI](https://img.shields.io/pypi/v/relay-backend?label=PyPI&color=8ccf7e)](https://pypi.org/project/relay-backend/)
[![Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-e5c76b)](LICENSE)

[Documentation](docs/README.md) · [FastAPI](#add-relay-to-fastapi) · [Node](#add-relay-to-node) · [Roadmap](#next-release)

## Choose your backend

| Backend | Install | Native integration |
| --- | --- | --- |
| FastAPI / Python 3.11+ | `pip install relay-backend` | `install_relay(app)` |
| Express / JavaScript or TypeScript | `npm install relay-backend` | `app.use(relay())` with existing OpenAPI |
| Fastify / JavaScript or TypeScript | `npm install relay-backend` | `app.register(relayFastify)` with a schema generator |

Both distributions include the UI, fonts and branding. **No repository clone, frontend build or CDN.** Node 22.13+ is required.

## Add Relay to FastAPI

![Install Relay, mount it on your FastAPI app, and open /relay on the existing backend port.](docs/assets/fastapi-quickstart.png)

### 1. Install

In your backend's Python environment (Python 3.11+):

```sh
python -m pip install relay-backend
```

A fresh installation gets the latest stable release. To update an existing installation:

```sh
python -m pip install --upgrade relay-backend
```

Restart the backend after upgrading. The browser title uses your application's name: `FastAPI(title="Ludo Portal")` becomes `Relay - Ludo Portal`. Any application's title works.

### 2. Add two lines

In the file where you create `app = FastAPI()`:

```python
from relay_backend import install_relay
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

Install before wrapping FastAPI with Socket.IO. Application factories, custom OpenAPI generators, lifespan and proxy prefixes are covered in the [FastAPI integration guide](docs/FASTAPI.md). Alternatively, install the wheel attached to the [v0.0.3 release](https://github.com/nibir-ai/relay/releases/tag/v0.0.3).

The distribution name is **relay-backend**. The import is **relay_backend** and the CLI is **relay**. Existing `from relay_agent import install_relay` integrations remain compatible. The `relay-agent` project on PyPI is unrelated.

</details>

## Add Relay to Node

![Relay for Node: install relay-backend, connect Express or Fastify to /relay, then execute an API and inspect its response.](docs/assets/node-quickstart.png)

```sh
npm install relay-backend
```

For **Express** with an existing `/openapi.json` route, add before your body parsers:

```js
import { relay } from 'relay-backend';
app.use(relay());
```

For **Fastify** with `@fastify/swagger` registered:

```js
import { relayFastify } from 'relay-backend';
await app.register(relayFastify);
```

Restart the backend and open `/relay` on its existing port. CommonJS, ES modules and TypeScript work with the same package. If your schema generator exposes a document instead of `/openapi.json`, pass it as `openapi`. Relay reads generated OpenAPI; it cannot infer undocumented request types.

[Full Node setup](docs/NODE.md) covers schema generators, development flags, lifecycle and Node HTTP. For a separate tester, use `npx relay-backend --target http://127.0.0.1:3000`.

## What Relay includes

- Inline APIs grouped by OpenAPI tags, method colors, search and editable request inputs. Endpoint definitions remain code-generated.
- Shared or per-endpoint authorization with explicit Authorize actions; advanced bearer, Basic and header API key settings.
- Request execution, response inspection, copy controls, response focus, optional line wrapping and code snippets.
- Manual statuses defaulting to Done, Git-shared status updates and native FastAPI handler attribution.
- Everblush, One Dark, Gruvbox, Nord and Paper themes with Relay branding.
- Per-endpoint `.relay` browser reports and structured JSON exports, plus a local report opener and Windows file association.
- A standalone CLI for loopback OpenAPI backends.

Relay is an alpha for local development. Multipart uploads, OAuth browser flows, YAML/external references and public hosting are outside its scope. A successful request does not automatically change status. Optional automatic team status sync uses your existing Git remote; see the [team setup guide](docs/GIT.md).

Tokens and drafts stay in browser session memory. Explicit exports include request bodies, parameters and captured responses, which may contain secrets; inspect them before sharing. See the [export format and handling guide](docs/EXPORTS.md).

## Next release

- [ ] Add `relay init` for backend detection and guided automatic integration setup.
- [ ] Add optional realtime team statuses through a shared backend, without creating a Git status branch.
- [ ] Authenticate developers and check contributor/team permissions for shared statuses.
- [ ] Persist status updates, handle concurrent edits and restore missed updates after reconnecting.
- [ ] Keep API testing local and provide minimal shared-service configuration.
- [ ] Ship the Windows report-association compatibility fix in a new Python patch release.

The realtime design is planned, not included in 0.0.3. Socket.IO is the proposed transport; see the [team sync proposal](docs/REALTIME.md). Git sync remains opt-in in the current release.

<details>
<summary>Completed release milestones</summary>

## Roadmap: v0.0.2

- [x] Ship the refined Relay branding consistently across the tester, reports and documentation.
- [x] Harden request testing for nested bodies, optional fields, arrays, path/query parameters, validation errors and empty responses.
- [x] Clarify effective authentication and keep shared and endpoint credentials independent, with quick switching.
- [x] Improve large-response inspection, truncation feedback and accurate copying and exports.
- [x] Verify seamless FastAPI integration with routers, application factories and Socket.IO; provide a small runnable example.
- [x] Finish illustrated setup guides, the package README and troubleshooting documentation.

Release gate: fresh package installation, endpoint discovery, authentication, execution, response inspection and both export formats verified without frontend tooling. See [verification notes](docs/VERIFICATION.md). Additional frameworks, cloud collaboration and premium tools remain outside this release.

## Roadmap: v0.0.3

- [x] Use `pip install relay-backend` for the latest fresh installation and document upgrades.
- [x] Make `relay_backend` the public Python import while preserving existing integrations.
- [x] Display `Relay - <app name>` automatically from each application's OpenAPI title.
- [x] Verify bundled branding and asset refresh from a clean published-package installation.
- [x] Remove unused artwork and private development metadata from public source and packages.
- [x] Add opt-in automatic team status sync without manual Git commands or changing working files.
- [x] Migrate the Ludo backend to the tested published package and verify its native integration.
- [x] Pass package, frontend, Python, cross-environment sync and release checks before publication.

### Node package: v0.0.3

- [x] Native Express middleware, Fastify plugin and Node HTTP integration.
- [x] Bundle the UI without Python, a consumer build or a repository clone.
- [x] Support CommonJS, ES modules and TypeScript declarations.
- [x] Verify API execution, authentication, response limits and status persistence.
- [x] Verify automatic status sharing between independent Git peers.
- [x] Verify the tarball in clean consumer installations and CI on supported Node versions.
- [x] Publish the verified npm package and check a fresh registry installation.

</details>

## Documentation

Start with the [documentation index](docs/README.md).

- [FastAPI setup and configuration](docs/FASTAPI.md)
- [JavaScript and TypeScript backends](docs/NODE.md)
- [Testing requests, authentication and responses](docs/TESTING.md)
- [Git status and source attribution](docs/GIT.md)
- [Exports and opening `.relay` files](docs/EXPORTS.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Contributing and verification](docs/CONTRIBUTING.md)
- [Release and registry publishing](docs/RELEASING.md)
- [Brand identity](docs/BRAND.md)

## License

Relay is [Apache-2.0](LICENSE). Bundled frontend dependencies and font licenses are included in [third-party notices](THIRD_PARTY_NOTICES.md).
