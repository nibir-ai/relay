"""Test independent native Python and Node integrations against one team service."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import tomllib
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def request(base, method, path, data=None, csrf=None):
    headers = {"Content-Type": "application/json"}
    if csrf:
        headers.update(Origin=base, **{"X-Relay-CSRF": csrf})
    message = urllib.request.Request(base + path, method=method, headers=headers,
                                     data=json.dumps(data).encode() if data is not None else None)
    try:
        with urllib.request.urlopen(message, timeout=8) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


def wait(check, timeout=20):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            value = check()
            if value:
                return value
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(0.1)
    raise AssertionError("Realtime integration did not reach its expected state.")


def main(require_installed=False):
    if require_installed:
        import relay_backend
        import relay_team
        assert all("site-packages" in str(module.__file__) for module in (relay_backend, relay_team))
    node = shutil.which("node")
    assert node, "Node.js is required for the cross-runtime consumer check."
    version = tomllib.loads((ROOT / "apps/agent/pyproject.toml").read_text())["project"]["version"]
    with tempfile.TemporaryDirectory(prefix="relay-native-team-") as temporary:
        folder = Path(temporary)
        processes = []
        def start(command, environment):
            process = subprocess.Popen(command, cwd=folder, env=environment,
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            processes.append(process)
            return process
        def stop(process):
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
        def port():
            with socket.socket() as candidate:
                candidate.bind(("127.0.0.1", 0))
                return candidate.getsockname()[1]
        environment = dict(os.environ)
        for key in ("PYTHONPATH", "RELAY_TEAM_URL", "RELAY_TEAM_PROJECT", "RELAY_TEAM_TOKEN"):
            environment.pop(key, None)
        members = [{"id": identity, "name": identity.title(), "role": "writer",
                    "token_sha256": hashlib.sha256((identity + "-developer-secret").encode()).hexdigest()}
                   for identity in ("python", "node")]
        configuration = folder / "members.json"
        configuration.write_text(json.dumps({"projects": {"example": {"members": members}}}))
        ports = set()
        while len(ports) < 3:
            ports.add(port())
        team_port, python_port, node_port = sorted(ports)
        team_base, python_base, node_base = [f"http://127.0.0.1:{value}" for value in (team_port, python_port, node_port)]
        team_environment = {**environment, "RELAY_TEAM_CONFIG": str(configuration), "RELAY_TEAM_DB": str(folder / "team.sqlite3")}
        team_command = [sys.executable, "-m", "uvicorn", "relay_team.app:create_app", "--factory", "--host", "127.0.0.1", "--port", str(team_port), "--timeout-graceful-shutdown", "2"]
        python_environment = {**environment, "RELAY_TEAM_URL": team_base, "RELAY_TEAM_PROJECT": "example", "RELAY_TEAM_TOKEN": "python-developer-secret"}
        node_environment = {**python_environment, "RELAY_TEAM_TOKEN": "node-developer-secret", "RELAY_TEST_PORT": str(node_port)}
        (folder / "backend.py").write_text('''from pathlib import Path
from fastapi import FastAPI, Header, HTTPException
from relay_backend import install_relay
app = FastAPI(title="Native team consumer")
@app.get("/api/me")
def me(authorization: str | None = Header(default=None)):
    if authorization != "Bearer local-api-secret":
        raise HTTPException(401, "API authorization required")
    return {"local": True}
install_relay(app, db_path=Path("workspace.sqlite3"))
''')
        (folder / "node.cjs").write_text('''const http=require('node:http');
const fs=require('node:fs');
const {relay}=require('./node_modules/relay-backend');
const middleware=relay({openapi:JSON.parse(fs.readFileSync('schema.json','utf8')),dataDir:process.cwd()+'/node-data'});
const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/relay')) return middleware(req,res);
  res.setHeader('Content-Type','application/json');
  if(req.url==='/api/me' && req.headers.authorization==='Bearer local-api-secret') return res.end('{"local":true}');
  res.statusCode=401;res.end('{"detail":"API authorization required"}');
});
server.listen(Number(process.env.RELAY_TEST_PORT),'127.0.0.1');
process.on('SIGTERM',async()=>{await middleware.close();server.close();});
''')
        (folder / "package.json").write_text('{"name":"relay-team-consumer","private":true}')
        npm_cli = Path(subprocess.check_output([node, "-p", "require('node:path').join(require('node:path').dirname(process.execPath),'node_modules/npm/bin/npm-cli.js')"], text=True).strip())
        npm = [node, str(npm_cli)] if npm_cli.exists() else [shutil.which("npm")]
        subprocess.run([*npm, "install", "--ignore-scripts", "--no-audit", "--no-fund",
                        str(ROOT / "dist" / f"relay-backend-{version}.tgz")], cwd=folder, check=True)
        try:
            team = start(team_command, team_environment)
            wait(lambda: request(team_base, "GET", "/health")[0] == 200)
            python_command = [sys.executable, "-m", "uvicorn", "backend:app", "--host", "127.0.0.1", "--port", str(python_port), "--timeout-graceful-shutdown", "2"]
            python = start(python_command, python_environment)
            wait(lambda: request(python_base, "GET", "/relay/__relay/health")[0] == 200)
            schema = request(python_base, "GET", "/openapi.json")[1]
            (folder / "schema.json").write_text(json.dumps(schema))
            node_process = start([node, str(folder / "node.cjs")], node_environment)
            wait(lambda: request(node_base, "GET", "/relay/__relay/health")[0] == 200)
            clients = {}
            for base in (python_base, node_base):
                csrf = request(base, "GET", "/relay/__relay/health")[1]["csrf_token"]
                snapshot = request(base, "POST", "/relay/__relay/sources/inspect", {}, csrf)[1]
                endpoint = next(row for row in snapshot["endpoints"] if row["id"] == "GET /api/me")
                clients[base] = (csrf, endpoint["fingerprint"])
                wait(lambda base=base: request(base, "GET", "/relay/__relay/workspace")[1].get("status_sync", {}).get("state") == "synced")
            assert clients[python_base][1] == clients[node_base][1], "Contract fingerprints must agree across runtimes."
            def update(base, progress=None, note=None, revision=None):
                csrf, fingerprint = clients[base]
                payload = {"endpoint_id": "GET /api/me", "fingerprint": fingerprint}
                if progress is not None: payload["progress"] = progress
                if note is not None: payload["note"] = note
                if revision is not None: payload["expected_revision"] = revision
                return request(base, "POST", "/relay/__relay/endpoints/update", payload, csrf)
            def row(base):
                return request(base, "GET", "/relay/__relay/workspace")[1]["endpoints"]["GET /api/me"]
            assert update(python_base, "in_progress", "Private Python note", 0)[0] == 200
            wait(lambda: row(node_base).get("team_revision") == 1)
            assert row(node_base)["progress"] == "in_progress" and row(node_base)["updated_by"]["name"] == "Python"
            assert row(node_base)["note"] == ""
            assert update(node_base, "done", revision=0)[0] == 409
            assert update(node_base, "needs_fixing", revision=1)[0] == 200
            wait(lambda: row(python_base).get("team_revision") == 2)
            assert row(python_base)["updated_by"]["name"] == "Node"
            stop(team)
            for base in (python_base, node_base):
                wait(lambda base=base: request(base, "GET", "/relay/__relay/workspace")[1]["status_sync"]["state"] == "offline")
                assert update(base, "done", revision=2)[0] == 503
                assert update(base, note="Local note during outage")[0] == 200
                response = request(base, "POST", "/relay/__relay/execute",
                    {"method":"GET", "path":"/api/me", "headers":{"Authorization":"Bearer local-api-secret"}}, clients[base][0])
                assert response[0] == 200 and response[1]["status"] == 200
                assert json.loads(response[1]["body"]) == {"local": True}
            stop(python)
            stop(node_process)
            start(python_command, python_environment)
            start([node, str(folder / "node.cjs")], node_environment)
            wait(lambda: request(node_base, "GET", "/relay/__relay/health")[0] == 200)
            new_csrf = request(node_base, "GET", "/relay/__relay/health")[1]["csrf_token"]
            assert request(node_base, "POST", "/relay/__relay/sources/inspect", {}, new_csrf)[0] == 200
            for base in (python_base, node_base):
                wait(lambda base=base: row(base).get("team_revision") == 2)
                assert row(base)["progress"] == "needs_fixing"
            start(team_command, team_environment)
            for base in (python_base, node_base):
                wait(lambda base=base: request(base, "GET", "/relay/__relay/workspace")[1]["status_sync"]["state"] == "synced")
                assert row(base)["team_revision"] == 2
            for filename in ("team.sqlite3", "workspace.sqlite3"):
                content = (folder / filename).read_bytes()
                assert b"local-api-secret" not in content and b"developer-secret" not in content
            for filename in (folder / "node-data").glob("*.json"):
                assert "developer-secret" not in filename.read_text() and "local-api-secret" not in filename.read_text()
            assert not list(folder.glob("**/.relay/status.json")), "Realtime mode must not create Git status metadata."
            print("Native Python/Node realtime: acknowledgement, attribution, conflict, private notes, offline API testing, cached restart and reconnect passed.")
        finally:
            for process in reversed(processes):
                stop(process)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--require-installed", action="store_true")
    main(parser.parse_args().require_installed)
