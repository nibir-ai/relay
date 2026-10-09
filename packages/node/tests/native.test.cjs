const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const Fastify = require('fastify');
const swagger = require('@fastify/swagger');
const { relay, relayFastify } = require('../lib/index.cjs');

const spec = {openapi:'3.1.0',info:{title:'Node Portal',version:'1'},paths:{
  '/health':{get:{tags:['System'],responses:{200:{description:'OK'}}}},
  '/items/{id}':{get:{tags:['Items'],parameters:[{in:'path',name:'id',required:true,schema:{type:'integer'}},{in:'query',name:'tag',schema:{type:'array',items:{type:'string'}}}],responses:{200:{description:'OK'}}}},
  '/admin':{get:{security:[{bearer:[]}],responses:{200:{description:'OK'},401:{description:'Unauthorized'}}}},
  '/body':{post:{requestBody:{required:true,content:{'application/json':{schema:{type:'object',properties:{name:{type:'string'}},required:['name']}}}},responses:{200:{description:'OK'},422:{description:'Invalid'}}}},
  '/empty':{delete:{responses:{204:{description:'No content'}}}},
},components:{securitySchemes:{bearer:{type:'http',scheme:'bearer'}}}};
async function start(app, tester, t) {
  const server=http.createServer(app); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=> { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); await tester?.close(); });
  return 'http://127.0.0.1:'+server.address().port;
}
async function session(origin) {
  const health=await (await fetch(origin+'/relay/__relay/health')).json();
  return {origin,health,post:async(route,body={})=>fetch(origin+'/relay/__relay/'+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'X-Relay-CSRF':health.csrf_token},body:JSON.stringify(body)})};
}
test('Express: bundled UI, schema, middleware, authentication, inputs, responses and statuses', async t=> {
  const app=express(), tester=relay({openapi:spec,dataDir:false,project:false});
  app.use(tester); app.use(express.json()); app.use((req,res,next)=> { res.setHeader('X-Host-Middleware','active'); next(); });
  app.get('/health',(req,res)=>res.json({ok:true,cookie:req.headers.cookie ?? null}));
  app.get('/items/:id',(req,res)=>res.json({id:Number(req.params.id),tags:req.query.tag}));
  app.get('/admin',(req,res)=>req.headers.authorization==='Bearer admin-token'?res.json({role:'admin'}):res.status(401).json({detail:'Unauthorized'}));
  app.post('/body',(req,res)=>typeof req.body?.name==='string'?res.json(req.body):res.status(422).json({detail:'Name required'}));
  app.delete('/empty',(req,res)=>res.status(204).end());
  const origin=await start(app,tester,t), s=await session(origin);
  assert.equal((await fetch(origin+'/relay')).url,origin+'/relay/');
  const page=await (await fetch(origin+'/relay/')).text(); assert.match(page,/<base href="\/relay\/">/);
  for (const [,asset] of page.matchAll(/(?:src|href)="([^"]+)"/g)) assert.equal((await fetch(new URL(asset,origin+'/relay/'))).status,200,asset);
  const identity=await (await fetch(origin+'/relay/brand/identity.html')).text();
  for (const [,asset] of identity.matchAll(/(?:src|href)="([^"]+)"/g)) assert.equal((await fetch(new URL(asset,origin+'/relay/brand/identity.html'))).status,200,asset);
  const imported=await (await s.post('sources/inspect')).json(); assert.equal(imported.title,'Node Portal'); assert.equal(imported.endpoints.length,5);
  assert.match(await (await fetch(origin+'/relay/')).text(),/<title>Relay - Node Portal<\/title>/);
  const run=async(method,path,values={})=> (await s.post('execute',{method,path,...values})).json();
  const result=await run('GET','/health'); assert.equal(result.status,200); assert.equal(result.headers['x-host-middleware'],'active'); assert.equal(JSON.parse(result.body).cookie,null);
  assert.deepEqual(JSON.parse((await run('GET','/items/7',{query:{tag:['a b','c&d']}})).body),{id:7,tags:['a b','c&d']});
  assert.equal((await run('GET','/admin')).status,401); assert.equal((await run('GET','/admin',{headers:{Authorization:'Bearer admin-token'}})).status,200);
  assert.equal((await run('POST','/body',{body_mode:'json',body:'{}'})).status,422);
  assert.equal((await run('POST','/body',{body_mode:'json',body:'{"name":"test","nested":{"id":7}}'})).status,200);
  const empty=await run('DELETE','/empty'); assert.equal(empty.status,204); assert.equal(empty.body,''); assert.equal(empty.bytes,0);
  const endpoint=imported.endpoints[0];
  const workspace=await (await fetch(origin+'/relay/__relay/workspace')).json(); assert.ok(Object.values(workspace.endpoints).every(row=>row.progress==='done'));
  const updated=await (await s.post('endpoints/update',{endpoint_id:endpoint.id,fingerprint:endpoint.fingerprint,progress:'needs_fixing'})).json(); assert.equal(updated.endpoints[endpoint.id].progress,'needs_fixing');
  assert.equal((await s.post('endpoints/update',{endpoint_id:endpoint.id,fingerprint:'f'.repeat(64),progress:'done'})).status,409);
});
test('Express schema endpoint fallback, disabled mode and preserved last good schema', async t=> {
  const app=express(), tester=relay({project:false,dataDir:false}); app.use(tester);
  let raw=spec; app.get('/openapi.json',(req,res)=>res.json(raw));
  const origin=await start(app,tester,t), s=await session(origin);
  assert.equal((await s.post('sources/inspect')).status,200);
  raw={openapi:'2',paths:{}}; assert.equal((await s.post('sources/inspect')).status,422);
  assert.equal((await (await fetch(origin+'/relay/__relay/sources/current')).json()).snapshot.title,'Node Portal');
  const disabled=express(), off=relay({enabled:false,project:'does-not-exist'}); disabled.use(off);
  const other=await start(disabled,off,t); assert.equal((await fetch(other+'/relay/')).status,404);
});
test('Fastify: generated Swagger schema, real hooks, auth and native bundled assets', async t=> {
  const app=Fastify({forceCloseConnections:true}); t.after(()=>app.close());
  await app.register(swagger,{openapi:{info:{title:'Fastify Portal',version:'1'}}});
  app.addHook('onRequest',async(req,reply)=> { if (req.url==='/private' && req.headers.authorization!=='Bearer user-token') return reply.code(401).send({detail:'Unauthorized'}); });
  app.get('/private',{schema:{tags:['User'],response:{200:{type:'object',properties:{ok:{type:'boolean'}}}}}},async()=>({ok:true}));
  await app.register(relayFastify,{project:false,dataDir:false});
  await app.listen({port:0,host:'127.0.0.1'});
  const origin='http://127.0.0.1:'+app.server.address().port, s=await session(origin);
  const snapshot=await (await s.post('sources/inspect')).json(); assert.equal(snapshot.title,'Fastify Portal'); assert.equal(snapshot.endpoints.length,1); assert.equal(snapshot.endpoints[0].path,'/private');
  const rejected=await (await s.post('execute',{method:'GET',path:'/private'})).json(); assert.equal(rejected.status,401);
  const accepted=await (await s.post('execute',{method:'GET',path:'/private',headers:{Authorization:'Bearer user-token'}})).json(); assert.equal(accepted.status,200); assert.deepEqual(JSON.parse(accepted.body),{ok:true});
  assert.equal((await fetch(origin+'/relay/brand/relay-symbol.svg')).status,200);
});
test('Node HTTP adapter rejects forged hosts/origins, unsafe headers, recursion and body overflow', async t=> {
  const tester=relay({openapi:spec,dataDir:false,project:false}), origin=await start(tester,tester,t), s=await session(origin);
  assert.equal(await new Promise((resolve,reject)=> { const req=http.get(origin+'/relay/__relay/health',{headers:{Host:'evil.example:'+new URL(origin).port}},res=> { res.resume(); resolve(res.statusCode); }); req.on('error',reject); }),403);
  assert.equal((await fetch(origin+'/relay/__relay/health',{headers:{Origin:'https://evil.example'}})).status,403);
  assert.equal((await fetch(origin+'/relay/__relay/execute',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
  for (const route of ['/relay/__relay/execute','/%72elay/__relay/execute','/x/../relay/__relay/execute','//evil.example/path','/health?unsafe=1','/x\\bad']) assert.equal((await s.post('execute',{method:'GET',path:route})).status,400,route);
  for (const headers of [{Host:'evil.example'},{Authorization:'a',authorization:'b'},{'X-Test':'bad\r\nvalue'},{'sec-fetch-site':'none'}]) assert.equal((await s.post('execute',{method:'GET',path:'/health',headers})).status,400);
  assert.equal((await s.post('execute',{method:'POST',path:'/body',body_mode:'json',body:'not-json'})).status,422);
  assert.equal((await s.post('execute',{method:'POST',path:'/body',body:'x'.repeat(1024*1024+1)})).status,413);
  assert.equal(await new Promise((resolve,reject)=> {
    const req=http.request(origin+'/relay/__relay/execute',{method:'POST',headers:{Origin:origin,'X-Relay-CSRF':s.health.csrf_token,'Content-Type':'application/json','Transfer-Encoding':'chunked'}},res=> { res.resume(); resolve(res.statusCode); });
    req.on('error',reject); req.write('x'.repeat(1024*1024)); req.end('xx');
  }),413);

});
test('Response runner bounds streaming, preserves redirects and isolates cookies', async t=> {
  const app=express(), tester=relay({openapi:spec,project:false,dataDir:false}); app.use(tester);
  app.get('/large',(req,res)=> { res.end('x'.repeat(3*1024*1024)); });
  app.get('/redirect',(req,res)=> { res.cookie('session','private'); res.redirect('https://example.com'); });
  app.get('/cookie',(req,res)=>res.json({cookie:req.headers.cookie ?? null}));
  const origin=await start(app,tester,t), s=await session(origin);
  const large=await (await s.post('execute',{method:'GET',path:'/large'})).json(); assert.equal(large.truncated,true); assert.equal(large.bytes,2*1024*1024);
  const redirect=await (await s.post('execute',{method:'GET',path:'/redirect'})).json(); assert.equal(redirect.status,302); assert.equal(redirect.headers['set-cookie'],undefined);
  const cookie=await (await s.post('execute',{method:'GET',path:'/cookie'})).json(); assert.deepEqual(JSON.parse(cookie.body),{cookie:null});
});
module.exports={spec};
