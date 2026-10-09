"""Copy this file into a Python environment with relay-backend installed.

Run: python -m uvicorn main:app --reload
Open: http://localhost:8000/relay/
Demo credentials: user-token or admin-token (not real authentication).
"""
from typing import Annotated

from fastapi import APIRouter, Body, Depends, FastAPI, HTTPException, Query, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
try:
    from relay_backend import install_relay
except ModuleNotFoundError as error:
    if error.name != "relay_backend":
        raise
    raise SystemExit("Relay is not installed. Run: pip install relay-backend") from None

bearer = HTTPBearer(auto_error=False)
router = APIRouter(prefix="/api")


def identity(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
    if credentials is None or credentials.credentials not in {"user-token", "admin-token"}:
        raise HTTPException(401, "Use user-token or admin-token for this example.")
    return credentials.credentials


class Details(BaseModel):
    label: str
    tags: list[str] = []


class Item(BaseModel):
    details: Details
    note: str | None = None


@router.get("/items/{item_id}", tags=["Items"])
def get_item(item_id: int, tag: Annotated[list[str] | None, Query()] = None):
    return {"id": item_id, "tags": tag or []}


@router.post("/items", tags=["Items"])
def preview_item(item: Item):
    return item.model_dump()


@router.post("/optional", tags=["Items"])
def optional_body(item: Annotated[Item | None, Body()] = None):
    return {"received": item.model_dump() if item else None}


@router.get("/me", tags=["Auth"])
def me(token: Annotated[str, Depends(identity)]):
    return {"role": "admin" if token == "admin-token" else "user"}


@router.get("/admin", tags=["Auth"])
def admin(token: Annotated[str, Depends(identity)]):
    if token != "admin-token":
        raise HTTPException(403, "Admin token required.")
    return {"role": "admin"}


@router.delete("/preview", tags=["Items"], status_code=204)
def empty_response():
    return Response(status_code=204)


def create_app():
    application = FastAPI(title="Relay example")
    application.include_router(router)
    install_relay(application)
    return application


app = create_app()
