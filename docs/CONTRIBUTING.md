# Contributor setup

Consumers install Relay and mount it; these commands are for maintaining the project. Requirements: Python 3.11+, Node 22.13+ or newer compatible version, pnpm 11.25.0. CI uses Node 24.

```sh
python -m pip install -e "./apps/agent[test]" build twine
pnpm install --frozen-lockfile
python scripts/package.py
python scripts/dev.py
```

Demo: `http://127.0.0.1:8000/relay/`; fake fixture auth `alex@example.com` / `demo123`.

```sh
pnpm --dir apps/web test
python -m pytest apps/agent/tests -q
python scripts/package.py
python scripts/verify_package.py
python scripts/verify_clean_install.py
python -m twine check dist/relay_backend-0.0.3*
```

Packaging builds Vite, copies the compiled assets into Python, and produces sdist plus wheel. The wheel is built from sdist, checking source-distribution asset inclusion. Wheel verification runs outside the editable checkout; customer verification creates a new venv and installs dependencies without Node or a checkout.

Keep `pnpm-lock.yaml` committed. Do not commit secrets, raw traffic, downloaded reports, `.env`, virtual environments or build/distribution outputs. Bundled dependency/font licenses are in THIRD_PARTY_NOTICES.md.


## Native Node package

```sh
node scripts/package_node.cjs
pnpm --dir packages/node test
pnpm --dir packages/node check:types
node scripts/verify_node_package.cjs
```

This creates `dist/relay-backend-0.0.3.tgz` with native adapters, declarations and the built UI. The clean consumer check installs outside the checkout with lifecycle scripts disabled and verifies CommonJS, ESM, TypeScript, assets and real API execution. `node scripts/verify_node_package.cjs --public-index` verifies the actual latest npm registry release instead of the local tarball.

Node CI runs on 22.13, 24 and 26. Consumers use the published npm package; contributor commands are not part of their integration.
