const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {Workspace}=require('../lib/workspace.cjs');
const {GitStatuses}=require('../lib/git.cjs');
const {RealtimeSync}=require('../lib/realtime.cjs');
const {readBounded}=require('../lib/file-input.cjs');

function growDuringInspection(file,limit,run) {
  const stat=fs.statSync,fstat=fs.fstatSync;
  let grew=false;
  const inspect=(fn,args)=>{const value=fn(...args);if(!grew){grew=true;fs.truncateSync(file,limit+1);}return value;};
  fs.statSync=(...args)=>inspect(stat,args);
  fs.fstatSync=(...args)=>inspect(fstat,args);
  try {return run();} finally {fs.statSync=stat;fs.fstatSync=fstat;}
}

test('workspace rejects metadata that grows beyond its bound before parsing',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'relay-workspace-bound-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const file=path.join(root,'workspace.json');
  fs.writeFileSync(file,JSON.stringify({version:1,endpoints:{},activity:[]}));
  // JSON whitespace remains valid after growth, so parser errors cannot enforce a limit.
  const buffer=Buffer.alloc(16*1024*1024+1,32);
  Buffer.from(fs.readFileSync(file)).copy(buffer);
  fs.writeFileSync(file,buffer.subarray(0,100));
  const originalTruncate=fs.truncateSync;
  fs.truncateSync=(target,size)=>{if(target===file)fs.writeFileSync(file,buffer);else originalTruncate(target,size);};
  try {assert.throws(()=>growDuringInspection(file,16*1024*1024,()=>new Workspace(file)),/invalid/);}
  finally {fs.truncateSync=originalTruncate;}
});

test('Git status rejects growing input without accepting a valid JSON prefix',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'relay-git-bound-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'.relay'));
  const shared=new GitStatuses(root);
  const buffer=Buffer.alloc(2*1024*1024+1,32);
  Buffer.from('{"version":1,"endpoints":{}}').copy(buffer);
  fs.writeFileSync(shared.file,buffer.subarray(0,100));
  const truncate=fs.truncateSync;
  fs.truncateSync=(file,size)=>file===shared.file?fs.writeFileSync(file,buffer):truncate(file,size);
  try {assert.throws(()=>growDuringInspection(shared.file,2*1024*1024,()=>shared.read()),/Cannot read/);}
  finally {fs.truncateSync=truncate;}
});

test('oversized realtime cache falls back offline without restoring its revision',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'relay-cache-bound-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const file=path.join(root,'cache.json'),buffer=Buffer.alloc(16*1024*1024+1,32);
  Buffer.from('{"protocol":1,"revision":5,"statuses":[]}').copy(buffer);
  fs.writeFileSync(file,buffer.subarray(0,100));
  const truncate=fs.truncateSync;
  fs.truncateSync=(target,size)=>target===file?fs.writeFileSync(file,buffer):truncate(target,size);
  let bridge;
  try {bridge=growDuringInspection(file,16*1024*1024,()=>new RealtimeSync({url:'http://127.0.0.1:4490',project:'example',token:'fixture-only'},file));}
  finally {fs.truncateSync=truncate;}
  try {assert.equal(bridge.state,'offline');assert.equal(bridge.revision,0);}
  finally {await bridge.close();}
});

test('bounded metadata reads preserve opened identity and close after errors',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'relay-file-input-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const file=path.join(root,'data.json');fs.writeFileSync(file,'{"value":1}');
  const fstat=fs.fstatSync;
  try {
    fs.fstatSync=(...args)=>{const info=fstat(...args);fs.renameSync(file,file+'.old');fs.writeFileSync(file,'replacement');return info;};
    assert.equal(readBounded(file,11),'{"value":1}');
  } finally {fs.fstatSync=fstat;}
  const read=fs.readSync,close=fs.closeSync;let closed=false;
  try {
    fs.readSync=()=>{throw Error('Read failed');};
    fs.closeSync=(...args)=>{closed=true;return close(...args);};
    assert.throws(()=>readBounded(file,100),/Read failed/);assert.equal(closed,true);
  } finally {fs.readSync=read;fs.closeSync=close;}
  fs.writeFileSync(file,'1234');assert.equal(readBounded(file,4),'1234');
  assert.throws(()=>readBounded(file,3),/limit/);
});
