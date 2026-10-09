"""Build the UI and self-contained Python source/wheel distributions. No publication occurs."""
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
node = shutil.which("node")
npm_cli = Path(node).parent / "node_modules/npm/bin/npm-cli.js" if node else Path("")
command = [node, str(npm_cli)] if npm_cli.is_file() else [shutil.which("npm.cmd") or shutil.which("npm") or "npm"]
subprocess.run([*command, "--prefix", str(ROOT / "apps/web"), "run", "build"], check=True, cwd=ROOT)
destination = ROOT / "apps/agent/relay_agent/static"
if destination.exists():
    if destination.resolve() != (ROOT / "apps/agent/relay_agent/static").absolute() or not destination.resolve().is_relative_to(ROOT):
        raise RuntimeError("Refusing to replace an unexpected static directory")
    shutil.rmtree(destination)
shutil.copytree(ROOT / "apps/web/dist", destination, dirs_exist_ok=True)
build_directory = ROOT / "apps/agent/build"
if build_directory.exists():
    if build_directory.resolve() != (ROOT / "apps/agent/build").absolute() or not build_directory.resolve().is_relative_to(ROOT):
        raise RuntimeError("Refusing to replace an unexpected package build directory")
    shutil.rmtree(build_directory)
subprocess.run([sys.executable, "-m", "build", str(ROOT / "apps/agent"), "--outdir", str(ROOT / "dist")], check=True, cwd=ROOT)
