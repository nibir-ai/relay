import ast
import json
import subprocess
import sys

import httpx
import pytest

from relay_backend.setup import doctor, initialize


def test_cli_help_and_version():
    from relay_backend import __version__
    help_result = subprocess.run([sys.executable,"-m","relay_backend","--help"],capture_output=True,text=True,check=True)
    assert "doctor" in help_result.stdout and "init" in help_result.stdout
    result = subprocess.run([sys.executable,"-m","relay_backend","--version"],capture_output=True,text=True,check=True)
    assert result.stdout.strip() == __version__


def test_init_preview_apply_idempotency_and_no_execution(tmp_path, capsys):
    file = tmp_path / "main.py"
    text = 'from fastapi import FastAPI\napp = FastAPI(title="Test")\nraise RuntimeError("must never execute")\n'
    file.write_bytes(text.replace("\n", "\r\n").encode())
    assert initialize(tmp_path)
    assert file.read_text() == text
    assert "Preview only" in capsys.readouterr().out
    assert initialize(tmp_path, apply=True)
    result = file.read_bytes()
    assert b"install_relay(app)\r\n" in result
    assert b"\n" not in result.replace(b"\r\n", b"")
    ast.parse(result)
    assert not initialize(tmp_path, apply=True)
    assert file.read_bytes() == result


@pytest.mark.parametrize("text", [
    'from fastapi import FastAPI\ndef factory():\n    return FastAPI()\n',
    'from fastapi import FastAPI\na = FastAPI()\nb = FastAPI()\n',
    'from fastapi import FastAPI\napp = FastAPI(); other = 1\n',
    'from fastapi import FastAPI\napp = FastAPI()\napp = None\n',
    'from fastapi import FastAPI\nFastAPI = lambda: None\napp = FastAPI()\n',
])
def test_ambiguous_init_does_not_edit(tmp_path, text):
    file = tmp_path / "main.py"; file.write_text(text)
    assert not initialize(tmp_path, apply=True)
    assert file.read_text() == text


def test_doctor_only_fetches_schema_and_health_and_omits_secrets(tmp_path, monkeypatch):
    requests = []
    spec = {"openapi":"3.1.0","info":{"title":"private-example","version":"1"},"paths":{}}
    def handler(request):
        requests.append(request)
        return httpx.Response(200, json=spec if request.url.path == "/schema" else {"status":"ok","mode":"local","csrf_token":"private-token"})
    client = httpx.Client
    monkeypatch.setattr("relay_backend.setup.httpx.Client", lambda **kwargs: client(**kwargs, transport=httpx.MockTransport(handler)))
    result = doctor(tmp_path, "http://127.0.0.1:8000", "/schema")
    assert [request.url.path for request in requests] == ["/schema", "/relay/__relay/health"]
    assert all(request.method == "GET" for request in requests)
    assert "private" not in json.dumps(result)
    assert next(row for row in result["checks"] if row["name"] == "openapi")["state"] == "ok"
    result = doctor(tmp_path, "http://user:secret@example.com:8000")
    assert "secret" not in json.dumps(result)
    assert result["checks"][-1]["state"] == "error"


def test_doctor_malformed_schema_and_unreachable(tmp_path, monkeypatch):
    client = httpx.Client
    monkeypatch.setattr("relay_backend.setup.httpx.Client", lambda **kwargs: client(**kwargs, transport=httpx.MockTransport(lambda _: httpx.Response(200,text="private-not-json"))))
    result = doctor(tmp_path, "http://127.0.0.1:8000")
    assert result["checks"][-2]["state"] == "error"
    assert "private" not in json.dumps(result)
