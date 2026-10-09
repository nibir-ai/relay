import json
import re
from contextlib import asynccontextmanager
from urllib.parse import urljoin

import pytest
from fastapi import APIRouter, Body, Depends, FastAPI, HTTPException, Query, Request, Response
from pydantic import BaseModel
from typing import Annotated
from fastapi.responses import RedirectResponse, StreamingResponse
from fastapi.testclient import TestClient

from relay_backend import install_relay
from relay_backend.security import MAX_REQUEST, MAX_RESPONSE

ORIGIN = "http://localhost:9321"


def test_factory_router_complex_bodies_query_arrays_and_empty_responses(tmp_path):
    class Details(BaseModel):
        name: str
        tags: list[str]
    class Item(BaseModel):
        details: Details
        note: str | None = None
    router = APIRouter(prefix="/api")
    @router.post("/items", tags=["Items"])
    def item(body: Item):
        return body.model_dump()
    @router.post("/optional")
    def optional(body: Annotated[Item | None, Body()] = None):
        return body.model_dump() if body else None
    @router.get("/items/{item_id}")
    def search(item_id: int, tag: Annotated[list[str] | None, Query()] = None):
        return {"id": item_id, "tags": tag}
    @router.delete("/items", status_code=204)
    def delete():
        return Response(status_code=204)
    def factory():
        app = FastAPI()
        app.include_router(router)
        install_relay(app, db_path=tmp_path / "complex.sqlite3")
        return app
    with TestClient(factory(), base_url=ORIGIN, client=("127.0.0.1", 4321)) as client:
        h = headers(client)
        snapshot = client.post("/relay/__relay/sources/inspect", headers=h).json()
        assert {e["id"] for e in snapshot["endpoints"]} == {"POST /api/items", "POST /api/optional", "GET /api/items/{item_id}", "DELETE /api/items"}
        def execute(method, path, **kwargs):
            result = client.post("/relay/__relay/execute", headers=h, json={"method": method, "path": path, **kwargs})
            assert result.status_code == 200, result.text
            return result.json()
        body = {"details": {"name": "nested", "tags": ["a", "b"]}, "note": None}
        assert json.loads(execute("POST", "/api/items", body_mode="json", body=json.dumps(body))["body"]) == body
        invalid = execute("POST", "/api/items", body_mode="json", body='{"details":{"tags":[]}}')
        assert invalid["status"] == 422 and json.loads(invalid["body"])["detail"][0]["loc"][-1] == "name"
        assert json.loads(execute("POST", "/api/optional")["body"]) is None
        result = execute("GET", "/api/items/3", query={"tag": ["a b", "c&d"]})
        assert json.loads(result["body"]) == {"id": 3, "tags": ["a b", "c&d"]}
        empty = execute("DELETE", "/api/items")
        assert empty["status"] == 204 and empty["body"] == "" and empty["bytes"] == 0


def test_disabled_integration_leaves_application_untouched():
    app = FastAPI()
    routes = list(app.routes)
    lifespan = app.router.lifespan_context
    assert install_relay(app, enabled=False) is None
    assert app.routes == routes
    assert app.router.lifespan_context is lifespan
    assert not hasattr(app.state, "relay")
    with TestClient(app) as client:
        assert client.get("/relay").status_code == 404


def test_app_name_is_escaped_in_browser_title_and_legacy_import_still_works(tmp_path):
    from relay_agent import install_relay as legacy_install
    assert legacy_install is install_relay
    with TestClient(host(tmp_path, title="Ludo <Portal>"), base_url=ORIGIN, client=("127.0.0.1", 4321)) as client:
        page = client.get("/relay/")
        assert "<title>Relay - Ludo &lt;Portal&gt;</title>" in page.text
        assert "relay-mark.svg?v=0.0.3" in page.text


def test_socketio_wrapper_forwards_relay_and_host_lifespan(tmp_path):
    import socketio
    events = []
    @asynccontextmanager
    async def lifespan(app):
        events.append("start")
        yield
        events.append("stop")
    app = host(tmp_path, lifespan=lifespan)
    wrapped = socketio.ASGIApp(socketio.AsyncServer(async_mode="asgi"), other_asgi_app=app)
    with TestClient(wrapped, base_url=ORIGIN, client=("127.0.0.1", 4321)) as client:
        assert events == ["start"]
        assert client.get("/relay/").status_code == 200
        result = client.post("/relay/__relay/execute", headers=headers(client), json={"method": "GET", "path": "/items/4"}).json()
        assert result["status"] == 200 and json.loads(result["body"])["id"] == 4
    assert events == ["start", "stop"]


def headers(client, prefix=""):
    health = client.get(prefix + "/relay/__relay/health")
    assert health.status_code == 200, health.text
    return {"Origin": ORIGIN, "X-Relay-CSRF": health.json()["csrf_token"]}


