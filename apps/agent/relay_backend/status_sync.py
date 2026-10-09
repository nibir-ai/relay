"""Opt-in status-only Git synchronization, independent of the user's checkout."""
import json
import os
import subprocess
import threading
from datetime import datetime, timezone

from .git_status import GitStatus


class StatusSync:
    branch = "refs/heads/relay-status"

    def __init__(self, shared: GitStatus, remote="origin", interval=10):
        self.shared = shared
        self.remote = remote
        self.interval = interval
        self.state = "pending"
        self.error = None
        self.last_synced_at = None
        self.stopped = threading.Event()
        self.thread = None
        self.lock = threading.Lock()

    def _git(self, *args, input=None, check=True):
        environment = {**os.environ, "GIT_TERMINAL_PROMPT": "0", "GCM_INTERACTIVE": "Never"}
        result = subprocess.run(["git", "-C", str(self.shared.root), *args], input=input,
                                capture_output=True, encoding="utf-8", errors="replace", timeout=15,
                                env=environment, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        if check and result.returncode:
            # Git errors can contain remote URLs or embedded credentials. Keep them out of the UI.
            raise RuntimeError("Team status sync failed. Check Git remote access and retry.")
        return result

    def read_remote(self):
        refs = self._git("ls-remote", "--heads", self.remote, self.branch).stdout.strip()
        if not refs:
            return None, {}
        commit = refs.split()[0]
        self._git("fetch", "--no-tags", "--no-write-fetch-head", self.remote, self.branch)
        size = int(self._git("cat-file", "-s", f"{commit}:status.json").stdout)
        if size > 2 * 1024 * 1024:
            raise ValueError("Remote status metadata exceeds the 2 MiB limit.")
        data = json.loads(self._git("show", f"{commit}:status.json").stdout)
        return commit, GitStatus.validate(data)

    @staticmethod
    def merge(remote, local):
        result = dict(remote)
        for key, row in local.items():
            prior = result.get(key)
            # Stable tie-breaking gives both devices the same result for concurrent edits.
            def revision(value):
                return (datetime.fromisoformat(value["updated_at"]).timestamp(), json.dumps(value, sort_keys=True))
            if prior is None or revision(row) > revision(prior):
                result[key] = row
        return result

    def sync_once(self):
        with self.lock:
            self.state = "syncing"
            try:
                for _ in range(3):
                    commit, remote = self.read_remote()
                    if self.stopped.is_set():
                        return
                    with self.shared._lock():
                        local = self.shared.read()
                        merged = self.merge(remote, local)
                        if merged != local:
                            self.shared.write(merged)
                    if merged != remote:
                        blob = self._git("hash-object", "-w", "--stdin", input=json.dumps({"version": 1, "endpoints": dict(sorted(merged.items()))}, ensure_ascii=False)).stdout.strip()
                        tree = self._git("mktree", "-z", input=f"100644 blob {blob}\tstatus.json\0").stdout.strip()
                        parents = ["-p", commit] if commit else []
                        new_commit = self._git("commit-tree", tree, *parents, "-m", "Update Relay endpoint statuses").stdout.strip()
                        if self.stopped.is_set():
                            return
                        # A normal push cannot overwrite a teammate's intervening commit.
                        pushed = self._git("push", "--porcelain", self.remote, f"{new_commit}:{self.branch}", check=False)
                        if pushed.returncode:
                            continue
                    self.state = "synced"
                    self.error = None
                    self.last_synced_at = datetime.now(timezone.utc).isoformat()
                    return
                raise RuntimeError("Team status sync could not publish. Check Git write access; local changes are retained.")
            except Exception as exc:
                self.state = "error"
                self.error = str(exc) if isinstance(exc, (ValueError, RuntimeError)) else "Team status sync unavailable. Check Git access and connectivity."

    def start(self):
        def run():
            while not self.stopped.is_set():
                self.sync_once()
                self.stopped.wait(self.interval)
        self.thread = threading.Thread(target=run, name="relay-status-sync", daemon=True)
        self.thread.start()

    def close(self):
        self.stopped.set()
        if self.thread:
            self.thread.join(timeout=1)

    def info(self):
        return {"enabled": True, "state": self.state, "error": self.error, "last_synced_at": self.last_synced_at}
