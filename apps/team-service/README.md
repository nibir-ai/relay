# Relay team status service

Development foundation for **0.0.5**, not a published package or a connected Relay UI feature yet. This optional service stores manual endpoint statuses for independent developer environments. Local API testing continues through the existing Python and Node packages.

The service currently provides authenticated snapshots and revision-checked writes. Live delivery, backend bridges, collaboration sign-in in the UI, migration and offline/conflict UX are still pending. It does not create a Git branch.

## Run one shared instance

Use Python 3.11 or newer. From the repository root, create an isolated environment and install the service:

```sh
python -m venv .venv-team
# Activate .venv-team using your shell's activation command.
python -m pip install ./apps/team-service
```

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
python -m uvicorn relay_team.app:create_app --factory --host 127.0.0.1 --port 4490
```

`GET /health` reports protocol version 1 without exposing membership or configuration. Start a single service instance with a local persistent disk; do not share the SQLite file over a network filesystem. Back up the database and membership configuration together. Restart after membership edits or credential revocation. Removing a member denies subsequent access after restart without deleting their historical attribution.

For access from other machines, put the service behind an HTTPS reverse proxy with request-size limits (16 KiB is sufficient for a status mutation) and rate limits. Keep the application bound to loopback behind that proxy. Tokens are developer credentials: use HTTPS, keep them out of URLs, logs, commits and exported API reports, and rotate them by replacing the configured hash and restarting. Browser CORS access is intentionally not enabled; future local backend bridges will handle collaboration separately from API-testing auth.

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

Stale writes return HTTP 409 with `detail.code` set to `revision_conflict` and `detail.current` containing the accepted record. Do not silently retry with a new revision: show the conflict for deliberate resolution. Concurrent first writes produce one successful acknowledgement and one conflict. A full authenticated snapshot recovers missed state after reconnect or service restart; live events and revision-gap delivery are a later implementation step.

Send only status metadata. API bearer tokens, request bodies, local notes, drafts and captured responses have no fields in this protocol and must stay local. Responses use `Cache-Control: no-store`.

## Verification

```sh
python -m pip install -e "./apps/team-service[test]"
python -m pytest apps/team-service/tests -q
```

The suite covers project isolation, reader/writer permissions, authenticated attribution, restart durability and revocation, stale revisions, concurrent developer edits, independent endpoint edits and rejection of unsupported fields. Full Python/Node integration and package-upgrade verification remain release gates for 0.0.5.
