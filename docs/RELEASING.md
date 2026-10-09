# Releasing Relay

v0.0.2 was published on 9 October 2026 on [PyPI](https://pypi.org/project/relay-backend/0.0.2/) and [GitHub](https://github.com/nibir-ai/relay/releases/tag/v0.0.2). The publishing workflow succeeded, and a fresh public-index installation passed the consumer smoke check. See [the changelog](../CHANGELOG.md) for release contents.

Initial Apache-2.0 alpha distribution: `relay-backend`, import `relay_agent`. Includes native/bundled FastAPI testing, auth, statuses/Git attribution, response inspection, themes/branding, exports and local CLI. Node is for maintainers only. Multipart, OAuth browser flows, realtime sync, public hosting, YAML/external refs and macOS/Linux desktop associations remain out of scope.

## Artifacts and checks

Build `dist/relay_backend-0.0.2-py3-none-any.whl` and `dist/relay_backend-0.0.2.tar.gz` using [contributor commands](CONTRIBUTING.md). Verify UI/Python tests, wheel assets/execution, clean customer installation and twine metadata validation. The clean-install gate copies the runnable example into a fresh environment outside the checkout and exercises authenticated handlers, query arrays, nested/optional bodies, validation and empty responses.

CI covers Python 3.11/3.12/3.13; inspect actual results before declaring these combinations validated. The release workflow reruns checks before its isolated upload job. It is triggered by publishing the GitHub release/tag `v0.0.2`.

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
4. Publish GitHub release `v0.0.2` with CHANGELOG.md notes.
5. Confirm workflow success and the actual PyPI project/version.
6. Run `python scripts/verify_clean_install.py --public-index` to verify the actual published version in a fresh environment; only then record publication success.

Published artifact versions are immutable. Inspect actual files before retrying a partial upload. A pushed tag or successful build alone does not mean publication succeeded.
