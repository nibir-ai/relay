const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {Workspace}=require('../lib/workspace.cjs');
const {normalize}=require('../lib/openapi.cjs');
const {GitStatuses,StatusSync}=require('../lib/git.cjs');
const {prepareReport}=require('../lib/reports.cjs');
function temp(t) { const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relay-node-')); t.after(()=>fs.rmSync(dir,{recursive:true,force:true})); return dir; }
function spec() { return {openapi:'3.1.0',info:{title:'Portal',version:'1'},paths:{'/test':{get:{responses:{200:{description:'OK'}}}}}}; }
test('Restart persistence, contract changes and invalid metadata',async t=> {
  const dir=temp(t),file=path.join(dir,'workspace.json'),snapshot=normalize(spec());
  const first=new Workspace(file); first.sync(snapshot);
  await first.update({endpoint_id:'GET /test',fingerprint:snapshot.endpoints[0].fingerprint,progress:'in_progress'});
  const restarted=new Workspace(file); assert.equal(restarted.read().endpoints['GET /test'].progress,'in_progress');
  await restarted.update({endpoint_id:'GET /test',fingerprint:snapshot.endpoints[0].fingerprint,progress:'done'});
  const changed=spec(); changed.paths['/test'].get.responses[404]={description:'Missing'};
  restarted.sync(normalize(changed)); assert.equal(restarted.read().endpoints['GET /test'].progress,'needs_fixing');
  restarted.sync({...snapshot,endpoints:[]}); assert.equal(restarted.read().endpoints['GET /test'].active,0);
  fs.writeFileSync(file,'broken'); assert.throws(()=>new Workspace(file),/invalid/);
});
test('OpenAPI references, parameter overrides and deterministic contract fingerprints',()=> {
  const raw=spec(); raw.components={schemas:{Tree:{type:'object',properties:{children:{type:'array',items:{$ref:'#/components/schemas/Tree'}}}}}};
  raw.paths['/test'].parameters=[{in:'query',name:'limit',schema:{type:'integer'}}];
  raw.paths['/test'].get.parameters=[{in:'query',name:'limit',schema:{type:'integer',default:5}}];
  raw.paths['/test'].get.responses[200].content={'application/json':{schema:{$ref:'#/components/schemas/Tree'}}};
  const normalized=normalize(raw); assert.equal(normalized.endpoints[0].parameters.length,1); assert.equal(normalized.endpoints[0].parameters[0].schema.default,5);
  assert.match(JSON.stringify(normalized),/Recursive schema/);
  assert.equal(normalize(structuredClone(raw)).endpoints[0].fingerprint,normalized.endpoints[0].fingerprint);
  raw.paths['/test'].get.parameters=[{$ref:'#/components/missing'}]; assert.throws(()=>normalize(raw),/Unresolved/);
  assert.throws(()=>normalize({openapi:'2.0'}),/OpenAPI/);
});
test('Independent Git peers merge concurrent edits without touching the code index',async t=> {
  const dir=temp(t),remote=path.join(dir,'remote.git');
  const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']}).trim();
  git(dir,'init','--bare',remote);
  const peers=['alice','bob'].map(name=> { const root=path.join(dir,name);fs.mkdirSync(root);git(root,'init');git(root,'config','user.name',name);git(root,'config','user.email',name+'@example.com');git(root,'remote','add','origin',remote);fs.writeFileSync(path.join(root,'code.txt'),'staged code');git(root,'add','code.txt');return new GitStatuses(root); });
  await Promise.all(peers.map((peer,i)=>peer.update('GET /'+i,'a'.repeat(64),i?'needs_fixing':'done')));
  const workers=peers.map(peer=>new StatusSync(peer,25)); t.after(async()=> {await Promise.all(workers.map(worker=>worker.close()));});
  await Promise.all(workers.map(worker=>worker.sync())); await Promise.all(workers.map(worker=>worker.sync()));
  for (const peer of peers) { assert.equal(Object.keys(peer.read()).length,2);assert.equal(peer.read()['GET /0'].updated_by.name,'alice');assert.equal(git(peer.root,'diff','--cached','--name-only'),'code.txt');assert.equal(fs.readFileSync(path.join(peer.root,'code.txt'),'utf8'),'staged code'); }
  assert.equal(git(remote,'ls-tree','--name-only','relay-status'),'status.json');
  const data=git(remote,'show','relay-status:status.json'); assert.doesNotMatch(data,/staged code|Authorization|request_body/);
  await peers[0].update('GET /background','b'.repeat(64),'in_progress'); workers.forEach(worker=>worker.start());
  const deadline=Date.now()+5000;
  while (!peers[1].read()['GET /background'] && Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(peers[1].read()['GET /background'].progress,'in_progress');
  await Promise.all(workers.map(worker=>worker.close()));
  assert.equal(workers[0].pending,null);
});
test('Malformed Git statuses are rejected and supported reports remain portable',async t=> {
  const dir=temp(t),shared=new GitStatuses(dir); fs.mkdirSync(path.join(dir,'.relay')); fs.writeFileSync(shared.file,'{"version":1,"endpoints":{"bad":{}}}');
  assert.throws(()=>shared.read(),/Resolve conflicts/);
  const file=path.join(dir,'test.relay'),html='<!doctype html><meta name="relay-format" content="relay.endpoint.report.v1"><title>GET /health</title>';
  fs.writeFileSync(file,html); const result=prepareReport(file,path.join(dir,'cache')); assert.equal(fs.readFileSync(result,'utf8'),html);
  fs.writeFileSync(file,'unrelated HTML'); assert.throws(()=>prepareReport(file,path.join(dir,'cache')),/supported/);
});
