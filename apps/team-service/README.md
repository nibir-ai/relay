# Relay team status service

The service is bundled in **relay-backend 0.0.5** with the optional `[realtime]` extra. Python/Node integrations and the local Relay UI connect to it. This optional service stores manual endpoint statuses for independent developer environments. Local API testing continues through the existing Python and Node packages.

The service provides authenticated snapshots, revision-checked writes and project-scoped Socket.IO delivery. Native bridges keep collaboration credentials on the backend and show connection/offline/conflict states locally. A reviewed Git-status import is available in the local UI. It does not create a Git branch.

## Run one shared instance

Install and run without cloning the repository:

```sh
python -m pip install --upgrade "relay-backend[realtime]"
relay team init --config ./members.json --project example --name Alice
relay team serve --config ./members.json --database ./team.sqlite3
```

The setup command prints a private developer token once and stores only its hash. Add teammates with `relay team add-member --config ./members.json --project example --name Bob`; use `--role reader` for read-only members. Restart after membership edits. See [team setup and migration](../../docs/REALTIME.md).

The remaining configuration and protocol sections document manual administration and deployment.

An administrator provisions each developer independently. Generate a random developer token and its hash privately:

```sh
python -c "import secrets,hashlib; token=secrets.token_urlsafe(32); print('Developer token:',token); print('Configuration hash:',hashlib.sha256(token.encode()).hexdigest())"
```

Give the token only to its intended developer. Save only the hash in a membership file outside the repository:

```json
{
  "projects": {
    "example": {
      "members": [
        {
          "id": "developer-1",
          "name": "Example developer",
          "token_sha256": "REPLACE_WITH_THE_GENERATED_SHA256_HASH",
          "role": "writer"
        }
      ]
    }
  }
}
```

Use `reader` for snapshot-only access. Project names use letters, numbers, underscores or hyphens. Member IDs and credential hashes must be unique within each project. Git names and possession of a repository clone do not grant membership. This explicit allowlist is the initial self-hosted identity model; repository-provider sign-in is not implemented.

Set `RELAY_TEAM_CONFIG` to the absolute membership-file path and `RELAY_TEAM_DB` to a persistent SQLite file outside the repository, using your host's environment settings. Then run:

```sh
python -m uvicorn relay_team.app:create_app --factory --host 127.0.0.1 --port 4490 --timeout-graceful-shutdown 5
```

`GET /health` reports protocol version 1 without exposing membership or configuration. Start a single service instance with a local persistent disk; do not share the SQLite file over a network filesystem. Back up the database and membership configuration together. Restart after membership edits or credential revocation. Removing a member denies subsequent access after restart without deleting their historical attribution.

For access from other machines, put the service behind an HTTPS reverse proxy with request-size limits (16 KiB is sufficient for a status mutation) and rate limits. Keep the application bound to loopback behind that proxy. Tokens are developer credentials: use HTTPS, keep them out of URLs, logs, commits and exported API reports, and rotate them by replacing the configured hash and restarting. Browser CORS access is intentionally not enabled; the local backend bridges handle collaboration separately from API-testing auth.

## Protocol 1

Every project request requires `Authorization: Bearer <developer-token>`. Unknown projects and invalid credentials return 401; a reader attempting to write receives 403. Authentication errors do not disclose project membership.

`GET /v1/projects/{project}/statuses` returns a consistent snapshot:

```json
{"protocol": 1, "revision": 0, "statuses": []}
```

`PUT /v1/projects/{project}/statuses` accepts exactly these fields:

```json
{
  "endpoint_id": "GET /api/me",
  "fingerprint": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "progress": "done",
  "expected_revision": 0
}
```

`progress` is `not_started`, `in_progress`, `done` or `needs_fixing`. Use revision zero only when creating an endpoint record. For subsequent writes, send that endpoint's last accepted revision, not the project's current snapshot revision. An unrelated endpoint edit does not cause a conflict.

A successful write returns `{"protocol":1,"status":{...}}`. The stored record includes the submitted endpoint ID, fingerprint and progress plus the authenticated `actor_id`, `actor_name`, server `updated_at` and monotonically increasing project `revision`. Clients cannot supply actor, timestamp or revision fields. Status, fingerprint and attribution are committed in one SQLite transaction before acknowledgement.

