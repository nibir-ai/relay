"""Opt-in, same-process FastAPI integration."""
import hashlib
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from .app import create_app


def install_relay(app: FastAPI, *, enabled: bool = True, project: Path | None = None,
                  data_dir: Path | None = None, db_path: str | Path | None = None,
                  static_dir: Path | None = None, sync_status: bool = False) -> FastAPI | None:
    """Mount the bundled tester at /relay. Enable only in development.

    No target URL, subprocess, or extra port is required. The parent lifespan
    runs normally; Relay owns only its client/workspace resources.
    """
    if not enabled:
        return None
    if getattr(app.state, "relay", None) is not None:
        raise ValueError("Relay is already installed on this application.")
    for route in app.routes:
        path = getattr(route, "path", "")
        if path == "/relay" or path.startswith("/relay/"):
            raise ValueError("The /relay namespace is already in use.")
    if project is None:
        project = next((p for p in (Path.cwd(), *Path.cwd().parents)
                        if (p / ".git").exists()), None)
    if db_path is None:
        identity = f"{Path(project or Path.cwd()).resolve()}:{app.title}"
        workspace_id = hashlib.sha256(identity.encode()).hexdigest()[:16]
        db_path = Path(data_dir or Path.home() / ".relay") / workspace_id / "workspace.sqlite3"
    relay = create_app(native_host=app, static_dir=static_dir, db_path=db_path, project=project, sync_status=sync_status)
    previous = app.router.lifespan_context

    @asynccontextmanager
    async def lifespan(application):
        async with previous(application) as state:
            # Mounted apps do not receive lifespan automatically.
            async with relay.router.lifespan_context(relay):
                yield state

    app.router.lifespan_context = lifespan
    app.mount("/relay", relay, name="relay")
    # Reserve this namespace even when the host has a catch-all route.
    app.router.routes.insert(0, app.router.routes.pop())
    app.state.relay = relay
    return relay
