"""Exercise an installed service wheel outside the repository over real HTTP."""
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request


def request(base, method, path, token=None, data=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    if data is not None:
        headers["Content-Type"] = "application/json"
    message = urllib.request.Request(base + path, method=method, headers=headers,
                                     data=json.dumps(data).encode() if data is not None else None)
    try:
        with urllib.request.urlopen(message, timeout=3) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


def main():
    with tempfile.TemporaryDirectory(prefix="relay-team-consumer-") as temporary:
        folder = Path(temporary)
        member = {"id": "developer", "name": "Example developer", "role": "writer",
                  "token_sha256": hashlib.sha256(b"consumer-test-only").hexdigest()}
        config = folder / "members.json"
        config.write_text(json.dumps({"projects": {"example": {"members": [member]}}}),
                          encoding="utf-8")
        environment = {**os.environ, "RELAY_TEAM_CONFIG": str(config),
                       "RELAY_TEAM_DB": str(folder / "statuses.sqlite3")}
        environment.pop("PYTHONPATH", None)
        subprocess.run([sys.executable, "-c",
                        "from pathlib import Path; import relay_team; "
                        "assert 'site-packages' in str(Path(relay_team.__file__))"],
                       cwd=folder, env=environment, check=True)
        endpoint = "/v1/projects/example/statuses"
        saved = None
        for run in range(2):
            with socket.socket() as available:
                available.bind(("127.0.0.1", 0))
                port = available.getsockname()[1]
            base = f"http://127.0.0.1:{port}"
            process = subprocess.Popen(
                [sys.executable, "-m", "uvicorn", "relay_team.app:create_app", "--factory",
                 "--host", "127.0.0.1", "--port", str(port)], cwd=folder, env=environment,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            try:
                deadline = time.monotonic() + 15
                while True:
                    try:
                        assert request(base, "GET", "/health") == (200, {"ok": True, "protocol": 1})
                        break
                    except (OSError, urllib.error.URLError):
                        if process.poll() is not None or time.monotonic() >= deadline:
                            raise RuntimeError("Installed team service did not become healthy.") from None
                        time.sleep(0.1)
                assert request(base, "GET", endpoint)[0] == 401
                status, snapshot = request(base, "GET", endpoint, "consumer-test-only")
                assert status == 200
                if run == 0:
                    assert snapshot == {"protocol": 1, "revision": 0, "statuses": []}
                    mutation = {"endpoint_id": "GET /api/me", "fingerprint": "a" * 64,
                                "progress": "done", "expected_revision": 0}
                    status, result = request(base, "PUT", endpoint, "consumer-test-only", mutation)
                    assert status == 200
                    saved = result["status"]
                    assert saved["actor_id"] == "developer" and saved["revision"] == 1
                    assert request(base, "PUT", endpoint, "consumer-test-only", mutation)[0] == 409
                else:
                    assert snapshot == {"protocol": 1, "revision": 1, "statuses": [saved]}
            finally:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
    print("Installed team service: native HTTP authentication, writes, conflicts and restart persistence passed.")


if __name__ == "__main__":
    main()
