"""Authenticated, revisioned status storage with SQLite durability."""
import hashlib
import asyncio
import hmac
import json
import os
import re
import sqlite3
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
import socketio


class Member(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=128)
    token_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    role: Literal["reader", "writer"]


class Project(BaseModel):
    model_config = ConfigDict(extra="forbid")
    members: list[Member] = Field(min_length=1)


class Configuration(BaseModel):
    model_config = ConfigDict(extra="forbid")
    projects: dict[str, Project]


class Update(BaseModel):
    model_config = ConfigDict(extra="forbid")
    endpoint_id: str = Field(min_length=1, max_length=2048)
    fingerprint: str = Field(pattern=r"^[a-f0-9]{64}$")
    progress: Literal["not_started", "in_progress", "done", "needs_fixing"]
    expected_revision: int = Field(ge=0, strict=True)


@contextmanager
def connect(database: Path):
    connection = sqlite3.connect(database, timeout=10)
    connection.row_factory = sqlite3.Row
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def record(row):
    return {key: row[key] for key in (
        "endpoint_id", "fingerprint", "progress", "revision", "updated_at",
        "actor_id", "actor_name",
    )}


def create_app(*, config: dict | None = None, db_path: str | Path | None = None):
    """Load trusted administrator configuration; never derive identity from Git."""
    if config is None:
        config_file = os.environ.get("RELAY_TEAM_CONFIG")
        if not config_file:
            raise ValueError("Set RELAY_TEAM_CONFIG to the team membership JSON file.")
        config = json.loads(Path(config_file).read_text(encoding="utf-8"))
    settings = Configuration.model_validate(config)
    if not settings.projects:
        raise ValueError("Configure at least one team project.")
    for project_id, project in settings.projects.items():
        if not re.fullmatch(r"[a-zA-Z0-9_-]{1,128}", project_id):
            raise ValueError("Project IDs must contain only letters, digits, _ or -.")
        if len({m.id for m in project.members}) != len(project.members):
            raise ValueError("Member IDs must be unique within a project.")
        if len({m.token_sha256 for m in project.members}) != len(project.members):
            raise ValueError("Member credentials must be unique within a project.")
    database = Path(db_path or os.environ.get("RELAY_TEAM_DB", "team-status.sqlite3"))
    database.parent.mkdir(parents=True, exist_ok=True)
    with connect(database) as connection:
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS project_revisions (
                project TEXT PRIMARY KEY, revision INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS statuses (
                project TEXT NOT NULL, endpoint_id TEXT NOT NULL,
                fingerprint TEXT NOT NULL, progress TEXT NOT NULL,
                revision INTEGER NOT NULL, updated_at TEXT NOT NULL,
                actor_id TEXT NOT NULL, actor_name TEXT NOT NULL,
                PRIMARY KEY (project, endpoint_id)
            );
        """)
    events = socketio.AsyncServer(async_mode="asgi", max_http_buffer_size=16384,
                                 logger=False, engineio_logger=False)
    write_lock = asyncio.Lock()

    @asynccontextmanager
    async def lifespan(application):
        yield
        await events.shutdown()

    app = FastAPI(title="Relay team status service", docs_url=None, redoc_url=None,
                  openapi_url=None, lifespan=lifespan)

    @app.middleware("http")
    async def private_response(request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    def authenticate(project, token):
        # Unknown projects and non-members have the same response. Do not disclose
        # project existence or accept API-testing credentials as developer identity.
        candidate = settings.projects.get(project) if isinstance(project, str) else None
        if isinstance(token, str) and token and len(token) <= 512 and candidate:
            digest = hashlib.sha256(token.encode()).hexdigest()
            for member in candidate.members:
                if hmac.compare_digest(member.token_sha256, digest):
                    return member
        raise HTTPException(401, "Developer authentication required.",
                            headers={"WWW-Authenticate": "Bearer"})

    def membership(project: str, authorization: Annotated[str | None, Header()] = None):
        prefix, _, token = (authorization or "").partition(" ")
        return authenticate(project, token if prefix.lower() == "bearer" else None)

    @app.get("/health")
    def health():
        return {"ok": True, "protocol": 1}

    def read_snapshot(project):
        # Both reads share a transaction, so the cursor and rows represent the
        # same point in time even when another developer writes concurrently.
        with connect(database) as connection:
            connection.execute("BEGIN")
            revision = connection.execute(
                "SELECT revision FROM project_revisions WHERE project=?", (project,)
            ).fetchone()
            rows = connection.execute(
                "SELECT * FROM statuses WHERE project=? ORDER BY endpoint_id", (project,)
            ).fetchall()
        return {"protocol": 1, "revision": revision[0] if revision else 0,
                "statuses": [record(row) for row in rows]}

    def save_status(project, mutation, member):
        if member.role != "writer":
            raise HTTPException(403, "Project write permission required.")
        with connect(database) as connection:
            connection.execute("BEGIN IMMEDIATE")
            current = connection.execute(
                "SELECT * FROM statuses WHERE project=? AND endpoint_id=?",
                (project, mutation.endpoint_id),
            ).fetchone()
            revision = current["revision"] if current else 0
            if mutation.expected_revision != revision:
                raise HTTPException(409, {"code": "revision_conflict",
                                          "current": record(current) if current else None})
            connection.execute("""INSERT INTO project_revisions VALUES (?, 1)
                ON CONFLICT(project) DO UPDATE SET revision=revision+1""", (project,))
            revision = connection.execute(
                "SELECT revision FROM project_revisions WHERE project=?", (project,)
            ).fetchone()[0]
            updated_at = datetime.now(timezone.utc).isoformat()
            connection.execute("""INSERT INTO statuses VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(project, endpoint_id) DO UPDATE SET
                fingerprint=excluded.fingerprint, progress=excluded.progress,
                revision=excluded.revision, updated_at=excluded.updated_at,
                actor_id=excluded.actor_id, actor_name=excluded.actor_name""",
                (project, mutation.endpoint_id, mutation.fingerprint, mutation.progress,
                 revision, updated_at, member.id, member.name))
        return {"protocol": 1, "status": {
            "endpoint_id": mutation.endpoint_id, "fingerprint": mutation.fingerprint,
            "progress": mutation.progress, "revision": revision, "updated_at": updated_at,
            "actor_id": member.id, "actor_name": member.name,
        }}

    async def save_and_broadcast(project, mutation, member):
        # Commit before notification. Serialize HTTP and socket writes through
        # delivery so subscribers observe accepted revisions in order.
        async with write_lock:
            result = await run_in_threadpool(save_status, project, mutation, member)
            await events.emit("status:updated", result, room="project:" + project)
            return result

    @app.get("/v1/projects/{project}/statuses")
    def snapshot(project: str, member: Annotated[Member, Depends(membership)]):
        return read_snapshot(project)

    @app.put("/v1/projects/{project}/statuses")
    async def update(project: str, mutation: Update,
                     member: Annotated[Member, Depends(membership)]):
        return await save_and_broadcast(project, mutation, member)

    @events.on("connect")
    async def socket_connect(sid, environ, auth):
        if not isinstance(auth, dict):
            return False
        try:
            member = authenticate(auth.get("project"), auth.get("token"))
        except HTTPException:
            return False
        project = auth["project"]
        await events.save_session(sid, {"project": project, "member": member})
        await events.enter_room(sid, "project:" + project)

    @events.on("snapshot:get")
    async def socket_snapshot(sid):
        session = await events.get_session(sid)
        result = await run_in_threadpool(read_snapshot, session["project"])
        return {"ok": True, **result}

    @events.on("status:update")
    async def socket_update(sid, data=None):
        session = await events.get_session(sid)
        try:
            mutation = Update.model_validate(data)
            result = await save_and_broadcast(session["project"], mutation, session["member"])
            return {"ok": True, **result}
        except ValidationError:
            return {"ok": False, "status": 422, "code": "invalid_status"}
        except HTTPException as error:
            if error.status_code == 409:
                return {"ok": False, "status": 409, **error.detail}
            return {"ok": False, "status": error.status_code, "code": "write_forbidden"}

    return socketio.ASGIApp(events, app)
