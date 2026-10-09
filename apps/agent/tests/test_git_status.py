import json
import subprocess

import pytest
from fastapi import HTTPException

from relay_agent.openapi import normalize
from relay_agent.workspace import Workspace

SPEC = {"openapi": "3.1.0", "info": {"title": "Demo", "version": "1"}, "paths": {"/items": {"get": {"responses": {"200": {"description": "OK"}}}}}}


def git(root, *args):
    return subprocess.run(["git", "-C", str(root), *args], check=True, capture_output=True, text=True).stdout.strip()


def repository(root):
    root.mkdir()
    git(root, "init")
    git(root, "config", "user.name", "Alex Developer")
    git(root, "config", "user.email", "alex@example.test")
    return root


def test_status_commit_clone_and_author_visible_in_second_environment(tmp_path):
    repo = repository(tmp_path / "first")
    snapshot = normalize(SPEC)
    endpoint = snapshot["endpoints"][0]
    first = Workspace(project=repo)
    first.sync(snapshot)
    first.update(endpoint["id"], endpoint["fingerprint"], "done", None)
    saved = json.loads((repo / ".relay/status.json").read_text())
    assert saved["endpoints"][endpoint["id"]]["updated_by"]["name"] == "Alex Developer"
    git(repo, "add", ".relay/status.json")
    git(repo, "commit", "-m", "Update API status")
    other = tmp_path / "second"
    subprocess.run(["git", "clone", str(repo), str(other)], check=True, capture_output=True)
    second = Workspace(project=other)
    second.sync(snapshot)
    row = second.read()["endpoints"][endpoint["id"]]
    assert row["progress"] == "done" and row["updated_by"]["name"] == "Alex Developer"
    # A pulled status file is read immediately, with no companion restart.
    saved["endpoints"][endpoint["id"]]["progress"] = "needs_fixing"
    (other / ".relay/status.json").write_text(json.dumps(saved))
    assert second.read()["endpoints"][endpoint["id"]]["progress"] == "needs_fixing"
    first.close(); second.close()


def test_conflict_is_reported_without_overwriting_and_lock_released(tmp_path):
    repo = repository(tmp_path / "repo")
    store = Workspace(project=repo)
    snapshot = normalize(SPEC); store.sync(snapshot)
    endpoint = snapshot["endpoints"][0]
    path = repo / ".relay/status.json"; path.parent.mkdir()
    path.write_text("<<<<<<< HEAD\nconflict")
    with pytest.raises(HTTPException) as error:
        store.update(endpoint["id"], endpoint["fingerprint"], "done", None)
    assert error.value.status_code == 409 and path.read_text().startswith("<<<<<<<")
    assert not path.with_suffix(".lock").exists()
    store.close()


def test_changed_contract_invalidates_shared_done_without_fabricating_author(tmp_path):
    repo = repository(tmp_path / "repo")
    store = Workspace(project=repo); snapshot = normalize(SPEC); store.sync(snapshot)
    endpoint = snapshot["endpoints"][0]
    store.update(endpoint["id"], endpoint["fingerprint"], "done", None)
    changed = json.loads(json.dumps(SPEC))
    changed["paths"]["/items"]["get"]["responses"]["201"] = {"description": "Created"}
    store.sync(normalize(changed))
    row = store.read()["endpoints"][endpoint["id"]]
    assert row["progress"] == "needs_fixing" and row["updated_by"]["name"] == "Alex Developer"
    store.close()
