# FastAPI integration

## Install and mount

![Install relay-backend, add two lines to your FastAPI entry point, and open /relay.](assets/fastapi-quickstart.png)

Install in your backend's Python environment:

```sh
python -m pip install relay-backend==0.0.2
```

In the file where your existing FastAPI instance is created:

```python
from relay_agent import install_relay
install_relay(app)
```

Start your backend normally. If its port is 8081, open `http://localhost:8081/relay/`. `/relay` redirects to the trailing-slash URL. Swagger `/docs` remains available.

The wheel includes UI, fonts and branding. No Node, source clone, CDN, frontend build, target URL or separate Relay process is required. Native integration reads `app.openapi()` directly and runs tests inside your host application.

![Relay's UI and request runner live inside your FastAPI application alongside its API routes. They use the same backend port.](assets/fastapi-native.png)

## Complete example

```python
# main.py
from fastapi import FastAPI
from relay_agent import install_relay

app = FastAPI(title="Example")

@app.get("/health", tags=["System"])
def health():
    return {"status": "ok"}

install_relay(app)
```

```sh
python -m uvicorn main:app --reload
```

Open `http://localhost:8000/relay/`, expand System → GET `/health`, then Execute request. Expect HTTP 200 and `{"status":"ok"}`.

A larger [runnable example](../examples/fastapi/main.py) covers routers, an application factory, nested/optional bodies, query arrays, empty responses and separate `user-token` / `admin-token` demo credentials. Save that single file as `main.py` beside your installed package and run the same Uvicorn command. It does not require cloning Relay or building the UI. Its routes only echo example data; the tokens illustrate authentication and are not a production security implementation.

## Development flag

```python
install_relay(app, enabled=settings.DEBUG)
```

Use your application's actual settings object. Relay does not infer production from arbitrary environment names. `enabled=False` returns `None` without mounting, modifying lifespan or creating Relay storage/resources. Otherwise the return value is the mounted sub-application, also available as `app.state.relay`.

## Factories and routers

```python
def create_app():
    app = FastAPI(lifespan=lifespan)
    app.include_router(api_router)
    install_relay(app, enabled=settings.DEBUG)
    return app
```

Mount once per app instance. Duplicate mounting and an existing `/relay` namespace produce explicit errors. `/relay` is fixed in v0.0.2. Routes can be included before or after mounting, before startup.

## Socket.IO and wrappers

```python
fastapi_app = FastAPI()
fastapi_app.include_router(api_router)
install_relay(fastapi_app, enabled=settings.DEBUG)
app = socketio.ASGIApp(sio, other_asgi_app=fastapi_app)
```

Install on FastAPI before wrapping it; the outer ASGI wrapper is not a FastAPI instance. Native tests invoke the FastAPI host, including its middleware, dependencies and handlers. Middleware exclusively outside that host is not tested by this internal execution path.

## Configuration reference

| Option | Default | Purpose |
|---|---|---|
| `enabled` | `True` | Your development flag. |
| `project` | Git repository detected upward from process cwd | Shared statuses and source attribution; pass `pathlib.Path`. |
| `data_dir` | `~/.relay` | Per-project/app local workspace storage. |
| `db_path` | Derived workspace SQLite path | Explicit path or `":memory:"` for tests. |
| `static_dir` | Bundled UI | Contributor override; unnecessary for consumers. |

```python
from pathlib import Path
install_relay(app, project=Path(__file__).resolve().parent)
```

Workspace identity uses resolved project/working directory and app title. Changing those can select a new workspace. Start from your project directory for consistent Git detection.

## Schema and lifespan

Custom/disabled public OpenAPI URLs and custom `app.openapi()` generators work. FastAPI caches OpenAPI; restart after route edits or clear `app.openapi_schema` for dynamic route updates. Sync re-reads your schema but cannot bypass the host's own cache.

The parent lifespan starts first and stops last. Relay's resources run inside it and preserve yielded host state. Keep existing startup/shutdown logic. Local mounted `root_path` prefixes are supported; loopback checks still apply.

## Install from a release file

Download the wheel from the [v0.0.2 release](https://github.com/nibir-ai/relay/releases/tag/v0.0.2), then install it with the same consumer integration:

```sh
python -m pip install /path/to/relay_backend-0.0.2-py3-none-any.whl
```

`relay-agent` on PyPI is an unrelated project; the distribution to use is `relay-backend`.
