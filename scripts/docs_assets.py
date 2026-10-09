"""Build original, editable visual guides for Relay documentation."""
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/assets"
OUT.mkdir(parents=True, exist_ok=True)
BG, PANEL, BORDER = "#10191d", "#192429", "#3c4f59"
TEXT, MUTED, BLUE, GREEN, AMBER = "#e4e7e9", "#b0bec4", "#67b0e8", "#8ccf7e", "#e5c76b"


def text(x, y, value, size=22, color=TEXT, weight=400):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}">{escape(value)}</text>'


def rect(x, y, w, h, fill=PANEL, stroke=BORDER, radius=4):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" stroke="{stroke}"/>'


def line(x1, y1, x2, y2, color=BORDER, width=2):
    return f'<path d="M{x1} {y1}H{x2}" stroke="{color}" stroke-width="{width}"/>' if y1 == y2 else f'<path d="M{x1} {y1}L{x2} {y2}" stroke="{color}" stroke-width="{width}" fill="none"/>'


def arrow(x1, y, x2, color=BLUE):
    return line(x1, y, x2, y, color) + f'<path d="M{x2-7} {y-6}L{x2} {y}L{x2-7} {y+6}" fill="none" stroke="{color}" stroke-width="2"/>'


def window(x, y, w, h, label):
    return rect(x, y, w, h) + line(x, y+42, x+w, y+42) + text(x+18, y+27, label, 16, MUTED)


def badge(x, y, label, color=BLUE, width=72):
    return rect(x, y, width, 30, color, color, 2) + text(x+12, y+21, label, 16, BG, 700)


def save(name, title, description, content, height=440):
    header = text(44, 61, title, 30, TEXT, 600)
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 {height}" role="img" aria-labelledby="title desc">
<title id="title">{escape(title)}</title><desc id="desc">{escape(description)}</desc>
<rect width="1400" height="{height}" fill="{BG}"/>
<g font-family="ui-monospace, SFMono-Regular, Consolas, Liberation Mono, monospace">{header}{content}</g></svg>\n'''
    (OUT / name).write_text(svg, encoding="utf-8")


content = ""
for x, label in [(44, "Install"), (504, "Mount"), (964, "Open")]:
    content += text(x, 122, label, 22, BLUE, 600)
content += window(44, 145, 392, 168, "Terminal")
content += text(64, 226, "pip install relay-backend", 21, GREEN, 600)
content += text(44, 353, "Use your backend's Python env", 18, MUTED)
content += arrow(451, 230, 484)
content += window(504, 145, 412, 168, "Your FastAPI entry point")
content += text(524, 219, "from relay_agent import install_relay", 17, BLUE)
content += text(524, 272, "install_relay(app)", 23, GREEN, 600)
content += text(504, 353, "Add the import and mount call", 18, MUTED)
content += arrow(927, 230, 950)
content += window(964, 145, 392, 168, "Your existing backend port")
content += text(985, 216, "localhost:8000", 23, MUTED)
content += text(985, 263, "/relay", 36, BLUE, 600)
content += text(964, 353, "Restart, then open in browser", 18, MUTED)
save("fastapi-quickstart.svg", "Relay in your backend", "Install relay-backend in your backend environment. Import install_relay from relay_agent and call install_relay(app) on your FastAPI instance. Restart your backend and open /relay on its existing port. Copy the commands from the guide below.", content)

content = window(44, 148, 306, 164, "Browser")
content += text(66, 220, "/relay", 34, BLUE, 600)
content += text(66, 266, "Test your APIs", 20)
content += arrow(365, 230, 423)
content += rect(444, 109, 912, 273, BG)
content += text(466, 148, "Your FastAPI application", 23, TEXT, 600)
content += text(1114, 148, "Same port", 20, GREEN)
content += rect(467, 177, 257, 157)
content += text(487, 214, "Relay UI", 24, BLUE, 600)
content += text(487, 249, "Bundled assets", 18, MUTED)
content += text(487, 282, "Request runner", 18)
content += arrow(739, 258, 875)
content += text(748, 233, "Execute", 17, GREEN)
content += rect(892, 177, 440, 157)
content += text(912, 215, "Your API routes", 24, GREEN, 600)
content += text(912, 253, "Middleware + dependencies", 19, MUTED)
content += text(912, 288, "Real backend handlers", 19)
content += line(1112, 334, 1112, 358, BLUE) + line(596, 358, 1112, 358, BLUE) + line(596, 358, 596, 334, BLUE)
content += text(778, 377, "OpenAPI discovery", 16, BLUE)
save("fastapi-native.svg", "One application. One port.", "Relay UI and its native request runner are mounted inside the existing FastAPI application. Relay discovers the app's OpenAPI and executes through its middleware, dependencies and real handlers. The browser uses the backend's existing port.", content)

content = text(44, 119, "Example endpoints", 18, MUTED)
for y, method, path, color in [(145, "GET", "/profile", BLUE), (221, "POST", "/admin/users", GREEN)]:
    content += rect(44, y, 588, 58) + badge(61, y+14, method, color)
    content += text(152, y+37, path, 22)
    content += rect(523, y+12, 88, 34, BG) + text(543, y+36, "Auth", 18, BLUE)
content += text(44, 337, "Shared token: header Authorize", 21, MUTED)
content += text(44, 372, "Endpoint token: its Auth button", 21, TEXT)
content += arrow(650, 249, 748)
content += window(770, 136, 586, 256, "Quick endpoint authorization")
content += text(794, 215, "Paste token", 22)
content += rect(794, 235, 538, 48, BG)
content += text(810, 267, "••••••••••••••••••••", 23, MUTED)
content += rect(1140, 309, 192, 48, BLUE, BLUE)
content += text(1164, 340, "Authorize", 21, BG, 600)
content += text(794, 339, "Advanced settings", 18, MUTED)
save("endpoint-auth.svg", "Paste. Authorize. Execute.", "Use header Authorize for a shared bearer token. For a separate user or admin credential, click Auth beside that endpoint, paste its token and click Authorize. Advanced settings offers additional authentication modes. Routes in this diagram are examples; permissions are enforced by the backend.", content, 460)

content = window(44, 141, 356, 232, "Run a request")
content += badge(64, 207, "GET") + text(153, 230, "/health", 23)
content += rect(64, 280, 246, 48, BLUE, BLUE)
content += text(89, 311, "Execute request", 20, BG, 600)
content += arrow(415, 256, 470)
content += window(490, 141, 407, 232, "Inspect the response")
content += text(511, 212, "Body   Raw   Headers", 20, BLUE)
content += text(511, 264, "Read · Copy · Focus", 22)
content += text(511, 316, "Export", 25, GREEN, 600)
content += arrow(912, 256, 955)
content += text(984, 180, "Choose a format", 21, MUTED)
content += rect(984, 201, 372, 68, BG)
content += text(1006, 243, ".relay", 26, BLUE, 600) + text(1126, 244, "Browser report", 18)
content += rect(984, 286, 372, 68, BG)
content += text(1006, 329, ".json", 26, GREEN, 600) + text(1126, 329, "Structured data", 18)
save("response-export.svg", "From request to shareable result", "Execute an endpoint, inspect or copy its response, and choose Export. Relay creates either an offline .relay browser report or structured JSON containing endpoint details, current request inputs and the latest captured response. Review exported bodies and responses before sharing; they can contain sensitive data.", content)
print(f"Built four documentation guides in {OUT}")
