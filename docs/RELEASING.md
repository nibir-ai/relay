# Releasing Relay

v0.0.3 is published on [PyPI](https://pypi.org/project/relay-backend/0.0.3/) and [GitHub](https://github.com/nibir-ai/relay/releases/tag/v0.0.3). Trusted Publishing succeeded and a fresh unpinned PyPI installation passed the consumer checks. Follow every gate below for subsequent releases. See [the changelog](../CHANGELOG.md) for release contents.

Apache-2.0 distribution: `relay-backend`, import `relay_backend`, with legacy root-import compatibility. Includes native FastAPI testing, auth, statuses, optional automatic Git status sync, source attribution, response inspection, themes, branding, exports and local CLI. Node is for maintainers only. Multipart, OAuth browser flows, public hosting, YAML/external refs and macOS/Linux desktop associations remain out of scope.

## Artifacts and checks

Build `dist/relay_backend-0.0.3-py3-none-any.whl` and `dist/relay_backend-0.0.3.tar.gz` using [contributor commands](CONTRIBUTING.md). Verify UI/Python tests, wheel assets/execution, clean customer installation and twine metadata validation. The clean-install gate copies the runnable example into a fresh environment outside the checkout and exercises authenticated handlers, query arrays, nested/optional bodies, validation and empty responses.

CI covers Python 3.11/3.12/3.13; inspect actual results before declaring these combinations validated. The release workflow reruns checks before its isolated upload job. It is triggered by publishing the GitHub release/tag `v0.0.3`.

## Trusted Publisher

The publisher is already configured for `relay-backend` and successfully published v0.0.1. Repeat releases use the existing trust configuration. The following account-side setup is only needed if that configuration is removed or the publishing repository changes.

The unrelated `relay-agent` distribution is not ours. Publish `relay-backend` only. The public launch source is `nibir-ai/relay`; private development history is kept separately.

1. Sign in to your account on PyPI.org, then open account settings → Publishing. Use real PyPI, not TestPyPI.
2. Under pending publishers, choose the GitHub form. This is an account-level form because the project does not exist yet.
3. Enter these exact values, then click Add and confirm that the pending publisher is listed:

| Field | Value |
|---|---|
| Project | `relay-backend` |
| GitHub owner | `nibir-ai` |
| Repository | `relay` |
| Workflow | `release.yml` |
| Environment | `pypi` |

The filename is `release.yml`, not the workflow's display name or its full `.github/workflows/` path. If you previously entered the private development repository, replace that pending publisher with these public-repository values.

The workflow references the GitHub `pypi` environment. GitHub creates it when the job runs if it does not exist; repository admins can configure its approval rules beforehand in Settings → Environments. The workflow uses OIDC with `pypa/gh-action-pypi-publish`, not a stored PyPI token. Workflow files alone do not establish PyPI trust or publish a distribution.

A pending publisher creates the project on first successful upload; it does not reserve the project name. No manual first upload is needed.

[Official pending-publisher setup](https://docs.pypi.org/trusted-publishers/creating-a-project-through-oidc/) · [Official publishing guide](https://docs.pypi.org/trusted-publishers/using-a-publisher/) · [GitHub environment behavior](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)

## Publish and confirm

1. Review the release diff and artifact checks.
2. Confirm the existing Trusted Publisher still matches the workflow and repository.
3. Commit/push release source; build outputs stay ignored because CI rebuilds them.
4. Publish GitHub release `v0.0.3` with CHANGELOG.md notes.
5. Confirm workflow success and the actual PyPI project/version.
6. Run `python scripts/verify_clean_install.py --public-index` to verify the actual published version in a fresh environment; only then record publication success.

Published artifact versions are immutable. Inspect actual files before retrying a partial upload. A pushed tag or successful build alone does not mean publication succeeded.

## npm releases

The Node package has its own registry and tag: `npm-v0.0.3`. Do not reuse the published Python `v0.0.3` tag or replace its artifacts.

Build and verify before publishing:

```sh
pnpm install --frozen-lockfile
pnpm --dir apps/web test
node scripts/package_node.cjs
pnpm --dir packages/node test
pnpm --dir packages/node check:types
node scripts/verify_node_package.cjs
```

`node.yml` runs these checks on Node 22.13, 24 and 26. The tarball includes only the native implementation, type declarations, built UI, package README and licenses. Consumers never build it.

The initial npm publication requires an authenticated maintainer account. Run `npm login` yourself, then publish the verified `dist/relay-backend-0.0.3.tgz` using `npm publish dist/relay-backend-0.0.3.tgz --access public`. Complete account verification/2FA in your own terminal or browser; never share tokens in issues or chat. First confirm all public CI checks pass. Check the registry version and install it in a fresh consumer directory after upload.

After the package exists, configure its npm Trusted Publisher using owner `nibir-ai`, repository `relay`, workflow `publish-node.yml` and environment `npm`, allowing direct publishing. Future `npm-v*` tags run the verification job before OIDC publication. The GitHub-hosted publishing job uses npm 11 and Node 24. See [npm's trusted publishing guide](https://docs.npmjs.com/trusted-publishers/).

## Pending Python compatibility fix

The source restores `python -m relay_agent.files` for Windows associations registered before the import rename and updates new associations to `relay_backend.files`. This fix needs a new Python patch release; the already published PyPI 0.0.3 artifacts remain unchanged.
