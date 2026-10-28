"""Read-only collaboration diagnostics with bounded, sanitized output."""
import json
import re
import time
import httpx
from .realtime import configuration


def diagnose(status_mode=None, sync_status=False):
    def check(name,state,message): return {"name":name,"state":state,"message":message}
    try:
        if status_mode not in {None,"local","git","realtime"}:
            raise ValueError("Choose --status-mode local, git or realtime.")
        if status_mode=="local" and sync_status:
            raise ValueError("Choose local mode or --sync-status; do not enable both.")
        team=configuration() if status_mode not in {"local","git"} else None
        if status_mode=="realtime" and not team:
            raise ValueError("Set RELAY_TEAM_URL, RELAY_TEAM_PROJECT and RELAY_TEAM_TOKEN together.")
        if team and sync_status:
            raise ValueError("Choose realtime or Git status sync; do not enable both.")
        if team and not re.fullmatch(r"[a-zA-Z0-9_-]{1,128}",team["project"]):
            raise ValueError("Use the project ID provisioned by the team administrator (letters, digits, _ or -).")
    except ValueError as error:
        return [check("status_mode","error",str(error))]
    mode="realtime" if team else "git" if sync_status or status_mode=="git" else "local"
    result=[check("status_mode","info",f"Doctor configuration: {mode}. Match --status-mode/--sync-status to the backend options; application source is not executed.")]
    if not team: return result
    def read(client,path,headers=None):
        deadline=time.monotonic()+5
        with client.stream("GET",team["url"]+path,headers=headers or {}) as response:
            body=bytearray()
            for chunk in response.iter_bytes():
                body.extend(chunk)
                if len(body)>16384 or time.monotonic()>deadline: raise ValueError()
            if response.status_code!=200: return response.status_code,None
            return response.status_code,json.loads(body)
    stage="team_service"
    with httpx.Client(timeout=5,trust_env=False,follow_redirects=False) as client:
        try:
            status,data=read(client,"/health")
            if status!=200 or not isinstance(data,dict) or data.get("ok") is not True or data.get("protocol")!=1:
                return result+[check("team_service","error","Not a supported team service response. Check RELAY_TEAM_URL and the shared service version; redirects are not followed.")]
            result.append(check("team_service","ok","Team service reachable (protocol 1)."))
            stage="team_access"
            status,data=read(client,"/v1/projects/"+team["project"]+"/access",{"Authorization":"Bearer "+team["token"]})
            if status in {401,403}:
                result.append(check("team_access","error","Project access rejected. Ask the administrator to verify this project's membership and developer credential; project existence is not disclosed."))
            elif status==404:
                result.append(check("team_access","info","Service lacks the read-only access diagnostic. Upgrade the shared service or inspect the local Relay connection state; access and write permission were not verified."))
            elif status==200 and isinstance(data,dict) and data.get("protocol")==1 and type(data.get("can_write")) is bool:
                result.append(check("team_access","ok" if data["can_write"] else "info","Writer access verified." if data["can_write"] else "Read-only project access verified. API testing remains available; ask the administrator for writer access if needed."))
            else:
                result.append(check("team_access","error","Access diagnostic unavailable or invalid. Check the shared service version and reverse-proxy route."))
        except httpx.RequestError:
            result.append(check(stage,"error","Team service unreachable or timed out. Check its HTTPS origin, certificate and running process; local API testing remains available."))
        except (ValueError,TypeError,RecursionError):
            result.append(check(stage,"error","Invalid or oversized team response. Check the shared service version and proxy; response content is omitted."))
    return result
