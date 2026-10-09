"""Socket-level smoke check. Run after starting python scripts/dev.py."""
import json

import httpx

ORIGIN = "http://127.0.0.1:4477"
with httpx.Client(base_url=ORIGIN, trust_env=False, timeout=25) as client:
    ui = client.get("/")
    assert ui.status_code == 200 and '<div id="root">' in ui.text
    assert client.get("/relay").status_code == 200
    health = client.get("/__relay/health").json()
    headers = {"Origin": ORIGIN, "X-Relay-CSRF": health["csrf_token"]}
    spec = client.post("/__relay/sources/inspect", headers=headers).json()
    login = next(e for e in spec["endpoints"] if e["method"] == "POST")
    for body, expected in [({"email":"alex@example.com","password":"demo123"},200), ({"email":"alex@example.com","password":"wrong"},401), ({},422)]:
        result = client.post("/__relay/execute", headers=headers, json={"method":"POST","path":login["path"],"body_mode":"json","body":json.dumps(body)}).json()
        assert result["status"] == expected, result
        print(f"Live POST {login['path']}: {expected}, {result['duration_ms']} ms")
    result = client.post("/__relay/execute", headers=headers, json={"method":"GET","path":"/api/users/1","query":{"include_email":"true"}}).json()
    assert result["status"] == 200 and json.loads(result["body"])["email"] == "alex@example.com"
    for auth, expected in [("",401),("Bearer demo-token-not-real",200)]:
        result=client.post("/__relay/execute",headers=headers,json={"method":"GET","path":"/api/auth/me","headers":{"Authorization":auth} if auth else {}}).json()
        assert result["status"]==expected
    assert client.post("/__relay/execute", headers={**headers,"Origin":"https://evil.example"},json={"method":"GET","path":"/api/health"}).status_code == 403
    print(f"Live GET, static UI, {len(spec['endpoints'])} discovered operations, and origin rejection passed.")
