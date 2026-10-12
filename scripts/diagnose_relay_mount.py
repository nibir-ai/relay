"""Explain why /relay is missing from a FastAPI app.

Usage:
    python scripts/diagnose_relay_mount.py server:app
    python scripts/diagnose_relay_mount.py server:app --no-mount

Imports the app module the way uvicorn does, then reports whether
install_relay ran, whether /relay is mounted, and what blocked it.
The module is only imported; no server is started.
"""
import argparse
import ast
import importlib
import sys
from pathlib import Path

GUARD_NAMES = {"install_relay", "create_app"}


def load_app(target: str):
    module_name, sep, attr = target.partition(":")
    if not sep:
        raise SystemExit("Target must be module:attribute, for example server:app")
    sys.path.insert(0, str(Path.cwd()))
    module = importlib.import_module(module_name)
    obj = module
    for part in attr.split("."):
        obj = getattr(obj, part)
    return module, obj


def callee_name(node: ast.Call) -> str:
    func = node.func
    if isinstance(func, ast.Name):
        return func.id
    if isinstance(func, ast.Attribute):
        return func.attr
    return ""


def call_sites(tree: ast.AST):
    """Find install_relay/create_app calls with their enclosing block chain."""
    sites = []

    def visit(node, stack):
        for child in ast.iter_child_nodes(node):
            if isinstance(child, ast.Call) and callee_name(child) in GUARD_NAMES:
                sites.append((child.lineno, callee_name(child), list(stack)))
            visit(child, stack + [type(node).__name__])

    visit(tree, [])
    return sorted(sites)


def describe_context(stack) -> str:
    if any(t in {"FunctionDef", "AsyncFunctionDef"} for t in stack):
        return "inside a function, runs only when that function is called"
    if "If" in stack or "IfExp" in stack:
        return "inside an if/conditional, may be skipped"
    if "Try" in stack:
        return "inside a try block, errors are being swallowed"
    if "Module" in stack:
        return "module level, runs on import"
    return " / ".join(stack)


def relay_routes(app):
    rows = []
    for index, route in enumerate(getattr(app, "routes", [])):
        path = getattr(route, "path", None)
        name = getattr(route, "name", "") or ""
        if (path and path.startswith("/relay")) or "relay" in name.lower():
            rows.append((index, path, name, type(route).__name__))
    return rows


def report_environment():
    print("== environment ==")
    print(f"  python      {sys.executable}")
    try:
        import relay_agent
    except Exception as exc:
        print(f"  relay_agent NOT IMPORTABLE: {type(exc).__name__}: {exc}")
        return False
    location = Path(relay_agent.__file__).resolve()
    static = location.parent / "static"
    print(f"  relay_agent {location}")
    print(f"  static dir  {static} exists={static.is_dir()} "
          f"index={(static / 'index.html').is_file()}")
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", help="module:attribute, e.g. server:app")
    parser.add_argument("--no-mount", action="store_true",
                        help="do not attempt install_relay on the imported app")
    args = parser.parse_args()

    if not report_environment():
        return 1

    print("\n== source ==")
    try:
        module, app = load_app(args.target)
    except Exception:
        print("  import failed:")
        print("  " + "\n  ".join(
            line.rstrip() for line in
            __import__("traceback").format_exc().splitlines()[-6:]))
        return 1
    source_file = getattr(module, "__file__", None)
    print(f"  module      {module.__name__} from {source_file}")
    if source_file and Path(source_file).is_file():
        tree = ast.parse(Path(source_file).read_text(encoding="utf-8"))
        sites = call_sites(tree)
        if not sites:
            print("  no install_relay() call found in this file")
        for lineno, name, stack in sites:
            print(f"  line {lineno}: {name}() - {describe_context(stack)}")

    print("\n== mounted state ==")
    print(f"  app.state.relay  {'set' if getattr(app.state, 'relay', None) else 'NOT SET'}")
    rows = relay_routes(app)
    if rows:
        for index, path, name, kind in rows:
            print(f"  route[{index}] {path}  name={name!r}  {kind}")
    else:
        print("  no /relay routes on this app object")
    total = len(getattr(app, "routes", []))
    catchalls = [
        (i, getattr(r, "path", None), getattr(r, "name", ""))
        for i, r in enumerate(getattr(app, "routes", []))
        if getattr(r, "path", None) in {"/", "/{path:path}", "/{full_path:path}"}
    ]
    print(f"  total routes    {total}")
    for index, path, name in catchalls:
        verdict = "shadows /relay" if rows and index < rows[0][0] else "after /relay, harmless"
        print(f"  catch-all route[{index}] {path} name={name!r}: {verdict}")

    if getattr(app.state, "relay", None) is None and not args.no_mount:
        print("\n== retry install_relay in this process ==")
        try:
            from relay_agent import install_relay
            install_relay(app)
            print("  succeeded -> the call in your app did not execute at startup")
        except Exception as exc:
            print(f"  raised {type(exc).__name__}: {exc}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