def host(tmp_path, **kwargs):
    app = FastAPI(**kwargs)
    @app.get("/items/{item_id}", tags=["Items"])
    async def item(item_id: int, request: Request, extra: str = ""):
        return {"id": item_id, "extra": extra, "cookie": request.headers.get("cookie"),
                "auth": request.headers.get("authorization"), "ready": getattr(app.state, "ready", False)}
    install_relay(app, db_path=tmp_path / "workspace.sqlite3")
    return app


def test_native_ui_namespace_and_contract(tmp_path):
    app = host(tmp_path, openapi_url="/schema.json")
    with TestClient(app, base_url=ORIGIN, client=("127.0.0.1", 4321)) as client:
        page = client.get("/relay")
        assert page.status_code == 200 and str(page.url) == ORIGIN + "/relay/"
        assert '<base href="/relay/">' in page.text
        for asset in re.findall(r'(?:src|href)="([^"]+)"', page.text):
            assert client.get(urljoin(str(page.url), asset)).status_code == 200, asset
        assert client.get("/relay/brand/relay-symbol.svg").status_code == 200
        assert client.get("/brand/relay-symbol.svg").status_code == 404
        assert client.get("/__relay/health").status_code == 404
        assert client.get("/docs").status_code == 200
        assert list(client.get("/schema.json").json()["paths"]) == ["/items/{item_id}"]
        snapshot = client.post("/relay/__relay/sources/inspect", headers=headers(client)).json()
        assert [e["path"] for e in snapshot["endpoints"]] == ["/items/{item_id}"]
        assert client.get("/relay/__relay/health").json()["base_url"] == ORIGIN


def test_lifespan_state_execution_and_shutdown(tmp_path):
    events = []
    @asynccontextmanager
    async def lifespan(app):
        events.append("start")
        app.state.ready = True
        yield {"from_host": "preserved"}
        events.append("stop")
    app = host(tmp_path, lifespan=lifespan)
    @app.middleware("http")
    async def middleware(request, call_next):
        response = await call_next(request)
        response.headers["X-Host"] = "present"
        return response
    @app.get("/lifespan-state")
    def lifespan_state(request: Request):
        return {"value": request.state.from_host}
    with TestClient(app, base_url=ORIGIN, client=("127.0.0.1", 4321)) as client:
        assert events == ["start"]
        result = client.post("/relay/__relay/execute", headers=headers(client), json={
            "method": "GET", "path": "/items/7", "query": {"extra": "a b"},
            "headers": {"Authorization": "Bearer explicit-token"}}).json()
        assert result["status"] == 200
        assert json.loads(result["body"]) == {"id": 7, "extra": "a b", "cookie": None,
                                             "auth": "Bearer explicit-token", "ready": True}
        assert result["headers"]["x-host"] == "present"
        state_result = client.post("/relay/__relay/execute", headers=headers(client),
                                   json={"method":"GET", "path":"/lifespan-state"}).json()
        assert state_result["status"] == 200 and json.loads(state_result["body"]) == {"value":"preserved"}
        bad = client.post("/relay/__relay/execute", headers=headers(client), json={"method":"GET", "path":"/items/nope"})
        assert bad.json()["status"] == 422
        workspace = app.state.relay.state.workspace
    assert events == ["start", "stop"]
    with pytest.raises(Exception, match="closed"):
        workspace.read()
    # A second lifespan on the same app recreates closed resources.
    with TestClient(app, base_url=ORIGIN, client=("127.0.0.1", 4321)) as client:
        assert client.get("/relay/__relay/workspace").status_code == 200


@pytest.mark.parametrize("change", [{"Origin":"https://evil.example"}, {"Host":"evil.example"},
    {"X-Relay-CSRF":"wrong"}, {"Sec-Fetch-Site":"cross-site"}])
def test_native_security(tmp_path, change):
    app = host(tmp_path)
    with TestClient(app, base_url=ORIGIN, client=("127.0.0.1", 4321)) as client:
        assert client.post("/relay/__relay/execute", headers={**headers(client), **change},
                           json={"method":"GET", "path":"/items/1"}).status_code == 403
    with TestClient(app, base_url=ORIGIN, client=("10.0.0.2", 4321)) as client:
        assert client.get("/relay/").status_code == 403
        assert client.get("/items/1").status_code == 200


@pytest.mark.parametrize("path", ["/relay/__relay/execute", "/%72elay/__relay/execute",
    "/items/../relay/__relay/execute", "//evil.example", "http://evil.example"])
def test_native_execution_cannot_recurse_or_escape(tmp_path, path):
    with TestClient(host(tmp_path), base_url=ORIGIN, client=("127.0.0.1", 4321)) as client:
        assert client.post("/relay/__relay/execute", headers=headers(client),
                           json={"method":"GET", "path":path}).status_code == 400


