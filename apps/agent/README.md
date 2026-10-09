# Relay Backend

An offline API testing interface for your FastAPI application. Install one Python package, mount it once, and open `/relay` on your backend's existing port.

## Install

![Install Relay, mount it on FastAPI, then open /relay on the backend's existing port.](https://raw.githubusercontent.com/nibir-ai/relay/main/docs/assets/fastapi-quickstart.png)

1. Install in your backend's Python environment:

```sh
python -m pip install relay-backend==0.0.2
```

2. Add these lines where your FastAPI `app` is created:

```python
from relay_agent import install_relay
install_relay(app)
```

3. Restart the backend with its usual command and open `/relay` on its existing port.

<details>
<summary>Complete example for a new app</summary>

```python
from fastapi import FastAPI
from relay_agent import install_relay

app = FastAPI()
install_relay(app)

@app.get("/health", tags=["System"])
def health():
    return {"status": "ok"}
```

Run your backend normally, for example `uvicorn main:app --reload`, then visit `http://localhost:8000/relay/`.

</details>

No repository clone, Node installation, frontend build, CDN, separate Relay process, or target URL is required. Existing applications only need the import and `install_relay(app)` call. Use `install_relay(app, enabled=settings.DEBUG)` to keep Relay under your application's development flag. Install it on the FastAPI object before wrapping that object in Socket.IO or another ASGI wrapper.

## Included

- Code-generated OpenAPI endpoints grouped by tags, with inline request/response testing.
- Shared and per-endpoint bearer, Basic, API-key and explicit no-auth modes.
- Five color schemes, copy controls, response focus, and Relay/JSON endpoint exports.
- Manual endpoint status, defaulting to Done, with optional Git-shared status and inferred source attribution.
- A bundled standalone CLI for local OpenAPI backends and portable `.relay` reports.

Python 3.11+ is required. This is a local development tool: only loopback hosts/clients are accepted. Request execution invokes your real application middleware, dependencies and handlers. Tests can change your development data. Multipart upload, OAuth browser flows, remote/shared deployment and realtime team sync are outside v0.0.2.

The PyPI distribution is **relay-backend**; the Python import remains **relay_agent**. `relay-agent` on PyPI is an unrelated package.

[Documentation](https://github.com/nibir-ai/relay/blob/main/docs/README.md) · [Source](https://github.com/nibir-ai/relay) · [Issues](https://github.com/nibir-ai/relay/issues)

Licensed under Apache-2.0. Bundled React, Lucide and JetBrains Mono assets retain their respective licenses; see THIRD_PARTY_NOTICES.md.
