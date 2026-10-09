import importlib.util
import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from relay_agent.app import create_app
from relay_agent.openapi import SpecError, normalize
from relay_agent.security import MAX_REQUEST, MAX_RESPONSE, Settings

ROOT = Path(__file__).resolve().parents[3]
module = importlib.util.spec_from_file_location("demo", ROOT / "fixtures/fastapi-demo/main.py")
demo = importlib.util.module_from_spec(module)
module.loader.exec_module(demo)
ORIGIN = "http://127.0.0.1:4477"


@pytest.fixture
def client():
    with TestClient(create_app(transport=httpx.ASGITransport(app=demo.app)), base_url=ORIGIN) as client:
        yield client


def headers(client):
    return {"Origin": ORIGIN, "X-Relay-CSRF": client.get("/__relay/health").json()["csrf_token"]}


def test_discover_and_execute_fixture(client):
    snapshot = client.post("/__relay/sources/inspect", headers=headers(client)).json()
    assert {e["method"] for e in snapshot["endpoints"]} == {"GET", "POST"}
    login = next(e for e in snapshot["endpoints"] if e["method"] == "POST")
    assert login["requestBody"]["content"]["application/json"]["schema"]["properties"]["email"]["examples"] == ["alex@example.com"]
    response = client.post("/__relay/execute", headers=headers(client), json={"method":"POST", "path":login["path"], "body_mode":"json", "body":json.dumps({"email":"alex@example.com", "password":"demo123"})})
    assert response.status_code == 200
    result = response.json()
    assert result["status"] == 200
    assert json.loads(result["body"])["access_token"] == "demo-token-not-real"
    assert result["duration_ms"] >= 0
    assert result["headers"]["content-type"] == "application/json"
    assert "ready" not in result


@pytest.mark.parametrize("payload,status", [
    ({"method":"GET","path":"/api/health"},200),
    ({"method":"GET","path":"/api/users/1","query":{"include_email":"true"}},200),
    ({"method":"GET","path":"/api/users/2"},404),
    ({"method":"GET","path":"/api/users/nope"},422),
    ({"method":"POST","path":"/api/auth/login","body_mode":"json","body":"{}"},422),
    ({"method":"POST","path":"/api/auth/login","body_mode":"json","body":'{"email":"wrong", "password":"wrong"}'},401),
])
def test_http_statuses_are_real_responses(client, payload, status):
    response = client.post("/__relay/execute", headers=headers(client), json=payload)
    assert response.status_code == 200
    assert response.json()["status"] == status
    if payload.get("query"):
        assert json.loads(response.json()["body"])["email"] == "alex@example.com"


@pytest.mark.parametrize("changes", [{"Origin":"https://evil.example"}, {"Origin":"null"}, {"X-Relay-CSRF":"wrong"}, {"Host":"evil.example"}, {"Sec-Fetch-Site":"cross-site"}])
def test_security_checks(client, changes):
    assert client.post("/__relay/execute", headers={**headers(client), **changes}, json={"method":"GET","path":"/api/health"}).status_code == 403


def test_missing_origin_and_token(client):
    assert client.post("/__relay/execute", json={"method":"GET","path":"/api/health"}).status_code == 403


@pytest.mark.parametrize("path", ["http://evil.example", "//evil.example", "/\\evil.example", "/api/health?x=1", "/api/health#fragment"])
def test_destination_escape(client, path):
    assert client.post("/__relay/execute", headers=headers(client), json={"method":"GET", "path":path}).status_code == 400


@pytest.mark.parametrize("target", ["http://example.com:80", "http://localhost:8000", "http://192.168.1.1:8000", "http://user:pass@127.0.0.1:8000", "ftp://127.0.0.1:8000", "http://127.0.0.1:8000/path"])
def test_only_explicit_loopback_origins(target):
    with pytest.raises(ValueError): Settings(base_url=target)


def test_invalid_json_and_forbidden_headers(client):
    for payload in [{"body_mode":"json","body":"{"}, {"headers":{"Host":"evil.example"}}, {"headers":{"X-Test":"a\r\nb"}}]:
        assert client.post("/__relay/execute", headers=headers(client), json={"method":"POST","path":"/api/auth/login", **payload}).status_code == 400


def test_request_limit(client):
    assert client.post("/__relay/execute", headers=headers(client), content=b"x" * (MAX_REQUEST + 1)).status_code == 413


