from pathlib import Path

import pytest

from relay_backend.files import REPORT_MARKER, open_report, prepare_report


def test_legacy_report_association_entry_point():
    import subprocess
    import sys
    from relay_agent.files import prepare_report as legacy_prepare
    assert legacy_prepare is prepare_report
    result = subprocess.run([sys.executable, "-m", "relay_agent.files", "--help"], capture_output=True, text=True)
    assert result.returncode == 0
    assert "Open a Relay endpoint report" in result.stdout


def test_prepare_report_preserves_contents_and_handles_spaces(tmp_path):
    path = tmp_path / "api report.relay"
    content = '<!doctype html><html><head>' + REPORT_MARKER + '</head><body>Response &amp; request</body></html>'
    path.write_text(content, encoding="utf-8")
    output = prepare_report(path, tmp_path / "cache")
    assert output.suffix == ".html"
    assert output.read_text(encoding="utf-8") == content
    assert path.read_text(encoding="utf-8") == content
    assert prepare_report(path, tmp_path / "cache") == output


@pytest.mark.parametrize("name,contents", [("report.json", "{}"), ("report.relay", "{}"), ("report.relay", "<!doctype html><html>unknown</html>")])
def test_rejects_unsupported_files(tmp_path, name, contents):
    path = tmp_path / name
    path.write_text(contents, encoding="utf-8")
    with pytest.raises(ValueError):
        prepare_report(path, tmp_path / "cache")


def test_open_uses_file_uri_and_reports_browser_failure(tmp_path, monkeypatch):
    path = tmp_path / "safe report.html"
    monkeypatch.setattr("relay_backend.files.prepare_report", lambda _: path)
    opened = []
    monkeypatch.setattr("relay_backend.files.webbrowser.open", lambda uri: opened.append(uri) or True)
    assert open_report(Path("example.relay")) == path
    assert opened == [path.as_uri()]
    monkeypatch.setattr("relay_backend.files.webbrowser.open", lambda _: False)
    with pytest.raises(RuntimeError):
        open_report(Path("example.relay"))
