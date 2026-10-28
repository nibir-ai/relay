"""Bounded, non-executing project inspection and opt-in setup edits."""
import ast
import difflib
import json
import os
import subprocess
import sys
import time
import shutil
import tempfile
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

import httpx
from fastapi import HTTPException

from .openapi import normalize
from .security import MAX_RESPONSE, Settings

SKIP = {".git", ".relay", ".venv", "venv", "node_modules", "dist", "build", "__pycache__"}


def sources(project: Path):
    project = project.resolve(strict=True)
    if not project.is_dir():
        raise ValueError("Project must be a directory.")
    count = 0
    for root, dirs, files in os.walk(project, followlinks=False):
        dirs[:] = sorted(d for d in dirs if d not in SKIP and not d.startswith(".")
                         and not (Path(root) / d).is_symlink() and len(Path(root).relative_to(project).parts) < 5)
        for name in sorted(files):
            file = Path(root) / name
            if file.suffix != ".py" or file.is_symlink() or file.stat().st_size > 512 * 1024:
                continue
            count += 1
            if count > 500:
                raise ValueError("Too many source files. Select a smaller backend project directory.")
            yield file, file.read_text(encoding="utf-8-sig")


def initialize(project: Path, apply=False):
    candidates = []
    detected = False
    all_calls = 0
    for file, text in sources(project):
        try:
            tree = ast.parse(text)
        except SyntaxError:
            continue
        constructors = {alias.asname or alias.name for node in tree.body if isinstance(node, ast.ImportFrom)
                        and node.module == "fastapi" for alias in node.names if alias.name == "FastAPI"}
        if not constructors:
            continue
        detected = True
        calls = [node for node in ast.walk(tree) if isinstance(node, ast.Call)
                 and isinstance(node.func, ast.Name) and node.func.id in constructors]
        all_calls += len(calls)
        for node in tree.body:
            if (isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name)
                    and isinstance(node.value, ast.Call) and node.value in calls and len(calls) == 1):
                candidates.append((file, text, tree, node, node.targets[0].id))
    print("Framework: " + ("FastAPI" if detected else "not detected"))
    print("Install in your backend environment if needed: python -m pip install relay-backend")
    if len(candidates) != 1 or all_calls != 1:
        print("No source changes: choose your application entry file; factories/multiple apps need manual setup.")
        print("After creating the app, before Socket.IO wrapping:\nfrom relay_backend import install_relay\ninstall_relay(app)")
        print("Restart the backend normally, then open /relay on its existing port.")
        return False
    file, text, tree, node, name = candidates[0]
    if any(isinstance(n, ast.Name) and isinstance(n.ctx, ast.Store) and
           (n.id in constructors or (n.id == name and n is not node.targets[0])) for n in ast.walk(tree)):
        print("Application/constructor names are reassigned. Follow manual setup; no source changes.")
        return False
    if any(isinstance(n, ast.ImportFrom) and n.module in {"relay_backend", "relay_agent"} for n in ast.walk(tree)):
        print("Relay import already present. Review the existing mount; no source changes.")
        return False
    if any(isinstance(n, ast.Name) and n.id == "install_relay" for n in ast.walk(tree)):
        print("The name install_relay is already used. Follow the manual setup guide; no source changes.")
        return False
    # Refuse multi-statement lines and assignments inside expressions.
    lines = text.splitlines(keepends=True)
    if ";" in lines[node.end_lineno - 1] or node.col_offset != 0:
        print("Entry file needs manual integration; no source changes.")
        return False
    newline = "\r\n" if "\r\n" in file.read_bytes().decode("utf-8-sig") else "\n"
    boundary = node.end_lineno
    if not lines[boundary - 1].endswith("\n"):
        lines[boundary - 1] += newline
    lines.insert(boundary, f"from relay_backend import install_relay{newline}install_relay({name}){newline}")
    edited = "".join(lines)
    if newline == "\r\n":
        edited = edited.replace("\r\n", "\n").replace("\n", "\r\n")
    ast.parse(edited)
    label = str(file.relative_to(project.resolve()))
    print("Entry: " + label)
    print("".join(difflib.unified_diff(text.splitlines(True), edited.splitlines(True), fromfile=label, tofile=label)), end="")
    if apply:
        original = file.read_bytes()
        if original.decode("utf-8-sig").replace("\r\n", "\n") != text:
            raise ValueError("Entry file changed during setup. Preview again before applying.")
        # Preserve BOM and permissions. Only the explicitly selected source is written.
        descriptor, temporary_name = tempfile.mkstemp(dir=file.parent, prefix=f".{file.name}.relay-")
        temporary = Path(temporary_name)
        try:
            with os.fdopen(descriptor, "wb") as handle:
                handle.write((b"\xef\xbb\xbf" if original.startswith(b"\xef\xbb\xbf") else b"") + edited.encode("utf-8"))
            shutil.copymode(file, temporary)
            os.replace(temporary, file)
        finally:
            temporary.unlink(missing_ok=True)
        print("Applied integration.")
    else:
        print("Preview only. Run relay init --project <directory> --apply to write this change.")
    print("Restart the backend with its usual command, then open /relay on its existing port.")
    return True


