import hashlib
import json
import re
import pytest
from relay_backend.team_cli import main


def test_provisioning_retains_members_and_stores_only_hashes(tmp_path,capsys):
    file=tmp_path/"members.json"
    main(["init","--config",str(file),"--project","example","--name","Alice"])
    output=capsys.readouterr().out
    token=re.search(r"RELAY_TEAM_TOKEN=(\S+)",output).group(1)
    data=json.loads(file.read_text())
    assert token not in file.read_text()
    assert data["projects"]["example"]["members"][0]["token_sha256"]==hashlib.sha256(token.encode()).hexdigest()
    main(["add-member","--config",str(file),"--project","example","--name","Bob","--role","reader"])
    members=json.loads(file.read_text())["projects"]["example"]["members"]
    assert [m["name"] for m in members]==["Alice","Bob"] and members[1]["role"]=="reader"
    original=file.read_bytes()
    with pytest.raises(SystemExit): main(["init","--config",str(file),"--project","other","--name","Eve"])
    assert file.read_bytes()==original
