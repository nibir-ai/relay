# Offline API testing with a bundled local client

Relay is a local API testing client with its UI, fonts and branding bundled inside the `relay-backend` Python and npm packages. After installation, you can open `/relay/` on a supported local backend without loading a frontend from a CDN or signing into a Relay cloud service.

Offline here describes the local testing interface. Installing packages normally requires network access. Your application's own database, external services and authentication dependencies may also require a network connection. Optional Git and realtime team collaboration use network services.

## What runs locally

The backend generates an OpenAPI document. Relay turns it into grouped operations with request inputs and response inspection. Native requests run through the application's actual middleware, dependencies and handlers. The workspace and backend share the application's existing localhost port.

| Component | Network requirement |
| --- | --- |
| Bundled UI, fonts and themes | No CDN needed after installation |
| Requests to a local backend | Loopback connection |
| Package installation and upgrades | Registry access, or a separately obtained package artifact and dependencies |
| Your application's external dependencies | Depends on your application |
| Optional Git or realtime team status sharing | Access to the configured remote or service |

## Set up FastAPI

```sh
python -m pip install relay-backend
```

```python
from relay_backend import install_relay
install_relay(app)
```

Restart the backend and open `/relay/` on its existing port. For Node, install `relay-backend` from npm and connect Express, Fastify or Node HTTP using the [Node guide](../guides/node/). Node integrations need generated OpenAPI; undocumented request types cannot be inferred.

## Test authentication explicitly

Use shared authorization for common requests and a per-endpoint override when testing a different role. Relay supports bearer, Basic, header API keys and explicit no-auth. Your backend remains responsible for deciding what a credential can access. Relay does not grant administrator privileges.

Tokens and request drafts stay in browser session memory. A browser reload clears them. If an authentication server needs the internet, obtain a valid development token through your normal workflow before going offline; Relay does not supply an offline identity provider or an OAuth browser flow.

## Save and share a result

Export an endpoint as a portable `.relay` browser report or structured JSON. Exports include the retained response and may include sensitive request values; inspect them before handing them to someone else. See [exports and report handling](../guides/exports/).

Relay supports loopback development, not public or arbitrary remote targets. Multipart upload and YAML/external OpenAPI references are outside its supported scope. For a broader request client, evaluate the features you need before moving your workflow.

[Free Postman alternative](../postman-alternative/) · [Swagger UI alternative](../swagger-ui-alternative/) · [Troubleshooting](../guides/troubleshooting/)
