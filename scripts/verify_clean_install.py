"""Exercise the published-style wheel from a clean environment outside the checkout."""
import argparse
import subprocess
import tempfile
import tomllib
import venv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--minimum-dependencies", action="store_true", help="Verify the declared minimum runtime versions.")
args = parser.parse_args()
project = tomllib.loads((ROOT / "apps/agent/pyproject.toml").read_text())["project"]
wheel = ROOT / "dist" / f"{project['name'].replace('-', '_')}-{project['version']}-py3-none-any.whl"
with tempfile.TemporaryDirectory(prefix="relay-customer-") as directory:
    root = Path(directory)
    venv.EnvBuilder(with_pip=True).create(root / "env")
    python = root / "env" / ("Scripts/python.exe" if __import__('os').name == 'nt' else "bin/python")
    dependencies = ["fastapi==0.115.0", "uvicorn==0.30.0", "httpx==0.28.0"] if args.minimum_dependencies else []
    subprocess.run([str(python), "-m", "pip", "install", str(wheel), *dependencies], cwd=root, check=True)
    sample = root / "verify.py"
    sample.write_text('''
import asyncio
import json
import re
from pathlib import Path
from urllib.parse import urljoin
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport
from relay_agent import install_relay, __version__
assert __version__ == "0.0.1"
import relay_agent
assert "site-packages" in str(Path(relay_agent.__file__))
app = FastAPI()
@app.get("/health", tags=["System"])
def health(): return {"status": "ok"}
install_relay(app)
async def verify(client):
    page = await client.get("/relay/")
    assert page.status_code == 200
    for asset in re.findall(r'(?:src|href)="([^"]+)"', page.text):
        if asset.endswith((".js", ".css")):
            assert (await client.get(urljoin("/relay/", asset))).status_code == 200, asset
    csrf = (await client.get("/relay/__relay/health")).json()["csrf_token"]
    headers = {"Origin": "http://localhost:8000", "X-Relay-CSRF": csrf}
    snapshot = (await client.post("/relay/__relay/sources/inspect", headers=headers)).json()
    assert snapshot["endpoints"][0]["path"] == "/health"
    response = (await client.post("/relay/__relay/execute", headers=headers, json={"method":"GET", "path":"/health"})).json()
    assert response["status"] == 200 and json.loads(response["body"]) == {"status":"ok"}
async def main():
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://localhost:8000") as client:
            await verify(client)
    disabled = FastAPI()
    install_relay(disabled, enabled=False)
    async with AsyncClient(transport=ASGITransport(app=disabled), base_url="http://localhost:8000") as client:
        assert (await client.get("/relay/")).status_code == 404
asyncio.run(main())
print("Fresh customer install: bundled assets, two-line integration, API execution and disabled mode verified.")
''', encoding="utf-8")
    subprocess.run([str(python), str(sample)], cwd=root, check=True)
