# Test a FastAPI endpoint in your browser with Relay

Relay adds an API testing interface to your FastAPI application at `/relay/`. It discovers endpoints from FastAPI's generated OpenAPI document and executes through your application's real middleware, dependencies and handlers.

This walkthrough creates one endpoint, runs it locally and checks the returned JSON. Python 3.11+ is required.

## 1. Install the package

Use the same Python environment that runs your application:

```sh
python -m pip install relay-backend
```

## 2. Create a small application

Save this example as `main.py`:

```python
from fastapi import FastAPI
from relay_backend import install_relay

app = FastAPI(title="Inventory API")

@app.get("/items/{item_id}", tags=["Items"])
def get_item(item_id: int, include_stock: bool = False):
    item = {"id": item_id, "name": "Notebook"}
    if include_stock:
        item["stock"] = 12
    return item

install_relay(app)
```

For an existing application, add only the import and `install_relay(app)` call where the FastAPI object is created. Do not create a second app just to add Relay. Use a development flag such as `enabled=settings.DEBUG` with your actual settings object. Install on the FastAPI object before wrapping it with another ASGI application.

## 3. Start the backend

```sh
python -m uvicorn main:app --reload
```

Open `http://localhost:8000/relay/`. Expand **Items** and select `GET /items/{item_id}`. Set `item_id` to `7`, set `include_stock` to `true`, then execute the request.

For this example, the expected status is `200` and the JSON response is:

```json
{"id": 7, "name": "Notebook", "stock": 12}
```

This is the expected output of the example handler, not a claim about your own application's response. Change `item_id` to a non-integer to inspect FastAPI's validation error.

## 4. Test protected endpoints

On your own protected routes, use **Authorize** for a shared bearer token or **Auth** beside an endpoint for a role-specific override. Submit authorization explicitly. Basic, header API key and None modes are available in advanced settings. The backend enforces permissions; receiving a 401 or 403 may be the correct result for the credential you chose.

## 5. Inspect and hand off the result

Inspect the body, status, headers and captured request metadata. Copy the response or export `.relay`/JSON if you need a record. Exports can contain sensitive data. Manual endpoint statuses describe team progress and are not changed automatically by a successful request.

## If the workspace does not load

Confirm the package is installed in the environment running Uvicorn, restart the backend, and use its actual port. Mount Relay on the application object that Uvicorn serves. Custom schemas, application factories, proxy prefixes and lifespan configuration are covered in the [FastAPI integration guide](../guides/fastapi/).

[Full testing guide](../guides/testing/) · [Swagger UI alternative](../swagger-ui-alternative/) · [Installation troubleshooting](../guides/troubleshooting/)
