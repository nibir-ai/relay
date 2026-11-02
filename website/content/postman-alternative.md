# A free Postman alternative for local backend APIs

Relay is a free, open-source Postman alternative for a specific workflow: testing your own local REST API from its generated OpenAPI contract. Instead of maintaining a separate request collection, install `relay-backend` and open a testing workspace at `/relay/` on the backend's existing localhost port.

The local workspace needs no Relay cloud account or subscription. Relay is Apache-2.0 licensed. Optional team collaboration requires separate configuration; a self-hosted service still has hosting costs.

## Should you use Relay or Postman?

| Your workflow | Fit |
| --- | --- |
| Test a local FastAPI, Express or Fastify app from generated OpenAPI | Relay is designed for this |
| Keep user/admin authentication overrides beside endpoints | Relay supports shared and per-endpoint auth |
| Share one captured response and request | Relay exports `.relay` and JSON reports |
| Work with arbitrary remote APIs and existing Postman collections | Keep a general-purpose API client; Relay is loopback-only and has no Postman collection importer |
| Depend on collection runners, pre-request scripts or broad protocol support | Evaluate those requirements separately; Relay is not a drop-in replacement |
| Need public interactive documentation | Consider a documentation tool; Relay's workspace is for local development |

Postman offers desktop and web applications. Its web workflow can use agents for local requests. See [Postman's official installation and agent documentation](https://learning.postman.com/docs/getting-started/installation/install-app/) for current options. This page does not claim that Postman always requires payment or that Relay implements every Postman feature.

## Start testing without recreating a collection

For FastAPI, install the Python package in the application's environment:

```sh
python -m pip install relay-backend
```

Then mount the workspace after constructing `app`:

```python
from relay_backend import install_relay
install_relay(app)
```

Restart your backend, open `/relay/` on its port, select a generated endpoint, enter the request inputs and execute. For JavaScript or TypeScript, use `npm install relay-backend` and follow the [Express and Fastify integration guide](../guides/node/).

## Move the workflow, not a collection file

Relay does not import Postman collection files. To evaluate it on an existing project:

1. Make sure the backend generates an accurate OpenAPI document, including request bodies and parameters.
2. Mount Relay using the appropriate framework adapter.
3. Find an endpoint using its method, path, summary or OpenAPI tag.
4. Enter a shared bearer token or choose an endpoint-specific authentication mode.
5. Execute a development request, inspect its response and export a report if needed.

This works best when your code-generated API contract is the source of truth. If your current workflow relies on hand-written requests to unrelated remote services, Relay's scope will be too narrow.

## Local data and sharing

The UI and assets ship with the package. Authentication tokens and drafts remain in browser session memory and clear on reload. Exports can contain request bodies, parameters and captured responses, so review them before sharing. Native execution calls real application handlers and can change development data.

Endpoint statuses are manual progress signals. They do not prove security, correctness or test coverage. Some documentation describes 0.0.6 development features; those are not part of published 0.0.5.

## Next steps

[Try a complete FastAPI request](../fastapi-api-testing/) · [Understand offline testing](../offline-api-testing/) · [Read the export guide](../guides/exports/) · [View the source](https://github.com/nibir-ai/relay)
