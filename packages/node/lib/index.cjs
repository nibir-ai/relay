const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomBytes } = require('node:crypto');
const { MAX_REQUEST, MAX_RESPONSE, RelayError, local, csrf, object, targetOrigin, pathOnly } = require('./security.cjs');
const { normalize, hash } = require('./openapi.cjs');
const { request, execute } = require('./runner.cjs');
const { findProject, GitStatuses, StatusSync } = require('./git.cjs');
const { Workspace } = require('./workspace.cjs');
const VERSION = '0.0.3';
const STATIC = path.resolve(__dirname,'../static');
const escape = text => String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function readBody(req, supplied) {
  if (Number(req.headers['content-length']) > MAX_REQUEST) throw new RelayError(413,'Request exceeds the 1 MiB limit.');
  if (supplied !== undefined) {
    if (Buffer.byteLength(JSON.stringify(supplied))>MAX_REQUEST) throw new RelayError(413,'Request exceeds the 1 MiB limit.');
    return supplied;
  }
  const chunks=[];
  await new Promise((resolve,reject)=> {
    let size=0;
    const cleanup=()=> { req.off('data',data); req.off('end',end); req.off('error',error); req.off('aborted',aborted); };
    const error=value=> { cleanup(); reject(value); };
    const aborted=()=>error(new RelayError(400,'Request was interrupted.'));
    const end=()=> { cleanup(); resolve(); };
    const data=chunk=> {
      size+=chunk.length;
      if (size>MAX_REQUEST) { cleanup(); req.resume(); reject(new RelayError(413,'Request exceeds the 1 MiB limit.')); }
      else chunks.push(chunk);
    };
    req.on('data',data); req.once('end',end); req.once('error',error); req.once('aborted',aborted);
  });
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw new RelayError(422,'Relay expects a JSON request body.'); }
}
function relay(options = {}) {
  if (options.enabled === false) {
    const disabled = (req,res,next) => { if (next) next(); else { res.statusCode=404; res.end(); } };
    disabled.close=async()=>{}; return disabled;
  }
  const token=randomBytes(32).toString('base64url');
  const project=options.project === false ? null : findProject(options.project || process.cwd());
  if (options.project && !project) throw new Error('Relay project must be an existing Git repository.');
  const shared=project ? new GitStatuses(project) : null;
  const sync=options.syncStatus && shared ? new StatusSync(shared) : null;
  const target=options.target ? targetOrigin(options.target) : null;
  const specPath=pathOnly(options.specPath || '/openapi.json');
  let snapshot=null, rawSpec=null, workspace=null, started=false, closed=false;
  function workspaceFor(title) {
    if (!workspace) {
      const file=options.dataDir === false ? null : path.join(options.dataDir || path.join(os.homedir(),'.relay'),'node-'+hash([project || process.cwd(),title]).slice(0,16)+'.json');
      workspace=new Workspace(file,shared);
    }
    return workspace;
  }
  function state() {
    const value=workspace?.read() ?? {endpoints:{},activity:[]};
    value.status_sync=sync ? sync.info() : {enabled:false,state:'local',error:options.syncStatus && !shared ? 'No Git repository detected.' : null};
    return value;
  }
  async function handle(req,res,next, supplied) {
    const original=req.originalUrl || req.url || '/';
    const pathname=original.split('?')[0];
    if (pathname!=='/relay' && !pathname.startsWith('/relay/')) { if (next) return next(); res.statusCode=404; return res.end(); }
    const json=(value,status=200) => { res.statusCode=status; res.setHeader('Content-Type','application/json; charset=utf-8'); res.end(JSON.stringify(value)); };
    try {
      if (closed) throw new RelayError(503,'Relay is closed. Restart the backend.');
      let origin;
      try { origin=new URL((req.socket.encrypted?'https':'http')+'://'+req.headers.host).origin; } catch { throw new RelayError(403,'Invalid local host.'); }
      if (!local(req.socket.remoteAddress) || !local(new URL(origin).hostname) || Number(new URL(origin).port || (req.socket.encrypted?443:80))!==req.socket.localPort) throw new RelayError(403,"Relay is available only on the developer's local machine.");
      if (req.headers.origin && req.headers.origin!==origin || req.headers['sec-fetch-site'] && !['none','same-origin'].includes(req.headers['sec-fetch-site'])) throw new RelayError(403,'Untrusted browser origin.');
      res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('Referrer-Policy','no-referrer'); res.setHeader('X-Frame-Options','DENY');
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'");
      if (req.method!=='GET' && req.method!=='HEAD' && (req.headers.origin!==origin || !csrf(req.headers['x-relay-csrf'],token))) throw new RelayError(403,'Local session expired or CSRF check failed. Reload Relay.');
      if (!started) { started=true; sync?.start(); }
      const base=target || origin;
      const route=pathname.slice('/relay'.length);
      if (req.method==='GET' && route==='/__relay/health') return json({status:'ok',mode:'local',version:VERSION,csrf_token:token,base_url:base,spec_url:base+specPath});
      if (req.method==='GET' && route==='/__relay/sources/current') return json({snapshot,raw_spec:rawSpec});
      if (req.method==='GET' && route==='/__relay/workspace') return json(state());
      if (req.method==='POST' && route==='/__relay/sources/inspect') {
        await readBody(req,supplied ?? req.body);
        let raw;
        if (options.openapi) raw=typeof options.openapi==='function' ? await options.openapi() : options.openapi;
        else {
          const fetched=await request(new URL(base+specPath),'GET');
          if (fetched.status!==200 || fetched.truncated) throw new RelayError(502,'OpenAPI unavailable. Provide the generated schema with openapi, or expose /openapi.json.');
          try { raw=JSON.parse(fetched.body); } catch { throw new RelayError(422,'OpenAPI must be a JSON document.'); }
        }
        let encoded;
        try { encoded=JSON.stringify(raw); } catch { throw new RelayError(422,'OpenAPI must be a serializable JSON document.'); }
        if (!encoded || Buffer.byteLength(encoded)>MAX_RESPONSE) throw new RelayError(413,'OpenAPI exceeds the 2 MiB limit.');
        const normalized=normalize(JSON.parse(encoded));
        workspaceFor(normalized.title).sync(normalized); snapshot=normalized; rawSpec=JSON.parse(encoded);
        return json(snapshot);
      }
      if (req.method==='POST' && route==='/__relay/endpoints/update') {
        if (!workspace) throw new RelayError(409,'Sync the OpenAPI contract first.');
        await workspace.update(await readBody(req,supplied ?? req.body)); return json(state());
      }
      if (req.method==='POST' && route==='/__relay/execute') return json(await execute(base,await readBody(req,supplied ?? req.body)));
      if (!['GET','HEAD'].includes(req.method)) throw new RelayError(405,'Method not allowed.');
      if (route==='') { res.statusCode=307; res.setHeader('Location','/relay/'); return res.end(); }
      if (route==='/') {
        if (!fs.existsSync(path.join(STATIC,'index.html'))) throw new RelayError(503,'Relay UI is missing from this package. Reinstall relay-backend.');
        const html=fs.readFileSync(path.join(STATIC,'index.html'),'utf8').replace('<head>','<head><base href="/relay/">').replace('<title>Relay</title>',`<title>Relay${snapshot ? ' - '+escape(snapshot.title) : ''}</title>`).replace('relay-mark.svg?v=2','relay-mark.svg?v='+VERSION);
        res.setHeader('Content-Type','text/html; charset=utf-8'); return res.end(req.method==='HEAD'?undefined:html);
      }
      let decoded;
      try { decoded=decodeURIComponent(route); } catch { throw new RelayError(400,'Invalid asset path.'); }
      const file=path.resolve(STATIC,'.'+decoded);
      if (!file.startsWith(STATIC+path.sep) || decoded.includes('\\') || !fs.existsSync(file) || !fs.statSync(file).isFile()) throw new RelayError(404,'Not found.');
      const mime={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.html':'text/html','.png':'image/png'}[path.extname(file)] || 'application/octet-stream';
      res.setHeader('Content-Type',mime); if (req.method==='HEAD') return res.end();
      const stream=fs.createReadStream(file); stream.on('error',()=>res.destroy()); stream.pipe(res);
    } catch (error) {
      if (!res.headersSent) json({detail:error instanceof RelayError ? error.message : 'Relay could not complete this operation. Check the backend schema and local metadata.'},error instanceof RelayError ? error.status : 500);
      else res.destroy();
    }
  }
  async function middleware(req,res,next) { return handle(req,res,next); }
  middleware.handle=handle;
  middleware.close=async()=> { closed=true; await sync?.close(); };
  return middleware;
}
async function relayFastify(app, options = {}) {
  if (options.enabled===false) return;
  const openapi=options.openapi || (typeof app.swagger==='function' ? ()=>app.swagger() : undefined);
  const handler=relay({...options,openapi});
  app.addHook('onClose',async()=>handler.close());
  app.route({method:['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'],url:'/relay',schema:{hide:true},bodyLimit:MAX_REQUEST,handler:async(req,reply)=> { reply.hijack(); await handler.handle(req.raw,reply.raw,undefined,req.body); }});
  app.route({method:['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'],url:'/relay/*',schema:{hide:true},bodyLimit:MAX_REQUEST,handler:async(req,reply)=> { reply.hijack(); await handler.handle(req.raw,reply.raw,undefined,req.body); }});
}
exports.relay=relay;
exports.relayFastify=relayFastify;
exports.version=VERSION;
