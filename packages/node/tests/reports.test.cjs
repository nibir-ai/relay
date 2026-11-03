const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {prepareReport}=require('../lib/reports.cjs');
const limit=32*1024*1024;
const html='<!doctype html><meta name="relay-format" content="relay.endpoint.report.v1">';

test('rejects report growth between metadata inspection and reading',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'relay-report-growth-'));
  const file=path.join(root,'capture.relay');
  const originalRead=fs.readFileSync;
  const originalFstat=fs.fstatSync;
  let grew=false;
  fs.writeFileSync(file,html);
  try {
    // Grow the opened file after its metadata has been inspected.
    fs.fstatSync=(...args)=>{const result=originalFstat(...args);if(!grew){grew=true;fs.truncateSync(file,limit+1);}return result;};
    // Reproduce the equivalent race in the previous path-based reader.
    fs.readFileSync=(source,...args)=>{if(source===file && !grew){grew=true;fs.truncateSync(file,limit+1);}return originalRead(source,...args);};
    assert.throws(()=>prepareReport(file,path.join(root,'reports')),/32 MiB/);
    assert.equal(fs.existsSync(path.join(root,'reports')),false);
  } finally {
    fs.readFileSync=originalRead;fs.fstatSync=originalFstat;
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('reads the opened report even if its pathname is replaced',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'relay-report-replace-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const file=path.join(root,'capture.relay'),originalFstat=fs.fstatSync;
  fs.writeFileSync(file,html);
  let replaced=false;
  try {
    fs.fstatSync=(...args)=>{const info=originalFstat(...args);if(!replaced){replaced=true;fs.renameSync(file,file+'.old');fs.writeFileSync(file,'unrelated replacement');}return info;};
    const saved=prepareReport(file,path.join(root,'reports'));
    assert.equal(fs.readFileSync(saved,'utf8'),html);
  } finally {fs.fstatSync=originalFstat;}
});

test('closes the descriptor on invalid encoding and failed reads',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'relay-report-errors-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const file=path.join(root,'capture.relay');
  fs.writeFileSync(file,Buffer.from([255]));
  assert.throws(()=>prepareReport(file,path.join(root,'reports')),/encoding|encoded/i);
  const originalRead=fs.readSync,originalClose=fs.closeSync;
  let closed=false;
  try {
    fs.readSync=()=>{throw Error('Read failed.');};
    fs.closeSync=(...args)=>{closed=true;return originalClose(...args);};
    assert.throws(()=>prepareReport(file,path.join(root,'reports')),/Read failed/);
    assert.equal(closed,true);
  } finally {fs.readSync=originalRead;fs.closeSync=originalClose;}
});

test('accepts a report at the byte limit and rejects a larger report',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'relay-report-limit-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const file=path.join(root,'capture.relay');
  fs.writeFileSync(file,html);
  fs.truncateSync(file,limit);
  const result=prepareReport(file,path.join(root,'reports'));
  assert.equal(fs.statSync(result).size,limit);
  fs.truncateSync(file,limit+1);
  assert.throws(()=>prepareReport(file,path.join(root,'reports')),/32 MiB/);
});
