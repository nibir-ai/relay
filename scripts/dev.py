"""Run the demo backend with native Relay; Ctrl+C stops the server."""
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    if not (ROOT / "apps/web/dist/index.html").exists():
        raise SystemExit("Build the UI first: pnpm --dir apps/web build (or npm --prefix apps/web run build)")
    for port in (8000,):
        with socket.socket() as probe:
            try: probe.bind(("127.0.0.1", port))
            except OSError: raise SystemExit(f"Port {port} is already in use. Stop that server or run Relay separately with a custom port.")
    children = []
    def stop(signum, frame): raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, stop)
    try:
        children.append(subprocess.Popen([sys.executable, "-m", "uvicorn", "main:app", "--app-dir", str(ROOT / "fixtures/fastapi-demo"), "--host", "127.0.0.1", "--port", "8000"]))
        print("\nRelay: http://127.0.0.1:8000/relay\nDemo docs: http://127.0.0.1:8000/docs\nPress Ctrl+C to stop the server.\n", flush=True)
        while all(child.poll() is None for child in children): time.sleep(.5)
    except KeyboardInterrupt:
        pass
    finally:
        for child in children:
            if child.poll() is None: child.terminate()
        for child in children:
            try: child.wait(timeout=5)
            except subprocess.TimeoutExpired: child.kill()


if __name__ == "__main__": main()
