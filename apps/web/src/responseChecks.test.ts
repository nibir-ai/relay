import { expect, it } from "vitest";
import { evaluateCheck } from "./responseChecks";
import type { LiveResponse } from "./types";
const response = (body = '{"data":{"role":"admin"}}', extra: Partial<LiveResponse> = {}): LiveResponse => ({status:200, reason:"OK",body,headers:{},bytes:body.length,duration_ms:10,truncated:false,content_type:"application/json",url:"/test",method:"GET",...extra});
const equals = (body: string, expected: string, pointer = "") => evaluateCheck({kind:"equals",pointer,expected},response(body));
it("compares HTTP status and an inclusive observed duration without changing the response", () => {
 const r=response(); const before=JSON.stringify(r);
 expect(evaluateCheck({kind:"status",expected:200},r).state).toBe("pass");
 expect(evaluateCheck({kind:"status",expected:201},r).state).toBe("fail");
 expect(evaluateCheck({kind:"duration",maximum:10},r).state).toBe("pass");
 expect(evaluateCheck({kind:"duration",maximum:9},r).state).toBe("fail");
 expect(JSON.stringify(r)).toBe(before);
});
it("distinguishes missing fields from null, false, zero and empty strings", () => {
 for(const value of ['null','false','0','""','[]','{}']) {
  expect(evaluateCheck({kind:"exists",pointer:"/v"},response(`{"v":${value}}`)).state).toBe("pass");
  expect(equals(`{"v":${value}}`,value,"/v").state).toBe("pass");
 }
 expect(evaluateCheck({kind:"exists",pointer:"/missing"},response()).state).toBe("fail");
 expect(equals('{"x":false}','0','/x').state).toBe("fail");
});
it("uses escaped JSON pointers, own object keys and canonical array indices", () => {
 const body='{"a/b":{"~key":[3]},"__proto__":4,"":5}';
 expect(equals(body,'3','/a~1b/~0key/0').state).toBe("pass");
 expect(equals(body,'4','/__proto__').state).toBe("pass");
 expect(equals(body,'5','/').state).toBe("pass");
 for(const pointer of ['/constructor','/a~1b/~0key/01','/a~1b/~0key/-','/a~1b/~0key/length']) expect(evaluateCheck({kind:"exists",pointer},response(body)).state).toBe("fail");
 for(const pointer of ['data/role','/~','/~2']) expect(evaluateCheck({kind:"exists",pointer},response()).state).toBe("invalid");
});
it("compares decimal numbers exactly without Number rounding or exponent expansion", () => {
 expect(equals('9007199254740993','9007199254740992').state).toBe("fail");
 expect(equals('9007199254740993','9007199254740993.0').state).toBe("pass");
 expect(equals('1e100000000000000000000','10e99999999999999999999').state).toBe("pass");
 expect(equals('0.10000000000000001','0.1').state).toBe("fail");
 expect(equals('-0e50','0').state).toBe("pass");
 expect(equals('1.2300e-5','0.0000123').state).toBe("pass");
 expect(equals('{"b":[2,false],"a":1}','{"a":1.0,"b":[2,false]}').state).toBe("pass");
 expect(equals('[1,2]','[2,1]').state).toBe("fail");
});
it("refuses incomplete, ambiguous, invalid and non-JSON bodies explicitly", () => {
 for(const body of ['', '{', '{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '[1,]', '01','true false','"bad\nstring"']) expect(evaluateCheck({kind:"exists",pointer:""},response(body)).state).toBe("unavailable");
 expect(evaluateCheck({kind:"exists",pointer:""},response('{}',{truncated:true})).state).toBe("unavailable");
 expect(evaluateCheck({kind:"exists",pointer:""},response('{}',{content_type:"text/plain"})).state).toBe("unavailable");
 expect(evaluateCheck({kind:"exists",pointer:""},response('{}',{content_type:"application/problem+json; charset=utf-8"})).state).toBe("pass");
 expect(equals('{}','{"a":1,"a":2}').state).toBe("invalid");
});
it("validates configuration before checking a captured result", () => {
 for(const expected of [99,600,200.5,NaN]) expect(evaluateCheck({kind:"status",expected},null).state).toBe("invalid");
 for(const maximum of [-1,Infinity,NaN]) expect(evaluateCheck({kind:"duration",maximum},null).state).toBe("invalid");
 expect(evaluateCheck({kind:"status",expected:200},null).state).toBe("unavailable");
 expect(evaluateCheck({kind:"duration",maximum:5},response('',{duration_ms:NaN})).state).toBe("unavailable");
 expect(equals('{}','undefined').state).toBe("invalid");
});
it("bounds size, depth, node count and numeric precision work", () => {
 for(const body of ['"'+'x'.repeat(2*1024*1024)+'"','['.repeat(130)+'0'+']'.repeat(130),'['+'0,'.repeat(100001)+'0]','1'.repeat(4097)]) expect(evaluateCheck({kind:"exists",pointer:""},response(body)).state).toBe("unavailable");
});
