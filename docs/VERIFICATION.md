# Release verification

Every release must pass the Python suite, frontend suite, strict production build, wheel/source metadata checks, independent wheel checks and fresh consumer installations with current and minimum supported dependencies. CI also checks Python 3.11, 3.12 and 3.13. Publication is followed by a fresh unpinned PyPI install; build success alone is insufficient.

## Published 0.0.3

This release adds the canonical import, application-specific titles and opt-in automatic status synchronization. Tests use two independent backend clones and a bare remote. They cover background propagation with updater identity, concurrent push retries, preservation of staged and uncommitted application code, unavailable remotes, invalid metadata, exclusion of non-status fields and native lifespan cleanup.

Package verification compares every bundled brand SVG and favicon with its source master. Consumer verification runs outside the checkout without Node or an editable install, exercising actual native handlers, separate user/admin authentication, routers, application factories, nested and optional bodies, query arrays, validation errors, empty responses, UI assets and disabled integration.

Local validation passed: 89 Python tests, 42 frontend tests, the strict build, independent wheel verification, Twine checks and clean consumer installs with current and minimum supported dependencies. [Public CI](https://github.com/nibir-ai/relay/actions/runs/37915243315) passed on Python 3.11, 3.12 and 3.13. An independent environment also received existing statuses and updater identities through a real GitHub remote. [Publication](https://github.com/nibir-ai/relay/actions/runs/37915487491) succeeded. After the index refreshed, an unpinned `pip install relay-backend` retrieved 0.0.3 in a fresh virtual environment and passed native consumer checks. A backend using Socket.IO was upgraded to the published package, with 65 discovered endpoints, native HTTP 200 execution, automatic remote status sync, application-specific title and bundled identity links verified. Both browser export downloads contained the endpoint and captured response. Cross-machine synchronization requires the existing Git remote's read/write credentials; tests use local independent repositories and do not claim verification of every credential provider.

## Published 0.0.2

- 82 Python tests and 40 frontend tests passed, along with the production build and package metadata checks.
- Clean consumer installs passed with current and minimum runtime dependencies.
- Public CI passed on Python 3.11, 3.12 and 3.13.
- Browser testing exercised protected requests, response inspection and both export formats at desktop and mobile widths.
- Trusted Publisher upload succeeded; a fresh PyPI installation of the published version passed native UI/assets, discovery, real handler execution, authentication and disabled mode.

[Release](https://github.com/nibir-ai/relay/releases/tag/v0.0.2) · [CI](https://github.com/nibir-ai/relay/actions/runs/37895317862) · [Publication](https://github.com/nibir-ai/relay/actions/runs/37895481789)

## Published 0.0.1

The first release passed local tests, clean package installation and public Linux CI on Python 3.11/3.12/3.13. Trusted Publishing succeeded and the actual PyPI package was verified outside the development checkout.


## Node npm candidate 0.0.3

The npm package is built and verified; registry publication remains pending maintainer login. The existing Python 0.0.3 release remains published unchanged.

- Nine native Node tests passed against real Express/Fastify/Node HTTP servers and independent Git peers.
- CommonJS and ESM TypeScript consumers passed strict checks, including a clean Express installation without Fastify installed.
- Clean tarball installation with lifecycle scripts disabled passed UI asset loading, schema discovery, request execution and CLI checks. No Python or frontend build ran in the consumer directory.
- Browser verification on a native Node backend passed endpoint discovery, per-endpoint bearer authorization, real response inspection and both JSON/Relay exports.
- The existing 42 frontend tests passed.
- [Node CI](https://github.com/nibir-ai/relay/actions/runs/37918786516) passed on Node 22.13, 24 and 26. [Python CI](https://github.com/nibir-ai/relay/actions/runs/37918786475) passed on Python 3.11, 3.12 and 3.13 for the same implementation commit.
- Missing-package startup guidance was tested in isolated Python without site packages; transitive dependency errors remain visible.

Supported native Node adapters are Express, Fastify and Node HTTP at the application root. Other frameworks/runtimes and Node handler source-author inference are not verified support. Generated OpenAPI remains required.
