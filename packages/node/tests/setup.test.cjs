const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {initialize,doctor}=require('../lib/setup.cjs');
function temp(t) { const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relay-setup-')); t.after(()=>fs.rmSync(dir,{recursive:true,force:true})); return dir; }

for (const esm of [false,true]) test('Express init preview, apply and repeat '+(esm?'ESM':'CJS'),t=> {
  const dir=temp(t),file=path.join(dir,esm?'main.mjs':'main.cjs');
  const text=(esm?"import express from 'express';":"const express = require('express');")+"\r\nconst app = express();\r\napp.use(express.json());\r\n";
  fs.writeFileSync(file,text); const output=[];
  assert.equal(initialize(dir,false,line=>output.push(line)),true);
  assert.equal(fs.readFileSync(file,'utf8'),text);
  assert.equal(initialize(dir,true,()=>{}),true);
  const edited=fs.readFileSync(file,'utf8');
  assert.ok(edited.indexOf('app.use(relay());')<edited.indexOf('app.use(express.json());'));
  assert.equal(edited.replaceAll('\r\n','').includes('\n'),false);
  assert.equal(initialize(dir,true,()=>{}),false);
  assert.equal(fs.readFileSync(file,'utf8'),edited);
});

test('Factories, same-line scopes, TS and Fastify require guidance without edits',t=> {
  const dir=temp(t),file=path.join(dir,'main.js');
  for (const text of ["import express from 'express';\nfunction factory() {\nconst app = express();\nreturn app;\n}","import express from 'express'; function factory() {\nconst app = express();\n}\n","import fastify from 'fastify';\nconst app = fastify();\n"]) {
    fs.writeFileSync(file,text); assert.equal(initialize(dir,true,()=>{}),false); assert.equal(fs.readFileSync(file,'utf8'),text);
  }
});

test('Doctor reads only schema/health and never echoes credentials',async t=> {
  const dir=temp(t), requests=[];
  const server=http.createServer((req,res)=> {
    requests.push([req.method,req.url]); res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify(req.url==='/schema'?{openapi:'3.1.0',info:{title:'private-title',version:'1'},paths:{}}:{status:'ok',mode:'local',csrf_token:'private-token'}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); t.after(()=>server.close());
  const result=await doctor(dir,`http://127.0.0.1:${server.address().port}`,'/schema');
  assert.deepEqual(requests,[['GET','/schema'],['GET','/relay/__relay/health']]);
  assert.doesNotMatch(JSON.stringify(result),/private/);
  assert.equal(result.checks.find(row=>row.name==='openapi').state,'ok');
  const bad=await doctor(dir,'http://user:secret@example.com:9000');
  assert.equal(bad.checks.at(-1).state,'error'); assert.doesNotMatch(JSON.stringify(bad),/secret/);
});
