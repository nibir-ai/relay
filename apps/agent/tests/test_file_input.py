import os
import stat
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from relay_backend.file_input import read_bounded
from relay_backend.git_status import GitStatus


def test_exact_limit_and_initial_oversize(tmp_path, monkeypatch):
    path = tmp_path / "input.json"
    path.write_bytes(b"12345678")
    assert read_bounded(path, 8) == b"12345678"
    monkeypatch.setattr(os, "read", lambda *_: pytest.fail("Oversized input was read"))
    with pytest.raises(ValueError, match="byte limit"):
        read_bounded(path, 7)


def test_git_growth_after_descriptor_inspection_is_rejected_and_closed(tmp_path, monkeypatch):
    path = tmp_path / "status.json"
    path.write_text('{"version":1,"endpoints":{}}')
    inspected = []
    original_stat = os.fstat
    original_read = os.read
    bytes_read = 0

    def grow(descriptor):
        info = original_stat(descriptor)
        inspected.append(descriptor)
        with path.open("ab") as stream:
            stream.write(b" " * (3 * 1024 * 1024))
        return info

    def counted(descriptor, count):
        nonlocal bytes_read
        chunk = original_read(descriptor, count)
        bytes_read += len(chunk)
        return chunk

    monkeypatch.setattr(os, "fstat", grow)
    monkeypatch.setattr(os, "read", counted)
    reader = object.__new__(GitStatus)
    reader.path = path
    with pytest.raises(HTTPException) as error:
        reader.read()
    assert error.value.status_code == 409
    assert bytes_read == 2 * 1024 * 1024 + 1
    with pytest.raises(OSError):
        original_stat(inspected[0])


def test_opened_file_is_preserved_when_path_changes(tmp_path, monkeypatch):
    path = tmp_path / "input.json"
    path.write_bytes(b"original")
    original_open = os.open

    def open_then_replace(file, flags):
        descriptor = original_open(file, flags)
        try:
            path.rename(tmp_path / "opened.json")
            path.write_bytes(b"replacement")
        except OSError:
            os.close(descriptor)
            pytest.skip("Platform does not permit renaming an open file")
        return descriptor

    monkeypatch.setattr(os, "open", open_then_replace)
    assert read_bounded(path, 8) == b"original"
    assert path.read_bytes() == b"replacement"


def test_nonregular_descriptor_is_rejected_before_read(tmp_path, monkeypatch):
    path = tmp_path / "input.json"
    path.write_bytes(b"content")
    monkeypatch.setattr(os, "fstat", lambda _: SimpleNamespace(st_mode=stat.S_IFIFO, st_size=0))
    monkeypatch.setattr(os, "read", lambda *_: pytest.fail("Nonregular input was read"))
    with pytest.raises(ValueError, match="regular file"):
        read_bounded(path, 8)


@pytest.mark.skipif(not hasattr(os, "mkfifo"), reason="Named pipes require POSIX")
def test_fifo_open_does_not_wait_for_a_writer(tmp_path):
    path = tmp_path / "pipe"
    os.mkfifo(path)
    with pytest.raises(ValueError, match="regular file"):
        read_bounded(path, 8)


def test_read_error_closes_descriptor_and_missing_git_file_is_empty(tmp_path, monkeypatch):
    path = tmp_path / "input.json"
    path.write_bytes(b"content")
    original_stat = os.fstat
    inspected = []

    def inspect(descriptor):
        inspected.append(descriptor)
        return original_stat(descriptor)

    def fail(*_):
        raise OSError("Read failed")

    monkeypatch.setattr(os, "fstat", inspect)
    monkeypatch.setattr(os, "read", fail)
    with pytest.raises(OSError, match="Read failed"):
        read_bounded(path, 8)
    with pytest.raises(OSError):
        original_stat(inspected[0])
    reader = object.__new__(GitStatus)
    reader.path = tmp_path / "missing.json"
    assert reader.read() == {}
