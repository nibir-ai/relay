# Release v0.0.1

Initial Apache-2.0 alpha distribution: `relay-backend`, import `relay_agent`. Includes native/bundled FastAPI testing, auth, statuses/Git attribution, response inspection, themes/branding, exports and local CLI. Node is for maintainers only. Multipart, OAuth browser flows, realtime sync, public hosting, YAML/external refs and macOS/Linux desktop associations remain out of scope.

## Artifacts and checks

Build `dist/relay_backend-0.0.1-py3-none-any.whl` and `dist/relay_backend-0.0.1.tar.gz` using [contributor commands](CONTRIBUTING.md). Verify UI/Python tests, wheel assets/execution, clean customer installation and twine metadata validation.

CI covers Python 3.11/3.12/3.13; inspect actual results before declaring these combinations validated. The release workflow reruns checks before its isolated upload job. It is triggered by publishing the GitHub release/tag `v0.0.1`.

## PyPI setup: account owner required

The unrelated `relay-agent` distribution is not ours. Publish `relay-backend` only. Create a pending PyPI Trusted Publisher:

| Field | Value |
|---|---|
| Project | `relay-backend` |
| GitHub owner | `nibir-ai` |
| Repository | `relay` |
| Workflow | `release.yml` |
| Environment | `pypi` |

Create the matching GitHub `pypi` environment and choose the desired release approval policy. The workflow uses OIDC with `pypa/gh-action-pypi-publish`, not a stored PyPI token. Workflow files alone do not establish PyPI trust or publish a distribution.

[Official pending-publisher setup](https://docs.pypi.org/trusted-publishers/creating-a-project-through-oidc/) · [Official publishing guide](https://docs.pypi.org/trusted-publishers/using-a-publisher/)

## Publish and confirm

1. Review the release diff and artifact checks.
2. Complete account-side publisher/environment setup.
3. Commit/push release source; build outputs stay ignored because CI rebuilds them.
4. Publish GitHub release `v0.0.1` with CHANGELOG.md notes.
5. Confirm workflow success and the actual PyPI project/version.
6. Verify public `pip install relay-backend==0.0.1` and two-line integration in a fresh environment; only then remove pending-publication notices.

Published artifact versions are immutable. Inspect actual files before retrying a partial upload. A pushed tag or successful build alone does not mean publication succeeded.
