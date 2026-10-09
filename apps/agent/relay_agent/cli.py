import argparse
import hashlib
import sys
from pathlib import Path

import uvicorn

from .app import create_app
from .security import Settings


def main():
    if len(sys.argv) > 1 and sys.argv[1] in {"open", "associate"}:
        from .files import associate_windows, open_report
        action = sys.argv[1]
        file_parser = argparse.ArgumentParser(description="Open Relay reports or enable Windows double-click support.")
        if action == "open":
            file_parser.add_argument("file", type=Path)
        file_args = file_parser.parse_args(sys.argv[2:])
        try:
            if action == "open":
                open_report(file_args.file)
            else:
                associate_windows()
                print("Relay .relay reports now open in your default browser. Existing Windows user choices remain unchanged.")
        except (OSError, UnicodeError, ValueError, RuntimeError) as error:
            file_parser.error(str(error))
        return
    parser = argparse.ArgumentParser(description="Relay local API explorer. Targets are approved explicitly at startup.")
    parser.add_argument("--target", default="http://127.0.0.1:8000")
    parser.add_argument("--spec-path", default="/openapi.json")
    parser.add_argument("--port", type=int, default=4477)
    parser.add_argument("--static-dir", type=Path)
    parser.add_argument("--data-dir", type=Path, default=Path.home() / ".relay")
    parser.add_argument("--project", type=Path, help="Git repository for shared .relay/status.json metadata")
    args = parser.parse_args()
    try:
        settings = Settings(args.target, args.spec_path, args.port)
    except Exception as exc:
        parser.error(str(exc))
    workspace_id = hashlib.sha256((str(args.project.resolve()) if args.project else settings.base_url.rstrip("/")).encode()).hexdigest()[:16]
    db_path = args.data_dir / workspace_id / "workspace.sqlite3"
    try:
        app = create_app(settings, static_dir=args.static_dir, db_path=db_path, project=args.project)
    except ValueError as exc:
        parser.error(str(exc))
    uvicorn.run(app, host="127.0.0.1", port=args.port, access_log=False)
