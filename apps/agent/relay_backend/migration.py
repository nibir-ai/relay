"""Reviewed, create-only import of Git status metadata into a team project."""
import hashlib
import json
from fastapi import HTTPException
from .git_status import GitStatus


def plan(rows, endpoints, remote, scope):
    entries = []
    for endpoint_id, row in sorted(rows.items()):
        endpoint = endpoints.get(endpoint_id)
        reason = ("Endpoint absent from current code" if not endpoint or not endpoint.get("active")
                  else "Contract changed; review it separately" if endpoint["fingerprint"] != row["fingerprint"]
                  else "Already has a team status" if endpoint_id in remote else None)
        if len(endpoint_id) > 2048 or any(c not in "0123456789abcdef" for c in row["fingerprint"]):
            reason = "Unsupported endpoint metadata"
        entries.append({"endpoint_id": endpoint_id, "fingerprint": row["fingerprint"],
                        "progress": row["progress"], "previous_author": row["updated_by"]["name"],
                        "eligible": reason is None, "reason": reason})
    digest = hashlib.sha256(json.dumps([scope, entries, sorted((k, v["revision"]) for k, v in remote.items())],
                                       sort_keys=True).encode()).hexdigest()
    return {"plan_id": digest, "entries": entries}


async def preview(workspace, worker, project):
    if not worker or not project:
        raise HTTPException(409, "Realtime sync and a Git project are required for import.")
    await worker.refresh()
    if not worker.ready:
        raise HTTPException(503, "Reconnect team statuses before importing.")
    if worker.can_write is not True:
        raise HTTPException(403, "Project write permission is required for import.")
    return plan(GitStatus(project).read(), workspace.read()["endpoints"], worker.rows, worker.source)


async def apply(workspace, worker, project, plan_id, selected):
    current = await preview(workspace, worker, project)
    eligible = {e["endpoint_id"]: e for e in current["entries"] if e["eligible"]}
    if current["plan_id"] != plan_id:
        raise HTTPException(409, "Import preview changed. Review the latest preview before importing.")
    if not selected or len(selected) != len(set(selected)) or any(e not in eligible for e in selected):
        raise HTTPException(422, "Select eligible endpoints from the current preview.")
    imported = []
    for endpoint_id in selected:
        entry = eligible[endpoint_id]
        try:
            workspace.validate(endpoint_id, entry["fingerprint"])
            await worker.update(endpoint_id, entry["fingerprint"], entry["progress"], 0)
        except HTTPException as error:
            return {"imported": imported, "stopped": True,
                    "message": "Import stopped. Review a new preview before continuing.", "status": error.status_code}
        imported.append(endpoint_id)
    return {"imported": imported, "stopped": False, "message": "Selected Git statuses imported."}
