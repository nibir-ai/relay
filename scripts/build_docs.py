"""Build Relay's static documentation from the repository's Markdown sources."""
from pathlib import Path
from html import escape
from html.parser import HTMLParser
import json
import re
import shutil
import struct
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET

import markdown

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist' / 'docs'
BASE = 'https://relay-backend.pages.dev'
REPO = 'https://github.com/nibir-ai/relay'
CONTENT = ROOT / 'website' / 'content'
PAGES = {
    '': ('Relay — Free Open-Source API Testing for FastAPI & Node', 'Test local APIs inside your backend. Relay is a free, open-source Swagger UI and Postman alternative for FastAPI, Express and Fastify.'),
    'swagger-ui-alternative': ('Swagger UI Alternative for Local API Testing | Relay', 'Compare Relay with Swagger UI for local development. Generated OpenAPI endpoints, per-endpoint authentication, manual statuses and portable reports.'),
    'postman-alternative': ('Free Postman Alternative for Local Backend APIs | Relay', 'Use Relay as a free Postman alternative for local FastAPI and Node APIs. Open-source, generated OpenAPI endpoints, no Relay cloud account for local testing.'),
    'offline-api-testing': ('Offline API Testing Client for FastAPI & Node | Relay', 'Test local APIs with a bundled interface and no CDN. Learn what works offline, how to authorize requests and how to share Relay reports.'),
    'fastapi-api-testing': ('FastAPI API Testing: Your First Request with Relay', 'Install Relay, mount it on FastAPI and test a real endpoint in your browser. A complete Python example with parameters, responses and authentication guidance.'),
}


class SearchSections(HTMLParser):
    """Index visible section text using the rendered heading anchors."""
    def __init__(self, title, url):
        super().__init__()
        self.title, self.url = title, url
        self.sections, self.words = [], []
        self.heading, self.heading_words, self.anchor = '', None, ''

    def flush(self):
        text = ' '.join(' '.join(self.words).split())
        if text:
            self.sections.append({'title': self.title, 'section': self.heading,
                                  'url': self.url + ('#' + self.anchor if self.anchor else ''), 'text': text})
        self.words = []

    def handle_starttag(self, tag, attrs):
        if tag in ('h1', 'h2', 'h3'):
            self.flush()
            self.heading_words, self.anchor = [], dict(attrs).get('id', '')

    def handle_data(self, data):
        self.words.append(data)
        if self.heading_words is not None:
            self.heading_words.append(data)

    def handle_endtag(self, tag):
        if tag in ('h1', 'h2', 'h3') and self.heading_words is not None:
            self.heading = ' '.join(self.heading_words).strip()
            self.heading_words = None


def route(slug):
    return '/' + slug.strip('/') + '/' if slug else '/'


def image_dimensions(data):
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        return struct.unpack('>II', data[16:24])
    if data.startswith(b'\xff\xd8'):
        position = 2
        while position < len(data):
            if data[position] != 0xff:
                break
            while position < len(data) and data[position] == 0xff:
                position += 1
            marker = data[position]
            position += 1
            if marker in {0x01, 0xd8, *range(0xd0, 0xd8)}:
                continue
            if marker in {0xd9, 0xda}:
                break
            length = int.from_bytes(data[position:position + 2], 'big')
            if length < 2:
                break
            if marker in {0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf}:
                height, width = struct.unpack('>HH', data[position + 3:position + 7])
                return width, height
            position += length
    raise ValueError('Unsupported or malformed documentation image')


