# Relay for Node

API testing on your backend's existing `/relay` route. The UI, themes and assets are bundled. No Python, repository clone, frontend build or CDN is required.

```sh
npm install relay-backend
```

## Express

```js
import express from 'express';
import { relay } from 'relay-backend';
import { openapi } from './generated-openapi.js';

const app = express();
const tester = relay({ openapi, enabled: process.env.NODE_ENV !== 'production' });
app.use(tester); // Before body parsers and catch-all handlers.
app.use(express.json());
// Register your API routes as usual.
const server = app.listen(3000);
server.on('close', () => void tester.close());
```

Open `http://localhost:3000/relay`. If your backend already serves `/openapi.json`, omit `openapi`. A provider such as `openapi: () => generatedDocument` supports regenerated schemas.

## Fastify

```js
import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import { relayFastify } from 'relay-backend';

const app = Fastify();
await app.register(swagger, {
  openapi: { info: { title: 'My Portal', version: '1' } }
});
// Register your API routes with their schemas here.
await app.register(relayFastify, {
  enabled: process.env.NODE_ENV !== 'production'
});
await app.listen({ port: 3000 });
```

Fastify reads `app.swagger()` automatically. With another generator, pass its document using `openapi`. Application hooks still apply, so configure your authentication hooks to allow the local `/relay` tooling routes if they otherwise protect every path.

## JavaScript and TypeScript

ES modules and CommonJS are supported, with bundled TypeScript declarations:

```js
const { relay, relayFastify } = require('relay-backend');
```

Node 22.13 or newer is required. Express, Fastify and Node HTTP are the tested adapters. Route definitions and request schemas come from OpenAPI 3.0/3.1 JSON; Relay cannot infer TypeScript interfaces or undocumented Express routes. Other frameworks and runtimes need their own adapter verification.

## Standalone

For a local backend that already exposes OpenAPI:

```sh
npx relay-backend --target http://127.0.0.1:3000
```

This opens a separate tester at `http://127.0.0.1:4477/relay/`. Native mounting uses the backend's existing port instead. A saved report opens with `npx relay-backend open endpoint.relay`.

## Team statuses

Endpoints start as Done. Status changes are manual. Set `syncStatus: true` to share them automatically through your existing Git `origin` using a separate `relay-status` branch. Git identity attributes each status update; native Node handler authors are not currently inferred. Request bodies, tokens and responses are never stored in that branch. Keep Git credentials configured on each developer's machine. See the [team guide](https://github.com/nibir-ai/relay/blob/main/docs/GIT.md).

Relay accepts loopback hosts and clients only and requires same-origin CSRF protection for tester actions. API execution runs real backend handlers. Multipart uploads, external/YAML references, browser OAuth and public hosting are outside this version's scope.

Detailed configuration: [Node integration guide](https://github.com/nibir-ai/relay/blob/main/docs/NODE.md). Apache-2.0; bundled third-party licenses are included.
