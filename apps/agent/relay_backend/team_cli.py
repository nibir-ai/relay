"""Provision and run the optional shared service without a repository checkout."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets


def main(arguments):
    parser = argparse.ArgumentParser(description="Set up or run a Relay team status service.")
    sub = parser.add_subparsers(dest="action", required=True)
    for action in ("init", "add-member", "serve"):
        command = sub.add_parser(action)
        command.add_argument("--config", type=Path, required=True)
        if action == "serve":
            command.add_argument("--database", type=Path, required=True)
            command.add_argument("--port", type=int, default=4490)
        else:
            command.add_argument("--project", required=True)
            command.add_argument("--name", required=True)
            command.add_argument("--role", choices=("reader", "writer"), default="writer")
    args = parser.parse_args(arguments)
    try:
        from relay_team.app import Configuration, create_app
    except ImportError:
        parser.error('Install the shared service with: pip install "relay-backend[realtime]"')
    try:
        if args.action == "serve":
            if not 1 <= args.port <= 65535:
                raise ValueError("Invalid port.")
            config = json.loads(args.config.read_text(encoding="utf-8"))
            application = create_app(config=config, db_path=args.database)
            import uvicorn
            uvicorn.run(application, host="127.0.0.1", port=args.port, timeout_graceful_shutdown=5, access_log=False)
            return
        if args.config.is_symlink():
            raise ValueError("Use a regular membership file.")
        config = {"projects": {}} if args.action == "init" else json.loads(args.config.read_text(encoding="utf-8"))
        if args.action == "init" and args.config.exists():
            raise ValueError("Membership file exists. Use add-member instead.")
        import re
        if not re.fullmatch(r"[a-zA-Z0-9_-]{1,128}", args.project):
            raise ValueError("Project IDs must contain only letters, digits, _ or -.")
        token = secrets.token_urlsafe(32)
        member = {"id": secrets.token_hex(12), "name": args.name, "role": args.role,
                  "token_sha256": hashlib.sha256(token.encode()).hexdigest()}
        config["projects"].setdefault(args.project, {"members": []})["members"].append(member)
        Configuration.model_validate(config)
        args.config.parent.mkdir(parents=True, exist_ok=True)
        lock = args.config.with_name(args.config.name + ".lock")
        descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        try:
            if args.action == "add-member":
                # Reject a concurrent admin edit rather than dropping another member.
                previous = json.loads(args.config.read_text(encoding="utf-8"))
                without_new = json.loads(json.dumps(config))
                without_new["projects"][args.project]["members"].pop()
                if not without_new["projects"][args.project]["members"]:
                    without_new["projects"].pop(args.project)
                if previous != without_new:
                    raise ValueError("Membership changed. Retry add-member.")
            stream = os.fdopen(descriptor, "w", encoding="utf-8")
            descriptor = None
            with stream:
                json.dump(config, stream, indent=2)
                stream.write("\n")
            if args.action == "init":
                # Hard-link creation is exclusive and never replaces an existing file.
                os.link(lock, args.config)
            else:
                os.replace(lock, args.config)
        finally:
            if descriptor is not None:
                os.close(descriptor)
            lock.unlink(missing_ok=True)
        print("Membership saved. Restart the shared service after membership changes.")
        print("Give these private backend settings only to this developer:")
        print("RELAY_TEAM_PROJECT=" + args.project)
        print("RELAY_TEAM_TOKEN=" + token)
        print("Set RELAY_TEAM_URL to your shared service HTTPS origin.")
    except (OSError, ValueError, KeyError, TypeError):
        parser.error("Could not update or run the team service. Check the membership file, project/name, permissions and port. Existing files are retained.")
