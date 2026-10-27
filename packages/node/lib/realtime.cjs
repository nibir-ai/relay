const fs = require('node:fs');
const {io} = require('socket.io-client');
const {hash} = require('./openapi.cjs');
const {atomic, PROGRESS} = require('./git.cjs');
const {local, RelayError} = require('./security.cjs');

function configuration(value) {
  const input=value ?? {url:process.env.RELAY_TEAM_URL,project:process.env.RELAY_TEAM_PROJECT,token:process.env.RELAY_TEAM_TOKEN};
  if (!Object.values(input).some(Boolean)) return null;
  if (!['url','project','token'].every(key=>typeof input[key]==='string' && input[key].trim())) throw new Error('Set RELAY_TEAM_URL, RELAY_TEAM_PROJECT and RELAY_TEAM_TOKEN together.');
  const result=Object.fromEntries(['url','project','token'].map(key=>[key,input[key].trim()]));
  let url;
  try {url=new URL(result.url);} catch {throw new Error('Relay team URL must be an HTTPS origin.');}
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname!=='/' || url.protocol==='http:' && !local(url.hostname)) throw new Error('Relay team URL must be an HTTPS origin (HTTP is allowed only on loopback).');
  if (result.token.length>512 || result.project.length>128) throw new Error('Invalid Relay team configuration.');
  result.url=url.origin;
  return result;
}
function record(input) {
  if (!input || typeof input!=='object') throw new Error('Invalid team status.');
  const value=Object.fromEntries(['endpoint_id','fingerprint','progress','revision','updated_at','actor_id','actor_name'].map(key=>[key,input[key]]));
  if (!PROGRESS.has(value.progress) || !Number.isSafeInteger(value.revision) || value.revision<1 || !/^[a-f0-9]{64}$/.test(value.fingerprint) || !Number.isFinite(Date.parse(value.updated_at)) || ![['endpoint_id',2048],['actor_id',128],['actor_name',128],['updated_at',64]].every(([key,max])=>typeof value[key]==='string' && value[key].length>0 && value[key].length<=max)) throw new Error('Invalid team status.');
  return value;
}
class RealtimeSync {
  constructor(config,file=null) {
    this.config=config; this.file=file; this.rows=Object.create(null); this.revision=0; this.ready=false; this.closed=false;
    this.state='connecting'; this.error=null; this.last_synced_at=null; this.refreshing=null; this.buffer=[];
    if (file && fs.existsSync(file)) {
      try { if (fs.statSync(file).size>16*1024*1024) throw new Error(); this.snapshot(JSON.parse(fs.readFileSync(file,'utf8'))); }
      catch { this.rows=Object.create(null); this.revision=0; this.offline(); }
    }
    this.socket=io(config.url,{auth:{project:config.project,token:config.token},autoConnect:false,reconnection:true,reconnectionDelayMax:5000,timeout:3000});
    this.socket.on('connect',()=>void this.refresh());
    this.socket.on('disconnect',()=>this.offline());
    this.socket.on('connect_error',()=>this.offline());
    this.socket.on('status:updated',payload=>this.event(payload));
  }
  snapshot(payload) {
    if (payload?.protocol!==1 || !Number.isSafeInteger(payload.revision) || payload.revision<this.revision || !Array.isArray(payload.statuses)) throw new Error('Invalid team snapshot.');
    const rows=payload.statuses.map(record);
    if (new Set(rows.map(row=>row.endpoint_id)).size!==rows.length || rows.some(row=>row.revision>payload.revision)) throw new Error('Invalid team snapshot.');
    this.rows=Object.assign(Object.create(null),Object.fromEntries(rows.map(row=>[row.endpoint_id,row]))); this.revision=payload.revision;
  }
  persist() {if (this.file) atomic(this.file,{protocol:1,revision:this.revision,statuses:Object.values(this.rows)},16*1024*1024);}
  offline() {this.ready=false;this.state='offline';this.error='Team statuses unavailable. API testing and local notes remain usable. Retry to reconnect.';}
  async refresh() {
    if (this.refreshing) return this.refreshing;
    this.ready=false;this.state='recovering';
    this.refreshing=(async()=>{
      try {
        const payload=await this.socket.timeout(5000).emitWithAck('snapshot:get');
        if (payload?.ok!==true) throw new Error();
        this.snapshot(payload);
        this.can_write=typeof payload.can_write==='boolean'?payload.can_write:undefined;
        const buffered=this.buffer; this.buffer=[];
        for (const row of buffered.sort((a,b)=>a.revision-b.revision)) {
          if (row.revision<=this.revision) continue;
          if (row.revision!==this.revision+1) throw new Error('Missed team updates.');
          this.rows[row.endpoint_id]=row;this.revision=row.revision;
        }
        this.persist();this.ready=true;this.state='synced';this.error=null;this.last_synced_at=new Date().toISOString();
      } catch {this.buffer=[];this.offline();}
      finally {this.refreshing=null;}
    })();
    return this.refreshing;
  }
  event(payload) {
    try {
      if (payload?.protocol!==1) throw new Error();
      const row=record(payload.status);
      if (this.refreshing) {if(this.buffer.length>=10000) throw new Error();this.buffer.push(row);return;}
      if (row.revision<=this.revision) return;
      if (row.revision!==this.revision+1) {void this.refresh();return;}
      this.rows[row.endpoint_id]=row;this.revision=row.revision;this.persist();this.last_synced_at=new Date().toISOString();
    } catch {this.offline();}
  }
  start() {if (!this.closed) this.socket.connect();}
  async request_sync() {if (this.socket.connected) await this.refresh();else this.start();}
  async update(endpoint_id,fingerprint,progress,expected_revision) {
    if (!this.ready || !this.socket.connected) throw new RelayError(503,'Team statuses are offline. API testing and local notes remain usable.');
    if (!Number.isSafeInteger(expected_revision) || expected_revision<0) throw new RelayError(422,'Refresh team statuses before changing an endpoint status.');
    let result;
    try {result=await this.socket.timeout(5000).emitWithAck('status:update',{endpoint_id,fingerprint,progress,expected_revision});}
    catch {this.offline();throw new RelayError(503,'Status acknowledgement unavailable. Refresh before retrying; the change may have been accepted.');}
    if (result?.ok!==true) {
      if (result?.status===409) {
        await this.refresh();this.state='conflict';this.error='A teammate changed this endpoint. Review its latest status before retrying.';
        throw new RelayError(409,this.error);
      }
      throw new RelayError(result?.status===403?403:422,'Team status update rejected. Check project write permission and refresh.');
    }
    try {
      const accepted=record(result.status);
      if (result.protocol!==1 || accepted.endpoint_id!==endpoint_id || accepted.fingerprint!==fingerprint || accepted.progress!==progress) throw new Error();
    } catch {this.offline();throw new RelayError(502,'Invalid team acknowledgement. Refresh before retrying.');}
    this.event(result);
  }
  overlay(value) {
    for (const [id,row] of Object.entries(value.endpoints)) {
      const saved=this.rows[id];row.team_revision=saved?.revision ?? 0;
      if (!saved) continue;
      row.contract_changed=row.fingerprint!==saved.fingerprint;
      row.progress=row.contract_changed && saved.progress==='done'?'needs_fixing':saved.progress;
      row.updated_at=saved.updated_at;row.updated_by={name:saved.actor_name,email:'',id:saved.actor_id};
    }
    return value;
  }
  info() {return {enabled:true,mode:'realtime',state:this.state,error:this.error,last_synced_at:this.last_synced_at,can_write:this.can_write};}
  async close() {this.closed=true;this.socket.disconnect();if(this.refreshing) await this.refreshing;}
}
module.exports={configuration,RealtimeSync,sourceKey:config=>hash([config.url,config.project]).slice(0,24)};
