"""Status-only realtime bridge; credentials and HTTP traffic never enter its cache."""
import asyncio
import hashlib
import ipaddress
import json
import os
from contextlib import suppress
from datetime import datetime, timezone
from urllib.parse import urlsplit

from fastapi import HTTPException

PROGRESS = {"not_started", "in_progress", "done", "needs_fixing"}


def configuration(value=None):
    values = value if value is not None else {"url": os.environ.get("RELAY_TEAM_URL"),
                       "project": os.environ.get("RELAY_TEAM_PROJECT"),
                       "token": os.environ.get("RELAY_TEAM_TOKEN")}
    if not isinstance(values, dict):
        raise ValueError("Invalid Relay team configuration.")
    if not any(values.values()):
        return None
    if not all(isinstance(values.get(key), str) and values[key].strip()
               for key in ("url", "project", "token")):
        raise ValueError("Set RELAY_TEAM_URL, RELAY_TEAM_PROJECT and RELAY_TEAM_TOKEN together.")
    values = {key: values[key].strip() for key in ("url", "project", "token")}
    try:
        parsed = urlsplit(values["url"])
        parsed.port
    except ValueError:
        raise ValueError("Relay team URL must be a valid HTTPS origin.") from None
    try:
        loopback = parsed.hostname == "localhost" or ipaddress.ip_address(parsed.hostname or "").is_loopback
    except ValueError:
        loopback = False
    if (parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username
            or parsed.password or parsed.query or parsed.fragment or parsed.path not in {"", "/"}
            or parsed.scheme == "http" and not loopback):
        raise ValueError("Relay team URL must be an HTTPS origin (HTTP is allowed only on loopback).")
    values["url"] = values["url"].rstrip("/")
    if len(values["token"]) > 512 or len(values["project"]) > 128:
        raise ValueError("Invalid Relay team configuration.")
    return values


def status_record(value):
    if not isinstance(value, dict):
        raise ValueError("Invalid team status.")
    result = {key: value.get(key) for key in (
        "endpoint_id", "fingerprint", "progress", "revision", "updated_at", "actor_id", "actor_name")}
    if (result["progress"] not in PROGRESS or type(result["revision"]) is not int
            or not 1 <= result["revision"] <= 2**53 - 1 or not isinstance(result["fingerprint"], str)
            or len(result["fingerprint"]) != 64 or any(c not in "0123456789abcdef" for c in result["fingerprint"])
            or any(not isinstance(result[key], str) or not result[key] or len(result[key]) > limit
                   for key, limit in (("endpoint_id", 2048), ("actor_id", 128), ("actor_name", 128), ("updated_at", 64)))):
        raise ValueError("Invalid team status.")
    if datetime.fromisoformat(result["updated_at"]).tzinfo is None:
        raise ValueError("Invalid team timestamp.")
    return result


