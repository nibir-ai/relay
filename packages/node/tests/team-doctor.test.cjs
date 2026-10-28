const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {diagnose}=require('../lib/team-doctor.cjs');
const {doctor}=require('../lib/setup.cjs');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
function configure(t,url) {
 const previous=Object.fromEntries(['RELAY_TEAM_URL','RELAY_TEAM_PROJECT','RELAY_TEAM_TOKEN'].map(key=>[key,process.env[key]]));
 Object.assign(process.env,{RELAY_TEAM_URL:url,RELAY_TEAM_PROJECT:'example',RELAY_TEAM_TOKEN:'private-token'});
 t.after(()=>{for(const [key,value] of Object.entries(previous)) if(value===undefined) delete process.env[key];else process.env[key]=value;});
}
test('doctor access requests use only GET and never expose service data or credentials',async t=>{
 const requests=[];let access={status:200,data:{protocol:1,can_write:false}};
 const server=http.createServer((req,res)=>{requests.push({method:req.method,url:req.url,auth:req.headers.authorization});res.setHeader('Content-Type','application/json');res.statusCode=req.url==='/health'?200:access.status;res.end(JSON.stringify(req.url==='/health'?{ok:true,protocol:1,secret:'private-token'}:access.data));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
 configure(t,`http://127.0.0.1:${server.address().port}`);
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'relay-team-doctor-'));
 t.after(()=>{assert.equal(path.dirname(folder),os.tmpdir());assert.ok(path.basename(folder).startsWith('relay-team-doctor-'));fs.rmSync(folder,{recursive:true,force:true});});
 for(const [status,data,state,pattern] of [[200,{protocol:1,can_write:false},'info',/Read-only/],[200,{protocol:1,can_write:true},'ok',/Writer/],[401,{detail:'private-token'},'error',/access rejected/],[404,{},'info',/were not verified/],[200,{protocol:1,can_write:'private-token'},'error',/invalid/],[302,{},'error',/unavailable/]]) {
  requests.length=0;access={status,data};const result=await doctor(folder);
  const check=result.checks.find(c=>c.name==='team_access');assert.equal(check.state,state);assert.match(check.message,pattern);assert.doesNotMatch(JSON.stringify(result),/private-token/);
  assert.deepEqual(requests.map(r=>[r.method,r.url]),[['GET','/health'],['GET','/v1/projects/example/access']]);
  assert.equal(requests[0].auth,undefined);assert.equal(requests[1].auth,'Bearer private-token');
 }
 access={status:200,data:{protocol:1,can_write:true,secret:"private-token".repeat(2000)}};
 const oversized=await doctor(folder);
 assert.equal(oversized.checks.find(c=>c.name==='team_access').state,'error');assert.doesNotMatch(JSON.stringify(oversized),/private-token/);
 assert.deepEqual(fs.readdirSync(folder),[]);
});
test('doctor rejects incomplete and competing configuration without network',async t=>{
 configure(t,'http://127.0.0.1:4490');const read=()=>assert.fail('No request expected');
 assert.equal((await diagnose({syncStatus:true},read))[0].state,'error');
 assert.equal((await diagnose({statusMode:'local',syncStatus:true},read))[0].state,'error');
 assert.match((await diagnose({statusMode:'git'},read))[0].message,/git/);
 delete process.env.RELAY_TEAM_TOKEN;assert.match((await diagnose({},read))[0].message,/together/);
 process.env.RELAY_TEAM_TOKEN='private-token';process.env.RELAY_TEAM_PROJECT='../private-token';assert.doesNotMatch(JSON.stringify(await diagnose({},read)),/private-token/);
});
test('failed transport and malformed service responses stay sanitized',async t=>{
 configure(t,'http://127.0.0.1:4490');
 for(const read of [async()=>{throw new Error('private-token');},async()=>({status:200,data:{secret:'private-token'}}),async()=>({status:302,data:null})]) {
  const result=await diagnose({},read);assert.equal(result.at(-1).state,'error');assert.doesNotMatch(JSON.stringify(result),/private-token/);
 }
});
