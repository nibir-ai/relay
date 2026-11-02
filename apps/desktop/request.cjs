const http = require('node:http');
const https = require('node:https');
const { performance } = require('node:perf_hooks');
const LIMIT = 2 * 1024 * 1024;
const methods = new Set(['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS']);
function validate(input) {
  if (!input || typeof input !== 'object' || !/^[a-zA-Z0-9_-]{1,64}$/.test(input.id || '')) throw Error('Invalid request id.');
  if (!methods.has(input.method)) throw Error('Choose a supported HTTP method.');
  if (typeof input.url !== 'string' || input.url.length > 8192) throw Error('Enter a valid HTTP or HTTPS URL.');
  let url; try { url = new URL(input.url); } catch { throw Error('Enter a complete URL, including http:// or https://.'); }
  if (!['http:','https:'].includes(url.protocol)) throw Error('Only HTTP and HTTPS requests are supported.');
  if (url.username || url.password) throw Error('Put credentials in Auth or request headers, not the URL.');
  if (typeof input.body !== 'string' || Buffer.byteLength(input.body) > LIMIT) throw Error('Request body exceeds 2 MiB.');
  if (['GET','HEAD'].includes(input.method) && input.body) throw Error('GET and HEAD bodies are not supported in this preview.');
  if (!input.headers || Array.isArray(input.headers) || typeof input.headers !== 'object' || Object.keys(input.headers).length > 100) throw Error('Headers must be a JSON object with at most 100 entries.');
  const headers = Object.create(null); let bytes = 0;
  for (const [name,value] of Object.entries(input.headers)) {
    if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(name) || /^(?:(?:host|content-length|transfer-encoding|connection|upgrade|expect)$|proxy-|sec-)/i.test(name)) throw Error('A header name is invalid or reserved by the request transport.');
    if (typeof value !== 'string' || /[\r\n\0]/.test(value)) throw Error('Header values must be strings without line breaks.');
    try { http.validateHeaderValue(name,value); } catch { throw Error('Header values contain unsupported characters.'); }
    bytes += Buffer.byteLength(name + value); if(bytes > 32768) throw Error('Headers exceed 32 KiB.');
    if (Object.hasOwn(headers,name.toLowerCase())) throw Error('Remove duplicate header names.');
    headers[name.toLowerCase()] = value;
  }
  url.hash = '';
  return {id:input.id,method:input.method,url,body:input.body,headers};
}
function execute(input, { signal, timeoutMs = 30000 } = {}) {
  const request = validate(input);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw Error('Invalid timeout.');
  return new Promise((resolve,reject) => {
    if(signal?.aborted) { reject(Error('Request cancelled.')); return; }
    const start = performance.now(); let settled = false, req, timer;
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort',cancel); };
    const finish = (error,value) => { if(settled) return; settled = true;cleanup();error ? reject(error) : resolve(value); };
    const cancel = () => { finish(Error('Request cancelled.'));req?.destroy(); };
    signal?.addEventListener('abort',cancel,{once:true});
    timer=setTimeout(()=>{finish(Error('Request timed out after '+timeoutMs+' ms.'));req?.destroy();},timeoutMs);
    req=(request.url.protocol==='https:' ? https : http).request(request.url,{method:request.method,headers:request.headers,agent:false,rejectUnauthorized:true},response=>{
      let chunks=[],received=0,captured=0;
      const done = truncated => {
        const bytes=Buffer.concat(chunks);chunks=[];
        finish(null,{status:response.statusCode,reason:response.statusMessage || '',headers:response.headers,body:new TextDecoder().decode(bytes),bytes:received,captured_bytes:bytes.length,truncated,duration_ms:Math.round((performance.now()-start)*10)/10,content_type:response.headers['content-type'] || ''});
      };
      response.on('data',chunk=>{
        received+=chunk.length;const keep=chunk.subarray(0,Math.max(0,LIMIT-captured));chunks.push(keep);captured+=keep.length;
        if(received>LIMIT) { done(true);response.destroy();req.destroy(); }
      });
      response.on('end',()=>done(false));
      response.on('aborted',()=>finish(Error('The server closed the response before it completed.')));
      response.on('error',()=>finish(Error('The response could not be read.')));
    });
    req.on('error',error=>{
      const code=error.code || '';
      const message=code==='ENOTFOUND' ? 'Host could not be resolved.' : code==='ECONNREFUSED' ? 'Connection refused. Check the address and server.' : /CERT|SSL|TLS|VERIFY/.test(code) ? 'TLS certificate validation failed. Check the server certificate.' : 'Network request failed. Check the server and connection.';
      finish(Error(message));
    });
    if(request.body) req.write(request.body);
    req.end();
  });
}
module.exports={execute,validate,LIMIT};
