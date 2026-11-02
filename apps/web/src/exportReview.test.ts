import { expect, it } from "vitest";
import { endpointExport, exportContent } from "./export";
import { reviewExport, requestHeaderSecrets } from "./exportReview";
import type { Endpoint, LiveResponse, Snapshot } from "./types";
const endpoint: Endpoint = {id:"POST /item",method:"POST",path:"/item",summary:"Item",description:"",tags:[],parameters:[],responses:{},security:[],deprecated:false,fingerprint:"test",requestBody:{content:{"application/json":{schema:{type:"object"}}}}};
const snapshot: Snapshot = {title:"Example",version:"v1",hash:"test",endpoints:[endpoint],securitySchemes:{}};
function value(body='{"id":9007199254740993,"password":"request-private","x":1,"x":2}',extra: Partial<LiveResponse> = {}) {
 return endpointExport({endpoint,snapshot,baseUrl:"http://localhost:8000",values:{},body,mediaType:"application/json",headerText:"X-Trace: sample",progress:"done",responseAt:"now",response:{status:200,reason:"OK",method:"POST",url:"http://localhost:8000/item",content_type:"application/json",body:'{"access_token":"response-private","id":9007199254740993}',headers:{"Set-Cookie":"session=cookie-private; Path=/; HttpOnly"},bytes:80,duration_ms:4,truncated:false,...extra}});
}
it("creates one reviewed payload for both formats while leaving drafts and captures untouched", () => {
 const original=value(); const before=JSON.stringify(original);
 const result=reviewExport(original);expect(result.error).toBeNull();const reviewed=result.value!;
 expect(JSON.stringify(original)).toBe(before);
 expect(reviewed.current_request.body).toBe('{"id":9007199254740993,"password":"[REDACTED]","x":1,"x":2}');
 expect(reviewed.latest_response?.body).toBe('{"access_token":"[REDACTED]","id":9007199254740993}');
 expect(reviewed.endpoint.path).toBe('/item');
 for(const format of ['json','relay'] as const) {
  const content=exportContent(reviewed,format);
  for(const secret of ['request-private','response-private','cookie-private']) expect(content).not.toContain(secret);
  expect(content).toContain('9007199254740993');expect(content).not.toContain('9007199254740992');
 }
 expect(JSON.parse(exportContent(reviewed)).version).toBe(1);
});
it("masks configured user/admin tokens across JSON bodies, URLs, headers and contract metadata", () => {
 const original=value('{"field":"user-\\u0074oken","safe":true}',{body:'{"other":"admin-token"}',url:'http://localhost/item?custom=admin-token'});
 original.endpoint.description='user-token';original.current_request.url='http://name:private@localhost/item?api_key=unconfigured&trace=safe';
 original.current_request.headers={aUtHoRiZaTiOn:'Bearer user-token','X-Custom':'admin-token','X-Trace':'safe'};
 original.current_request.parameter_values={'query:token':'unconfigured','cookie:sid':'cookie-private','query:trace':'safe'};
 const result=reviewExport(original,{secrets:['user-token','admin-token']});expect(result.error).toBeNull();
 for(const format of ['json','relay'] as const) {
  const content=exportContent(result.value!,format);
  for(const secret of ['user-token','admin-token','unconfigured','cookie-private','name:private']) expect(content).not.toContain(secret);
 }
 expect(result.value?.current_request.headers?.['X-Trace']).toBe('safe');
 expect(result.value?.current_request.parameter_values['query:trace']).toBe('safe');
});
it("detects Basic and URL-encoded credential forms and fails without leaking error excerpts", () => {
 const original=value('{"field":"'+btoa('alice:long-private-password')+'"}',{body:'{"field":"long-private-password"}'});
 original.current_request.url='http://localhost/item?custom=alice%3Along-private-password';
 const result=reviewExport(original,{secrets:['alice:long-private-password']});expect(result.error).toBeNull();
 expect(JSON.stringify(result.value)).not.toContain('long-private-password');expect(result.value?.current_request.body).toContain('[REDACTED]');
 original.current_request.header_error='Invalid header: alice:long-private-password';
 expect(reviewExport(original).value?.current_request.header_error).toBe('Request headers could not be parsed; omitted from export.');
});
it("redacts selected duplicate fields in both bodies without changing untouched lexemes", () => {
 const result=reviewExport(value('{"private":1,"private":2,"keep":1.200e30}',{body:'{"rows":[{"private":false,"keep":null}]}'}),{requestPointers:['/private'],responsePointers:['/rows/0/private']});
 expect(result.value?.current_request.body).toBe('{"private":"[REDACTED]","private":"[REDACTED]","keep":1.200e30}');
 expect(result.value?.latest_response?.body).toBe('{"rows":[{"private":"[REDACTED]","keep":null}]}');
});
it("omits opaque, invalid and truncated bodies explicitly and preserves legitimate empty captures", () => {
 const opaque=value('invalid JSON',{body:'opaque response',content_type:'text/plain'});
 const result=reviewExport(opaque);expect(result.value?.review.omissions).toHaveLength(2);
 expect(result.value?.current_request.body).toBe('[OMITTED]');expect(result.value?.latest_response?.body).toBe('[OMITTED]');
 expect(reviewExport(opaque,{includeOpaque:true}).value?.latest_response?.body).toBe('opaque response');
 expect(reviewExport(value('{}',{body:'{}',truncated:true})).value?.review.omissions[0]).toContain('truncated');
 expect(reviewExport(value('',{body:'',status:204})).value?.latest_response?.body).toBe('');
 expect(reviewExport(value(),{omitRequestBody:true,omitResponseBody:true}).value?.review.omissions).toHaveLength(2);
});
it("keeps sensitive-name suggestions opt-in for inclusion while configured credentials stay masked", () => {
 const result=reviewExport(value('{"password":"example","custom":"actual-secret"}',{body:'{}'}),{requestSuggestions:false,secrets:['actual-secret']});
 expect(result.value?.current_request.body).toBe('{"password":"example","custom":"[REDACTED]"}');
 expect(result.suggestions.request).toEqual(['/password']);
});
it("preserves colliding secret-bearing metadata keys separately", () => {
 const original=value();original.endpoint.responses={'alpha-private':{description:'one'},'beta-private':{description:'two'}};
 const result=reviewExport(original,{secrets:['alpha-private','beta-private']});
 expect(Object.values(result.value!.endpoint.responses).map(v=>v.description)).toEqual(['one','two']);
 expect(JSON.stringify(result.value)).not.toContain('user-token');expect(JSON.stringify(result.value)).not.toContain('admin-token');
});
it("blocks excessive credential sets and numeric metadata overlap without returning an export", () => {
 expect(reviewExport(value(),{secrets:Array.from({length:33},(_,i)=>`secret-${i}`)}).value).toBeNull();
 const result=reviewExport(value(),{secrets:['200']});expect(result.value).toBeNull();expect(result.error).toContain('numeric export metadata');
});

