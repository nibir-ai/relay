const fs = require('node:fs');
const { RelayError, MAX_RESPONSE, object } = require('./security.cjs');
const { PROGRESS, atomic } = require('./git.cjs');
class Workspace {
  constructor(file, shared) {
    this.file=file; this.shared=shared; this.rows={}; this.activity=[];
    if (file && fs.existsSync(file)) {
      try {
        if (fs.statSync(file).size>MAX_RESPONSE) throw new Error();
        const data=JSON.parse(fs.readFileSync(file,'utf8'));
        if (data.version!==1 || !object(data.endpoints) || !Array.isArray(data.activity)) throw new Error();
        for (const row of Object.values(data.endpoints)) if (!object(row) || !PROGRESS.has(row.progress) || typeof row.fingerprint!=='string') throw new Error();
        this.rows=data.endpoints; this.activity=data.activity.slice(-100);
      } catch { throw new RelayError(409,'Local Relay workspace is invalid. Restore or move its metadata file before retrying.'); }
    }
  }
  save() { if (this.file) atomic(this.file,{version:1,endpoints:this.rows,activity:this.activity.slice(-100)}); }
  event(id,kind,value) { this.activity.push({id:(this.activity.at(-1)?.id ?? 0)+1,endpoint_id:id,kind,value,created_at:new Date().toISOString()}); this.activity=this.activity.slice(-100); }
  sync(snapshot) {
    const present=new Set();
    for (const endpoint of snapshot.endpoints) {
      present.add(endpoint.id);
      const prior=this.rows[endpoint.id];
      if (!prior) {
        this.rows[endpoint.id]={endpoint_id:endpoint.id,fingerprint:endpoint.fingerprint,progress:'done',note:'',active:1,updated_at:new Date().toISOString()};
        this.event(endpoint.id,'discovered','done');
      } else if (prior.fingerprint!==endpoint.fingerprint || !prior.active) {
        if (prior.progress==='done') prior.progress='needs_fixing';
        prior.fingerprint=endpoint.fingerprint; prior.active=1; prior.updated_at=new Date().toISOString(); this.event(endpoint.id,'contract_changed',prior.progress);
      }
    }
    for (const [id,row] of Object.entries(this.rows)) if (!present.has(id) && row.active) { row.active=0; this.event(id,'removed',row.progress); }
    this.save();
  }
  async update(payload) {
    if (!object(payload) || typeof payload.endpoint_id!=='string' || typeof payload.fingerprint!=='string' || !/^[a-f0-9]{64}$/.test(payload.fingerprint) ||
        (payload.progress!==undefined && !PROGRESS.has(payload.progress)) || (payload.note!==undefined && (typeof payload.note!=='string' || payload.note.length>4000))) throw new RelayError(422,'Invalid endpoint status update.');
    const row=this.rows[payload.endpoint_id];
    if (!row?.active) throw new RelayError(404,'Endpoint is no longer active. Sync and try again.');
    if (row.fingerprint!==payload.fingerprint) throw new RelayError(409,'The contract changed. Sync before updating progress.');
    if (this.shared && payload.progress!==undefined) await this.shared.update(payload.endpoint_id,payload.fingerprint,payload.progress);
    if (payload.progress!==undefined && payload.progress!==row.progress) { row.progress=payload.progress; this.event(payload.endpoint_id,'progress_changed',row.progress); }
    if (payload.note!==undefined) row.note=payload.note;
    row.updated_at=new Date().toISOString(); this.save();
  }
  read() {
    const endpoints=structuredClone(this.rows);
    if (this.shared) for (const [id,saved] of Object.entries(this.shared.read())) {
      if (!endpoints[id]) continue;
      const row=endpoints[id]; row.contract_changed=row.fingerprint!==saved.fingerprint;
      row.progress=row.contract_changed && saved.progress==='done'?'needs_fixing':saved.progress;
      row.updated_by=saved.updated_by; row.updated_at=saved.updated_at;
    }
    return {endpoints,activity:[...this.activity].reverse()};
  }
}
module.exports = { Workspace };
