# Relay documentation

[API testing workflow](API-TESTING.md) covers discovery, authorization, requests, responses and exports.

Relay ships as **relay-backend**, importing **relay_backend** in Python. Version **0.0.5 is published on PyPI and npm**, with verified distributions and checksums attached to the [GitHub release](https://github.com/nibir-ai/relay/releases/tag/v0.0.5). The complete UI is bundled; consumers do not clone or build this repository. Optional realtime team collaboration and its shared service use `relay-backend[realtime]`; see [team setup and migration](REALTIME.md).

![Three steps: install the package, add the import and mount call, then open /relay on your backend.](assets/fastapi-quickstart.png)

## Quick start

Install in your backend's Python environment:

```sh
python -m pip install relay-backend
```

In the file where `app = FastAPI()` is created:

```python
from relay_backend import install_relay
install_relay(app)
```

Restart your backend normally. Open `/relay` on its existing port. That is all the required configuration.

## Node backends

The [relay-backend npm package](https://www.npmjs.com/package/relay-backend) is published for Express, Fastify and Node HTTP. The UI is bundled; Python is not needed. See [Node integration](NODE.md) for JavaScript and TypeScript setup.

## Next release

[0.0.6 roadmap](RELEASE-0.0.6.md): session request history, lightweight response checks, reviewed exports and realtime diagnostics. Implementation is in progress; realtime diagnostics and session request history are complete in source; response checks, reviewed exports and release gates remain pending.

## Guides

New in 0.0.5: [realtime team setup, reviewed Git migration and upgrades](REALTIME.md). Existing setup tools include [guided setup and diagnostics](SETUP.md), local endpoint notes/activity and persistent contract-change explanations.

1. [FastAPI integration](FASTAPI.md): installation, existing apps, factories, development flags, Socket.IO and optional settings.
2. [Testing APIs](TESTING.md): inputs, shared and endpoint auth, responses, limits and shortcuts.
3. [Git workflow](GIT.md): statuses, source authors, commit/pull sharing and conflicts.
4. [Exports](EXPORTS.md): Relay reports, JSON, saved responses and file associations.
5. [Troubleshooting](TROUBLESHOOTING.md): missing `/relay`, installation, auth, schemas and reports.

For maintainers: [v0.0.4 plan](RELEASE-0.0.4.md), [contributor setup](CONTRIBUTING.md), [release process](RELEASING.md), [architecture](ARCHITECTURE.md), [distribution](DISTRIBUTION.md) and [changelog](../CHANGELOG.md).

Python 3.11+ is required. This is a local development tool: loopback clients/hosts only. Native execution runs real backend handlers and can modify development data. There is no Relay cloud or editable endpoint definition. Optional automatic team status sync exchanges status metadata on a separate Git branch. Done is a manual team status, not test/security approval.
