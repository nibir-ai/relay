"""Consumer startup guidance must work even when Relay is absent."""
import ast
import subprocess
import sys
from pathlib import Path


def guard_source():
    source = Path(__file__).resolve().parents[3] / "examples" / "fastapi" / "main.py"
    tree = ast.parse(source.read_text(encoding="utf-8"))
    return ast.unparse(next(node for node in tree.body if isinstance(node, ast.Try)))


def test_uninstalled_backend_gets_actionable_install_command():
    result = subprocess.run([sys.executable, "-I", "-S", "-c", guard_source()], capture_output=True, text=True)
    assert result.returncode == 1
    assert result.stderr.strip() == "Relay is not installed. Run: pip install relay-backend"
    assert "Traceback" not in result.stderr


def test_missing_transitive_dependency_is_not_misreported():
    hook = '''
import builtins
original = builtins.__import__
def missing(name, *args, **kwargs):
    if name == "relay_backend":
        raise ModuleNotFoundError("No module named 'fastapi'", name="fastapi")
    return original(name, *args, **kwargs)
builtins.__import__ = missing
'''
    result = subprocess.run([sys.executable, "-I", "-S", "-c", hook + guard_source()], capture_output=True, text=True)
    assert result.returncode == 1
    assert "No module named 'fastapi'" in result.stderr
    assert "Relay is not installed" not in result.stderr
