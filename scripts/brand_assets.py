"""Build Relay's original vector identity from one geometry source."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "apps/web/public/brand"
OUT.mkdir(parents=True, exist_ok=True)

# The separated stem, return path and outgoing leg form one open R.
MARK = "M4 4H12V36H4Z M16 4H28L36 12V16L28 24H16V16H24L28 12H16Z M18 28H28L36 36H26Z"
# Original squared lowercase lettering, with a descending y.
WORD = (
    "M2 10H8V14L12 10H21V16H14L8 22V34H2Z "
    "M31 10H45L51 16V25H34V28H49V34H31L28 31V16Z M34 16H43L45 18V20H34Z "
    "M58 2H64V28H70V34H62L58 30Z "
    "M84 10H97L103 16V34H97V31L94 34H83L79 30V24L84 20H97V17L94 16H82V10Z M86 25H97V28H86Z "
    "M112 10H119V26H127V10H134V38L128 44H113V38H125L127 36V32H118L112 26Z"
)


def svg(viewbox, content, label):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" role="img" aria-labelledby="title"><title id="title">{label}</title>{content}</svg>\n'


def mark(fill):
    return f'<path d="{MARK}" fill="{fill}"/>'


def word(fill):
    return f'<path d="{WORD}" fill="{fill}" fill-rule="evenodd"/>'


def lockup(symbol, lettering):
    return f'<g transform="translate(0 4)">{mark(symbol)}</g><g transform="translate(60 0)">{word(lettering)}</g>'


assets = {
    "relay-symbol.svg": svg("0 0 40 40", mark("#fff"), "Relay symbol"),
    "relay-wordmark.svg": svg("0 0 136 48", word("#fff"), "Relay wordmark"),
    "relay-logo.svg": svg("0 0 196 48", lockup("#67b0e8", "#dadada"), "Relay"),
    "relay-logo-light.svg": svg("0 0 196 48", lockup("#245f9a", "#232c38"), "Relay"),
    "relay-logo-black.svg": svg("0 0 196 48", lockup("#10191d", "#10191d"), "Relay"),
    "relay-logo-white.svg": svg("0 0 196 48", lockup("#fff", "#fff"), "Relay"),
    "relay-icon.svg": svg("0 0 48 48", '<rect width="48" height="48" rx="4" fill="#10191d"/>' + f'<g transform="translate(4 4)">{mark("#67b0e8")}</g>', "Relay"),
}
for name, content in assets.items():
    (OUT / name).write_text(content, encoding="utf-8")
(ROOT / "apps/web/public/relay-mark.svg").write_text(assets["relay-icon.svg"], encoding="utf-8")
print(f"Built {len(assets)} vector brand assets and favicon.")