class RealtimeSync:
    def __init__(self, workspace, config):
        try:
            import socketio
            import aiohttp  # noqa: F401 - fail before mounting an incomplete integration
        except ImportError:
            raise ValueError('Realtime sync requires: pip install "relay-backend[realtime]"') from None
        self.workspace, self.config = workspace, config
        self.source = hashlib.sha256(json.dumps([config["url"], config["project"]]).encode()).hexdigest()
        self.rows, self.revision = {}, 0
        self.state, self.error, self.last_synced_at = "connecting", None, None
        self.ready = False
        self.can_write = None
        self.closed = False
        self.task = None
        self.apply_lock, self.call_lock = asyncio.Lock(), asyncio.Lock()
        self.client = socketio.AsyncClient(reconnection=True, reconnection_delay_max=5,
                                          logger=False, engineio_logger=False)
        with workspace.lock, workspace.db:
            workspace.db.execute("CREATE TABLE IF NOT EXISTS team_cache (source TEXT PRIMARY KEY, payload TEXT NOT NULL)")
            cached = workspace.db.execute("SELECT payload FROM team_cache WHERE source=?", (self.source,)).fetchone()
            if cached:
                try:
                    if len(cached[0].encode()) > 16 * 1024 * 1024:
                        raise ValueError()
                    self._snapshot(json.loads(cached[0]))
                except (ValueError, TypeError, KeyError):
                    self.rows, self.revision = {}, 0
                    self.offline()
        self.client.on("connect", self.refresh)
        self.client.on("disconnect", self.disconnected)
        self.client.on("status:updated", self.event)

    def _snapshot(self, payload):
        if (not isinstance(payload, dict) or payload.get("protocol") != 1
                or type(payload.get("revision")) is not int or not self.revision <= payload["revision"] <= 2**53 - 1
                or not isinstance(payload.get("statuses"), list)):
            raise ValueError("Invalid team snapshot.")
        rows = [status_record(row) for row in payload["statuses"]]
        if len({row["endpoint_id"] for row in rows}) != len(rows) or any(row["revision"] > payload["revision"] for row in rows):
            raise ValueError("Invalid team snapshot.")
        self.rows = {row["endpoint_id"]: row for row in rows}
        self.revision = payload["revision"]

    def persist(self):
        payload = json.dumps({"protocol": 1, "revision": self.revision, "statuses": list(self.rows.values())})
        if len(payload.encode()) > 16 * 1024 * 1024:
            raise ValueError("Team snapshot exceeds the metadata limit.")
        with self.workspace.lock, self.workspace.db:
            self.workspace.db.execute("INSERT OR REPLACE INTO team_cache VALUES (?, ?)", (self.source, payload))

    def offline(self):
        self.ready = False
        self.state, self.error = "offline", "Team statuses unavailable. API testing and local notes remain usable. Retry to reconnect."

    async def disconnected(self, *args):
        self.offline()

    async def call(self, event, data=None):
        async with self.call_lock:
            return await self.client.call(event, data, timeout=5)

    async def refresh(self):
        async with self.apply_lock:
            self.ready = False
            self.state = "recovering"
            try:
                payload = await self.call("snapshot:get")
                if payload.get("ok") is not True:
                    raise ValueError()
                self._snapshot(payload)
                self.can_write = payload.get("can_write") if isinstance(payload.get("can_write"), bool) else None
                self.persist()
                self.ready = True
                self.state, self.error = "synced", None
                self.last_synced_at = datetime.now(timezone.utc).isoformat()
            except Exception:
                self.offline()

    async def event(self, payload):
        try:
            if not isinstance(payload, dict) or payload.get("protocol") != 1:
                raise ValueError()
            row = status_record(payload.get("status"))
            async with self.apply_lock:
                if row["revision"] <= self.revision:
                    return
                gap = row["revision"] != self.revision + 1
                if not gap:
                    self.rows[row["endpoint_id"]] = row
                    self.revision = row["revision"]
                    self.persist()
                    self.last_synced_at = datetime.now(timezone.utc).isoformat()
            if gap:
                await self.refresh()
        except Exception:
            self.offline()

    async def run(self):
        while not self.closed:
            try:
                await self.client.connect(self.config["url"], auth={"project": self.config["project"], "token": self.config["token"]}, wait_timeout=3)
                await self.client.wait()
            except Exception:
                self.offline()
            if not self.closed:
                await asyncio.sleep(3)

    def start(self):
        self.task = asyncio.create_task(self.run())

    async def request_sync(self):
        if self.client.connected:
            await self.refresh()

    async def update(self, endpoint_id, fingerprint, progress, expected_revision):
        if not self.ready or not self.client.connected:
            raise HTTPException(503, "Team statuses are offline. API testing and local notes remain usable.")
        if type(expected_revision) is not int or expected_revision < 0:
            raise HTTPException(422, "Refresh team statuses before changing an endpoint status.")
        try:
            result = await self.call("status:update", {"endpoint_id": endpoint_id, "fingerprint": fingerprint,
                                     "progress": progress, "expected_revision": expected_revision})
        except Exception:
            self.offline()
            raise HTTPException(503, "Status acknowledgement unavailable. Refresh before retrying; the change may have been accepted.") from None
        if not isinstance(result, dict):
            self.offline()
            raise HTTPException(502, "Invalid team acknowledgement. Refresh before retrying.")
        if result.get("ok") is not True:
            if result.get("status") == 409:
                await self.refresh()
                self.state, self.error = "conflict", "A teammate changed this endpoint. Review its latest status before retrying."
                raise HTTPException(409, self.error)
            raise HTTPException(403 if result.get("status") == 403 else 422, "Team status update rejected. Check project write permission and refresh.")
        try:
            accepted = status_record(result.get("status"))
            if (result.get("protocol") != 1 or accepted["endpoint_id"] != endpoint_id
                    or accepted["fingerprint"] != fingerprint or accepted["progress"] != progress):
                raise ValueError()
        except (ValueError, TypeError):
            self.offline()
            raise HTTPException(502, "Invalid team acknowledgement. Refresh before retrying.") from None
        await self.event(result)

    def overlay(self, value):
        for endpoint_id, endpoint in value["endpoints"].items():
            row = self.rows.get(endpoint_id)
            endpoint["team_revision"] = row["revision"] if row else 0
            if row:
                mismatch = endpoint["fingerprint"] != row["fingerprint"]
                endpoint.update(progress="needs_fixing" if mismatch and row["progress"] == "done" else row["progress"],
                                contract_changed=mismatch, updated_at=row["updated_at"],
                                updated_by={"name": row["actor_name"], "email": "", "id": row["actor_id"]})
        return value

    def info(self):
        return {"enabled": True, "mode": "realtime", "state": self.state, "error": self.error,
                "last_synced_at": self.last_synced_at, "can_write": self.can_write}

    async def close(self):
        self.closed = True
        if self.task:
            self.task.cancel()
            with suppress(asyncio.CancelledError):
                await self.task
        await self.client.shutdown()
        await self.client.disconnect()
