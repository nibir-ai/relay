# Shared team statuses: v0.0.5 proposal

This is a design proposal. It is not shipped in Relay 0.0.3.

Target launch: **November 2026**, after v0.0.4. The [README roadmap](../README.md#release-roadmap) defines weekly milestones and launch gates. The [v0.0.4 plan](RELEASE-0.0.4.md) keeps setup and local handoff improvements independent of this service.

The goal is simple: a developer changes the status beside an API; the other developers see the change and its author without Git commands or a status branch. API testing remains the main workspace.

## Proposed flow

```mermaid
flowchart LR
  A[Developer A: local /relay] --> B[Shared team service]
  C[Developer B: local /relay] --> B
  B --> D[(Saved endpoint statuses)]
  B -->|Status events| A
  B -->|Status events| C
```

Each local Relay integration connects to the same authenticated team service. The service persists endpoint status, contract fingerprint, authenticated updater and timestamp, then broadcasts an update to that project's members. Socket.IO provides project rooms and connection middleware; it does not replace durable storage. See its [server API](https://socket.io/docs/v4/server-api/).

Local API requests, bearer tokens, request bodies and captured responses stay in the developer's testing environment. Only team status metadata goes to the shared service. A backend bridge can preserve the local browser's existing same-origin flow.

## Scope and implementation sequence

1. Decide the service deployment/storage model, self-hosting setup, identity provider and project access rules. Document configuration before implementation.
2. Define a shared protocol for Python and Node: project/endpoint identity, contract fingerprint, status, authenticated updater, server timestamp and monotonic revision. Mutations include the expected revision; stale updates receive a conflict response.
3. Implement authenticated membership checks before room subscription, reads and writes, plus durable transactional updates. The service assigns actor/timestamp/revision; client-supplied Git names do not establish identity.
4. Bridge local integrations to the service, keeping the browser's existing same-origin request execution. Distinguish local API authorization from developer collaboration sign-in.
5. Recover full state or a validated revision gap after reconnect. Surface unacknowledged edits and conflicts; do not silently overwrite another developer's accepted update.
6. Select local, Git or realtime mode explicitly. Preview imports from existing Git status metadata; do not run competing status authorities or create a Git status branch in realtime mode.
7. Dogfood, verify both package upgrades and publish only after the release requirements below pass.

Local notes/activity remain local for this release. Remote request execution, payload sharing, chat, OAuth API-testing flows and multipart uploads are not part of this milestone.

## Contributor access

Use an authenticated developer identity with repository collaborator/team checks, or an explicit developer allowlist. A Git-configured name alone does not authenticate someone. For public repositories, being able to clone the code does not imply permission to change team statuses.

## Release requirements

- Minimal setup: one shared service address and developer sign-in, or a verified host-backend authentication adapter.
- Durable status storage with project isolation and membership enforcement.
- Server acknowledgements and explicit conflict handling for simultaneous edits.
- Full state recovery after reconnect, including changes missed while offline.
- API testing stays usable when collaboration is unavailable; sync failure is visible.
- Verify two separate developer environments, unauthorized clients, reconnects and concurrent updates before shipping.

Independent localhost servers need a shared destination to communicate. Adding Socket.IO to each local server alone does not connect the team. The implementation should make that shared destination easy to configure and avoid creating a Git status branch in this mode.
