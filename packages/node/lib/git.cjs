const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { RelayError, MAX_RESPONSE, object } = require('./security.cjs');
const { canonical } = require('./openapi.cjs');
const PROGRESS = new Set(['done','in_progress','needs_fixing','not_started']);
function findProject(directory = process.cwd()) {
  let root = path.resolve(directory);
  for (;;) {
    if (fs.existsSync(path.join(root,'.git'))) return root;
    const parent = path.dirname(root);
    if (parent === root) return null;
    root = parent;
  }
}
function validate(data) {
  if (!object(data) || data.version !== 1 || !object(data.endpoints)) throw new RelayError(409,'Invalid status metadata. Resolve conflicts before retrying.');
  return Object.fromEntries(Object.entries(data.endpoints).map(([key,row]) => {
    if (key.length > 8192 || !object(row) || !PROGRESS.has(row.progress) || !/^[a-f0-9]{64}$/.test(row.fingerprint || '') ||
        !object(row.updated_by) || typeof row.updated_by.name !== 'string' || typeof row.updated_by.email !== 'string' ||
        typeof row.updated_at !== 'string' || !/(Z|[+-]\d\d:\d\d)$/.test(row.updated_at) || !Number.isFinite(Date.parse(row.updated_at)))
      throw new RelayError(409,'Invalid status metadata. Resolve conflicts before retrying.');
    return [key,{fingerprint:row.fingerprint,progress:row.progress,updated_by:{name:row.updated_by.name,email:row.updated_by.email},updated_at:row.updated_at}];
  }));
}
function atomic(file, value) {
  const encoded = JSON.stringify(value,null,2)+'\n';
  if (Buffer.byteLength(encoded) > MAX_RESPONSE) throw new RelayError(413,'Status metadata exceeds the 2 MiB limit.');
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temporary = path.join(path.dirname(file),'status-'+randomUUID()+'.tmp');
  try { fs.writeFileSync(temporary,encoded,{encoding:'utf8',flag:'wx'}); fs.renameSync(temporary,file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
class GitStatuses {
  constructor(root) { this.root = root; this.file = path.join(root,'.relay/status.json'); }
  async git(args, input) {
    try {
      const child = execFile('git',['-C',this.root,...args],{encoding:'utf8',timeout:15000,maxBuffer:MAX_RESPONSE + 65536,windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'}});
      const result = new Promise((resolve,reject) => {
        let stdout = '', stderr = '';
        child.stdout.on('data',chunk => { stdout += chunk; });
        child.stderr.on('data',chunk => { stderr += chunk; });
        child.on('error',reject);
        child.on('close',code => code === 0 ? resolve(stdout.trim()) : reject(new Error('Git access failed')));
      });
      child.stdin.on('error',()=>{});
      child.stdin.end(input ?? '');
      return await result;
    } catch { throw new RelayError(409,'Team status sync failed. Check Git remote access and identity; local changes are retained.'); }
  }
  read() {
    if (!fs.existsSync(this.file)) return {};
    try {
      if (fs.statSync(this.file).size > MAX_RESPONSE) throw new Error();
      return validate(JSON.parse(fs.readFileSync(this.file,'utf8')));
    } catch { throw new RelayError(409,'Cannot read .relay/status.json. Resolve conflicts before changing status.'); }
  }
  locked(action) {
    fs.mkdirSync(path.dirname(this.file),{recursive:true});
    const lock = path.join(path.dirname(this.file),'status.lock');
    let fd;
    try { fd = fs.openSync(lock,'wx'); } catch { throw new RelayError(409,'Another Relay process is updating statuses. Retry shortly.'); }
    try { return action(); } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
  }
  async update(id, fingerprint, progress) {
    let name, email;
    try { [name,email] = await Promise.all([this.git(['config','user.name']),this.git(['config','user.email'])]); }
    catch { throw new RelayError(409,'Configure Git user.name and user.email before changing a shared status.'); }
    if (!name || !email) throw new RelayError(409,'Configure Git user.name and user.email before changing a shared status.');
    this.locked(() => {
      const rows = this.read();
      rows[id] = {fingerprint,progress,updated_by:{name,email},updated_at:new Date().toISOString()};
      atomic(this.file,{version:1,endpoints:rows});
    });
  }
}
class StatusSync {
  constructor(shared, interval = 10000) {
    this.shared=shared; this.interval=interval; this.state='pending'; this.error=null; this.last_synced_at=null; this.closed=false; this.pending=null;
  }
  info() { return {enabled:true,state:this.state,error:this.error,last_synced_at:this.last_synced_at}; }
  sync() {
    if (this.closed) return Promise.resolve();
    if (this.pending) return this.pending;
    this.pending = this.once().finally(() => { this.pending=null; });
    return this.pending;
  }
  async once() {
    this.state='syncing';
    const git = this.shared.git.bind(this.shared), branch='refs/heads/relay-status';
    try {
      for (let attempt=0; attempt<3; attempt++) {
        const refs = await git(['ls-remote','--heads','origin',branch]);
        let commit = null, remote = {};
        if (refs) {
          commit=refs.split(/\s/)[0];
          if (!/^[a-f0-9]{40,64}$/.test(commit)) throw new Error();
          await git(['fetch','--no-tags','--no-write-fetch-head','origin',branch]);
          if (Number(await git(['cat-file','-s',commit+':status.json'])) > MAX_RESPONSE) throw new Error();
          remote=validate(JSON.parse(await git(['show',commit+':status.json'])));
        }
        if (this.closed) return;
        const merged = this.shared.locked(() => {
          const local=this.shared.read(), rows={...remote};
          for (const [id,row] of Object.entries(local)) {
            const previous=rows[id];
            if (!previous || Date.parse(row.updated_at)>Date.parse(previous.updated_at) ||
                (Date.parse(row.updated_at)===Date.parse(previous.updated_at) && canonical(row)>canonical(previous))) rows[id]=row;
          }
          if (canonical(rows)!==canonical(local)) atomic(this.shared.file,{version:1,endpoints:rows});
          return rows;
        });
        if (canonical(merged)!==canonical(remote)) {
          const blob=await git(['hash-object','-w','--stdin'],JSON.stringify({version:1,endpoints:merged}));
          const tree=await git(['mktree','-z'],`100644 blob ${blob}\tstatus.json\0`);
          const next=await git(['commit-tree',tree,...(commit?['-p',commit]:[]),'-m','Update Relay endpoint statuses']);
          if (this.closed) return;
          try { await git(['push','--porcelain','origin',next+':'+branch]); } catch { continue; }
        }
        this.state='synced'; this.error=null; this.last_synced_at=new Date().toISOString(); return;
      }
      throw new Error();
    } catch { this.state='error'; this.error='Team status sync failed. Check Git remote access; local changes are retained.'; }
  }
  start() { void this.sync(); this.timer=setInterval(()=>void this.sync(),this.interval); this.timer.unref(); }
  async close() { this.closed=true; clearInterval(this.timer); if (this.pending) await this.pending; }
}
module.exports = { findProject, GitStatuses, StatusSync, PROGRESS, atomic, validate };
