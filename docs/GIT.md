# Git workflow

## Share endpoint status

With a detected Git repository, Relay writes workflow metadata to `.relay/status.json`. Commit/push normally; teammates pull and Sync locally. Relay never commits, pushes or pulls for you.

```sh
git add .relay/status.json
git commit -m "Update API statuses"
git push
```

Updater identity comes from local Git configuration. It is attribution, not verified identity or a security boundary. The shared file contains status/attribution, not raw traffic or tokens. SQLite holds local workspace/status history; explicitly downloaded exports are separate files.

Configure your identity in the backend repository before changing a shared status:

```sh
git config user.name "Your Name"
git config user.email "you@example.com"
```

Missing identity blocks shared status writes with a clear message; API testing remains available.

| Status | Meaning |
|---|---|
| Done | Initial default, or a manually recorded team decision. |
| In progress | Work underway. |
| Needs fixing | Known follow-up or detected contract change. |
| Not started | Work not begun. |

Statuses are manual. Execute never marks Done. New APIs default Done; manual choices persist. Contract changes can flag previously Done work for review.

## Handler authors

Native FastAPI maps handlers to source/Git. Expanded details show Introduced by, Last committed change by and file/line. The path tooltip exposes the inferred creator. Status updated by is distinct.

Introduction is inferred from oldest available definition-line history and last editor from committed handler history. Shallow/squashed repositories, reused handlers, wrappers and moved registrations can limit accuracy. This is not verified ownership or a guaranteed history of the original route registration.

Local/uncommitted changes are labeled. Unavailable Git/source attribution does not block testing. Standalone OpenAPI mode cannot infer Python source authors from a remote schema.

## Selection and conflicts

Detection searches upward from process cwd. Pass `project=Path(...)` if needed. Git reads are cached; shared writes are atomic and locked. Malformed/conflicted metadata is reported rather than overwritten. Resolve merge markers normally, then Sync.

Track `.relay/status.json`; ignore `.relay/status.lock` and `.relay/status-*.tmp`. Do not ignore the entire directory if sharing statuses.
