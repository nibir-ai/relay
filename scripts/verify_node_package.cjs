const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const version=JSON.parse(fs.readFileSync(path.join(root,'packages/node/package.json'),'utf8')).version;
const archive=path.join(root,'dist',`relay-backend-${version}.tgz`);
const publicIndex=process.argv.includes('--public-index');
if(process.argv.slice(2).some(arg=>arg!=='--public-index')) throw new Error('Usage: node scripts/verify_node_package.cjs [--public-index]');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'relay-consumer-'));
const npm=path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const npmBinary=fs.existsSync(npm)?process.execPath:'npm';
const npmPrefix=fs.existsSync(npm)?[npm]:[];
function run(binary,args) {
  const result=spawnSync(binary,args,{cwd:directory,encoding:'utf8',timeout:180000,windowsHide:true});
  if(result.status!==0) throw new Error((result.stdout||'')+(result.stderr||'')+String(result.error||''));
  return result.stdout;
}
async function main() {
  if(!publicIndex) assert.ok(fs.existsSync(archive),'Build the npm tarball first.');
  fs.writeFileSync(path.join(directory,'package.json'),JSON.stringify({name:'relay-clean-consumer',private:true}));
  run(npmBinary,[...npmPrefix,'install','--ignore-scripts','--no-audit','--no-fund','--registry=https://registry.npmjs.org',publicIndex?'relay-backend':archive,'express@5','typescript@5','@types/node@22','@types/express@5']);
  assert.ok(!fs.existsSync(path.join(directory,'node_modules/fastify')),'Express consumer must not require Fastify.');
  const installed=JSON.parse(fs.readFileSync(path.join(directory,'node_modules/relay-backend/package.json'),'utf8'));
  assert.equal(installed.version,version); assert.equal(Object.keys(installed.dependencies||{}).length,0);
  const packageDirectory=path.join(directory,'node_modules/relay-backend');
  for(const asset of ['relay-mark.svg','brand/relay-symbol.svg','brand/relay-wordmark.svg']) {
    assert.equal(fs.readFileSync(path.join(packageDirectory,'static',asset),'utf8').replaceAll('\r\n','\n'),fs.readFileSync(path.join(root,'apps/web/public',asset),'utf8').replaceAll('\r\n','\n'));
  }
  assert.ok(fs.existsSync(path.join(packageDirectory,'README.md')));
  console.log(publicIndex?'Unpinned npm registry installation resolved the expected release.':'Packed distribution installed successfully.');
  fs.writeFileSync(path.join(directory,'consumer.cjs'),`
const assert=require('node:assert/strict');
const express=require('express');
const {relay,version}=require('relay-backend');
(async()=> {
 const esm=await import('relay-backend'); assert.equal(esm.relay,relay); assert.equal(esm.version,version);
 const app=express(),tester=relay({project:false,dataDir:false,openapi:{openapi:'3.1.0',info:{title:'Clean Consumer',version:'1'},paths:{'/health':{get:{responses:{200:{description:'OK'}}}}}}});
 app.use(tester); app.get('/health',(req,res)=>res.json({ok:true}));
 const server=await new Promise(resolve=> { const value=app.listen(0,'127.0.0.1',()=>resolve(value)); });
 try {
 const origin='http://127.0.0.1:'+server.address().port;
 const html=await (await fetch(origin+'/relay/')).text(); assert.match(html,/<base href="\\/relay\\/">/);
 for (const [,asset] of html.matchAll(/(?:src|href)="([^"]+)"/g)) assert.equal((await fetch(new URL(asset,origin+'/relay/'))).status,200);
 const health=await (await fetch(origin+'/relay/__relay/health')).json();
 const post=async(route,body={})=>fetch(origin+'/relay/__relay/'+route,{method:'POST',headers:{Origin:origin,'X-Relay-CSRF':health.csrf_token,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await (await post('sources/inspect')).json()).title,'Clean Consumer');
 const result=await (await post('execute',{method:'GET',path:'/health'})).json();assert.equal(result.status,200);assert.deepEqual(JSON.parse(result.body),{ok:true});
 } finally { server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await tester.close(); }
 console.log('Clean installed CJS/ESM consumer, bundled assets and request execution passed.');
})().catch(error=> {console.error(error);process.exitCode=1;});
`);
  console.log(run(process.execPath,['consumer.cjs']).trim());
  const types="import express = require('express');\nimport {relay,relayFastify} from 'relay-backend';\nexpress().use(relay({enabled:true}));\nvoid relayFastify;\n";
  fs.writeFileSync(path.join(directory,'consumer.cts'),types);
  fs.writeFileSync(path.join(directory,'consumer.mts'),types.replace("import express = require('express');","import express from 'express';"));
  run(process.execPath,['node_modules/typescript/bin/tsc','--noEmit','--strict','--module','NodeNext','--target','ES2022','--esModuleInterop','consumer.cts','consumer.mts']);
  assert.match(run(process.execPath,['node_modules/relay-backend/lib/cli.cjs','--version']),new RegExp(version.replaceAll('.','\\.')));
  assert.match(run(process.execPath,['node_modules/relay-backend/lib/cli.cjs','--help']),/npx relay-backend/);
  console.log('Clean installed TypeScript consumers and CLI passed; no Python or build scripts ran.');
}
main().catch(error=> {console.error(error);process.exitCode=1;}).finally(()=> {
  const resolved=fs.realpathSync(directory),tempRoot=fs.realpathSync(os.tmpdir());
  if(path.dirname(resolved)!==tempRoot || !path.basename(resolved).startsWith('relay-consumer-')) throw new Error('Unexpected temporary directory.');
  fs.rmSync(resolved,{recursive:true,force:true});
});
