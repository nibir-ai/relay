"""Open portable Relay reports and register their Windows file association."""
import argparse
import hashlib
import sys
import webbrowser
from pathlib import Path

REPORT_MARKER = '<meta name="relay-format" content="relay.endpoint.report.v1">'
PROG_ID = "Relay.EndpointReport"


def prepare_report(path: Path, cache_dir: Path | None = None) -> Path:
    path = path.expanduser().resolve(strict=True)
    if path.suffix.lower() != ".relay":
        raise ValueError("Choose a .relay endpoint report.")
    if path.stat().st_size > 32 * 1024 * 1024:
        raise ValueError("Relay report exceeds the 32 MiB limit.")
    data = path.read_bytes()
    content = data.decode("utf-8-sig")
    if REPORT_MARKER not in content or not content.lstrip().lower().startswith("<!doctype html>"):
        raise ValueError("This is not a supported Relay browser report.")
    # A .html copy gives every browser the correct local-file content type.
    # Keep the original report intact; no backend or HTTP server is required.
    root = cache_dir or Path.home() / ".relay" / "reports"
    root.mkdir(parents=True, exist_ok=True)
    destination = root / (hashlib.sha256(data).hexdigest() + ".html")
    destination.write_bytes(data)
    return destination


def open_report(path: Path) -> Path:
    destination = prepare_report(path)
    if not webbrowser.open(destination.as_uri()):
        raise RuntimeError(f"Could not open your browser. Open {destination} manually.")
    return destination


def associate_windows() -> str:
    if sys.platform != "win32":
        raise ValueError("Automatic association currently supports Windows. Use relay open <file.relay> on this platform.")
    import ctypes
    import subprocess
    import winreg

    extension = r"Software\Classes\.relay"
    # Do not replace another application's association.
    for hive, key_path in ((winreg.HKEY_CURRENT_USER, extension), (winreg.HKEY_CLASSES_ROOT, ".relay")):
        try:
            with winreg.OpenKey(hive, key_path) as key:
                existing = winreg.QueryValue(key, None)
                if existing and existing != PROG_ID:
                    raise ValueError(".relay already belongs to another application. Choose Relay explicitly in Windows Open with settings.")
        except FileNotFoundError:
            pass
    python = Path(sys.executable)
    pythonw = python.with_name("pythonw.exe")
    executable = pythonw if pythonw.is_file() else python
    command = subprocess.list2cmdline([str(executable), "-m", "relay_backend.files"]) + ' "%1"'
    values = {
        extension: PROG_ID,
        rf"Software\Classes\{PROG_ID}": "Relay endpoint report",
        rf"Software\Classes\{PROG_ID}\shell\open\command": command,
    }
    for key_path, value in values.items():
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path) as key:
            winreg.SetValueEx(key, "", 0, winreg.REG_SZ, value)
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, extension) as key:
        winreg.SetValueEx(key, "Content Type", 0, winreg.REG_SZ, "text/html")
    ctypes.windll.shell32.SHChangeNotify(0x08000000, 0, None, None)
    return command


def main():
    parser = argparse.ArgumentParser(description="Open a Relay endpoint report in your default browser.")
    parser.add_argument("file", type=Path)
    args = parser.parse_args()
    try:
        open_report(args.file)
    except (OSError, UnicodeError, ValueError, RuntimeError) as error:
        if sys.platform == "win32" and sys.executable.lower().endswith("pythonw.exe"):
            import ctypes
            ctypes.windll.user32.MessageBoxW(None, str(error), "Relay report", 0x10)
        else:
            parser.error(str(error))


if __name__ == "__main__":
    main()
