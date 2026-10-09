"""Copied into a fresh customer environment by verify_clean_install.py."""
import asyncio
import json
import re
import sys
from pathlib import Path
from urllib.parse import urljoin
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from main import app
from relay_backend import __version__, install_relay
import relay_backend

assert __version__ == sys.argv[1]
assert "site-packages" in str(Path(relay_backend.__file__))


async def verify(client):
    page = await client.get("/relay/")
    assert page.status_code == 200 and "<title>Relay - Relay example</title>" in page.text
    for asset in re.findall(r'(?:src|href)="([^"]+)"', page.text):
        assert (await client.get(urljoin("/relay/", asset))).status_code == 200, asset
    health = (await client.get("/relay/__relay/health")).json()
    assert health["version"] == __version__
    headers = {"Origin": "http://localhost:8000", "X-Relay-CSRF": health["csrf_token"]}
    snapshot = (await client.post("/relay/__relay/sources/inspect", headers=headers)).json()
    assert len(snapshot["endpoints"]) == 6
    assert all(endpoint["path"].startswith("/api/") for endpoint in snapshot["endpoints"])
    async def execute(method, path, **values):
        result = await client.post("/relay/__relay/execute", headers=headers, json={"method": method, "path": path, **values})
        assert result.status_code == 200, result.text
        return result.json()
    result = await execute("GET", "/api/items/7", query={"tag": ["a b", "c&d"]})
    assert json.loads(result["body"]) == {"id": 7, "tags": ["a b", "c&d"]}
    assert (await execute("GET", "/api/me"))["status"] == 401
    for token, role in [("user-token", "user"), ("admin-token", "admin")]:
        result = await execute("GET", "/api/me", headers={"Authorization": f"Bearer {token}"})
        assert result["status"] == 200 and json.loads(result["body"])["role"] == role
    assert (await execute("GET", "/api/admin", headers={"Authorization": "Bearer user-token"}))["status"] == 403
    assert (await execute("GET", "/api/admin", headers={"Authorization": "Bearer admin-token"}))["status"] == 200
    body = {"details": {"label": "Nested example", "tags": ["one", "two"]}, "note": None}
    result = await execute("POST", "/api/items", body_mode="json", body=json.dumps(body))
    assert result["status"] == 200 and json.loads(result["body"]) == body
    invalid = await execute("POST", "/api/items", body_mode="json", body='{"details":{}}')
    assert invalid["status"] == 422 and json.loads(invalid["body"])["detail"]
    result = await execute("POST", "/api/optional")
    assert result["status"] == 200 and json.loads(result["body"]) == {"received": None}
    empty = await execute("DELETE", "/api/preview")
    assert empty["status"] == 204 and empty["body"] == "" and empty["bytes"] == 0
    workspace = (await client.get("/relay/__relay/workspace")).json()
    assert all(row["progress"] == "done" for row in workspace["endpoints"].values())


async def main():
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://localhost:8000") as client:
            await verify(client)
    disabled = FastAPI()
    install_relay(disabled, enabled=False)
    async with AsyncClient(transport=ASGITransport(app=disabled), base_url="http://localhost:8000") as client:
        assert (await client.get("/relay/")).status_code == 404


asyncio.run(main())
print("Fresh install verified: assets, factory/router discovery, user/admin auth, nested/optional bodies, arrays, validation, empty responses and disabled mode.")