def frame(slug, title, description, body):
    canonical = BASE + ('/404.html' if slug == '404' else route(slug))
    crumbs = [{'@type': 'ListItem', 'position': 1, 'name': 'Relay', 'item': BASE + '/'}]
    if slug:
        crumbs.append({'@type': 'ListItem', 'position': 2, 'name': title.split(' | ')[0], 'item': canonical})
    graph = [{'@type': 'WebPage', '@id': canonical, 'url': canonical, 'name': title, 'description': description,
              'isPartOf': {'@id': BASE + '/#website'}, 'about': {'@id': BASE + '/#software'}},
             {'@type': 'BreadcrumbList', 'itemListElement': crumbs}]
    if not slug:
        graph += [{'@type': 'WebSite', '@id': BASE + '/#website', 'url': BASE + '/', 'name': 'Relay API Testing'},
                  {'@type': 'SoftwareApplication', '@id': BASE + '/#software', 'name': 'Relay',
                   'alternateName': 'relay-backend', 'applicationCategory': 'DeveloperApplication',
                   'operatingSystem': 'Windows, macOS, Linux', 'url': BASE + '/', 'sameAs': REPO,
                   'license': REPO + '/blob/main/LICENSE', 'description': description,
                   'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'USD'}}]
    schema = json.dumps({'@context': 'https://schema.org', '@graph': graph}).replace('<', '\\u003c')
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(title)}</title><meta name="description" content="{escape(description, quote=True)}">
<link rel="canonical" href="{canonical}"><meta name="robots" content="index,follow,max-image-preview:large">
<link rel="icon" href="/assets/relay-icon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/docs.css">
<meta property="og:type" content="website"><meta property="og:title" content="{escape(title, quote=True)}">
<meta property="og:description" content="{escape(description, quote=True)}"><meta property="og:url" content="{canonical}">
<meta property="og:image" content="{BASE}/assets/fastapi-quickstart.png"><meta property="og:site_name" content="Relay API Testing">
<meta name="twitter:card" content="summary_large_image"><script type="application/ld+json">{schema}</script><script type="module" src="/assets/search.mjs"></script></head>
<body><a class="skip" href="#main">Skip to content</a><header><a class="brand" href="/" aria-label="Relay home"><img src="/assets/relay-logo.svg" alt="Relay" width="180" height="44"></a><nav aria-label="Main navigation"><a href="/guides/">Documentation</a><a href="/swagger-ui-alternative/">Compare</a><a href="{REPO}">GitHub ↗</a></nav></header>
<div class="layout"><aside><p class="eyebrow">API testing / Open source</p><nav aria-label="Relay topics"><a href="/">Overview & install</a><a href="/swagger-ui-alternative/">Swagger UI alternative</a><a href="/postman-alternative/">Free Postman alternative</a><a href="/offline-api-testing/">Offline API testing</a><a href="/fastapi-api-testing/">FastAPI walkthrough</a><a href="/guides/node/">Express & Fastify</a><a href="/guides/testing/">Authentication & requests</a><a href="/guides/exports/">Reports & exports</a><a href="/guides/">All documentation →</a></nav><div class="package"><span>Install the workspace</span><code>pip install relay-backend</code><code>npm install relay-backend</code></div></aside>
<main id="main"><search class="doc-search" id="doc-search" hidden><label for="docs-query">Search documentation</label><div class="search-field"><input id="docs-query" type="search" placeholder="Setup, authentication, exports…" maxlength="120" autocomplete="off" spellcheck="false" aria-describedby="search-status" aria-controls="search-results"><button id="search-clear" type="button" hidden>Clear</button></div><p id="search-status" role="status">Search guides and reference sections.</p><button id="search-retry" type="button" hidden>Retry search</button><ol id="search-results" hidden></ol></search><p class="eyebrow">Relay / Developer documentation</p>{body}</main></div>
<footer><span>Relay · Apache-2.0</span><nav aria-label="Packages"><a href="https://pypi.org/project/relay-backend/">PyPI</a><a href="https://www.npmjs.com/package/relay-backend">npm</a><a href="{REPO}/issues">Issues</a><a href="/sitemap.xml">Sitemap</a></nav></footer></body></html>'''


def render(source, source_path, slug):
    body = markdown.markdown(source, extensions=['fenced_code', 'tables', 'toc', 'sane_lists'])
    # Resolve every repository-relative Markdown link from its original source location.
    def rewrite(match):
        attr, url = match.group(1), match.group(2)
        parsed = urlsplit(url)
        if parsed.scheme or url.startswith(('/', '#')):
            return match.group(0)
        if source_path.parent == CONTENT:
            return match.group(0)
        resolved = (source_path.parent / parsed.path).resolve()
        if resolved.parent == ROOT / 'docs' and resolved.suffix == '.md':
            target_slug = 'guides/' + ('overview' if resolved.stem == 'README' else resolved.stem.lower())
            target = route(target_slug)
        elif resolved.is_relative_to(ROOT / 'docs' / 'assets'):
            target = '/assets/' + resolved.name
        else:
            rel = resolved.relative_to(ROOT).as_posix()
            target = f'{REPO}/blob/main/{rel}'
        if parsed.fragment:
            target += '#' + parsed.fragment
        return f'{attr}="{escape(target, quote=True)}"'
    body = re.sub(r'(href|src)="([^"]+)"', rewrite, body)
    def dimensions(match):
        image = match.group(0)
        src = re.search(r'src="([^"]+)"', image).group(1)
        if src.startswith(('/assets/', 'assets/')) and src.endswith('.png'):
            file = ROOT / 'docs' / 'assets' / Path(src).name
            if file.is_file():
                width, height = image_dimensions(file.read_bytes())
                return image.replace('<img ', f'<img width="{width}" height="{height}" ')
        return image
    return re.sub(r'<img\b[^>]+>', dimensions, body)


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    assets = OUT / 'assets'
    assets.mkdir(exist_ok=True)
    for file in (ROOT / 'docs' / 'assets').iterdir():
        if file.is_file():
            shutil.copy2(file, assets / file.name)
    for name in ['relay-logo.svg', 'relay-icon.svg']:
        shutil.copy2(ROOT / 'apps/web/public/brand' / name, assets / name)
    shutil.copy2(ROOT / 'website/docs.css', assets / 'docs.css')
    shutil.copy2(ROOT / 'website/search.mjs', assets / 'search.mjs')
    pages = []
    for slug, (title, description) in PAGES.items():
        source = CONTENT / ((slug or 'index') + '.md')
        pages.append((slug, title, description, render(source.read_text(encoding='utf-8'), source, slug)))
    guides = []
    for source in [*sorted((ROOT / 'docs').glob('*.md')), ROOT / 'CHANGELOG.md']:
        text = source.read_text(encoding='utf-8')
        heading = re.search(r'^# (.+)$', text, re.M)
        name = heading.group(1) if heading else source.stem
        slug = 'guides/' + ('overview' if source.stem == 'README' else source.stem.lower())
        guides.append((slug, name))
        description = f"{name}: Relay's source documentation for local API testing, backend integration and team workflows."
        body = '<p class="breadcrumb"><a href="/guides/">All guides</a> / Reference</p>' + render(text, source, slug)
        pages.append((slug, name + ' | Relay Documentation', description, body))
    library = '<h1>Relay documentation</h1><p>Setup, practical API testing and reference guides, built from the maintained repository documentation. Sections labeled 0.0.6 development describe unreleased work.</p><ul class="library">'
    library += ''.join(f'<li><a href="{route(slug)}">{escape(name)}</a></li>' for slug, name in guides) + '</ul>'
    pages.append(('guides', 'Relay Documentation — FastAPI, Node & API Testing', 'Install Relay on FastAPI, Express or Fastify. Browse API testing, authentication, export, troubleshooting and team collaboration guides.', library))
    search_sections = []
    for slug, title, description, body in pages:
        target = OUT / slug / 'index.html'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(frame(slug, title, description, body), encoding='utf-8')
        indexer = SearchSections(title.split(' | ')[0], route(slug))
        indexer.feed(body)
        indexer.flush()
        search_sections.extend(indexer.sections)
    (assets / 'search-index.json').write_text(json.dumps(search_sections, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    root = ET.Element('urlset', xmlns='http://www.sitemaps.org/schemas/sitemap/0.9')
    for slug, *_ in pages:
        ET.SubElement(ET.SubElement(root, 'url'), 'loc').text = BASE + route(slug)
    ET.ElementTree(root).write(OUT / 'sitemap.xml', encoding='utf-8', xml_declaration=True)
    (OUT / 'robots.txt').write_text(f'User-agent: *\nAllow: /\nSitemap: {BASE}/sitemap.xml\n', encoding='utf-8')
    (OUT / '404.html').write_text(frame('404', 'Page not found | Relay', 'Find Relay API testing documentation.', '<h1>Page not found</h1><p><a href="/guides/">Find a guide</a> or <a href="/">start with Relay</a>.</p>').replace('index,follow,max-image-preview:large', 'noindex,follow'), encoding='utf-8')
    (OUT / '.nojekyll').touch()
    headers = '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n'
    for image in assets.glob('*.png'):
        if image.read_bytes().startswith(b'\xff\xd8'):
            headers += f'/assets/{image.name}\n  Content-Type: image/jpeg\n'
    (OUT / '_headers').write_text(headers, encoding='utf-8')
    print(f'Built {len(pages)} indexable pages in dist/docs')


if __name__ == '__main__':
    build()
