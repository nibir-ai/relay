import type {Endpoint,LiveResponse,Schema} from "./types";

export const HISTORY_LIMITS={total:50,perEndpoint:10,bytes:5*1024*1024} as const;
const sensitive=(name:string)=>/authorization|cookie|token|secret|password|passwd|api[-_]?key|credential/i.test(name);
export type HistoryInputs={values:Record<string,string>;body:string|null;mediaType:string;headers:Record<string,string>};
export type HistoryEntry={id:number;endpointId:string;fingerprint:string;at:string;status?:number;duration?:number;outcome:"response"|"network_error";inputs:HistoryInputs;omitted:boolean;truncated:boolean;bytes:number};
function privateSchema(schema:Schema|undefined,seen=new Set<Schema>()):boolean {
 if(!schema || seen.has(schema)) return false;
 seen.add(schema);
 return !!schema.$ref || !!schema["x-relay-warning"] || schema.format==='password' || !!schema.writeOnly || Object.entries(schema.properties??{}).some(([name,value])=>sensitive(name)||privateSchema(value,seen)) || privateSchema(schema.items,seen) || [...(schema.anyOf??[]),...(schema.oneOf??[]),...(schema.allOf??[])].some(value=>privateSchema(value,seen));
}
function privateJSON(text:string,containsToken:(value:string)=>boolean):boolean {
 for(const match of text.matchAll(/("(?:\\.|[^"\\])*")\s*:/g)) if(sensitive(JSON.parse(match[1]))) return true;
 for(const match of text.matchAll(/("(?:\\.|[^"\\])*")/g)) if(containsToken(JSON.parse(match[1]))) return true;
 return false;
}
export function historyCapture(endpoint:Endpoint,values:Record<string,string>,body:string,mediaType:string,headers:Record<string,string>,secrets:string[]) {
 const tokens=[...secrets,...Object.entries(headers).filter(([name])=>sensitive(name)).flatMap(([name,value])=>[value,...(name.toLowerCase()==='cookie'?value.split(';').map(cookie=>cookie.slice(cookie.indexOf('=')+1).trim()):[])])].flatMap(value=>[value,value.replace(/^(?:Bearer|Basic)\s+/i,""),...(value.includes(':')?value.split(':'):[])]).filter(Boolean);
 const containsToken=(value:string)=>tokens.some(token=>value.includes(token));
 const cleanValues:Record<string,string>={},cleanHeaders:Record<string,string>={};
 let omitted=false;
 for(const [name,value] of Object.entries(values)) {
  if(sensitive(name)||name.startsWith('cookie:')||privateSchema(endpoint.parameters.find(parameter=>`${parameter.in}:${parameter.name}`===name)?.schema)||containsToken(value)) omitted=true;else cleanValues[name]=value;
 }
 for(const [name,value] of Object.entries(headers)) {
  if(sensitive(name)||containsToken(value)) omitted=true;else cleanHeaders[name]=value;
 }
 let cleanBody:string|null=endpoint.requestBody?body:null;
 if(cleanBody) {
  try {
   const schema=endpoint.requestBody?.content[mediaType]?.schema;
   if(!mediaType.includes('json')||containsToken(cleanBody)||privateSchema(schema)||(JSON.parse(cleanBody),privateJSON(cleanBody,containsToken))) {cleanBody=null;omitted=true;}
  } catch {cleanBody=null;omitted=true;}
 }
 return {inputs:{values:cleanValues,body:cleanBody,mediaType,headers:cleanHeaders},omitted};
}
export class SessionHistory {
 private entries:readonly HistoryEntry[]=Object.freeze([]);
 private listeners=new Set<()=>void>();
 private sequence=0;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};};
 snapshot=()=>this.entries;
 private changed(entries:HistoryEntry[]) {this.entries=Object.freeze(entries);for(const listener of this.listeners) listener();}
 add(endpoint:Endpoint,capture:ReturnType<typeof historyCapture>,response:LiveResponse|null,at=new Date().toISOString()) {
  const inputs=structuredClone(capture.inputs);
  const bytes=new TextEncoder().encode(JSON.stringify(inputs)).byteLength;
  if(bytes>HISTORY_LIMITS.bytes) return {saved:false,evicted:0};
  Object.freeze(inputs.values);Object.freeze(inputs.headers);Object.freeze(inputs);
  const entry=Object.freeze({id:++this.sequence,endpointId:endpoint.id,fingerprint:endpoint.fingerprint,at,status:response?.status,duration:response?.duration_ms,outcome:response?'response' as const:'network_error' as const,inputs,omitted:capture.omitted,truncated:response?.truncated??false,bytes});
  let next=[...this.entries,entry],evicted=0;
  while(next.filter(item=>item.endpointId===endpoint.id).length>HISTORY_LIMITS.perEndpoint) {next.splice(next.findIndex(item=>item.endpointId===endpoint.id),1);evicted++;}
  let total=next.reduce((sum,item)=>sum+item.bytes,0);
  while(next.length>HISTORY_LIMITS.total||total>HISTORY_LIMITS.bytes) {total-=next.shift()!.bytes;evicted++;}
  this.changed(next);return {saved:true,evicted};
 }
 remove(id:number) {this.changed(this.entries.filter(entry=>entry.id!==id));}
 clear(endpointId?:string) {this.changed(endpointId?this.entries.filter(entry=>entry.endpointId!==endpointId):[]);}
}
export function restoreHistory(entry:HistoryEntry,endpoint:Endpoint,current:HistoryInputs) {
 const changed=entry.fingerprint!==endpoint.fingerprint;
 const permitted=new Set(endpoint.parameters.map(parameter=>`${parameter.in}:${parameter.name}`));
 const values={...current.values,...Object.fromEntries(Object.entries(entry.inputs.values).filter(([name])=>permitted.has(name)))};
 const bodyCompatible=!changed && entry.inputs.body!==null && Object.hasOwn(endpoint.requestBody?.content??{},entry.inputs.mediaType);
 const headers={...entry.inputs.headers,...Object.fromEntries(Object.entries(current.headers).filter(([name])=>sensitive(name)))};
 return {values,headers,body:bodyCompatible?entry.inputs.body!:current.body,mediaType:bodyCompatible?entry.inputs.mediaType:current.mediaType};
}
