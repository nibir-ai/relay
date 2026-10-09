# Relay documentation

Relay v0.0.3 ships as **relay-backend**, importing **relay_backend**. Its complete UI is bundled in the Python distribution; consumers do not clone or build this repository.

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

## Guides

1. [FastAPI integration](FASTAPI.md): installation, existing apps, factories, development flags, Socket.IO and optional settings.
2. [Testing APIs](TESTING.md): inputs, shared and endpoint auth, responses, limits and shortcuts.
3. [Git workflow](GIT.md): statuses, source authors, commit/pull sharing and conflicts.
4. [Exports](EXPORTS.md): Relay reports, JSON, saved responses and file associations.
5. [Troubleshooting](TROUBLESHOOTING.md): missing `/relay`, installation, auth, schemas and reports.

For maintainers: [contributor setup](CONTRIBUTING.md), [release process](RELEASING.md), [architecture](ARCHITECTURE.md), [distribution](DISTRIBUTION.md) and [changelog](../CHANGELOG.md).

Python 3.11+ is required. This is a local development tool: loopback clients/hosts only. Native execution runs real backend handlers and can modify development data. There is no Relay cloud or editable endpoint definition. Optional automatic team status sync exchanges status metadata on a separate Git branch. Done is a manual team status, not test/security approval.
