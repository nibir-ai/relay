const http = require('node:http');
const https = require('node:https');
const { performance } = require('node:perf_hooks');
const { MAX_REQUEST, MAX_RESPONSE, METHODS, RelayError, pathOnly, safeHeaders, object } = require('./security.cjs');

function request(url, method, headers = {}, body, limit = MAX_RESPONSE) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const transport = url.protocol === 'https:' ? https : http;
    const outgoing = transport.request(url, { method, headers, agent: false }, (response) => {
      const chunks = []; let bytes = 0; let finished = false;
      function finish(truncated) {
        if (finished) return;
        finished = true;
        clearTimeout(deadline);
        const result = { status: response.statusCode, reason: response.statusMessage || '',
          headers: Object.fromEntries(Object.entries(response.headers).filter(([key]) => key !== 'set-cookie').map(([key,value]) => [key, Array.isArray(value) ? value.join(', ') : String(value ?? '')])),
          body: Buffer.concat(chunks).toString('utf8'), bytes, duration_ms: Math.round((performance.now() - started) * 10) / 10,
          truncated, content_type: String(response.headers['content-type'] || ''), url: url.href, method };
        resolve(result);
      }
      response.on('data', (chunk) => {
        const remaining = limit - bytes;
        chunks.push(chunk.subarray(0, remaining)); bytes += Math.min(remaining, chunk.length);
        if (chunk.length > remaining) { finish(true); response.destroy(); }
      });
      response.on('end', () => finish(false));
      response.on('error', () => { if (!finished) { clearTimeout(deadline); reject(new RelayError(502, 'The backend response was interrupted. Try again.')); } });
    });
    const deadline = setTimeout(() => outgoing.destroy(new Error('timeout')), 20000);
    outgoing.on('error', () => { clearTimeout(deadline); reject(new RelayError(502, 'Could not reach the backend. Check its connection and logs.')); });
    if (body !== undefined) outgoing.write(body);
    outgoing.end();
  });
}
async function execute(origin, payload) {
  if (!object(payload) || !METHODS.has(payload.method)) throw new RelayError(422, 'Choose a supported HTTP method.');
  pathOnly(payload.path);
  const url = new URL(origin + payload.path);
  let decoded;
  try { decoded = decodeURIComponent(url.pathname); } catch { throw new RelayError(400, 'Invalid encoded request path.'); }
  if (url.origin !== origin || decoded === '/relay' || decoded.startsWith('/relay/') || decoded.includes('\\')) throw new RelayError(400, 'Relay routes cannot be executed.');
  const headers = { ...safeHeaders(payload.headers), 'accept-encoding': 'identity' };
  const query = payload.query ?? {};
  if (!object(query)) throw new RelayError(422, 'Query values must be an object.');
  for (const [name, value] of Object.entries(query)) {
    const values = Array.isArray(value) ? value : [value];
    if (values.some(v => typeof v !== 'string')) throw new RelayError(422, 'Query values must be strings or arrays of strings.');
    for (const item of values) url.searchParams.append(name, item);
  }
  const mode = payload.body_mode ?? 'none';
  if (!['none', 'json', 'text', 'form'].includes(mode) || (payload.body !== undefined && typeof payload.body !== 'string')) throw new RelayError(422, 'Invalid request body mode or content.');
  let body;
  if (mode !== 'none') {
    body = payload.body ?? '';
    if (Buffer.byteLength(body) > MAX_REQUEST) throw new RelayError(413, 'Request exceeds the 1 MiB limit.');
    if (mode === 'json') {
      try { JSON.parse(body); } catch { throw new RelayError(422, 'Request body is not valid JSON.'); }
    }
    if (!Object.keys(headers).some(k => k.toLowerCase() === 'content-type')) headers['content-type'] = {json:'application/json',text:'text/plain',form:'application/x-www-form-urlencoded'}[mode];
    if (['GET', 'HEAD'].includes(payload.method)) throw new RelayError(400, 'GET and HEAD requests cannot include a body.');
  }
  return request(url, payload.method, headers, body);
}
module.exports = { request, execute };
