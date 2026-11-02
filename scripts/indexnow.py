"""Notify IndexNow of changed public documentation URLs, with local deduplication."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import secrets
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
HOST = 'relay-backend.pages.dev'
BASE = 'https://' + HOST
OUT = ROOT / 'dist' / 'docs'
CONFIG = ROOT / '.wrangler' / 'indexnow.json'
STATE = ROOT / '.wrangler' / 'indexnow-state.json'
ENDPOINT = 'https://api.indexnow.org/indexnow'


def configuration():
    config = json.loads(CONFIG.read_text(encoding='utf-8'))
    assert config['host'] == HOST, 'Verification host must be the production documentation host'
    assert re.fullmatch(r'[a-f0-9]{32}', config['key']), 'Invalid verification token'
    return config


def page_hashes():
    tree = ET.parse(OUT / 'sitemap.xml')
    pages = {}
    for loc in tree.iter('{http://www.sitemaps.org/schemas/sitemap/0.9}loc'):
        url = loc.text
        parsed = urlsplit(url)
        assert parsed.scheme == 'https' and parsed.netloc == HOST and not parsed.query and not parsed.fragment
        file = OUT / parsed.path.lstrip('/') / 'index.html'
        assert file.resolve().is_relative_to(OUT.resolve()) and file.is_file(), 'Invalid sitemap path'
        pages[url] = hashlib.sha256(file.read_bytes()).hexdigest()
    assert 0 < len(pages) <= 10000, 'Unexpected sitemap size'
    return pages


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--init', action='store_true', help='Create local verification configuration; does not submit')
    mode.add_argument('--dry-run', action='store_true', help='Show changed URL count without network requests or state changes')
    args = parser.parse_args()
    if args.init:
        if not CONFIG.exists():
            CONFIG.parent.mkdir(parents=True, exist_ok=True)
            CONFIG.write_text(json.dumps({'host': HOST, 'key': secrets.token_hex(16)}) + '\n', encoding='utf-8')
        configuration()
        print('Local IndexNow verification configured. Build and deploy before submitting.')
        return
    config = configuration()
    pages = page_hashes()
    previous = json.loads(STATE.read_text(encoding='utf-8')) if STATE.exists() else {}
    old_pages = previous.get('pages', {})
    changed = sorted(url for url, fingerprint in pages.items() if old_pages.get(url) != fingerprint)
    changed += sorted(set(old_pages) - set(pages))
    assert all(url.startswith(BASE + '/') for url in changed), 'Stored URLs must belong to production'
    if not changed:
        print('No changed documentation URLs; no submission sent.')
        return
    if args.dry_run:
        print(f'Dry run: {len(changed)} changed URLs for {HOST}; no submission sent.')
        return
    key_url = BASE + '/' + config['key'] + '.txt'
    headers = {'User-Agent': 'RelayDocumentation/1.0'}
    with urlopen(Request(key_url, headers=headers), timeout=30) as response:
        assert response.status == 200 and response.read(256).decode().strip() == config['key'], 'Deploy verification file first'
    payload = {'host': HOST, 'key': config['key'], 'keyLocation': key_url, 'urlList': changed}
    request = Request(ENDPOINT, data=json.dumps(payload).encode(), method='POST',
                      headers={**headers, 'Content-Type': 'application/json; charset=utf-8'})
    with urlopen(request, timeout=45) as response:
        status = response.status
        assert status in (200, 202), f'Unexpected IndexNow status: {status}'
    STATE.write_text(json.dumps({'pages': pages, 'last_http_status': status, 'submitted_count': len(changed)}, indent=2) + '\n', encoding='utf-8')
    meaning = 'received' if status == 200 else 'received; ownership verification pending'
    print(f'IndexNow HTTP {status}: {len(changed)} URLs {meaning}. This does not confirm indexing.')


if __name__ == '__main__':
    main()
