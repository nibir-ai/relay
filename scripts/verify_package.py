"""Verify the wheel independently of the editable checkout."""
import subprocess
import sys
import tempfile
import zipfile
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
metadata = tomllib.loads((ROOT / "apps/agent/pyproject.toml").read_text())["project"]
wheel = ROOT / f"dist/{metadata['name'].replace('-', '_')}-{metadata['version']}-py3-none-any.whl"
with zipfile.ZipFile(wheel) as archive:
    names = archive.namelist()
    assert "relay_backend/static/index.html" in names
    assert "relay_backend/static/brand/relay-symbol.svg" in names
    assert "relay_backend/static/brand/relay-wordmark.svg" in names
    assert len([name for name in names if name.endswith(".js") and "/static/" in name]) == 1
    assert not any(name.endswith((".webp.json", ".prompt.txt")) for name in names)
    for master in (ROOT / "apps/web/public/brand").glob("*.svg"):
        assert archive.read("relay_backend/static/brand/" + master.name).decode().replace("\r\n", "\n") == master.read_text(encoding="utf-8")
    assert archive.read("relay_backend/static/relay-mark.svg").decode().replace("\r\n", "\n") == (ROOT / "apps/web/public/relay-mark.svg").read_text(encoding="utf-8")
with tempfile.TemporaryDirectory(prefix="relay-wheel-") as directory:
    subprocess.run([sys.executable, "-m", "pip", "install", "--no-deps", "--target", directory, str(wheel)], check=True)
    code = '''
import sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import relay_backend
assert Path(relay_backend.__file__).is_relative_to(Path(sys.argv[1]))
from fastapi.testclient import TestClient
from relay_backend.app import create_app
from relay_backend import install_relay
from fastapi import FastAPI
with TestClient(create_app(), base_url="http://127.0.0.1:4477") as client:
    response = client.get("/relay")
    assert response.status_code == 200 and '<div id="root">' in response.text
    import re
    assets = re.findall(r'(?:src|href)="([^"]+)"', response.text)
    for asset in assets:
        from urllib.parse import urljoin
        assert client.get(urljoin("/relay/", asset)).status_code == 200, asset
    for name in ("relay-symbol.svg", "relay-wordmark.svg", "relay-logo.svg", "relay-icon.svg"):
        response = client.get("/brand/" + name)
        assert response.status_code == 200 and "<svg" in response.text, name
    sheet = client.get("/brand/identity.html")
    assert sheet.status_code == 200 and 'href="identity.css"' in sheet.text
    assert '<style>' not in sheet.text and 'style="' not in sheet.text
    assert client.get("/brand/identity.css").status_code == 200
host = FastAPI()
@host.get("/ping", tags=["System"])
def ping():
    return {"ok": True}
install_relay(host, db_path=":memory:")
with TestClient(host, base_url="http://localhost:9876", client=("127.0.0.1",1234)) as client:
    page = client.get("/relay")
    assert page.status_code == 200 and '<base href="/relay/">' in page.text
    for asset in re.findall(r'(?:src|href)="([^"]+)"', page.text):
        assert client.get(urljoin("/relay/", asset)).status_code == 200, asset
    identity = client.get("/relay/brand/identity.html")
    assert identity.status_code == 200
    for asset in re.findall(r'(?:src|href)="([^"]+)"', identity.text):
        assert client.get(urljoin("/relay/brand/identity.html", asset)).status_code == 200, asset
    h = {"Origin":"http://localhost:9876", "X-Relay-CSRF":client.get("/relay/__relay/health").json()["csrf_token"]}
    snapshot = client.post("/relay/__relay/sources/inspect",headers=h).json()
    assert len(snapshot["endpoints"]) == 1
    endpoint = snapshot["endpoints"][0]
    result = client.post("/relay/__relay/execute",headers=h,json={"method":"GET","path":"/ping"}).json()
    import json
    assert result["status"] == 200 and json.loads(result["body"]) == {"ok":True}
    saved = client.post("/relay/__relay/endpoints/update",headers=h,json={"endpoint_id":endpoint["id"],"fingerprint":endpoint["fingerprint"],"progress":"done"})
    assert saved.json()["endpoints"][endpoint["id"]]["progress"] == "done"
    assert client.get("/__relay/health").status_code == 404
print("Installed wheel: CLI and native FastAPI UI/assets, discovery, execution, and status verified independently.")
'''
    subprocess.run([sys.executable, "-c", code, directory], cwd=directory, check=True)
