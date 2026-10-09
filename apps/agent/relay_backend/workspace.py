"""Local metadata only. Never store HTTP traffic or credentials here."""
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException


class Workspace:
    def __init__(self, path: str | Path = ":memory:", project: Path | None = None):
        from .git_status import GitStatus
        self.shared = GitStatus(project) if project else None
        if str(path) != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(str(path), check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.lock = threading.RLock()
        self.sources = {}
        with self.db:
            self.db.execute("""CREATE TABLE IF NOT EXISTS endpoints (
                endpoint_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL,
                progress TEXT NOT NULL DEFAULT 'done', note TEXT NOT NULL DEFAULT '',
                active INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)""")
            self.db.execute("""CREATE TABLE IF NOT EXISTS activity (
                id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint_id TEXT NOT NULL,
                kind TEXT NOT NULL, value TEXT NOT NULL, created_at TEXT NOT NULL)""")
            if self.db.execute("PRAGMA user_version").fetchone()[0] < 2:
                # Upgrade untouched discovery defaults, preserving deliberate
                # status changes. Explicit shared statuses still overlay these.
                self.db.execute("""UPDATE endpoints SET progress='done'
                    WHERE progress='not_started' AND NOT EXISTS (
                        SELECT 1 FROM activity WHERE activity.endpoint_id=endpoints.endpoint_id
                        AND activity.kind='progress_changed')""")
                self.db.execute("PRAGMA user_version = 2")

    def sync(self, snapshot: dict):
        now = datetime.now(timezone.utc).isoformat()
        with self.lock, self.db:
            previous = {row["endpoint_id"]: dict(row) for row in self.db.execute("SELECT * FROM endpoints")}
            present = {e["id"] for e in snapshot["endpoints"]}
            for endpoint in snapshot["endpoints"]:
                old = previous.get(endpoint["id"])
                if not old:
                    self.db.execute("INSERT INTO endpoints (endpoint_id, fingerprint, progress, updated_at) VALUES (?, ?, 'done', ?)", (endpoint["id"], endpoint["fingerprint"], now))
                    self._event(endpoint["id"], "discovered", "done", now)
                elif old["fingerprint"] != endpoint["fingerprint"] or not old["active"]:
                    progress = "needs_fixing" if old["progress"] == "done" else old["progress"]
                    self.db.execute("UPDATE endpoints SET fingerprint=?, progress=?, active=1, updated_at=? WHERE endpoint_id=?", (endpoint["fingerprint"], progress, now, endpoint["id"]))
                    self._event(endpoint["id"], "contract_changed", progress, now)
            for endpoint_id, old in previous.items():
                if old["active"] and endpoint_id not in present:
                    self.db.execute("UPDATE endpoints SET active=0, updated_at=? WHERE endpoint_id=?", (now, endpoint_id))
                    self._event(endpoint_id, "removed", old["progress"], now)

    def _event(self, endpoint_id, kind, value, now):
        self.db.execute("INSERT INTO activity (endpoint_id, kind, value, created_at) VALUES (?, ?, ?, ?)", (endpoint_id, kind, value, now))

    def update(self, endpoint_id: str, fingerprint: str, progress: str | None, note: str | None):
        with self.lock, self.db:
            row = self.db.execute("SELECT * FROM endpoints WHERE endpoint_id=? AND active=1", (endpoint_id,)).fetchone()
            if not row:
                raise HTTPException(404, "Endpoint is no longer active. Sync the contract and try again.")
            if row["fingerprint"] != fingerprint:
                raise HTTPException(409, "The contract changed. Sync before updating progress.")
            status = progress if progress is not None else row["progress"]
            if self.shared and progress is not None:
                shared = self.shared.read().get(endpoint_id, {})
                if shared.get("progress") != progress or shared.get("fingerprint") != fingerprint:
                    self.shared.update(endpoint_id, fingerprint, progress)
            notes = note if note is not None else row["note"]
            if status == row["progress"] and notes == row["note"]:
                return
            now = datetime.now(timezone.utc).isoformat()
            self.db.execute("UPDATE endpoints SET progress=?, note=?, updated_at=? WHERE endpoint_id=?", (status, notes, now, endpoint_id))
            if status != row["progress"]:
                self._event(endpoint_id, "progress_changed", status, now)
            if notes != row["note"]:
                self._event(endpoint_id, "note_updated", "", now)

    def read(self):
        with self.lock:
            rows = self.db.execute("SELECT endpoint_id, fingerprint, progress, note, active, updated_at FROM endpoints").fetchall()
            activity = self.db.execute("SELECT * FROM activity ORDER BY id DESC LIMIT 100").fetchall()
            endpoints = {r["endpoint_id"]: dict(r) for r in rows}
            for endpoint_id, source in self.sources.items():
                if endpoint_id in endpoints:
                    endpoints[endpoint_id]["source"] = source
            if self.shared:
                for endpoint_id, saved in self.shared.read().items():
                    if endpoint_id in endpoints:
                        current = endpoints[endpoint_id]
                        current["contract_changed"] = saved["fingerprint"] != current["fingerprint"]
                        current["progress"] = "needs_fixing" if saved["fingerprint"] != current["fingerprint"] and saved["progress"] == "done" else saved["progress"]
                        current["updated_by"] = saved["updated_by"]
                        current["updated_at"] = saved["updated_at"]
            return {"endpoints": endpoints, "activity": [dict(r) for r in activity]}

    def close(self):
        self.db.close()
