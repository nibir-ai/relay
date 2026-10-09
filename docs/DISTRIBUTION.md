# Distribution

Relay v0.0.3 ships as the Python distribution **relay-backend**, with import **relay_backend** and console command **relay**. Native FastAPI integration is the primary consumer path. The wheel and source archive include the compiled UI, fonts and brand assets; consumers need Python 3.11+ and their existing backend, with no frontend tooling.

Install from [PyPI](https://pypi.org/project/relay-backend/0.0.3/) with `python -m pip install relay-backend`. The wheel is also attached to the [GitHub release](https://github.com/nibir-ai/relay/releases/tag/v0.0.3).

```python
from relay_backend import install_relay

install_relay(app)
```

Start the backend normally and visit `/relay` on its existing port. Development gating is explicit: `install_relay(app, enabled=settings.DEBUG)`. Framework templates can include this dependency and call for an experience that is already available in a newly created project.

## Node distribution

`npm install relay-backend` installs the published 0.0.3 Node package with bundled assets and TypeScript declarations. Native Express, Fastify and Node HTTP adapters mount `/relay` on your backend. No Python or consumer build is needed. See [Node setup](NODE.md).

`npx relay-backend --target http://127.0.0.1:3000` provides a separate local tester for existing OpenAPI backends. Python and npm distributions share the Relay UI and package name, but install into their respective backend environments.

## Guides

- [Native FastAPI integration](FASTAPI.md): lifecycle, configuration, factories, Socket.IO, prefixes and storage.
- [Portable endpoint reports](EXPORTS.md): `.relay` and JSON formats, report opening and Windows double-click registration.
- [Git workflow](GIT.md): manual status, attribution, commit/push/pull synchronization and conflicts.
- [Release process](RELEASING.md): build artifacts, checks and PyPI Trusted Publishing setup.
- [Contributor setup](CONTRIBUTING.md): source builds and clean consumer installation checks.

## Standalone OpenAPI backends

For a different framework exposing JSON OpenAPI on a literal loopback origin:

```sh
relay --target http://127.0.0.1:8000 --spec-path /openapi.json
# Optionally use a Git repository for shared status metadata:
relay --target http://127.0.0.1:8000 --project /path/to/backend
```

This mode starts a separate local Relay process. It cannot infer Python handler authors from a remote OpenAPI document. Native FastAPI avoids that extra process and directly maps handlers to available Git history.
