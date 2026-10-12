import json

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from relay_backend.app import create_app
from relay_backend.integration import install_relay
from relay_backend.openapi import normalize
from relay_backend.workspace import Workspace

ORIGIN = "http://127.0.0.1:4477"
SPEC = {"openapi":"3.1.0","info":{"title":"Test","version":"1"},"paths":{"/test":{"get":{"responses":{"200":{"description":"OK"}}}}}}


def csrf(client):
    return {"Origin":ORIGIN,"X-Relay-CSRF":client.get("/__relay/health").json()["csrf_token"]}


def test_progress_and_notes_survive_restart(tmp_path):
    path=tmp_path/"workspace.sqlite3"
    transport=httpx.MockTransport(lambda request:httpx.Response(200,json=SPEC))
    with TestClient(create_app(transport=transport,db_path=path),base_url=ORIGIN) as client:
        endpoint=client.post("/__relay/sources/inspect",headers=csrf(client)).json()["endpoints"][0]
        result=client.post("/__relay/endpoints/update",headers=csrf(client),json={"endpoint_id":endpoint["id"],"fingerprint":endpoint["fingerprint"],"progress":"done","note":"Review pagination"})
        assert result.status_code==200
    with TestClient(create_app(transport=transport,db_path=path),base_url=ORIGIN) as client:
        client.post("/__relay/sources/inspect",headers=csrf(client))
        row=client.get("/__relay/workspace").json()["endpoints"][endpoint["id"]]
        assert row["progress"]=="done" and row["note"]=="Review pagination"


def test_sync_is_idempotent_and_changed_done_contract_needs_fixing():
    store=Workspace()
    snapshot=normalize(SPEC)
    store.sync(snapshot)
    endpoint=snapshot["endpoints"][0]
    store.update(endpoint["id"],endpoint["fingerprint"],"done","Keep this note")
    before=store.read()
    store.sync(snapshot)
    assert store.read()==before
    changed=json.loads(json.dumps(SPEC))
    changed["paths"]["/test"]["get"]["responses"]["200"]["content"]={"application/json":{"schema":{"type":"object","properties":{"name":{"type":"string"}}}}}
    store.sync(normalize(changed))
    row=store.read()["endpoints"][endpoint["id"]]
    assert row["progress"]=="needs_fixing" and row["note"]=="Keep this note"
    store.close()


def test_removed_endpoint_is_archived_with_history():
    store=Workspace(); snapshot=normalize(SPEC);store.sync(snapshot)
    endpoint=snapshot["endpoints"][0]
    store.update(endpoint["id"],endpoint["fingerprint"],"in_progress","Preserved")
    store.sync(normalize({**SPEC,"paths":{}}))
    result=store.read()
    assert result["endpoints"][endpoint["id"]]["active"]==0
    assert result["endpoints"][endpoint["id"]]["note"]=="Preserved"
    assert result["activity"][0]["kind"]=="removed"
    store.close()


def test_progress_update_requires_current_fingerprint_and_csrf():
    with TestClient(create_app(transport=httpx.MockTransport(lambda request:httpx.Response(200,json=SPEC))),base_url=ORIGIN) as client:
        endpoint=client.post("/__relay/sources/inspect",headers=csrf(client)).json()["endpoints"][0]
        payload={"endpoint_id":endpoint["id"],"fingerprint":"a"*64,"progress":"done"}
        assert client.post("/__relay/endpoints/update",headers=csrf(client),json=payload).status_code==409
        payload["fingerprint"]=endpoint["fingerprint"]
        assert client.post("/__relay/endpoints/update",json=payload).status_code==403
        assert client.post("/__relay/endpoints/update",headers=csrf(client),json={**payload,"progress":"ready"}).status_code==422
        assert client.post("/__relay/statuses/retry").status_code == 403
        assert client.post("/__relay/statuses/retry",headers=csrf(client)).status_code == 200


