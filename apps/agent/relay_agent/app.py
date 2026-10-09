import json
import secrets
import ipaddress
import posixpath
import asyncio
from html import escape
from urllib.parse import unquote
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

import httpx
from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .executor import send
from .openapi import SpecError, normalize
from .security import MAX_REQUEST, MAX_RESPONSE, Settings, safe_headers, validate_path
from .workspace import Workspace
from .git_source import GitSource


class ExecuteRequest(BaseModel):
    method: Literal["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]
    path: str = Field(max_length=8192)
    headers: dict[str, str] = Field(default_factory=dict)
    query: dict[str, str | list[str]] = Field(default_factory=dict)
    body_mode: Literal["none", "json", "text", "form"] = "none"
    body: str = ""


class EndpointUpdate(BaseModel):
    endpoint_id: str = Field(max_length=8192)
    fingerprint: str = Field(min_length=64, max_length=64)
    progress: Literal["not_started", "in_progress", "done", "needs_fixing"] | None = None
    note: str | None = Field(default=None, max_length=4000)


def create_app(settings: Settings | None = None, transport=None, static_dir: Path | None = None, db_path: str | Path = ":memory:", project: Path | None = None, native_host: FastAPI | None = None):
    settings = settings or Settings()
    token = secrets.token_urlsafe(32)

    @asynccontextmanager
    async def lifespan(app):
        workspace = Workspace(db_path, project=project)
        app.state.workspace = workspace
        app.state.git_source = GitSource(workspace.shared.root if workspace.shared else None)
        app.state.snapshot = None
        app.state.raw_spec = None
        try:
            async with httpx.AsyncClient(timeout=20, follow_redirects=False, trust_env=False, transport=transport) as client:
                app.state.client = client
                yield
        finally:
            workspace.close()

    app = FastAPI(title="Relay Local Companion", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    app.state.snapshot = None
    app.state.raw_spec = None

    @app.middleware("http")
    async def guard(request: Request, call_next):
        expected_origin = f"{request.url.scheme}://{request.url.netloc}" if native_host else settings.origin
        if native_host:
            def local(host):
                try:
                    return ipaddress.ip_address(host).is_loopback
                except ValueError:
                    return host == "localhost"
            if not request.client or not local(request.client.host) or not local(request.url.hostname or ""):
                return JSONResponse({"detail": "Relay is available only on the developer's local machine."}, 403)
        elif request.headers.get("host") != f"127.0.0.1:{settings.port}":
            return JSONResponse({"detail": f"Open Relay at {settings.origin}; this host is not allowed."}, 403)
        origin = request.headers.get("origin")
        if origin and origin != expected_origin:
            return JSONResponse({"detail": "Untrusted browser origin."}, 403)
        if request.headers.get("sec-fetch-site") not in {None, "none", "same-origin"}:
            return JSONResponse({"detail": "Cross-origin access to the local runner is forbidden."}, 403)
        if request.method not in {"GET", "HEAD"}:
            if origin != expected_origin or not secrets.compare_digest(request.headers.get("x-relay-csrf", "").encode(), token.encode()):
                return JSONResponse({"detail": "Local session expired or CSRF check failed. Reload Relay."}, 403)
            # Read the stream with a hard cap before Pydantic allocates the request body.
            body = bytearray()
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > MAX_REQUEST:
                    return JSONResponse({"detail": "Request exceeds the 1 MiB limit."}, 413)
            request._body = bytes(body)
        response = await call_next(request)
        response.headers.update({"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
                                 "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY",
                                 "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'"})
        return response

    def target_base(request: Request):
        if not native_host:
            return settings.base_url.rstrip("/")
        root = request.scope.get("root_path", "").removesuffix("/relay")
        return f"{request.url.scheme}://{request.url.netloc}{root}"

    @app.get("/__relay/health")
    def health(request: Request):
        return {"status": "ok", "mode": "local", "version": "0.0.2", "csrf_token": token,
                "base_url": target_base(request), "spec_url": target_base(request) + (native_host.openapi_url or "") if native_host else settings.target(settings.spec_path)}

    @app.post("/__relay/sources/inspect")
    async def inspect():
        try:
            if native_host:
                raw = native_host.openapi()
                if len(json.dumps(raw).encode()) > MAX_RESPONSE:
                    raise HTTPException(413, "OpenAPI document exceeds the 2 MiB limit.")
            else:
                result = await send(app.state.client, "GET", settings.target(settings.spec_path), limit=MAX_RESPONSE)
                if result["status"] != 200:
                    raise HTTPException(502, f"OpenAPI returned HTTP {result['status']}. Check the configured spec path; redirects are not followed.")
                if result["truncated"]:
                    raise HTTPException(413, "OpenAPI document exceeds the 2 MiB limit.")
                raw = json.loads(result["body"])
            snapshot = normalize(raw)
        except (ValueError, SpecError, RecursionError, TypeError, AttributeError) as exc:
            raise HTTPException(422, f"Could not import OpenAPI: {exc}. Last good import is preserved.")
        app.state.workspace.sync(snapshot)
        if native_host:
            app.state.workspace.sources = await asyncio.to_thread(app.state.git_source.collect, native_host)
        app.state.snapshot, app.state.raw_spec = snapshot, raw
        return snapshot

    @app.get("/__relay/workspace")
    def read_workspace():
        return app.state.workspace.read()

    @app.post("/__relay/endpoints/update")
    def update_endpoint(payload: EndpointUpdate):
        app.state.workspace.update(payload.endpoint_id, payload.fingerprint, payload.progress, payload.note)
        return app.state.workspace.read()

    @app.get("/__relay/sources/current")
    def current():
        return {"snapshot": app.state.snapshot, "raw_spec": app.state.raw_spec}

    @app.post("/__relay/execute")
    async def execute(payload: ExecuteRequest, request: Request):
        validate_path(payload.path)
        decoded_path = posixpath.normpath(unquote(payload.path))
        if native_host and (decoded_path == "/relay" or decoded_path.startswith("/relay/")):
            raise HTTPException(400, "Relay's own routes cannot be executed.")
        url = target_base(request) + payload.path
        root = request.scope.get("root_path", "").removesuffix("/relay") if native_host else ""
        if native_host:
            resolved_path = posixpath.normpath(unquote(httpx.URL(url).path))
            if root and not resolved_path.startswith(root + "/"):
                raise HTTPException(400, "Request path escapes the application's mount.")
            route_path = resolved_path.removeprefix(root)
            if route_path == "/relay" or route_path.startswith("/relay/"):
                raise HTTPException(400, "Relay's own routes cannot be executed.")
        headers = safe_headers(dict(payload.headers))
        content = None
        if payload.body_mode == "json":
            try:
                json.loads(payload.body)
            except (ValueError, RecursionError):
                raise HTTPException(400, "Invalid JSON body. Fix the JSON before executing.")
            content = payload.body.encode()
            headers = {k: v for k, v in headers.items() if k.lower() != "content-type"}
            headers["Content-Type"] = "application/json"
        elif payload.body_mode != "none":
            content = payload.body.encode()
            if not any(k.lower() == "content-type" for k in headers):
                headers["Content-Type"] = "application/x-www-form-urlencoded" if payload.body_mode == "form" else "text/plain"
        if native_host:
            async def bounded_host(scope, receive, send_message):
                # HTTPX's ASGI transport buffers response chunks. Cap what it
                # retains, while allowing the application to finish normally.
                retained = 0
                scope["state"] = dict(request.scope.get("state", {}))
                async def bounded_send(message):
                    nonlocal retained
                    if message["type"] == "http.response.body":
                        chunk = message.get("body", b"")[:max(0, MAX_RESPONSE + 1 - retained)]
                        retained += len(chunk)
                        message = {**message, "body": chunk}
                    await send_message(message)
                await native_host(scope, receive, bounded_send)
            native_transport = httpx.ASGITransport(app=bounded_host, root_path=root, raise_app_exceptions=False,
                                                 client=(request.client.host, request.client.port))
            # Never reuse cookies from a previous response as implicit auth.
            async with httpx.AsyncClient(transport=native_transport, follow_redirects=False, trust_env=False) as client:
                return await send(client, payload.method, url, headers=headers, query=payload.query, content=content)
        return await send(app.state.client, payload.method, url, headers=headers, query=payload.query, content=content)

    bundled = Path(__file__).resolve().parent / "static"
    static_dir = static_dir or (bundled if bundled.is_dir() else Path(__file__).resolve().parents[2] / "web" / "dist")
    if static_dir.is_dir():
        # Preserve CLI API URLs while the browser uses namespaced URLs.
        if not native_host:
            aliases = APIRouter()
            aliases.routes = list(app.router.routes)
            app.include_router(aliases, prefix="/relay", include_in_schema=False)
        @app.get("/" if native_host else "/relay", include_in_schema=False)
        @app.get("/index.html" if native_host else "/relay/", include_in_schema=False)
        def relay_ui(request: Request):
            base = request.scope.get("root_path", "") if native_host else request.scope.get("root_path", "") + "/relay"
            html = (static_dir / "index.html").read_text(encoding="utf-8")
            html = html.replace("<head>", f'<head><base href="{escape(base + "/", quote=True)}">', 1)
            return HTMLResponse(html)
        if not native_host:
            app.mount("/relay", StaticFiles(directory=static_dir, html=True), name="relay-web")
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="web")
    else:
        @app.get("/")
        def missing_ui():
            return JSONResponse({"detail": "Relay's bundled UI is missing. Reinstall the Relay package."}, 503)
    return app
