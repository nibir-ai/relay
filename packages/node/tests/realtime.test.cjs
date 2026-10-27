const test=require('node:test');
const assert=require('node:assert/strict');
const {configuration,RealtimeSync}=require('../lib/realtime.cjs');
const {relay}=require('../lib/index.cjs');

test('team configuration rejects insecure origins and mixed authorities',()=>{
  for(const url of ['http://team.example','https://user:private@team.example','https://team.example/?token=private','https://team.example/prefix','ftp://team.example']) assert.throws(()=>configuration({url,project:'example',token:'private'}));
  const realtime={url:'http://127.0.0.1:4490/',project:'example',token:'private'};
  assert.equal(configuration(realtime).url,'http://127.0.0.1:4490');
  assert.throws(()=>relay({realtime,syncStatus:true}),/both/);
});

test('a stopped bridge keeps API metadata local and never queues an offline status',async()=>{
  const bridge=new RealtimeSync({url:'http://127.0.0.1:4490',project:'example',token:'private'});
  try {
    await assert.rejects(()=>bridge.update('GET /me','a'.repeat(64),'done',0),error=>error.status===503);
    assert.deepEqual(bridge.overlay({endpoints:{'GET /me':{fingerprint:'a'.repeat(64),progress:'done',note:'Private local note'}}}).endpoints['GET /me'],{fingerprint:'a'.repeat(64),progress:'done',note:'Private local note',team_revision:0});
    assert.ok(!JSON.stringify(bridge.info()).includes('private'));
  } finally {await bridge.close();}
});
