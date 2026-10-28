import hashlib
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from relay_team.app import create_app


def member(identity, token, role="writer"):
    return {"id": identity, "name": identity.title(), "role": role,
            "token_sha256": hashlib.sha256(token.encode()).hexdigest()}


@pytest.fixture
def service(tmp_path):
    config = {"projects": {
        "alpha": {"members": [member("alice", "alice-token"),
                                member("bob", "bob-token"),
                                member("reader", "read-token", "reader")]},
        "beta": {"members": [member("carol", "carol-token")]},
    }}
    database = tmp_path / "service.sqlite3"
    with TestClient(create_app(config=config, db_path=database)) as client:
        yield client, config, database


def headers(token="alice-token"):
    return {"Authorization": f"Bearer {token}"}


def mutation(**changes):
    return {"endpoint_id": "GET /api/me", "fingerprint": "a" * 64,
            "progress": "done", "expected_revision": 0, **changes}


URL = "/v1/projects/alpha/statuses"


def test_authentication_and_project_isolation(service):
    client, _, _ = service
    assert client.get("/health").json() == {"ok": True, "protocol": 1}
    for token in ("", "wrong", "carol-token"):
        assert client.get(URL, headers=headers(token)).status_code == 401
    assert client.get("/v1/projects/unknown/statuses", headers=headers()).status_code == 401
    assert client.put(URL, headers=headers("read-token"), json=mutation()).status_code == 403
    assert client.get(URL, headers=headers("read-token")).json()["statuses"] == []
    assert client.get(URL, headers=headers("read-token")).headers["cache-control"] == "no-store"


def test_identity_revision_and_restart_durability(service):
    client, config, database = service
    saved = client.put(URL, headers=headers(), json=mutation()).json()["status"]
    assert saved["actor_id"] == "alice" and saved["actor_name"] == "Alice"
    assert saved["revision"] == 1 and saved["updated_at"].endswith("+00:00")
    restarted = TestClient(create_app(config=config, db_path=database))
    snapshot = restarted.get(URL, headers=headers("bob-token")).json()
    assert snapshot["revision"] == 1 and snapshot["statuses"] == [saved]
    assert restarted.get("/v1/projects/beta/statuses", headers=headers("carol-token")).json()["statuses"] == []


def test_stale_update_returns_current_record_without_overwriting(service):
    client, _, _ = service
    client.put(URL, headers=headers(), json=mutation())
    rejected = client.put(URL, headers=headers("bob-token"), json=mutation(progress="needs_fixing"))
    assert rejected.status_code == 409
    assert rejected.json()["detail"]["current"]["actor_id"] == "alice"
    accepted = client.put(URL, headers=headers("bob-token"),
                          json=mutation(expected_revision=1, progress="needs_fixing"))
    assert accepted.json()["status"]["revision"] == 2
    assert accepted.json()["status"]["actor_id"] == "bob"


def test_concurrent_developers_have_one_winner(service):
    client, _, _ = service
    def write(token):
        return client.put(URL, headers=headers(token), json=mutation()).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(write, ["alice-token", "bob-token"])) == [200, 409]
    assert client.get(URL, headers=headers()).json()["revision"] == 1


def test_unrelated_endpoint_edits_do_not_conflict(service):
    client, _, _ = service
    first = client.put(URL, headers=headers(), json=mutation()).json()["status"]
    client.put(URL, headers=headers(), json=mutation(endpoint_id="POST /api/items"))
    result = client.put(URL, headers=headers(), json=mutation(expected_revision=first["revision"]))
    assert result.status_code == 200 and result.json()["status"]["revision"] == 3


@pytest.mark.parametrize("changes", [
    {"actor_id": "forged"}, {"updated_at": "yesterday"}, {"body": "private"},
    {"progress": "approved"}, {"fingerprint": "invalid"}, {"expected_revision": -1},
    {"expected_revision": True}, {"endpoint_id": ""},
])
def test_invalid_or_private_fields_are_rejected(service, changes):
    client, _, _ = service
    assert client.put(URL, headers=headers(), json=mutation(**changes)).status_code == 422
    assert client.get(URL, headers=headers()).json()["revision"] == 0


def test_revoked_members_cannot_read_after_restart(service):
    client, config, database = service
    client.put(URL, headers=headers(), json=mutation())
    config["projects"]["alpha"]["members"] = [member("bob", "bob-token")]
    restarted = TestClient(create_app(config=config, db_path=database))
    assert restarted.get(URL, headers=headers()).status_code == 401
    assert restarted.get(URL, headers=headers("bob-token")).json()["revision"] == 1


def test_ambiguous_configuration_fails_closed(tmp_path):
    duplicate = member("alice", "token")
    with pytest.raises(ValueError, match="unique"):
        create_app(config={"projects": {"alpha": {"members": [duplicate, duplicate]}}},
                   db_path=tmp_path / "invalid.sqlite3")


def test_hosted_factory_uses_environment_configuration(service, monkeypatch, tmp_path):
    import json
    _, config, database = service
    path = tmp_path / "members.json"
    path.write_text(json.dumps(config), encoding="utf-8")
    monkeypatch.setenv("RELAY_TEAM_CONFIG", str(path))
    monkeypatch.setenv("RELAY_TEAM_DB", str(database))
    hosted = TestClient(create_app())
    assert hosted.put(URL, headers=headers(), json=mutation()).status_code == 200


def test_access_diagnostic_reports_only_authenticated_permission_without_mutation(service):
    client,_,database=service
    before=client.get(URL,headers=headers()).json()
    assert client.get("/v1/projects/alpha/access",headers=headers()).json()=={"protocol":1,"can_write":True}
    assert client.get("/v1/projects/alpha/access",headers=headers("read-token")).json()=={"protocol":1,"can_write":False}
    for project,token in [("alpha","wrong"),("unknown","alice-token"),("beta","alice-token")]:
        response=client.get(f"/v1/projects/{project}/access",headers=headers(token))
        assert response.status_code==401
        assert response.json()=={"detail":"Developer authentication required."}
    assert client.get(URL,headers=headers()).json()==before
