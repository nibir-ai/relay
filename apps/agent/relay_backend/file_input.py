"""Read regular files through one descriptor with a strict byte budget."""
import os
import stat


class FileSizeLimitError(ValueError):
    """The input exceeds its byte budget."""


def read_bounded(path, limit):
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NONBLOCK", 0)
    descriptor = os.open(path, flags)
    try:
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode):
            raise ValueError("Input must be a regular file.")
        if info.st_size > limit:
            raise FileSizeLimitError("Input exceeds its byte limit.")
        content = bytearray()
        while len(content) <= limit:
            chunk = os.read(descriptor, min(65536, limit + 1 - len(content)))
            if not chunk:
                return bytes(content)
            content.extend(chunk)
        raise FileSizeLimitError("Input exceeds its byte limit.")
    finally:
        os.close(descriptor)
