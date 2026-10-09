const { createHash } = require('node:crypto');
const { METHODS, RelayError, pathOnly, object } = require('./security.cjs');
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(', ') + ']';
  if (object(value)) return '{' + Object.keys(value).sort().map(key => canonical(key) + ': ' + canonical(value[key])).join(', ') + '}';
  const encoded = JSON.stringify(value);
  return encoded?.replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) ?? 'null';
}
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
function normalize(spec) {
  const fail = message => { throw new RelayError(422, message); };
  if (!object(spec) || !/^3\.[01]\./.test(spec.openapi || '')) fail('Relay supports OpenAPI 3.0 and 3.1 JSON documents.');
  if (!object(spec.info) || !object(spec.paths)) fail('OpenAPI needs an info object and a paths object.');
  if (typeof (spec.info.title ?? 'API') !== 'string' || typeof (spec.info.version ?? '') !== 'string') fail('OpenAPI title and version must be strings.');
  function resolve(value, stack = [], depth = 0) {
    if (depth > 40) return {'x-relay-warning':'Schema is too deeply nested; inspect the raw spec.'};
    if (Array.isArray(value)) return value.map(v => resolve(v, stack, depth + 1));
    if (!object(value)) return value;
    if (Object.hasOwn(value, '$ref')) {
      const ref = value.$ref;
      if (typeof ref !== 'string' || !ref.startsWith('#/')) return {$ref:ref,'x-relay-warning':'External references are not fetched.'};
      if (stack.includes(ref)) return {$ref:ref,'x-relay-warning':'Recursive schema; edit JSON directly.'};
      let target = spec;
      for (const key of ref.slice(2).split('/').map(k => k.replace(/~1/g,'/').replace(/~0/g,'~'))) {
        if (!object(target) && !Array.isArray(target) || !Object.hasOwn(target, key)) fail('Unresolved internal reference: ' + ref);
        target = target[key];
      }
      const siblings = Object.fromEntries(Object.entries(value).filter(([key]) => key !== '$ref').map(([key,v]) => [key,resolve(v,stack,depth + 1)]));
      return { ...resolve(target, [...stack,ref], depth + 1), ...siblings };
    }
    return Object.fromEntries(Object.entries(value).map(([key,v]) => [key, resolve(v,stack,depth + 1)]));
  }
  function schema(value) {
    if (typeof value === 'boolean') return;
    if (!object(value)) fail('Schema must be an object or a boolean.');
    if ('properties' in value) {
      if (!object(value.properties)) fail('Schema properties must be an object.');
      Object.values(value.properties).forEach(schema);
    }
    for (const key of ['required','enum','anyOf','allOf','oneOf']) if (key in value && !Array.isArray(value[key])) fail('Invalid schema ' + key + ' definition.');
    for (const key of ['anyOf','allOf','oneOf']) (value[key] ?? []).forEach(schema);
    if ('items' in value) schema(value.items);
  }
  function content(value) {
    if (!('content' in value)) return;
    if (!object(value.content)) fail('OpenAPI content must be an object.');
    for (const media of Object.values(value.content)) {
      if (!object(media)) fail('Invalid media type definition.');
      if ('schema' in media) schema(media.schema);
    }
  }
  const endpoints = [];
  for (const [path, raw] of Object.entries(spec.paths)) {
    pathOnly(path);
    if (path === '/relay' || path.startsWith('/relay/')) continue;
    const item = resolve(raw);
    if (!object(item)) fail('Invalid path definition: ' + path);
    for (const [method, operation] of Object.entries(item)) {
      if (!METHODS.has(method.toUpperCase())) continue;
      if (!object(operation) || !object(operation.responses)) fail('Missing responses for ' + method + ' ' + path);
      for (const key of ['summary','description']) if (key in operation && typeof operation[key] !== 'string') fail(key + ' must be text.');
      if ('tags' in operation && (!Array.isArray(operation.tags) || operation.tags.some(tag => typeof tag !== 'string'))) fail('Tags must be a list of strings.');
      for (const response of Object.values(operation.responses)) {
        if (!object(response) || typeof (response.description ?? '') !== 'string') fail('Invalid response definition.');
        content(response);
      }
      const requestBody = operation.requestBody ?? null;
      if (requestBody !== null && (!object(requestBody) || !object(requestBody.content))) fail('Request body needs a content object.');
      if (requestBody) content(requestBody);
      const security = operation.security ?? spec.security ?? [];
      if (!Array.isArray(security) || security.some(group => !object(group))) fail('Invalid security requirements.');
      const params = new Map();
      for (const owner of [item,operation]) {
        if ('parameters' in owner && !Array.isArray(owner.parameters)) fail('Parameters must be a list.');
        for (const param of owner.parameters ?? []) {
          if (!object(param) || typeof param.name !== 'string' || !['path','query','header','cookie'].includes(param.in)) fail('Invalid parameter definition.');
          if ('schema' in param) schema(param.schema);
          params.set(param.name + '\0' + param.in,param);
        }
      }
      const contract = {method:method.toUpperCase(),path,parameters:[...params].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([,v]) => v),requestBody,responses:operation.responses,security};
      endpoints.push({...contract,id:contract.method+' '+path,fingerprint:hash(contract),summary:operation.summary ?? path,description:operation.description ?? '',tags:operation.tags?.length ? operation.tags : ['General'],deprecated:Boolean(operation.deprecated)});
    }
  }
  return { title:spec.info.title ?? 'API',version:spec.info.version ?? '',endpoints,hash:hash(spec),securitySchemes:resolve(spec.components?.securitySchemes ?? {}) };
}
module.exports = { normalize, canonical, hash };
