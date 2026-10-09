"""Read-only source attribution for native FastAPI endpoints.

Creation is inferred from the oldest available history of the handler's
definition line. It is not ownership or verified identity.
"""
import ast
import inspect
import subprocess
from pathlib import Path

from fastapi.routing import APIRoute


def api_routes(routes, prefix=""):
    """Support flattened routes and FastAPI's newer included-router branches."""
    for route in routes:
        if isinstance(route, APIRoute):
            if route.include_in_schema:
                yield route, prefix + route.path
        else:
            router = getattr(route, "original_router", None)
            context = getattr(route, "include_context", None)
            if router is not None and context is not None and context.include_in_schema:
                yield from api_routes(router.routes, prefix + context.prefix)


class GitSource:
    def __init__(self, root: Path | None):
        self.root = root
        self.cache = {}
        self.files = {}

    def git(self, *args):
        result = subprocess.run(["git", "-C", str(self.root), "-c", "core.quotepath=false", *args],
                                capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=5)
        if result.returncode:
            raise ValueError("Git history unavailable")
        return result.stdout

    def collect(self, app):
        try:
            head = self.git("rev-parse", "HEAD").strip() if self.root else None
        except (ValueError, OSError, subprocess.TimeoutExpired):
            head = None
        sources = {}
        for route, route_path in api_routes(app.routes):
            try:
                handler = inspect.unwrap(route.endpoint)
                file = Path(inspect.getsourcefile(handler)).resolve()
                lines, start = inspect.getsourcelines(handler)
                # inspect includes route decorators; the definition itself is
                # the stable anchor for tracing this handler back through Git.
                import textwrap
                tree = ast.parse(textwrap.dedent("".join(lines)))
                node = next(n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)))
                definition = start + node.lineno - 1
                end = start + len(lines) - 1
                relative = file.relative_to(self.root).as_posix() if self.root else file.name
                key = (head, relative, start, definition, end, file.stat().st_mtime_ns)
                if key not in self.cache:
                    self.cache[key] = self.history(relative, start, definition, end, head, handler.__name__)
                source = self.cache[key]
            except (ValueError, TypeError, OSError, StopIteration, SyntaxError):
                source = {"state": "unavailable"}
            for method in route.methods:
                sources[f"{method} {route_path}"] = source
        # Bound the cache across auto-sync and edits.
        if len(self.cache) > 1024:
            self.cache.clear()
            self.files.clear()
        return sources

    def history(self, file, start, definition, end, head, name):
        source = {"file": file, "line": definition, "state": "unavailable"}
        if not head:
            if self.root:
                source["state"] = "uncommitted"
            return source
        try:
            file_key = (head, file)
            if file_key not in self.files:
                try:
                    self.files[file_key] = ast.parse(self.git("show", f"{head}:{file}"))
                except ValueError:
                    source["state"] = "uncommitted"
                    return source
            definitions = [n for n in ast.walk(self.files[file_key])
                           if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name]
            if definitions:
                node = min(definitions, key=lambda n: abs(n.lineno - definition))
                committed_start = min([node.lineno, *(d.lineno for d in node.decorator_list)])
                history = self.git("log", "--no-patch", "--format=%H%x00%an%x00%ae%x00%aI",
                                   "-L", f"{committed_start},{node.end_lineno}:{file}", head)
                entries = [line.split("\0") for line in history.splitlines() if line.count("\0") == 3]
                if entries:
                    commit, author, email, date = entries[0]
                    source.update(last_changed_by={"name": author, "email": email}, commit=commit, changed_at=date)
            output = self.git("blame", "--line-porcelain", "-L", f"{start},{end}", "--", file)
            records = []
            record = {}
            for line in output.splitlines():
                if not record:
                    sha, original, final, *_ = line.split()
                    record = {"commit": sha, "original": int(original), "final": int(final)}
                elif line.startswith("\t"):
                    records.append(record)
                    record = {}
                else:
                    name, _, value = line.partition(" ")
                    record[name] = value
            committed = [r for r in records if set(r["commit"]) != {"0"}]
            source["state"] = "uncommitted" if len(committed) != len(records) else "tracked"
            anchor = next((r for r in committed if r["final"] == definition), None)
            if anchor:
                old_file = anchor["filename"]
                if old_file.startswith('"'):
                    old_file = ast.literal_eval(old_file)
                history = self.git("log", "--no-patch", "--format=%H%x00%an%x00%ae%x00%aI",
                                   "-L", f'{anchor["original"]},{anchor["original"]}:{old_file}', anchor["commit"])
                entries = [line.split("\0") for line in history.splitlines() if line.count("\0") == 3]
                if entries:
                    commit, name, email, date = entries[-1]
                    source.update(created_by={"name": name, "email": email}, created_commit=commit, created_at=date)
        except (ValueError, KeyError, OSError, subprocess.TimeoutExpired, SyntaxError):
            # Missing/untracked files, shallow history, and failed Git commands
            # never prevent API discovery or testing.
            pass
        return source