def test_response_limit_and_redirects():
    urls = []
    def handler(request):
        urls.append(str(request.url))
        if request.url.path == "/redirect": return httpx.Response(302, headers={"Location":"http://evil.example"})
        return httpx.Response(200, content=b"x" * (MAX_RESPONSE + 50))
    with TestClient(create_app(transport=httpx.MockTransport(handler)), base_url=ORIGIN) as client:
        response = client.post("/__relay/execute", headers=headers(client), json={"method":"GET","path":"/large"}).json()
        assert response["truncated"] and response["bytes"] == MAX_RESPONSE
        result = client.post("/__relay/execute", headers=headers(client), json={"method":"GET","path":"/redirect"}).json()
        assert result["status"] == 302
        assert len(urls) == 2 and all(url.startswith("http://127.0.0.1:8000") for url in urls)


def test_backend_500_is_a_response_not_transport_error():
    with TestClient(create_app(transport=httpx.MockTransport(lambda request: httpx.Response(500, text="Server failure"))), base_url=ORIGIN) as client:
        result = client.post("/__relay/execute", headers=headers(client), json={"method":"GET","path":"/failure"})
        assert result.status_code == 200
        assert result.json()["status"] == 500 and result.json()["body"] == "Server failure"


@pytest.mark.parametrize("exception,status", [(httpx.ConnectError,502), (httpx.ReadTimeout,504)])
def test_transport_errors(exception, status):
    def handler(request): raise exception("unavailable")
    with TestClient(create_app(transport=httpx.MockTransport(handler)), base_url=ORIGIN) as client:
        result = client.post("/__relay/execute", headers=headers(client), json={"method":"GET","path":"/api/health"})
        assert result.status_code == status
        assert "detail" in result.json()


def test_failed_import_preserves_last_good_snapshot():
    calls = 0
    def handler(request):
        nonlocal calls
        calls += 1
        return httpx.Response(200, json=demo.app.openapi()) if calls == 1 else httpx.Response(200, text="invalid json")
    with TestClient(create_app(transport=httpx.MockTransport(handler)), base_url=ORIGIN) as client:
        good = client.post("/__relay/sources/inspect", headers=headers(client)).json()
        assert client.post("/__relay/sources/inspect", headers=headers(client)).status_code == 422
        assert client.get("/__relay/sources/current").json()["snapshot"] == good


def test_normalization_is_repeatable_and_resolves_refs():
    spec = demo.app.openapi()
    assert normalize(spec) == normalize(json.loads(json.dumps(spec)))
    endpoint = next(e for e in normalize(spec)["endpoints"] if e["method"] == "POST")
    assert "properties" in endpoint["responses"]["200"]["content"]["application/json"]["schema"]
    assert len(endpoint["fingerprint"]) == 64


def test_external_references_are_not_fetched():
    spec = {"openapi":"3.1.0","info":{"title":"Test"},"paths":{"/test":{"get":{"responses":{"200":{"content":{"application/json":{"schema":{"$ref":"https://evil.example/schema"}}}}}}}}}
    response = normalize(spec)["endpoints"][0]["responses"]["200"]
    assert "x-relay-warning" in response["content"]["application/json"]["schema"]


@pytest.mark.parametrize("spec", [{}, {"openapi":"3.2.0","info":{},"paths":{}}, {"openapi":"3.1.0","info":{},"paths":{"/test":{"get":{}}}}])
def test_invalid_specs(spec):
    with pytest.raises(SpecError): normalize(spec)


@pytest.mark.parametrize("override", [{"tags":"Auth"}, {"summary":{}}, {"requestBody":{"content":[]}}, {"responses":{"200":42}}, {"security":"bearer"}])
def test_malformed_operations_are_rejected(override):
    spec = json.loads(json.dumps(demo.app.openapi()))
    spec["paths"]["/api/auth/login"]["post"].update(override)
    with pytest.raises(SpecError): normalize(spec)


def test_arbitrary_example_fields_are_preserved():
    spec = json.loads(json.dumps(demo.app.openapi()))
    media = spec["paths"]["/api/auth/login"]["post"]["requestBody"]["content"]["application/json"]
    media["example"] = {"content":"text", "required":"an arbitrary payload field"}
    endpoint = next(e for e in normalize(spec)["endpoints"] if e["method"] == "POST")
    assert endpoint["requestBody"]["content"]["application/json"]["example"] == media["example"]
