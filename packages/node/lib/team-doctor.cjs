const {configuration}=require('./realtime.cjs');
async function diagnose(options,read) {
 const check=(name,state,message)=>({name,state,message});
 let team;
 try {
  if (![undefined,'local','git','realtime'].includes(options.statusMode)) throw new Error('Choose --status-mode local, git or realtime.');
  if (options.statusMode==='local' && options.syncStatus) throw new Error('Choose local mode or --sync-status; do not enable both.');
  team=['local','git'].includes(options.statusMode)?null:configuration();
  if (options.statusMode==='realtime' && !team) throw new Error('Set RELAY_TEAM_URL, RELAY_TEAM_PROJECT and RELAY_TEAM_TOKEN together.');
  if (team && options.syncStatus) throw new Error('Choose realtime or Git status sync; do not enable both.');
  if (team && !/^[a-zA-Z0-9_-]{1,128}$/.test(team.project)) throw new Error('Use the project ID provisioned by the team administrator (letters, digits, _ or -).');
 } catch(error) {return [check('status_mode','error',error.message)];}
 const mode=team?'realtime':options.syncStatus || options.statusMode==='git'?'git':'local';
 const result=[check('status_mode','info',`Doctor configuration: ${mode}. Match --status-mode/--sync-status to the backend options; application source is not executed.`)];
 if (!team) return result;
 let stage="team_service";
 try {
  const health=await read(new URL(team.url+'/health'),{},16384);
  if (health.status!==200 || health.data?.ok!==true || health.data?.protocol!==1) return [...result,check('team_service','error','Not a supported team service response. Check RELAY_TEAM_URL and the shared service version; redirects are not followed.')];
  result.push(check('team_service','ok','Team service reachable (protocol 1).'));
  stage="team_access";
  const access=await read(new URL(team.url+'/v1/projects/'+team.project+'/access'),{Authorization:'Bearer '+team.token},16384);
  if ([401,403].includes(access.status)) result.push(check('team_access','error',"Project access rejected. Ask the administrator to verify this project's membership and developer credential; project existence is not disclosed."));
  else if (access.status===404) result.push(check('team_access','info','Service lacks the read-only access diagnostic. Upgrade the shared service or inspect the local Relay connection state; access and write permission were not verified.'));
  else if (access.status===200 && access.data?.protocol===1 && typeof access.data?.can_write==='boolean') result.push(check('team_access',access.data.can_write?'ok':'info',access.data.can_write?'Writer access verified.':'Read-only project access verified. API testing remains available; ask the administrator for writer access if needed.'));
  else result.push(check('team_access','error','Access diagnostic unavailable or invalid. Check the shared service version and reverse-proxy route.'));
 } catch {result.push(check(stage,'error','Team service unreachable, invalid, oversized or timed out. Check its HTTPS origin, certificate and running process; local API testing remains available.'));}
 return result;
}
module.exports={diagnose};
