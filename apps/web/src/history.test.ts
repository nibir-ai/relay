import {expect,it} from "vitest";
import {SessionHistory,historyCapture,restoreHistory,HISTORY_LIMITS} from "./history";
import type {Endpoint,LiveResponse} from "./types";
const endpoint:Endpoint={id:'POST /items',method:'POST',path:'/items',parameters:[{name:'id',in:'query'}],fingerprint:'v1',summary:'',description:'',tags:[],deprecated:false,security:[],responses:{},requestBody:{content:{'application/json':{schema:{type:'object'}}}}};
const result:LiveResponse={status:200,reason:'OK',duration_ms:4,body:'response-secret',headers:{Authorization:'response-secret'},url:'private-url',method:'POST',bytes:15,truncated:false,content_type:'application/json'};
const capture=(body='{"id":1}')=>historyCapture(endpoint,{'query:id':'1'},body,'application/json',{'X-Trace':'keep'},[]);
it('never retains auth values, cookie inputs, sensitive bodies or response traffic',()=>{
 const value=historyCapture(endpoint,{'query:id':'1','cookie:session':'cookie-value','query:q':'current-token'},'{"password":"body-secret"}','application/json',{Authorization:'Bearer current-token','X-Trace':'keep'},['current-token']);
 const history=new SessionHistory();history.add(endpoint,value,result);
 const saved=JSON.stringify(history.snapshot());
 for(const secret of ['current-token','cookie-value','body-secret','response-secret','private-url']) expect(saved).not.toContain(secret);
 expect(historyCapture(endpoint,{},'{"proof":"cookie-value"}','application/json',{Cookie:'session=cookie-value'},[]).inputs.body).toBeNull();
 expect(historyCapture(endpoint,{},'{"proof":"cGFzczpzZWNyZXQ="}','application/json',{Authorization:'Basic cGFzczpzZWNyZXQ='},['pass:secret']).inputs.body).toBeNull();
 expect(value.omitted).toBe(true);expect(value.inputs.body).toBeNull();expect(value.inputs.headers).toEqual({'X-Trace':'keep'});
});
it('omits escaped sensitive keys, duplicate-key objects, write-only schema inputs and opaque bodies',()=>{
 for(const body of ['{"outer":{"password":"hidden"},"outer":{}}','{"pass\\u0077ord":"hidden"}','{"field":"\\u0061bc-secret"}']) {
  expect(historyCapture(endpoint,{},body,'application/json',{},['abc-secret']).inputs.body).toBeNull();
 }
 const writeOnly={...endpoint,requestBody:{content:{'application/json':{schema:{type:'object',properties:{pin:{writeOnly:true}}}}}}};
 expect(historyCapture(writeOnly,{},'{"pin":"hidden"}','application/json',{},[]).inputs.body).toBeNull();
 expect(historyCapture(endpoint,{},'opaque text','text/plain',{},[]).inputs.body).toBeNull();
});
it('retains safe JSON byte-for-byte, including large integers and duplicate keys',()=>{
 const body='{"id":9007199254740993123,"name":"one","name":"two"}';
 expect(capture(body).inputs.body).toBe(body);
});
it('bounds history per endpoint, per tab and by byte budget while evicting oldest first',()=>{
 const history=new SessionHistory();
 for(let i=0;i<12;i++) history.add(endpoint,capture(),result);
 expect(history.snapshot()).toHaveLength(10);expect(history.snapshot()[0].id).toBe(3);
 for(let i=0;i<50;i++) history.add({...endpoint,id:'POST /'+i},capture(),result);
 expect(history.snapshot()).toHaveLength(50);expect(history.snapshot().some(entry=>entry.endpointId===endpoint.id)).toBe(false);
 history.clear();
 for(let i=0;i<7;i++) history.add({...endpoint,id:'POST /'+i},capture('{"data":"'+'a'.repeat(1024*1024)+'"}'),result);
 expect(history.snapshot().reduce((sum,item)=>sum+item.bytes,0)).toBeLessThanOrEqual(HISTORY_LIMITS.bytes);
 expect(history.add(endpoint,capture('{"data":"'+'a'.repeat(HISTORY_LIMITS.bytes+1)+'"}'),null).saved).toBe(false);
});
it('stores immutable independent captures, records failures and clears without persistence',()=>{
 const history=new SessionHistory(),value=capture();let changes=0;const unsubscribe=history.subscribe(()=>changes++);
 history.add(endpoint,value,null);value.inputs.values['query:id']='changed';
 expect(history.snapshot()[0].inputs.values['query:id']).toBe('1');expect(Object.isFrozen(history.snapshot()[0].inputs)).toBe(true);
 expect(history.snapshot()[0].outcome).toBe('network_error');
 history.remove(history.snapshot()[0].id);expect(history.snapshot()).toHaveLength(0);
 history.add(endpoint,capture(),result);history.clear(endpoint.id);expect(history.snapshot()).toHaveLength(0);expect(new SessionHistory().snapshot()).toHaveLength(0);
 unsubscribe();expect(changes).toBe(4);
});
it('restores inputs without resurrecting credentials and skips stale bodies and removed parameters',()=>{
 const history=new SessionHistory();history.add(endpoint,capture(),result);const entry=history.snapshot()[0];
 const current={values:{'query:new':'keep'},body:'current body',mediaType:'application/json',headers:{Authorization:'Bearer current-user'}};
 const restored=restoreHistory(entry,endpoint,current);
 expect(restored.headers.Authorization).toBe('Bearer current-user');expect(restored.body).toBe('{"id":1}');
 const stale=restoreHistory(entry,{...endpoint,fingerprint:'v2',parameters:[]},current);
 expect(stale.body).toBe('current body');expect(stale.values).toEqual({'query:new':'keep'});
});
