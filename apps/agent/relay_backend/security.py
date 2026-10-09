import ipaddress
import re
from dataclasses import dataclass
from urllib.parse import urlsplit

from fastapi import HTTPException

MAX_REQUEST = 1024 * 1024
MAX_RESPONSE = 2 * 1024 * 1024
METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}


@dataclass(frozen=True)
class Settings:
    base_url: str = "http://127.0.0.1:8000"
    spec_path: str = "/openapi.json"
    port: int = 4477

    def __post_init__(self):
        parts = urlsplit(self.base_url)
        try:
            loopback = ipaddress.ip_address(parts.hostname or "").is_loopback
            valid_port = parts.port is not None
        except ValueError:
            loopback, valid_port = False, False
        if (parts.scheme not in {"http", "https"} or not loopback or not valid_port
                or parts.username or parts.password or parts.query or parts.fragment
                or parts.path not in {"", "/"}):
            raise ValueError("Target must be an explicit loopback IP origin with a port, e.g. http://127.0.0.1:8000")
        if not 1 <= self.port <= 65535:
            raise ValueError("Invalid Relay port")
        validate_path(self.spec_path)

    @property
    def origin(self):
        return f"http://127.0.0.1:{self.port}"

    def target(self, path: str):
        validate_path(path)
        return self.base_url.rstrip("/") + path


def validate_path(path: str):
    parts = urlsplit(path)
    if (not path.startswith("/") or path.startswith("//") or "\\" in path
            or parts.scheme or parts.netloc or parts.query or parts.fragment
            or any(ord(c) < 32 for c in path)):
        raise HTTPException(400, "Use a relative route starting with /; query values belong in Parameters.")


def safe_headers(headers: dict[str, str]):
    forbidden = {"host", "connection", "content-length", "transfer-encoding", "upgrade",
                 "proxy-authorization", "proxy-connection", "accept-encoding", "te", "trailer"}
    names = set()
    for name, value in headers.items():
        if name.lower() in names:
            raise HTTPException(400, f"Duplicate header: {name}")
        names.add(name.lower())
        if name.lower() in forbidden or name.lower().startswith("sec-"):
            raise HTTPException(400, f"The runner manages the {name} header.")
        if (not re.fullmatch(r"[!#$%&'*+.^_`|~0-9A-Za-z-]+", name)
                or any(ord(c) > 126 or (ord(c) < 32 and c != "\t") for c in value)):
            raise HTTPException(400, "Invalid header name or value.")
    return headers