def git_checks(project: Path):
    def run(*args):
        return subprocess.run(["git", "-C", str(project), *args], capture_output=True, timeout=5,
                              creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    try:
        if run("rev-parse", "--is-inside-work-tree").returncode:
            return {"name": "git", "state": "info", "message": "No Git repository. Local testing still works."}
        remote = run("config", "--get", "remote.origin.url")
        return {"name": "git", "state": "info", "message": "Origin configured; remote access is not tested. Enable sync_status explicitly for automatic sharing."
                if remote.returncode == 0 else "No origin remote. Configure one before enabling automatic status sharing."}
    except (OSError, subprocess.TimeoutExpired):
        return {"name": "git", "state": "info", "message": "Git unavailable or timed out. Install Git for optional status sharing."}


def doctor(project: Path, target: str | None = None, spec_path="/openapi.json", status_mode=None, sync_status=False):
    from . import __version__
    checks = [{"name": "runtime", "state": "ok", "message": f"Python {sys.version.split()[0]}; Relay {__version__}"}]
    if not project.is_dir():
        checks.append({"name": "project", "state": "error", "message": "Select an existing backend directory with --project."})
        return {"checks": checks}
    try:
        installed = version("relay-backend")
        checks.append({"name": "package", "state": "ok", "message": f"relay-backend {installed} installed in this interpreter."})
    except PackageNotFoundError:
        checks.append({"name": "package", "state": "error", "message": "Run python -m pip install relay-backend in the backend interpreter."})
    from .team_doctor import diagnose
    checks.extend(diagnose(status_mode, sync_status))
    checks.append(git_checks(project.resolve()))
    if target is None:
        checks.append({"name": "backend", "state": "info", "message": "Supply --target with a loopback IP origin and port to check OpenAPI and the native /relay mount."})
        return {"checks": checks}
    try:
        settings = Settings(target, spec_path)
    except (ValueError, HTTPException):
        # Never echo invalid input, exception details or URLs: they may contain credentials.
        checks.append({"name": "target", "state": "error", "message": "Use a loopback IP origin with a port and a relative spec path, e.g. http://127.0.0.1:8000."})
        return {"checks": checks}
    with httpx.Client(timeout=5, trust_env=False, follow_redirects=False) as client:
        for name, path in (("openapi", spec_path), ("mount", "/relay/__relay/health")):
            try:
                deadline = time.monotonic() + 5
                with client.stream("GET", settings.target(path)) as response:
                    body = bytearray()
                    for chunk in response.iter_bytes():
                        if time.monotonic() > deadline:
                            raise httpx.ReadTimeout("Diagnostic deadline exceeded")
                        body.extend(chunk)
                        if len(body) > MAX_RESPONSE:
                            raise ValueError("oversize")
                    if response.status_code != 200:
                        optional = name == "mount" and response.status_code == 404
                        checks.append({"name": name, "state": "info" if optional else "error", "message": f"HTTP {response.status_code}. " + ("Check --spec-path; redirects are not followed." if name == "openapi" else "Native mount not found; standalone testers do not require it. For native integration, verify install_relay(app), restart and check any proxy prefix.")})
                        continue
                    data = json.loads(body)
                    if name == "openapi":
                        count = len(normalize(data)["endpoints"])
                        message = f"Valid OpenAPI; {count} endpoints."
                    else:
                        if not isinstance(data, dict) or data.get("mode") != "local" or data.get("status") != "ok":
                            raise ValueError("not Relay")
                        message = "Native /relay mount responds. Standalone testers do not require this mount."
                    checks.append({"name": name, "state": "ok", "message": message})
            except httpx.RequestError:
                checks.append({"name": name, "state": "error", "message": "Backend unreachable or timed out. Start it, check its port and retry."})
            except (ValueError, TypeError, KeyError, RecursionError, AttributeError, HTTPException):
                checks.append({"name": name, "state": "error", "message": "Invalid or oversized JSON. Check the schema generator." if name == "openapi" else "Not a Relay health response. Check the mount and any proxy prefix."})
    return {"checks": checks}
