const { isIP } = require('node:net');
const { timingSafeEqual } = require('node:crypto');

const MAX_REQUEST = 1024 * 1024;
const MAX_RESPONSE = 2 * MAX_REQUEST;
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
class RelayError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function local(host) {
  host = String(host || '').replace(/^\[|\]$/g, '').toLowerCase();
  return host === 'localhost' || host === '::1' || host === '::ffff:127.0.0.1' ||
    (isIP(host) === 4 && host.startsWith('127.')) || /^::ffff:127\.\d+\.\d+\.\d+$/.test(host);
}
function pathOnly(path) {
  if (typeof path !== 'string' || path.length > 8192 || !path.startsWith('/') || path.startsWith('//') || /[\\?#\x00-\x1f]/.test(path))
    throw new RelayError(400, 'Use a relative route starting with /; query values belong in Parameters.');
  return path;
}
function targetOrigin(target) {
  let url;
  try { url = new URL(target); } catch { throw new RelayError(400, 'Target must be a loopback HTTP origin with a port.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !local(url.hostname) || !url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw new RelayError(400, 'Target must be a loopback HTTP origin with a port.');
  return url.origin;
}
function safeHeaders(headers = {}) {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) throw new RelayError(400, 'Headers must be an object.');
  const denied = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'upgrade', 'proxy-authorization', 'proxy-connection', 'accept-encoding', 'te', 'trailer']);
  const seen = new Set();
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (seen.has(lower)) throw new RelayError(400, `Duplicate header: ${name}`);
    seen.add(lower);
    if (denied.has(lower) || lower.startsWith('sec-')) throw new RelayError(400, `The runner manages the ${name} header.`);
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || typeof value !== 'string' || /[^\t\x20-\x7e]/.test(value)) throw new RelayError(400, 'Invalid header name or value.');
  }
  return headers;
}
function csrf(actual, expected) {
  if (typeof actual !== 'string') return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
module.exports = { MAX_REQUEST, MAX_RESPONSE, METHODS, RelayError, local, pathOnly, targetOrigin, safeHeaders, csrf, object };
