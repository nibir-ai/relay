import json
import subprocess
import time

from relay_backend.git_status import GitStatus
from relay_backend.status_sync import StatusSync
from test_git_status import repository, git


def peers(tmp_path):
    first = repository(tmp_path / "first")
    (first / "app.py").write_text("original\n")
    git(first, "add", "app.py")
    git(first, "commit", "-m", "Initial backend")
    remote = tmp_path / "remote.git"
    subprocess.run(["git", "clone", "--bare", str(first), str(remote)], check=True, capture_output=True)
    git(first, "remote", "add", "origin", str(remote))
    second = tmp_path / "second"
    subprocess.run(["git", "clone", str(remote), str(second)], check=True, capture_output=True)
    git(second, "config", "user.name", "Sam Developer")
    git(second, "config", "user.email", "sam@example.test")
    return first, second, remote


def test_automatic_background_sync_preserves_checkout_and_identity(tmp_path):
    first, second, remote = peers(tmp_path)
    (first / "app.py").write_text("staged edit\n")
    git(first, "add", "app.py")
    (first / "app.py").write_text("unstaged edit\n")
    before = (git(first, "rev-parse", "HEAD"), git(first, "symbolic-ref", "HEAD"), git(first, "diff", "--cached"))
    a, b = GitStatus(first), GitStatus(second)
    a.update("GET /items", "a" * 64, "needs_fixing")
    sender, receiver = StatusSync(a, interval=0.05), StatusSync(b, interval=0.05)
    sender.start()
    receiver.start()
    try:
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline and "GET /items" not in b.read():
            time.sleep(0.05)
        row = b.read()["GET /items"]
        assert row["progress"] == "needs_fixing" and row["updated_by"]["name"] == "Alex Developer"
        assert (first / "app.py").read_text() == "unstaged edit\n"
        assert before == (git(first, "rev-parse", "HEAD"), git(first, "symbolic-ref", "HEAD"), git(first, "diff", "--cached"))
        assert git(remote, "ls-tree", "--name-only", "relay-status") == "status.json"
    finally:
        sender.close()
        receiver.close()


def test_concurrent_updates_retry_without_overwriting_a_teammate(tmp_path, monkeypatch):
    first, second, remote = peers(tmp_path)
    a, b = GitStatus(first), GitStatus(second)
    sender, peer = StatusSync(a), StatusSync(b)
    a.update("GET /items", "a" * 64, "done")
    sender.sync_once()
    peer.sync_once()
    a.update("GET /items", "a" * 64, "in_progress")
    original = sender._git
    injected = False
    def race(*args, **kwargs):
        nonlocal injected
        if args[0] == "push" and not injected:
            injected = True
            b.update("POST /items", "b" * 64, "needs_fixing")
            peer.sync_once()
        return original(*args, **kwargs)
    monkeypatch.setattr(sender, "_git", race)
    sender.sync_once()
    assert injected and sender.state == "synced", sender.error
    peer.sync_once()
    assert a.read() == b.read()
    assert b.read()["GET /items"]["progress"] == "in_progress"
    assert b.read()["POST /items"]["updated_by"]["name"] == "Sam Developer"


def test_failed_remote_access_preserves_local_changes_and_reports_error(tmp_path):
    root = repository(tmp_path / "backend")
    shared = GitStatus(root)
    shared.update("GET /items", "a" * 64, "in_progress")
    before = shared.path.read_bytes()
    sync = StatusSync(shared)
    sync.sync_once()
    assert sync.state == "error" and sync.info()["error"]
    assert shared.path.read_bytes() == before


def test_sync_only_exports_status_fields(tmp_path):
    first, second, remote = peers(tmp_path)
    shared = GitStatus(first)
    shared.update("GET /items", "a" * 64, "done")
    data = json.loads(shared.path.read_text())
    data["endpoints"]["GET /items"]["token"] = "must-not-share"
    shared.path.write_text(json.dumps(data))
    sync = StatusSync(shared)
    sync.sync_once()
    assert sync.state == "synced", sync.error
    assert "must-not-share" not in git(remote, "show", "relay-status:status.json")


def test_invalid_remote_metadata_is_not_overwritten(tmp_path):
    first, second, remote = peers(tmp_path)
    shared = GitStatus(first)
    sync = StatusSync(shared)
    blob = sync._git("hash-object", "-w", "--stdin", input='{"version":99,"endpoints":{}}').stdout.strip()
    tree = sync._git("mktree", "-z", input=f"100644 blob {blob}\tstatus.json\0").stdout.strip()
    commit = sync._git("commit-tree", tree, "-m", "Invalid metadata").stdout.strip()
    sync._git("push", "origin", f"{commit}:{sync.branch}")
    shared.update("GET /items", "a" * 64, "done")
    before = shared.path.read_bytes()
    sync.sync_once()
    assert sync.state == "error"
    assert shared.path.read_bytes() == before
    assert git(remote, "rev-parse", "relay-status") == commit


def test_native_workspace_reports_sync_and_receives_remote_changes(tmp_path):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from relay_backend import install_relay
    first, second, remote = peers(tmp_path)
    shared = GitStatus(first)
    shared.update("GET /ping", "a" * 64, "needs_fixing")
    sender = StatusSync(shared)
    sender.sync_once()
    app = FastAPI(title="Team backend")
    relay = install_relay(app, project=second, db_path=":memory:", sync_status=True)
    with TestClient(app, base_url="http://localhost", client=("127.0.0.1", 1234)) as client:
        worker = relay.state.status_sync
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline and worker.state != "synced":
            time.sleep(0.05)
        metadata = client.get("/relay/__relay/workspace").json()["status_sync"]
        assert metadata["enabled"] and metadata["state"] == "synced", metadata
        assert GitStatus(second).read()["GET /ping"]["updated_by"]["name"] == "Alex Developer"
    assert worker.stopped.is_set() and not worker.thread.is_alive()