def test_http_success_does_not_update_progress_or_store_traffic():
    def handler(request):
        return httpx.Response(200,json=SPEC) if request.url.path=="/openapi.json" else httpx.Response(200,json={"access_token":"private-test-value"})
    with TestClient(create_app(transport=httpx.MockTransport(handler)),base_url=ORIGIN) as client:
        endpoint=client.post("/__relay/sources/inspect",headers=csrf(client)).json()["endpoints"][0]
        before=client.get("/__relay/workspace").json()
        result=client.post("/__relay/execute",headers=csrf(client),json={"method":"GET","path":"/test","headers":{"Authorization":"Bearer private-test-value"}})
        assert result.json()["status"]==200
        after=client.get("/__relay/workspace").json()
        assert after==before and "private-test-value" not in json.dumps(after)


def test_relay_route_and_assets_are_served(tmp_path):
    (tmp_path/"index.html").write_text('<div id="root"></div>')
    with TestClient(create_app(static_dir=tmp_path),base_url=ORIGIN) as client:
        assert client.get("/relay").status_code==200
        assert client.get("/relay/").status_code==200


def test_default_done_migration_preserves_manual_statuses(tmp_path):
    import sqlite3
    path = tmp_path / "legacy.sqlite3"
    store = Workspace(path)
    store.sync(normalize(SPEC))
    assert store.read()["endpoints"]["GET /test"]["progress"] == "done"
    store.close()
    with sqlite3.connect(path) as db:
        db.execute("UPDATE endpoints SET progress='not_started'")
        db.execute("PRAGMA user_version=1")
    store = Workspace(path)
    assert store.read()["endpoints"]["GET /test"]["progress"] == "done"
    endpoint = normalize(SPEC)["endpoints"][0]
    store.update(endpoint["id"], endpoint["fingerprint"], "not_started", None)
    store.close()
    with sqlite3.connect(path) as db:
        db.execute("PRAGMA user_version=1")
    store = Workspace(path)
    assert store.read()["endpoints"]["GET /test"]["progress"] == "not_started"
    store.sync(normalize(SPEC))
    assert store.read()["endpoints"]["GET /test"]["progress"] == "not_started"
    store.close()


def test_contract_explanation_survives_restart_and_note_save_until_review(tmp_path):
    path = tmp_path / "contract.sqlite3"
    snapshot = normalize(SPEC); endpoint = snapshot["endpoints"][0]
    store = Workspace(path); store.sync(snapshot)
    changed = json.loads(json.dumps(SPEC))
    changed["paths"]["/test"]["get"]["responses"]["404"] = {"description":"Missing"}
    current = normalize(changed)
    store.sync(current); store.close()
    store = Workspace(path); store.sync(current)
    row = store.read()["endpoints"][endpoint["id"]]
    assert row["contract_changed"] and row["changed_sections"] == ["Responses"]
    store.update(endpoint["id"], row["fingerprint"], None, "Retest 404")
    assert store.read()["endpoints"][endpoint["id"]]["contract_changed"]
    with pytest.raises(Exception) as error:
        store.update(endpoint["id"], endpoint["fingerprint"], "done", None)
    assert error.value.status_code == 409
    store.update(endpoint["id"], row["fingerprint"], "done", None)
    assert not store.read()["endpoints"][endpoint["id"]]["contract_changed"]
    assert store.read()["endpoints"][endpoint["id"]]["note"] == "Retest 404"
    store.close()


def test_equivalent_parameter_order_does_not_invalidate_and_activity_is_bounded():
    raw = json.loads(json.dumps(SPEC))
    params = [{"name":name,"in":"query","schema":{"type":"string"}} for name in ("a","b")]
    raw["paths"]["/test"]["get"]["parameters"] = params
    store = Workspace(); first = normalize(raw); store.sync(first)
    raw["paths"]["/test"]["get"]["parameters"] = list(reversed(params))
    store.sync(normalize(raw))
    assert not store.read()["endpoints"]["GET /test"]["contract_changed"]
    for number in range(110):
        store.update("GET /test", first["endpoints"][0]["fingerprint"], None, str(number))
    assert store.db.execute("SELECT COUNT(*) FROM activity").fetchone()[0] == 100
    store.close()
