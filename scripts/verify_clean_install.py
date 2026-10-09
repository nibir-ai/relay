"""Exercise the published-style wheel from a clean environment outside the checkout."""
import argparse
import subprocess
import tempfile
import tomllib
import venv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--minimum-dependencies", action="store_true", help="Verify the declared minimum runtime versions.")
parser.add_argument("--public-index", action="store_true", help="Install the exact current version from PyPI.")
args = parser.parse_args()
project = tomllib.loads((ROOT / "apps/agent/pyproject.toml").read_text())["project"]
wheel = ROOT / "dist" / f"{project['name'].replace('-', '_')}-{project['version']}-py3-none-any.whl"
with tempfile.TemporaryDirectory(prefix="relay-customer-") as directory:
    root = Path(directory)
    venv.EnvBuilder(with_pip=True).create(root / "env")
    python = root / "env" / ("Scripts/python.exe" if __import__('os').name == 'nt' else "bin/python")
    dependencies = ["fastapi==0.115.0", "uvicorn==0.30.0", "httpx==0.28.0"] if args.minimum_dependencies else []
    install = [f"{project['name']}=={project['version']}", "--index-url", "https://pypi.org/simple", "--no-cache-dir"] if args.public_index else [str(wheel)]
    subprocess.run([str(python), "-m", "pip", "install", *install, *dependencies], cwd=root, check=True)
    import shutil
    shutil.copyfile(ROOT / "examples/fastapi/main.py", root / "main.py")
    shutil.copyfile(ROOT / "scripts/consumer_smoke.py", root / "verify.py")
    subprocess.run([str(python), str(root / "verify.py"), project["version"]], cwd=root, check=True)