it("collects manual credential headers before the base export masks them", () => {
 const headerText='Authorization: Bearer manually-entered-secret\nCookie: session=session-private; other=other-private';
 const secrets=requestHeaderSecrets(headerText);expect(secrets).toContain('manually-entered-secret');expect(secrets).toContain('session-private');
 const original=value('{"custom":"session-private","second":"manually-entered-secret"}',{body:'{"x":"other-private"}'});
 const result=reviewExport(original,{secrets});expect(result.error).toBeNull();
 for(const format of ['json','relay'] as const) for(const secret of ['session-private','other-private','manually-entered-secret']) expect(exportContent(result.value!,format)).not.toContain(secret);
 expect(requestHeaderSecrets('invalid')).toEqual([]);
});

it("masks echoed cookies from combined Set-Cookie headers without treating attributes as credentials",()=>{
 const original=value('{}',{body:'{"one":"first-cookie","two":"second-cookie"}',headers:{'Set-Cookie':'first=first-cookie; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/, second=second-cookie; Path=/'}});
 const result=reviewExport(original);expect(result.error).toBeNull();
 expect(result.value?.endpoint.path).toBe('/item');
 expect(JSON.stringify(result.value)).not.toContain('first-cookie');expect(JSON.stringify(result.value)).not.toContain('second-cookie');
});

it("also removes recognized parameter and URL credentials when echoed in unrelated fields",()=>{
 const original=value('{"custom":"query-private","other":"url-private"}',{body:'{"field":"cookie-param-private"}'});
 original.current_request.parameter_values={'query:api_key':'query-private','cookie:session':'cookie-param-private'};
 original.current_request.url='http://localhost/item?access_token=url-private';
 const result=reviewExport(original);expect(result.error).toBeNull();
 for(const secret of ['query-private','url-private','cookie-param-private']) expect(JSON.stringify(result.value)).not.toContain(secret);
});

it("blocks credential overlap with required field names rather than returning a broken envelope",()=>{
 const result=reviewExport(value(),{secrets:['current_request']});expect(result.value).toBeNull();expect(result.error).toContain('required export fields');
});
