"""Real Socket.IO clients exercise project delivery and reconnect recovery."""
import hashlib
import socket
import threading
import time

import httpx
import pytest
import socketio
import uvicorn

from relay_team.app import create_app


def identity(name, role="writer"):
    return {"id": name, "name": name.title(), "role": role,
            "token_sha256": hashlib.sha256(name.encode()).hexdigest()}


@pytest.fixture
def live_service(tmp_path):
    app = create_app(config={"projects": {
        "alpha": {"members": [identity("alice"), identity("bob"), identity("reader", "reader")]},
        "beta": {"members": [identity("carol")]},
    }}, db_path=tmp_path / "statuses.sqlite3")
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    base = f"http://127.0.0.1:{listener.getsockname()[1]}"
    server = uvicorn.Server(uvicorn.Config(app, log_level="error", lifespan="on",
                                          timeout_graceful_shutdown=1))
    thread = threading.Thread(target=server.run, kwargs={"sockets": [listener]}, daemon=True)
    thread.start()
    deadline = time.monotonic() + 10
    while not server.started:
        if not thread.is_alive() or time.monotonic() > deadline:
            raise RuntimeError("Team service failed to start.")
        time.sleep(0.01)
    clients = []

    def client(name, project="alpha", transport="websocket"):
        connection = socketio.Client(reconnection=False, logger=False, engineio_logger=False)
        clients.append(connection)
        connection.connect(base, auth={"project": project, "token": name}, transports=[transport])
        return connection

    try:
        yield base, client
    finally:
        for connection in clients:
            if connection.connected:
                connection.disconnect()
        server.should_exit = True
        thread.join(timeout=10)
        listener.close()
        assert not thread.is_alive()


def mutation(**changes):
    return {"endpoint_id": "GET /api/me", "fingerprint": "a" * 64,
            "progress": "done", "expected_revision": 0, **changes}


def test_socket_membership_and_reader_permissions(live_service):
    _, client = live_service
    with pytest.raises(socketio.exceptions.ConnectionError):
        client("unknown")
    with pytest.raises(socketio.exceptions.ConnectionError):
        client("carol", "alpha")
    reader = client("reader")
    assert reader.call("snapshot:get", timeout=3)["revision"] == 0
    assert reader.call("status:update", mutation(), timeout=3) == {
        "ok": False, "status": 403, "code": "write_forbidden"}


def test_project_delivery_acknowledgement_conflicts_and_recovery(live_service):
    _, client = live_service
    alice, bob, carol = client("alice"), client("bob"), client("carol", "beta")
    delivered, isolated = threading.Event(), threading.Event()
    received = []
    bob.on("status:updated", lambda payload: (received.append(payload), delivered.set()))
    carol.on("status:updated", lambda payload: isolated.set())
    saved = alice.call("status:update", mutation(), timeout=3)
    assert saved["ok"] and saved["status"]["actor_id"] == "alice"
    assert delivered.wait(3) and received == [{"protocol": 1, "status": saved["status"]}]
    assert carol.call("snapshot:get", timeout=3)["statuses"] == []
    assert not isolated.is_set()
    stale = bob.call("status:update", mutation(), timeout=3)
    assert stale["code"] == "revision_conflict" and stale["current"] == saved["status"]
    bob.disconnect()
    accepted = alice.call("status:update", mutation(expected_revision=1, progress="needs_fixing"), timeout=3)
    reconnected = client("bob", transport="polling")
    recovered = reconnected.call("snapshot:get", timeout=3)
    assert recovered["revision"] == 2 and recovered["statuses"] == [accepted["status"]]


def test_http_updates_reach_socket_subscribers_and_identity_cannot_be_forged(live_service):
    base, client = live_service
    bob = client("bob")
    delivered = threading.Event()
    received = []
    bob.on("status:updated", lambda payload: (received.append(payload), delivered.set()))
    response = httpx.put(base + "/v1/projects/alpha/statuses", json=mutation(),
                         headers={"Authorization": "Bearer alice"})
    assert response.status_code == 200 and delivered.wait(3)
    assert received[0]["status"]["actor_id"] == "alice"
    forged = bob.call("status:update", mutation(expected_revision=1, actor_id="alice"), timeout=3)
    assert forged == {"ok": False, "status": 422, "code": "invalid_status"}
    assert bob.call("snapshot:get", timeout=3)["revision"] == 1
