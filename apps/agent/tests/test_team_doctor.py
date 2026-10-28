import json
import httpx
import pytest
from relay_backend.team_doctor import diagnose


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setenv("RELAY_TEAM_URL","http://127.0.0.1:4490")
    monkeypatch.setenv("RELAY_TEAM_PROJECT","example")
    monkeypatch.setenv("RELAY_TEAM_TOKEN","private-token")
    return monkeypatch


@pytest.mark.parametrize("status,payload,state,text",[
    (200,{"protocol":1,"can_write":True},"ok","Writer access verified"),
    (200,{"protocol":1,"can_write":False},"info","Read-only"),
    (401,{"detail":"private-token membership"},"error","Project access rejected"),
    (403,{"detail":"private-token"},"error","Project access rejected"),
    (404,{"detail":"Not Found"},"info","were not verified"),
    (200,{"protocol":1,"can_write":"private-token"},"error","invalid"),
    (302,{},"error","unavailable"),
])
def test_readonly_access_checks_are_bounded_and_sanitized(configured,status,payload,state,text):
    requests=[]
    def handler(request):
        requests.append(request)
        return httpx.Response(200,json={"ok":True,"protocol":1,"secret":"private-token"}) if request.url.path=="/health" else httpx.Response(status,json=payload)
    client=httpx.Client
    configured.setattr("relay_backend.team_doctor.httpx.Client",lambda **kwargs:client(**kwargs,transport=httpx.MockTransport(handler)))
    checks=diagnose()
    assert checks[-1]["state"]==state and text in checks[-1]["message"]
    assert "private" not in json.dumps(checks)
    assert [r.url.path for r in requests]==["/health","/v1/projects/example/access"]
    assert all(r.method=="GET" for r in requests)
    assert "authorization" not in requests[0].headers
    assert requests[1].headers["authorization"]=="Bearer private-token"


def test_configuration_and_competing_authorities_do_not_make_requests(configured):
    configured.setattr("relay_backend.team_doctor.httpx.Client",lambda **kwargs:pytest.fail("No network expected"))
    assert diagnose(sync_status=True)[-1]["state"]=="error"
    assert diagnose("local",True)[-1]["state"]=="error"
    assert "git" in diagnose("git")[0]["message"]
    configured.delenv("RELAY_TEAM_TOKEN")
    assert "together" in diagnose()[-1]["message"]
    configured.setenv("RELAY_TEAM_TOKEN","private-token")
    configured.setenv("RELAY_TEAM_PROJECT","../private-token")
    assert diagnose()[-1]["state"]=="error"
    assert "private" not in json.dumps(diagnose())


@pytest.mark.parametrize("kind",["timeout","oversize","redirect","malformed"])
def test_unavailable_or_invalid_service_never_leaks_response(configured,kind):
    def handler(request):
        if kind=="timeout":raise httpx.ConnectTimeout("private-token",request=request)
        if kind=="oversize":return httpx.Response(200,content=b"private-token"*2000)
        if kind=="redirect":return httpx.Response(302,headers={"Location":"https://private-token.example"})
        return httpx.Response(200,text="private-token")
    client=httpx.Client
    configured.setattr("relay_backend.team_doctor.httpx.Client",lambda **kwargs:client(**kwargs,transport=httpx.MockTransport(handler)))
    checks=diagnose()
    assert checks[-1]["state"]=="error" and "private" not in json.dumps(checks)
