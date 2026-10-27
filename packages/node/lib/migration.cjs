const {GitStatuses}=require('./git.cjs');
const {hash}=require('./openapi.cjs');
const {RelayError}=require('./security.cjs');
function plan(rows,endpoints,remote,scope) {
  const entries=Object.entries(rows).sort(([a],[b])=>a.localeCompare(b)).map(([id,row])=>{
    const endpoint=endpoints[id];
    const reason=!endpoint || !endpoint.active?'Endpoint absent from current code':endpoint.fingerprint!==row.fingerprint?'Contract changed; review it separately':Object.hasOwn(remote,id)?'Already has a team status':id.length>2048?'Unsupported endpoint metadata':null;
    return {endpoint_id:id,fingerprint:row.fingerprint,progress:row.progress,previous_author:row.updated_by.name,eligible:reason===null,reason};
  });
  return {plan_id:hash([scope,entries,Object.entries(remote).map(([id,row])=>[id,row.revision]).sort()]),entries};
}
async function preview(workspace,worker,project) {
  if (!workspace || !worker || !project) throw new RelayError(409,'Realtime sync and a Git project are required for import.');
  await worker.refresh();
  if (!worker.ready) throw new RelayError(503,'Reconnect team statuses before importing.');
  if (worker.can_write!==true) throw new RelayError(403,'Project write permission is required for import.');
  return plan(new GitStatuses(project).read(),workspace.read().endpoints,worker.rows,[worker.config.url,worker.config.project]);
}
async function apply(workspace,worker,project,plan_id,selected) {
  const current=await preview(workspace,worker,project);
  if (current.plan_id!==plan_id) throw new RelayError(409,'Import preview changed. Review the latest preview before importing.');
  const eligible=new Map(current.entries.filter(e=>e.eligible).map(e=>[e.endpoint_id,e]));
  if (!Array.isArray(selected) || !selected.length || selected.length>10000 || new Set(selected).size!==selected.length || selected.some(id=>!eligible.has(id))) throw new RelayError(422,'Select eligible endpoints from the current preview.');
  const imported=[];
  for (const id of selected) {
    const entry=eligible.get(id);
    try {workspace.validate(entry);await worker.update(id,entry.fingerprint,entry.progress,0);}
    catch(error) {if (!(error instanceof RelayError)) throw error; return {imported,stopped:true,message:'Import stopped. Review a new preview before continuing.',status:error.status};}
    imported.push(id);
  }
  return {imported,stopped:false,message:'Selected Git statuses imported.'};
}
module.exports={plan,preview,apply};
