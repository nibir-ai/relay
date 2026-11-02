# Relay: API testing inside your backend

Relay is a **free, open-source API testing workspace** for FastAPI, Express, Fastify and Node HTTP. Install `relay-backend`, mount it on your application, and open `/relay/` on the backend's existing localhost port. Endpoints come from your generated OpenAPI document.

Use Relay as a Swagger UI alternative for everyday local testing, or as a focused Postman alternative when your work starts with your own backend's API contract. The interface, fonts and assets ship in the package. No separate frontend build, CDN or Relay cloud account is needed for local testing.

[Get started with FastAPI](guides/fastapi/) · [Connect a Node backend](guides/node/) · [Browse the documentation](guides/)

![Relay installation: install the package, mount it on FastAPI, open the backend's /relay path.](assets/fastapi-quickstart.png)

## Start with two lines

Install in the Python environment running your backend:

```sh
python -m pip install relay-backend
```

Add Relay after creating your FastAPI application:

```python
from relay_backend import install_relay
install_relay(app)
```

Restart your application and open `http://localhost:8000/relay/` if your backend runs on port 8000. Python 3.11+ is required. Use `enabled=settings.DEBUG` with your actual development settings to control the mount.

For JavaScript or TypeScript, install `npm install relay-backend`. Express uses `app.use(relay())` with an existing OpenAPI document; Fastify uses `app.register(relayFastify)` with its schema generator. Node 22.13+ is required. Follow the [complete Node integration guide](guides/node/) for middleware order and lifecycle setup.

## A workspace that follows your API

- **Generated endpoints:** browse operations grouped by OpenAPI tags, and search by method, path or summary.
- **Explicit authentication:** use shared or per-endpoint bearer tokens, Basic auth, header API keys or an explicit no-auth mode.
- **Request and response inspection:** edit inputs, execute real backend handlers, and inspect response bodies, headers and status codes.
- **Manual endpoint statuses:** keep progress beside the API; optional Git and authenticated realtime collaboration support team workflows.
- **Portable reports:** export a captured endpoint as a `.relay` browser report or structured JSON.
- **Bundled interface:** use local assets and five themes without fetching a frontend from a CDN.

## Find the right fit

| What you need | Start here |
| --- | --- |
| A Swagger UI alternative for local development | [Relay and Swagger UI](swagger-ui-alternative/) |
| A free Postman alternative for your own REST API | [Relay and Postman](postman-alternative/) |
| An offline API client that uses generated endpoints | [Offline API testing](offline-api-testing/) |
| A practical first request in FastAPI | [Test a FastAPI endpoint](fastapi-api-testing/) |
| Installation, authentication, exports or team help | [Documentation library](guides/) |

## Scope and availability

Relay is licensed under Apache-2.0. The Python and npm packages are named **relay-backend**; the Python import is **relay_backend**. The source repository is **nibir-ai/relay**. Relay is a local development tool, unrelated to Meta's GraphQL Relay or blockchain relayers.

Local testing accepts loopback clients and hosts. Requests run real middleware, dependencies and handlers and can modify development data. Multipart uploads, OAuth browser flows, public API hosting and Postman collection import are outside the supported workflow. A manual Done status is not an automated test result.

The published release is 0.0.5. Documentation may also describe explicitly marked 0.0.6 development work; check [release history](https://github.com/nibir-ai/relay/releases) before relying on unreleased features.

[Source on GitHub](https://github.com/nibir-ai/relay) · [Python package](https://pypi.org/project/relay-backend/) · [npm package](https://www.npmjs.com/package/relay-backend)
