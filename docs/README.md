# Relay documentation

Relay v0.0.1 ships as **relay-backend**, importing **relay_agent**. Its complete UI is bundled in the Python distribution; consumers do not clone or build this repository.

1. [FastAPI integration](FASTAPI.md): installation, existing apps, factories, development flags, Socket.IO and optional settings.
2. [Testing APIs](TESTING.md): inputs, shared and endpoint auth, responses, limits and shortcuts.
3. [Git workflow](GIT.md): statuses, source authors, commit/pull sharing and conflicts.
4. [Exports](EXPORTS.md): Relay reports, JSON, saved responses and file associations.
5. [Troubleshooting](TROUBLESHOOTING.md): missing `/relay`, installation, auth, schemas and reports.

For maintainers: [contributor setup](CONTRIBUTING.md), [release process](RELEASING.md), [architecture](ARCHITECTURE.md), [distribution](DISTRIBUTION.md) and [changelog](../CHANGELOG.md).

Python 3.11+ is required. This is a local development tool: loopback clients/hosts only. Native execution runs real backend handlers and can modify development data. There is no Relay cloud, automatic Git commit/push, realtime collaboration, or editable endpoint definition. Done is a manual team status, not test/security approval.
