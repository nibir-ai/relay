// Verify the installed service with independent Node Socket.IO clients.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const {createHash} = require('node:crypto');
const {spawn, execFileSync} = require('node:child_process');
const {io} = require('socket.io-client');

const python = process.env.RELAY_TEAM_PYTHON;
if (!python) throw new Error('Set RELAY_TEAM_PYTHON to an installed service environment.');
const mutation = {endpoint_id:'GET /api/me', fingerprint:'a'.repeat(64), progress:'done', expected_revision:0};
const member = (id, role='writer') => ({id, name:id, role, token_sha256:createHash('sha256').update(id).digest('hex')});
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));

async function run() {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(),'relay-team-events-'));
  const sockets = [];
  let server;
  try {
    const configuration = path.join(folder,'members.json');
    await fs.writeFile(configuration,JSON.stringify({projects:{alpha:{members:[member('node'),member('python'),member('reader','reader')]},beta:{members:[member('other')]}}}));
    const reservation = net.createServer();
    await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
    const port = reservation.address().port;
    await new Promise(resolve=>reservation.close(resolve));
    const base = `http://127.0.0.1:${port}`;
    const environment = {...process.env, RELAY_TEAM_CONFIG:configuration, RELAY_TEAM_DB:path.join(folder,'statuses.sqlite3')};
    delete environment.PYTHONPATH;
    server = spawn(python,['-m','uvicorn','relay_team.app:create_app','--factory','--host','127.0.0.1','--port',String(port),'--timeout-graceful-shutdown','3'],{cwd:folder,env:environment,stdio:'ignore',windowsHide:true});
    const deadline = Date.now()+15000;
    while (true) {
      try { const health = await fetch(base+'/health'); if (health.ok) break; } catch {}
      if (server.exitCode !== null || Date.now()>deadline) throw new Error('Installed service did not start.');
      await pause(100);
    }
    async function connect(token,project='alpha',transports=['websocket']) {
      const socket = io(base,{auth:{project,token},transports,reconnection:false,autoConnect:false,timeout:3000});
      sockets.push(socket);
      await new Promise((resolve,reject)=>{
        socket.once('connect',resolve);
        socket.once('connect_error',reject);
        socket.connect();
      });
      return socket;
    }
    const writer = await connect('node');
    const reader = await connect('reader');
    const isolated = await connect('other','beta');
    const received = [];
    let leaked = false;
    reader.on('status:updated',payload=>received.push(payload));
    isolated.on('status:updated',()=>{leaked=true;});
    const saved = await writer.timeout(3000).emitWithAck('status:update',mutation);
    assert.equal(saved.ok,true);
    assert.equal(saved.status.actor_id,'node');
    const forbidden = await reader.timeout(3000).emitWithAck('status:update',mutation);
    assert.equal(forbidden.status,403);
    const stale = await writer.timeout(3000).emitWithAck('status:update',mutation);
    assert.equal(stale.code,'revision_conflict');
    assert.deepEqual(stale.current,saved.status);
    // A separate Python process writes over HTTP; Socket.IO listeners must see it.
    const pythonWrite = 'import json,sys,urllib.request; r=urllib.request.Request(sys.argv[1],data=json.dumps({"endpoint_id":"GET /api/me","fingerprint":"a"*64,"progress":"needs_fixing","expected_revision":1}).encode(),headers={"Authorization":"Bearer python","Content-Type":"application/json"},method="PUT"); response=urllib.request.urlopen(r); assert response.status==200';
    execFileSync(python,['-c',pythonWrite,base+'/v1/projects/alpha/statuses'],{cwd:folder,env:environment,windowsHide:true});
    const deliveredDeadline=Date.now()+3000;
    while (received.length<2 && Date.now()<deliveredDeadline) await pause(20);
    assert.deepEqual(received.map(row=>row.status.revision),[1,2]);
    assert.equal(received[1].status.actor_id,'python');
    assert.equal(leaked,false);
    const other = await isolated.timeout(3000).emitWithAck('snapshot:get');
    assert.deepEqual(other.statuses,[]);
    reader.disconnect();
    const recovered = await connect('reader','alpha',['polling']);
    const snapshot = await recovered.timeout(3000).emitWithAck('snapshot:get');
    assert.equal(snapshot.revision,2);
    assert.deepEqual(snapshot.statuses,[received[1].status]);
    console.log('Installed service Node clients: live delivery, Python HTTP interoperability, permissions, conflicts, project isolation and polling reconnect passed.');
  } finally {
    for (const socket of sockets) socket.disconnect();
    if (server && server.exitCode===null) {
      await new Promise(resolve=>{server.once('exit',resolve);server.kill();});
    }
    const resolvedFolder = await fs.realpath(folder);
    assert.equal(path.dirname(resolvedFolder),await fs.realpath(os.tmpdir()));
    assert.ok(path.basename(resolvedFolder).startsWith('relay-team-events-'));
    await fs.rm(resolvedFolder,{recursive:true,force:true});
  }
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
