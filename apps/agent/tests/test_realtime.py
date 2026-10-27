import pytest
from relay_backend.realtime import configuration, status_record
from relay_backend import install_relay
from fastapi import FastAPI


@pytest.mark.parametrize("url", ["http://team.example", "https://user:secret@team.example", "https://team.example/?token=secret", "https://team.example/prefix", "ftp://team.example"])
def test_team_urls_reject_insecure_or_credential_bearing_origins(url):
    with pytest.raises(ValueError):
        configuration({"url":url,"project":"example","token":"private"})


def test_team_configuration_requires_all_values_and_supports_loopback(monkeypatch):
    for key in ("RELAY_TEAM_URL", "RELAY_TEAM_PROJECT", "RELAY_TEAM_TOKEN"):
        monkeypatch.delenv(key, raising=False)
    assert configuration() is None
    monkeypatch.setenv("RELAY_TEAM_URL", "http://127.0.0.1:4490/")
    with pytest.raises(ValueError, match="together"):
        configuration()
    monkeypatch.setenv("RELAY_TEAM_PROJECT", "example")
    monkeypatch.setenv("RELAY_TEAM_TOKEN", "private")
    assert configuration()["url"] == "http://127.0.0.1:4490"
    with pytest.raises(ValueError, match="both"):
        install_relay(FastAPI(), sync_status=True)


def test_team_records_do_not_retain_unrelated_payload_fields():
    row = {"endpoint_id":"GET /me","fingerprint":"a"*64,"progress":"done","revision":1,
           "updated_at":"2026-10-27T00:00:00+00:00","actor_id":"member","actor_name":"Member",
           "token":"private","response":"private"}
    saved = status_record(row)
    assert "token" not in saved and "response" not in saved
    with pytest.raises(ValueError):
        status_record({**row,"revision":True})
