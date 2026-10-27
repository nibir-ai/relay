const fs = require('node:fs');
const { RelayError, object } = require('./security.cjs');
const { PROGRESS, atomic } = require('./git.cjs');
const { hash } = require('./openapi.cjs');
const SECTIONS={parameters:'Parameters',requestBody:'Request body',responses:'Responses',security:'Authentication'};
const sections=endpoint=>Object.fromEntries(Object.keys(SECTIONS).map(key=>[key,hash(endpoint[key] ?? null)]));
const MAX_WORKSPACE=16*1024*1024;
class Workspace {
  constructor(file, shared) {
    this.file=file; this.shared=shared; this.rows={}; this.activity=[];
    if (file && fs.existsSync(file)) {
      try {
        if (fs.statSync(file).size>MAX_WORKSPACE) throw new Error();
        const data=JSON.parse(fs.readFileSync(file,'utf8'));
        if (data.version!==1 || !object(data.endpoints) || !Array.isArray(data.activity)) throw new Error();
        for (const row of Object.values(data.endpoints)) if (!object(row) || !PROGRESS.has(row.progress) || typeof row.fingerprint!=='string') throw new Error();
        this.rows=data.endpoints; this.activity=data.activity.slice(-100);
      } catch { throw new RelayError(409,'Local Relay workspace is invalid. Restore or move its metadata file before retrying.'); }
    }
  }
  save() {
    if (!this.file) return;
    const data={version:1,endpoints:this.rows,activity:this.activity.slice(-100)};
    if (Buffer.byteLength(JSON.stringify(data))>MAX_WORKSPACE) throw new RelayError(413,'Local workspace exceeds the 16 MiB metadata limit. Reduce notes or use a separate workspace.');
    atomic(this.file,data,MAX_WORKSPACE);
  }
  event(id,kind,value) { this.activity.push({id:(this.activity.at(-1)?.id ?? 0)+1,endpoint_id:id,kind,value,created_at:new Date().toISOString()}); this.activity=this.activity.slice(-100); }
  sync(snapshot) {
    const previousRows=structuredClone(this.rows),previousActivity=[...this.activity];
    const present=new Set();
    for (const endpoint of snapshot.endpoints) {
      present.add(endpoint.id);
      const prior=this.rows[endpoint.id];
      const digest=sections(endpoint);
      if (!prior) {
        this.rows[endpoint.id]={endpoint_id:endpoint.id,fingerprint:endpoint.fingerprint,progress:'done',note:'',active:1,updated_at:new Date().toISOString(),contract_sections:digest,contract_changed:false,changed_sections:[]};
        this.event(endpoint.id,'discovered','done');
      } else if (prior.fingerprint!==endpoint.fingerprint || !prior.active) {
        prior.changed_sections=!prior.active ? ['Restored from source'] : !prior.contract_sections ? ['Contract (previous details unavailable)'] : Object.entries(SECTIONS).filter(([key])=>prior.contract_sections[key]!==digest[key]).map(([,label])=>label);
        if (!prior.changed_sections.length) prior.changed_sections=['Contract'];
        prior.contract_sections=digest; prior.contract_changed=true;
        if (prior.progress==='done') prior.progress='needs_fixing';
        prior.fingerprint=endpoint.fingerprint; prior.active=1; prior.updated_at=new Date().toISOString(); this.event(endpoint.id,'contract_changed',prior.progress);
      } else if (!prior.contract_sections) prior.contract_sections=digest;
    }
    for (const [id,row] of Object.entries(this.rows)) if (!present.has(id) && row.active) { row.active=0; this.event(id,'removed',row.progress); }
    try { this.save(); }
    catch (error) { this.rows=previousRows; this.activity=previousActivity; throw error; }
  }
  validate(payload) {
    if (!object(payload) || typeof payload.endpoint_id!=='string' || typeof payload.fingerprint!=='string' || !/^[a-f0-9]{64}$/.test(payload.fingerprint) ||
        (payload.progress!==undefined && !PROGRESS.has(payload.progress)) || (payload.note!==undefined && (typeof payload.note!=='string' || payload.note.length>4000))) throw new RelayError(422,'Invalid endpoint status update.');
    const row=this.rows[payload.endpoint_id];
    if (!row?.active) throw new RelayError(404,'Endpoint is no longer active. Sync and try again.');
    if (row.fingerprint!==payload.fingerprint) throw new RelayError(409,'The contract changed. Sync before updating progress.');
  }
  async update(payload) {
    this.validate(payload);
    const row=this.rows[payload.endpoint_id];
    if (this.shared && payload.progress!==undefined) await this.shared.update(payload.endpoint_id,payload.fingerprint,payload.progress);
    // Schema inspection can run while the Git write awaits its lock.
    if (!row.active || row.fingerprint!==payload.fingerprint) throw new RelayError(409,'The contract changed during saving. Sync and review before updating progress.');
    if ((payload.progress===undefined || payload.progress===row.progress) && (payload.note===undefined || payload.note===row.note) && !(payload.progress!==undefined && row.contract_changed)) return;
    const previousRow=structuredClone(row),previousActivity=[...this.activity];
    if (payload.progress!==undefined && payload.progress!==row.progress) { row.progress=payload.progress; this.event(payload.endpoint_id,'progress_changed',row.progress); }
    if (payload.note!==undefined && payload.note!==row.note) { row.note=payload.note; this.event(payload.endpoint_id,'note_updated',''); }
    if (payload.progress!==undefined && row.contract_changed) { row.contract_changed=false; this.event(payload.endpoint_id,'contract_reviewed',payload.progress); }
    row.updated_at=new Date().toISOString();
    try { this.save(); }
    catch (error) { this.rows[payload.endpoint_id]=previousRow; this.activity=previousActivity; throw error; }
  }
  read() {
    const endpoints=structuredClone(this.rows);
    for (const row of Object.values(endpoints)) { delete row.contract_sections; row.contract_changed=Boolean(row.contract_changed); row.changed_sections ??=[]; }
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
