"""Check rendered documentation metadata, structured data and local links."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit, unquote
import json
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1] / 'dist' / 'docs'
BASE = 'https://relay-backend.pages.dev'


class Document(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links, self.ids, self.canonicals, self.descriptions, self.schemas = [], set(), [], [], []
        self.h1 = 0
        self.schema = None
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if 'id' in a:
            self.ids.add(a['id'])
        if tag == 'h1':
            self.h1 += 1
        if tag == 'img':
            for dimension in ['width', 'height']:
                if dimension in a:
                    assert 0 < int(a[dimension]) <= 20000, ('Invalid image dimension', a)
        if tag in ('a', 'img', 'link', 'script'):
            self.links.append(a.get('href', a.get('src', '')))
        if tag == 'link' and a.get('rel') == 'canonical':
            self.canonicals.append(a['href'])
        if tag == 'meta' and a.get('name') == 'description':
            self.descriptions.append(a['content'])
        if tag == 'script' and a.get('type') == 'application/ld+json':
            self.schema = ''
    def handle_data(self, data):
        if self.schema is not None:
            self.schema += data
    def handle_endtag(self, tag):
        if tag == 'script' and self.schema is not None:
            self.schemas.append(json.loads(self.schema))
            self.schema = None


documents = {}
titles = set()
for file in ROOT.rglob('*.html'):
    doc = Document()
    source = file.read_text(encoding='utf-8')
    if file.parent == ROOT and re.fullmatch(r'google[a-f0-9]{16}\.html', file.name):
        assert source.strip() == f'google-site-verification: {file.name}', 'Incorrect Google ownership file'
        continue
    doc.feed(source)
    assert doc.h1 == 1, (file, 'Expected exactly one H1', doc.h1)
    assert len(doc.canonicals) == 1 and doc.canonicals[0].startswith(BASE + '/'), file
    assert len(doc.descriptions) == 1 and doc.descriptions[0], file
    assert doc.schemas, (file, 'Missing structured data')
    title = re.search(r'<title>(.+?)</title>', source).group(1)
    assert title not in titles, (file, 'Duplicate title')
    titles.add(title)
    documents[file.resolve()] = doc

for file, doc in documents.items():
    page = BASE + '/' + file.relative_to(ROOT).as_posix().removesuffix('index.html')
    for link in doc.links:
        parsed = urlsplit(urljoin(page, link))
        if parsed.netloc != urlsplit(BASE).netloc:
            continue
        target = ROOT / unquote(parsed.path).lstrip('/')
        if target.is_dir():
            target /= 'index.html'
        assert target.is_file(), (file.relative_to(ROOT), 'Broken local link', link)
        if parsed.fragment and target.resolve() in documents:
            assert unquote(parsed.fragment) in documents[target.resolve()].ids, (file, 'Missing fragment', link)

tree = ET.parse(ROOT / 'sitemap.xml')
urls = [el.text for el in tree.iter('{http://www.sitemaps.org/schemas/sitemap/0.9}loc')]
expected = {d.canonicals[0] for f, d in documents.items() if f.name != '404.html'}
assert set(urls) == expected and len(urls) == len(expected), 'Sitemap must cover exactly the indexable pages'
assert 'Sitemap: ' + BASE + '/sitemap.xml' in (ROOT / 'robots.txt').read_text()
sections = json.loads((ROOT / 'assets/search-index.json').read_text(encoding='utf-8'))
assert 0 < len(sections) <= 5000
assert (ROOT / 'assets/search-index.json').stat().st_size < 1024 * 1024, 'Keep search bounded'
indexed_pages = set()
for section in sections:
    assert set(section) == {'title', 'section', 'url', 'text'}
    assert all(isinstance(value, str) and value for key, value in section.items() if key != 'section')
    parsed = urlsplit(section['url'])
    assert not parsed.scheme and not parsed.netloc and parsed.path.startswith('/')
    target = (ROOT / unquote(parsed.path).lstrip('/') / 'index.html').resolve()
    assert target in documents, ('Invalid search target', section['url'])
    if parsed.fragment:
        assert unquote(parsed.fragment) in documents[target].ids, ('Invalid search section', section['url'])
    indexed_pages.add(documents[target].canonicals[0])
assert indexed_pages == expected, 'Search must cover every public page and exclude the 404'
for file, doc in documents.items():
    assert {'doc-search', 'docs-query', 'search-status', 'search-results', 'search-clear', 'search-retry'} <= doc.ids
print(f'Checked {len(documents)} HTML files: headings, canonicals, descriptions, JSON-LD, local links/fragments and sitemap passed.')
print(f'Checked {len(sections)} searchable sections, target anchors and complete page coverage.')
