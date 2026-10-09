# Team statuses and Git attribution

## Automatic sharing

Each teammate enables sync in the existing FastAPI backend:

```python
from relay_backend import install_relay
install_relay(app, sync_status=True)
```

Run from the backend repository, or pass `project=Path(...)`. Relay uses its existing `origin` remote and the normal Git credentials already configured on that machine. Teammates need read and write access to that remote and Git available on PATH. No Relay account or hosted service is required.

Change the status beside any endpoint. Relay records your Git name, then exchanges metadata in the background every ten seconds. Other running backends receive it automatically; visible Relay tabs refresh every five seconds. Allow roughly fifteen seconds with a healthy connection. This is periodic synchronization, not instant messaging. The connection details show sync state and failures.

Relay creates a dedicated `relay-status` branch containing only `status.json`. It never checks out that branch, stages your files, commits application code, merges code or forces a push. Requests, response bodies, credentials and notes are not sent to this branch. Add `.relay/status.json` to your backend's `.gitignore` when using automatic mode; also ignore `.relay/status.lock` and `.relay/status-*.tmp`.

Each endpoint's most recent timestamp wins; equal timestamps use a stable tie-break. Keep machine clocks synchronized. Updates to different endpoints are preserved. Rejected concurrent pushes fetch, merge and retry. Network or permission failures retain your local changes and retry in the background. Fix Git remote access on the machine when the connection details report an error. Invalid remote metadata is reported and never overwritten.

Configure your identity in the backend repository:

```sh
git config user.name "Your Name"
git config user.email "you@example.com"
```

Git-configured names are attribution, not authenticated identity. Everyone with write access to the status branch can change that metadata. Missing identity blocks shared status writes; API testing remains available.

## Manual Git sharing

Automatic sharing is opt-in. With the default `install_relay(app)`, Relay writes `.relay/status.json` locally and makes no network Git operations. To share manually, track that file, commit and push it; teammates pull it. Running tabs refresh the resulting metadata.

```sh
git add .relay/status.json
git commit -m "Update API statuses"
git push
```

Choose one workflow for the team. In manual mode, do not ignore `.relay/status.json`; ignore the temporary lock files only. SQLite stores local workspace history. Downloaded exports are separate files.

## Status meanings

| Status | Meaning |
|---|---|
| Done | Initial default, or a manually recorded team decision. |
| In progress | Work underway. |
| Needs fixing | Known follow-up or a detected contract change. |
| Not started | Work not begun. |

Execute never changes status. New APIs default to Done; manual choices persist. Contract changes can flag previously Done work for review. Shared rows include a contract fingerprint so obsolete decisions are not applied silently to changed APIs.

## Handler authors

Native FastAPI maps handlers to source and Git. Expanded details show Introduced by, Last committed change by and file/line. The path tooltip exposes the inferred creator. Status updated by is distinct.

Introduction is inferred from the oldest available definition-line history and the last editor from committed handler history. Shallow or squashed repositories, reused handlers, wrappers and moved registrations can limit accuracy. Local or uncommitted changes are labeled. Unavailable attribution does not block testing. Standalone OpenAPI mode cannot infer Python source authors from a remote schema.

## Local metadata conflicts

Git detection searches upward from process cwd. Local writes are atomic and locked. Malformed or conflicted `.relay/status.json` is reported instead of overwritten. Resolve merge markers before retrying. Only status synchronization uses the separate remote branch; your application branch and working files remain under your normal workflow.
