import importlib.util
import json

from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient

from relay_agent import install_relay
from relay_agent.git_source import GitSource
from test_git_status import git, repository

CODE = '''from fastapi import FastAPI
app = FastAPI()
@app.get("/items")
def items():
    return {"value": "first"}
'''


def load(path):
    spec = importlib.util.spec_from_file_location("source_fixture", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.app


def commit(repo, name):
    git(repo, "add", ".")
    git(repo, "-c", f"user.name={name}", "-c", f"user.email={name.lower()}@example.test",
        "commit", "-m", "Change endpoint")


def test_creator_last_editor_and_local_changes_are_separate(tmp_path):
    repo = repository(tmp_path / "repo")
    path = repo / "routes.py"
    path.write_text(CODE)
    commit(repo, "Alice")
    app = load(path)
    source = GitSource(repo)
    first = source.collect(app)["GET /items"]
    assert first["created_by"]["name"] == "Alice"
    assert first["last_changed_by"]["name"] == "Alice"
    assert first["state"] == "tracked"
    path.write_text(CODE.replace('"first"', '"second"'))
    commit(repo, "Bob")
    second = source.collect(load(path))["GET /items"]
    assert second["created_by"]["name"] == "Alice"
    assert second["last_changed_by"]["name"] == "Bob"
    path.write_text(CODE.replace('"first"', '"local"'))
    local = source.collect(load(path))["GET /items"]
    assert local["state"] == "uncommitted"
    assert local["created_by"]["name"] == "Alice"
    assert local["last_changed_by"]["name"] == "Bob"


def test_new_untracked_handler_does_not_claim_git_identity(tmp_path):
    repo = repository(tmp_path / "repo")
    (repo / "readme.txt").write_text("Initial")
    commit(repo, "Alice")
    path = repo / "routes.py"
    path.write_text(CODE)
    row = GitSource(repo).collect(load(path))["GET /items"]
    assert row["state"] == "uncommitted"
    assert "created_by" not in row and "last_changed_by" not in row


def test_nested_included_router_prefixes_and_hidden_routes(tmp_path):
    repo = repository(tmp_path / "repo")
    path = repo / "routes.py"
    path.write_text(CODE.replace('from fastapi import FastAPI', 'from fastapi import APIRouter')
                    .replace('app = FastAPI()', 'app = APIRouter(prefix="/v1")'))
    commit(repo, "Alice")
    app = FastAPI()
    parent = APIRouter(prefix="/api")
    parent.include_router(load(path))
    app.include_router(parent, prefix="/backend")
    app.include_router(load(path), prefix="/hidden", include_in_schema=False)
    sources = GitSource(repo).collect(app)
    assert list(sources) == ["GET /backend/api/v1/items"]
    assert sources["GET /backend/api/v1/items"]["created_by"]["name"] == "Alice"


def test_native_workspace_exposes_source_without_writing_shared_status(tmp_path):
    repo = repository(tmp_path / "repo")
    path = repo / "routes.py"
    path.write_text(CODE)
    commit(repo, "Alice")
    app = load(path)
    install_relay(app, project=repo, db_path=":memory:")
    origin = "http://localhost:9000"
    with TestClient(app, base_url=origin, client=("127.0.0.1", 1234)) as client:
        headers = {"Origin":origin, "X-Relay-CSRF":client.get("/relay/__relay/health").json()["csrf_token"]}
        snapshot = client.post("/relay/__relay/sources/inspect", headers=headers).json()
        row = client.get("/relay/__relay/workspace").json()["endpoints"]["GET /items"]
        assert row["progress"] == "done"
        assert row["source"]["created_by"]["name"] == "Alice"
        assert "updated_by" not in row
        assert "source" not in snapshot["endpoints"][0]
        assert not (repo / ".relay/status.json").exists()
        client.post("/relay/__relay/endpoints/update", headers=headers, json={
            "endpoint_id":row["endpoint_id"], "fingerprint":row["fingerprint"], "progress":"in_progress"})
        saved = json.loads((repo / ".relay/status.json").read_text())
        assert saved["endpoints"]["GET /items"]["updated_by"]["name"] == "Alex Developer"
        assert "source" not in saved["endpoints"]["GET /items"]