Stale writes return HTTP 409 with `detail.code` set to `revision_conflict` and `detail.current` containing the accepted record. Do not silently retry with a new revision: show the conflict for deliberate resolution. Concurrent first writes produce one successful acknowledgement and one conflict. A full authenticated snapshot recovers missed state after reconnect or service restart; incremental revision-gap replay is a later implementation step.

Send only status metadata. API bearer tokens, request bodies, local notes, drafts and captured responses have no fields in this protocol and must stay local. HTTP snapshot and write responses use `Cache-Control: no-store`.

## Socket.IO delivery

Use Socket.IO client protocol 4.x (JavaScript) or python-socketio 5.x with the default `/socket.io` transport path and namespace `/`. Both WebSocket and HTTP polling are supported. Authenticate the namespace connection using `auth: {project, token}`; do not put tokens in query strings. The project is fixed for the lifetime of that authenticated connection. Invalid credentials are rejected before room subscription, and there is no client-controlled room-join operation. See the [Python server reference](https://python-socketio.readthedocs.io/en/stable/server.html) and [JavaScript client API](https://socket.io/docs/v4/client-api/).

| Event | Direction | Contract |
| --- | --- | --- |
| `snapshot:get` | Client request with acknowledgement | No arguments. Returns `{ok:true, protocol:1, revision, statuses, can_write}`. The authenticated membership determines `can_write`. |
| `status:update` | Client request with acknowledgement | The same strict mutation fields as HTTP PUT. Returns `{ok:true, protocol:1, status}` after commit, or an explicit error acknowledgement. |
| `status:updated` | Server notification to project members | `{protocol:1, status}` with the accepted server-attributed record. Includes the writer. |

A stale mutation returns `{ok:false, status:409, code:"revision_conflict", current}`. Reader writes return `{ok:false, status:403, code:"write_forbidden"}`. Invalid mutation fields return `{ok:false, status:422, code:"invalid_status"}` without echoing submitted data. HTTP writes and socket writes use the same transaction and notification path; accepted writes are broadcast in revision order within the single service process.

On every connection or reconnection, request a full snapshot. Buffer events while that request is pending, then apply only revisions newer than the snapshot; fetch another snapshot if a gap appears. A timeout is an unknown outcome, not proof that a write failed: inspect current state before deliberately resolving or resubmitting a change. Events are live notifications rather than a durable message queue. Database snapshots recover updates missed during disconnects and process restarts.

Run one process/worker for this initial service; multiple worker processes need shared delivery coordination that is not implemented yet. The example uses a bounded graceful-shutdown timeout because outstanding polling requests can otherwise keep a shutting-down worker alive. Clients must reconnect and recover a snapshot after service restarts. The service transport is tested directly from Python and Node clients; the native bridges are described in the [integration setup](../../docs/REALTIME.md#connect-an-existing-backend).

## Verification

```sh
python -m pip install -e "./apps/team-service[test]"
python -m pytest apps/team-service/tests -q
```

The suite covers project isolation, reader/writer permissions, authenticated attribution, restart durability and revocation, stale revisions, concurrent developer edits, independent endpoint edits and rejection of unsupported fields. Real Python Socket.IO clients additionally cover authenticated subscription, live delivery, cross-project isolation, reader rejection, stale acknowledgements, HTTP-to-socket notifications and polling reconnect recovery. `scripts/verify_team_events.cjs` exercises an installed wheel with independent Node clients and a separate Python HTTP writer. `scripts/verify_realtime_integrations.py` checks both installed native integrations and reviewed migration. `scripts/verify_upgrades.py` checks in-place upgrades from the previous public packages.

## Read-only access diagnostics: 0.0.6 development

The source service adds authenticated `GET /v1/projects/{project}/access`, returning only `{"protocol":1,"can_write":true}` for a writer or `false` for a reader. This route does not retrieve endpoint statuses or alter storage. Invalid credentials, unknown projects and cross-project access receive the same generic 401 response. It is intended for the Python/Node `doctor` checks; it is not in the published 0.0.5 service. New doctors treat an older service's 404 as unverified permission and provide upgrade guidance.
