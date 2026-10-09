# Distribution

Relay v0.0.1 ships as the Python distribution **relay-backend**, with import **relay_agent** and console command **relay**. Native FastAPI integration is the primary consumer path. The wheel and source archive include the compiled UI, fonts and brand assets; consumers need Python 3.11+ and their existing backend, with no frontend tooling.

Install from [PyPI](https://pypi.org/project/relay-backend/0.0.1/) with `python -m pip install relay-backend==0.0.1`. The wheel is also attached to the [GitHub release](https://github.com/nibir-ai/relay/releases/tag/v0.0.1).

```python
from relay_agent import install_relay

install_relay(app)
```

Start the backend normally and visit `/relay` on its existing port. Development gating is explicit: `install_relay(app, enabled=settings.DEBUG)`. Framework templates can include this dependency and call for an experience that is already available in a newly created project.

An npm/npx package may follow for Node integrations. This FastAPI release uses the backend's Python environment, so no Node runner or companion process is required.

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
