"""Git-trackable status metadata. No Git commits or network operations are automatic."""
import json
import os
import subprocess
import tempfile
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException

PROGRESS = {"not_started", "in_progress", "done", "needs_fixing"}


class GitStatus:
    def __init__(self, project: Path):
        self.root = Path(self._git(project, "rev-parse", "--show-toplevel")).resolve()
        self.path = self.root / ".relay" / "status.json"

    @staticmethod
    def _git(project, *args):
        result = subprocess.run(["git", "-C", str(project), *args], capture_output=True, text=True, timeout=5)
        if result.returncode:
            raise ValueError("Relay --project requires an existing Git repository.")
        return result.stdout.strip()

    def read(self):
        if not self.path.exists():
            return {}
        try:
            if self.path.stat().st_size > 2 * 1024 * 1024:
                raise ValueError("Status file is too large")
            data = json.loads(self.path.read_text(encoding="utf-8"))
            if data.get("version") != 1 or not isinstance(data.get("endpoints"), dict):
                raise ValueError("Unknown status format")
            for key, row in data["endpoints"].items():
                if not isinstance(key, str) or not isinstance(row, dict) or row.get("progress") not in PROGRESS:
                    raise ValueError("Invalid endpoint status")
                if not isinstance(row.get("fingerprint"), str) or len(row["fingerprint"]) != 64:
                    raise ValueError("Invalid contract fingerprint")
                author = row.get("updated_by")
                if not isinstance(author, dict) or not all(isinstance(author.get(k), str) for k in ("name", "email")):
                    raise ValueError("Invalid author")
                if not isinstance(row.get("updated_at"), str):
                    raise ValueError("Invalid timestamp")
            return data["endpoints"]
        except (ValueError, OSError, AttributeError, TypeError) as exc:
            raise HTTPException(409, "Cannot read .relay/status.json. Resolve Git conflicts or fix the file before changing status.") from exc

    @contextmanager
    def _lock(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        lock = self.path.with_suffix(".lock")
        try:
            fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError as exc:
            raise HTTPException(409, "Another Relay process is updating statuses. Retry shortly; remove a stale .relay/status.lock after stopping Relay.") from exc
        try:
            os.close(fd)
            yield
        finally:
            lock.unlink(missing_ok=True)

    def update(self, endpoint_id, fingerprint, progress):
        try:
            name = self._git(self.root, "config", "user.name")
            email = self._git(self.root, "config", "user.email")
            if not name or not email:
                raise ValueError("Missing identity")
        except ValueError as exc:
            raise HTTPException(409, "Configure Git user.name and user.email before changing a shared status.") from exc
        with self._lock():
            rows = self.read()
            rows[endpoint_id] = {"fingerprint": fingerprint, "progress": progress,
                "updated_by": {"name": name, "email": email}, "updated_at": datetime.now(timezone.utc).isoformat()}
            fd, temporary = tempfile.mkstemp(prefix="status-", suffix=".tmp", dir=self.path.parent)
            try:
                with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
                    json.dump({"version": 1, "endpoints": dict(sorted(rows.items()))}, stream, indent=2, ensure_ascii=False)
                    stream.write("\n")
                os.replace(temporary, self.path)
            finally:
                Path(temporary).unlink(missing_ok=True)
