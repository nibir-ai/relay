from pathlib import Path

import pytest

from relay_agent.files import REPORT_MARKER, open_report, prepare_report


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
    monkeypatch.setattr("relay_agent.files.prepare_report", lambda _: path)
    opened = []
    monkeypatch.setattr("relay_agent.files.webbrowser.open", lambda uri: opened.append(uri) or True)
    assert open_report(Path("example.relay")) == path
    assert opened == [path.as_uri()]
    monkeypatch.setattr("relay_agent.files.webbrowser.open", lambda _: False)
    with pytest.raises(RuntimeError):
        open_report(Path("example.relay"))
