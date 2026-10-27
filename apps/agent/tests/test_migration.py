import asyncio
from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from relay_backend.migration import plan, apply


def row(progress="done", fingerprint="a"*64):
    return {"progress":progress,"fingerprint":fingerprint,"updated_by":{"name":"Old Git author","email":"private@example.test"},"updated_at":"2026-10-01T00:00:00Z","note":"Private note","token":"Private token"}


def test_preview_filters_removed_changed_and_existing_without_private_fields():
    rows={key:row() for key in ("GET /new","GET /changed","GET /removed","GET /existing")}
    endpoints={key:{"active":1,"fingerprint":"b"*64 if "changed" in key else "a"*64} for key in rows if "removed" not in key}
    result=plan(rows,endpoints,{"GET /existing":{"revision":1}},"project")
    assert [e["endpoint_id"] for e in result["entries"] if e["eligible"]]==["GET /new"]
    assert "Private" not in str(result) and "private@example.test" not in str(result)
    assert result["plan_id"]!=plan(rows,endpoints,{},"project")["plan_id"]
    assert result["plan_id"]!=plan(rows,endpoints,{},"another-project")["plan_id"]


def test_apply_rejects_stale_review_and_reports_partial_acknowledgements(monkeypatch):
    import relay_backend.migration as migration
    async def preview(*args):
        return {"plan_id":"a"*64,"entries":[{"endpoint_id":key,"fingerprint":"b"*64,"progress":"done","eligible":True} for key in ("GET /one","GET /two")]}
    monkeypatch.setattr(migration,"preview",preview)
    accepted=[]
    async def update(endpoint,*args):
        if accepted: raise HTTPException(409,"Concurrent writer")
        accepted.append(endpoint)
    workspace=SimpleNamespace(validate=lambda *args:None)
    worker=SimpleNamespace(update=update)
    with pytest.raises(HTTPException) as error: asyncio.run(apply(workspace,worker,None,"stale",["GET /one"]))
    assert error.value.status_code==409 and not accepted
    result=asyncio.run(apply(workspace,worker,None,"a"*64,["GET /one","GET /two"]))
    assert result["stopped"] and result["imported"]==["GET /one"]
