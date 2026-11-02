import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.mjs';

test('old Relay URLs permanently redirect to the matching documentation', () => {
  for (const [path, expected] of [
    ['/relay', '/'], ['/relay/', '/'],
    ['/relay/guides/fastapi/?from=readme', '/guides/fastapi/?from=readme'],
    ['/relay/guides/node', '/guides/node/'],
    ['/relay/guides/documentation-overview/', '/guides/overview/'],
    ['/relay/guides/node-quickstart/', '/guides/node/'],
    ['/relay/guides/fastapi-example/', '/guides/fastapi/'],
  ]) {
    const response = worker.fetch(new Request('https://nibir.online' + path));
    assert.equal(response.status, 301);
    assert.equal(response.headers.get('location'), 'https://relay-backend.pages.dev' + expected);
  }
});

test('unrelated paths and hosts cannot redirect', () => {
  for (const url of ['https://nibir.online/', 'https://nibir.online/relaying', 'https://example.com/relay/']) {
    assert.equal(worker.fetch(new Request(url)).status, 404);
  }
});

test('a double slash in the old path cannot change destination origin', () => {
  const response = worker.fetch(new Request('https://nibir.online/relay//example.com/'));
  assert.equal(new URL(response.headers.get('location')).origin, 'https://relay-backend.pages.dev');
});
