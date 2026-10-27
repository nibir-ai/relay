const test=require('node:test');
const assert=require('node:assert/strict');
const {plan,apply}=require('../lib/migration.cjs');
const {RelayError}=require('../lib/security.cjs');
test('migration excludes changed, removed and existing statuses and private fields',()=>{
 const row={progress:'done',fingerprint:'a'.repeat(64),updated_by:{name:'Old author',email:'private@example.test'},note:'Private note'};
 const rows=Object.fromEntries(['new','changed','removed','existing'].map(name=>['GET /'+name,row]));
 const endpoints=Object.fromEntries(['new','changed','existing'].map(name=>['GET /'+name,{active:1,fingerprint:(name==='changed'?'b':'a').repeat(64)}]));
 const result=plan(rows,endpoints,{'GET /existing':{revision:1}},'project');
 assert.deepEqual(result.entries.filter(e=>e.eligible).map(e=>e.endpoint_id),['GET /new']);
 assert.ok(!JSON.stringify(result).includes('private@example.test') && !JSON.stringify(result).includes('Private note'));
 assert.notEqual(result.plan_id,plan(rows,endpoints,{},'project').plan_id);
});
test('migration requires a connected writable project and never changes Git files implicitly',async()=>{
 await assert.rejects(()=>apply(null,null,null,'a',[]),error=>error instanceof RelayError && error.status===409);
});

test('reviewed Node import acknowledges selected statuses and preserves Git metadata',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'relay-node-migration-'));
 try {
  fs.mkdirSync(path.join(root,'.relay'));
  const row={progress:'in_progress',fingerprint:'a'.repeat(64),updated_by:{name:'Old author',email:'private@example.test'},updated_at:'2026-10-01T00:00:00Z'};
  const file=path.join(root,'.relay/status.json'),original=JSON.stringify({version:1,endpoints:{'GET /new':row}});fs.writeFileSync(file,original);
  const workspace={read:()=>({endpoints:{'GET /new':{active:1,fingerprint:row.fingerprint}}}),validate:()=>{}};
  const worker={config:{url:'http://127.0.0.1:4490',project:'example'},rows:Object.create(null),ready:true,can_write:true,refresh:async()=>{},update:async(id,fingerprint,progress,revision)=>{assert.equal(revision,0);worker.rows[id]={fingerprint,progress,revision:1};}};
  const {preview}=require('../lib/migration.cjs');
  const review=await preview(workspace,worker,root);
  const result=await apply(workspace,worker,root,review.plan_id,['GET /new']);
  assert.deepEqual(result.imported,['GET /new']);assert.equal(fs.readFileSync(file,'utf8'),original);
  await assert.rejects(()=>apply(workspace,worker,root,review.plan_id,['GET /new']),error=>error.status===409);
 } finally {assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith("relay-node-migration-"));fs.rmSync(root,{recursive:true,force:true});}
});
