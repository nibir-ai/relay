# Release verification

Every release must pass the Python suite, frontend suite, strict production build, wheel/source metadata checks, independent wheel checks and fresh consumer installations with current and minimum supported dependencies. CI also checks Python 3.11, 3.12 and 3.13. Publication is followed by a fresh unpinned PyPI install; build success alone is insufficient.

## 0.0.3 candidate

The current candidate adds the canonical import, application-specific titles and opt-in automatic status synchronization. Tests use two independent backend clones and a bare remote. They cover background propagation with updater identity, concurrent push retries, preservation of staged and uncommitted application code, unavailable remotes, invalid metadata, exclusion of non-status fields and native lifespan cleanup.

Package verification compares every bundled brand SVG and favicon with its source master. Consumer verification runs outside the checkout without Node or an editable install, exercising actual native handlers, separate user/admin authentication, routers, application factories, nested and optional bodies, query arrays, validation errors, empty responses, UI assets and disabled integration.

Local validation passed: 89 Python tests, 42 frontend tests, the strict build, independent wheel verification, Twine checks and clean consumer installs with current and minimum supported dependencies. [Public CI](https://github.com/nibir-ai/relay/actions/runs/37915243315) passed on Python 3.11, 3.12 and 3.13. An independent environment also received existing statuses and updater identities through a real GitHub remote. Publication remains pending. Cross-machine synchronization requires the existing Git remote's read/write credentials; tests use local independent repositories and do not claim verification of every credential provider.

## Published 0.0.2

- 82 Python tests and 40 frontend tests passed, along with the production build and package metadata checks.
- Clean consumer installs passed with current and minimum runtime dependencies.
- Public CI passed on Python 3.11, 3.12 and 3.13.
- Browser testing exercised protected requests, response inspection and both export formats at desktop and mobile widths.
- Trusted Publisher upload succeeded; a fresh PyPI installation of the published version passed native UI/assets, discovery, real handler execution, authentication and disabled mode.

[Release](https://github.com/nibir-ai/relay/releases/tag/v0.0.2) · [CI](https://github.com/nibir-ai/relay/actions/runs/37895317862) · [Publication](https://github.com/nibir-ai/relay/actions/runs/37895481789)

## Published 0.0.1

The first release passed local tests, clean package installation and public Linux CI on Python 3.11/3.12/3.13. Trusted Publishing succeeded and the actual PyPI package was verified outside the development checkout.