def test_status_persists_and_execution_does_not_change_it(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    app = host(tmp_path)
    for first in (True, False):
        with TestClient(app, base_url=ORIGIN, client=("127.0.0.1", 4321)) as client:
            h = headers(client)
            endpoint = client.post("/relay/__relay/sources/inspect", headers=h).json()["endpoints"][0]
            if first:
                assert client.post("/relay/__relay/endpoints/update", headers=h, json={
                    "endpoint_id":endpoint["id"], "fingerprint":endpoint["fingerprint"], "progress":"in_progress"}).status_code == 200
            before = client.get("/relay/__relay/workspace").json()
            assert before["endpoints"][endpoint["id"]]["progress"] == "in_progress"
            client.post("/relay/__relay/execute", headers=h, json={"method":"GET", "path":"/items/1"})
            assert client.get("/relay/__relay/workspace").json() == before


def test_native_errors_redirects_cookie_isolation_and_limits(tmp_path):
    app = host(tmp_path)
    @app.get("/crash")
    async def crash():
        raise RuntimeError("failed")
    @app.get("/redirect")
    async def redirect():
        response = RedirectResponse("https://evil.example")
        response.set_cookie("session", "private")
        return response
    @app.get("/large")
    async def large():
        async def chunks():
            for _ in range(40):
                yield b"x" * 65536
        return StreamingResponse(chunks())
    with TestClient(app, base_url=ORIGIN, client=("127.0.0.1", 4321)) as client:
        h = headers(client)
        def execute(path):
            return client.post("/relay/__relay/execute", headers=h, json={"method":"GET", "path":path}).json()
        assert execute("/crash")["status"] == 500
        assert execute("/redirect")["status"] == 307
        assert json.loads(execute("/items/1")["body"])["cookie"] is None
        large = execute("/large")
        assert large["truncated"] and large["bytes"] == MAX_RESPONSE
        assert client.post("/relay/__relay/execute", headers=h, content=b"x"*(MAX_REQUEST+1)).status_code == 413


def test_openapi_can_be_disabled_and_routes_added_after_install(tmp_path):
    app = host(tmp_path, openapi_url=None)
    @app.get("/late")
    def late():
        return {"ok": True}
    with TestClient(app, base_url=ORIGIN, client=("127.0.0.1", 4321)) as client:
        snapshot = client.post("/relay/__relay/sources/inspect", headers=headers(client)).json()
        assert {e["path"] for e in snapshot["endpoints"]} == {"/items/{item_id}", "/late"}


def test_install_conflicts_and_catchall(tmp_path):
    app = host(tmp_path)
    with pytest.raises(ValueError, match="already installed"):
        install_relay(app)
    other = FastAPI()
    @other.get("/relay/existing")
    def existing():
        return {}
    with pytest.raises(ValueError, match="namespace"):
        install_relay(other)
    catchall = FastAPI()
    @catchall.get("/{path:path}")
    def fallback(path: str):
        return {"path": path}
    install_relay(catchall, db_path=":memory:")
    with TestClient(catchall, base_url=ORIGIN, client=("127.0.0.1", 4321)) as client:
        assert client.get("/relay/").headers["content-type"].startswith("text/html")
        assert client.get("/anything").json() == {"path": "anything"}


def test_root_path_assets_and_execution(tmp_path):
    app = host(tmp_path, root_path="/service")
    with TestClient(app, base_url=ORIGIN, root_path="/service", client=("127.0.0.1", 4321)) as client:
        page = client.get("/service/relay/")
        assert page.status_code == 200 and '<base href="/service/relay/">' in page.text
        h = headers(client, "/service")
        assert client.get("/service/relay/__relay/health").json()["base_url"] == ORIGIN + "/service"
        result = client.post("/service/relay/__relay/execute", headers=h,
                            json={"method":"GET", "path":"/items/5"}).json()
        assert result["status"] == 200 and json.loads(result["body"])["id"] == 5
        assert result["url"] == ORIGIN + "/service/items/5"
        assert client.post("/service/relay/__relay/execute", headers=h,
                           json={"method":"GET", "path":"/../service/relay/__relay/execute"}).status_code == 400


def test_native_git_autodetection_and_attribution(tmp_path, monkeypatch):
    from test_git_status import repository
    repo = repository(tmp_path / "repo")
    nested = repo / "backend"
    nested.mkdir()
    monkeypatch.chdir(nested)
    app = FastAPI(title="Auto Git")
    @app.get("/ping")
    def ping():
        return {"ok": True}
    install_relay(app, data_dir=tmp_path / "local-data")
    with TestClient(app, base_url=ORIGIN, client=("127.0.0.1", 4321)) as client:
        h = headers(client)
        endpoint = client.post("/relay/__relay/sources/inspect", headers=h).json()["endpoints"][0]
        saved = client.post("/relay/__relay/endpoints/update", headers=h, json={
            "endpoint_id":endpoint["id"], "fingerprint":endpoint["fingerprint"], "progress":"done"})
        row = saved.json()["endpoints"][endpoint["id"]]
        assert row["updated_by"]["name"] == "Alex Developer"
    metadata = (repo / ".relay/status.json").read_text()
    assert "Alex Developer" in metadata and '"progress": "done"' in metadata
    assert len(list((tmp_path / "local-data").glob("*/workspace.sqlite3"))) == 1
