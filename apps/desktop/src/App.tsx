import {useEffect,useId,useRef,useState} from "react";
import {Plus,Play,Square,Copy,Check,ArrowDown,LockKeyhole,X} from "lucide-react";
import ResponseText from "../../web/src/ResponseText";
import {formatted} from "../../web/src/request";
import type {ResponseData} from "./types";
type Draft={id:string;method:string;url:string;headers:string;body:string;token:string;response:ResponseData|null;error:string};
const create=():Draft=>({id:crypto.randomUUID(),method:"GET",url:"",headers:'{\n  "Accept": "application/json"\n}',body:"",token:"",response:null,error:""});
const themes=[['everblush','Everblush'],['onedark','One Dark'],['gruvbox','Gruvbox'],['nord','Nord'],['light','Paper']];
const responseTabs=['Body','Raw','Headers'];
function label(draft:Draft){try{return new URL(draft.url).pathname || '/';}catch{return draft.url || 'Untitled request';}}
export default function App(){
 const [drafts,setDrafts]=useState<Draft[]>(()=>[create()]);const [selected,setSelected]=useState(drafts[0].id);
 const [tab,setTab]=useState('Body');const [theme,setTheme]=useState('everblush');const [running,setRunning]=useState<string|null>(null);const [copied,setCopied]=useState(false);
 const active=useRef<string|null>(null);const executeRef=useRef<()=>void>(()=>{});const copyTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const responsePanelId=useId();const tabButtons=useRef<Array<HTMLButtonElement|null>>([]);
 const draft=drafts.find(d=>d.id===selected)!;
 const update=(change:Partial<Draft>,id=selected)=>setDrafts(values=>values.map(value=>value.id===id ? {...value,...change}:value));
 useEffect(()=>{document.documentElement.dataset.theme=theme;},[theme]);
 useEffect(()=>{const keyboard=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();executeRef.current();}};window.addEventListener('keydown',keyboard);return()=>{window.removeEventListener('keydown',keyboard);if(copyTimer.current)clearTimeout(copyTimer.current);};},[]);
 async function send(){
  if(active.current)return;
  update({response:null,error:''});setCopied(false);if(copyTimer.current)clearTimeout(copyTimer.current);
  if(!window.relayDesktop){update({error:'Open the Windows app to send requests. The browser preview has no network bridge.'});return;}
  const id=crypto.randomUUID();
  try{
   let headers:Record<string,string>;try{headers=JSON.parse(draft.headers);}catch{throw Error('Headers must be a valid JSON object.');}
   if(!headers || Array.isArray(headers) || typeof headers!=='object')throw Error('Headers must be a JSON object.');
   headers={...headers};if(draft.token.trim()){for(const key of Object.keys(headers))if(key.toLowerCase()==='authorization')delete headers[key];headers.Authorization='Bearer '+draft.token.trim().replace(/^Bearer\s+/i,'');}
   active.current=id;setRunning(draft.id);update({error:''});
   const result=await window.relayDesktop.execute({id,method:draft.method,url:draft.url,headers,body:['GET','HEAD'].includes(draft.method)?'':draft.body});
   if(result.response){update({response:result.response,error:''},draft.id);setTab('Body');}
   else update({error:result.error || 'Request failed.'},draft.id);
  }catch(error){update({error:error instanceof Error?error.message:'Request failed.'},draft.id);}
  finally{active.current=null;setRunning(null);}
 }
 executeRef.current=()=>void send();
 const response=draft.response;const responseText=response ? tab==='Headers'?JSON.stringify(response.headers,null,2):tab==='Raw'?response.body:formatted(response.body):'';
 async function copy(){try{if(window.relayDesktop) await window.relayDesktop.copy(responseText); else await navigator.clipboard.writeText(responseText);setCopied(true);if(copyTimer.current)clearTimeout(copyTimer.current);copyTimer.current=setTimeout(()=>setCopied(false),1500);}catch{update({error:'Clipboard access failed. Select and copy the response text.'});}}
 return <div className="desktop-shell">
  <header className="desktop-topbar"><div className="desktop-brand"><span className="desktop-wordmark" role="img" aria-label="Relay"/><span>Desktop preview</span></div><div className="desktop-top-actions"><span className="desktop-local">Local workspace</span><select aria-label="Color scheme" value={theme} onChange={e=>setTheme(e.target.value)}>{themes.map(([value,name])=><option key={value} value={value}>{name}</option>)}</select></div></header>
  <aside className="desktop-sidebar"><div className="desktop-sidebar-title"><h2>Requests</h2><button className="icon-button" aria-label="New request" disabled={drafts.length>=10 || !!running} onClick={()=>{const value=create();setDrafts(all=>[...all,value]);setSelected(value.id);}}><Plus size={17}/></button></div>
   <div className="desktop-request-list">{drafts.map(value=><div key={value.id} className={`desktop-request-item${selected===value.id?' selected':''}`}><button className="desktop-request-select" aria-pressed={selected===value.id} onClick={()=>{setSelected(value.id);setTab('Body');}}><span className={`desktop-method method-${value.method.toLowerCase()}`}>{value.method}</span><span>{label(value)}</span></button><button className="icon-button" aria-label={`Close ${label(value)}`} disabled={drafts.length===1 || running===value.id} onClick={()=>{setDrafts(all=>all.filter(d=>d.id!==value.id));if(selected===value.id)setSelected(drafts.find(d=>d.id!==value.id)!.id);}}><X size={13}/></button></div>)}</div>
   <p className="desktop-session-note">Session only<br/>Requests and tokens clear when Relay closes.</p>
  </aside>
  <main className="desktop-workspace"><div className="desktop-workspace-heading"><div><h1>{label(draft)}</h1><span>HTTP request</span></div><span className="desktop-shortcut">Ctrl + Enter to send</span></div>
   <div className="desktop-urlbar"><select aria-label="HTTP method" className={`desktop-method method-${draft.method.toLowerCase()}`} value={draft.method} onChange={e=>update({method:e.target.value})}>{['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].map(method=><option key={method}>{method}</option>)}</select><input aria-label="Request URL" placeholder="https://api.example.com/v1/users" value={draft.url} spellCheck={false} onChange={e=>update({url:e.target.value})}/>{running ? <button className="desktop-send desktop-cancel" onClick={()=>{if(active.current)void window.relayDesktop?.cancel(active.current);}}><Square size={14}/>Cancel</button>:<button className="desktop-send" onClick={()=>void send()}><Play size={14}/>Send</button>}</div>
   <div className="desktop-auth"><label><LockKeyhole size={15}/><span>Bearer token</span><input aria-label="Bearer token" type="password" placeholder="Paste token for this request" autoComplete="off" value={draft.token} onChange={e=>update({token:e.target.value})}/></label><span>30 s timeout · redirects stay visible</span></div>
   <section className="desktop-inputs"><label>Headers <span>JSON object</span><textarea aria-label="Request headers" rows={5} spellCheck={false} value={draft.headers} onChange={e=>update({headers:e.target.value})}/></label><label>Request body <span>{['GET','HEAD'].includes(draft.method)?'Not sent for '+draft.method:'Raw text · set Content-Type in headers'}</span><textarea aria-label="Request body" rows={5} spellCheck={false} disabled={['GET','HEAD'].includes(draft.method)} placeholder="Request body" value={draft.body} onChange={e=>update({body:e.target.value})}/></label></section>
   <section className="desktop-response" aria-label="Response"><div className="desktop-response-heading"><h2><ArrowDown size={16}/>Response</h2><div>{running===draft.id?<span>Request in progress…</span>:response?<><strong className={response.status<400?'status-success':'status-error'}>{response.status} {response.reason}</strong><span>{response.duration_ms} ms</span><span>{(response.captured_bytes/1024).toFixed(2)} KB captured</span></>:<span>{draft.error?'Not completed':'No response captured'}</span>}</div></div>
    {draft.error && <p className="desktop-error" role="alert">{draft.error}</p>}
    {response?<><div className="desktop-response-tools"><div role="tablist" aria-label="Response views">{responseTabs.map((name,index)=><button key={name} ref={node=>{tabButtons.current[index]=node;}} role="tab" aria-selected={tab===name} aria-controls={responsePanelId} tabIndex={tab===name?0:-1} onClick={()=>setTab(name)} onKeyDown={event=>{let next:number;if(event.key==='ArrowRight')next=(index+1)%responseTabs.length;else if(event.key==='ArrowLeft')next=(index+responseTabs.length-1)%responseTabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=responseTabs.length-1;else return;event.preventDefault();setTab(responseTabs[next]);tabButtons.current[next]?.focus();}}>{name}</button>)}</div><button className="text-button" onClick={()=>void copy()}>{copied?<Check size={14}/>:<Copy size={14}/>} {copied?'Copied':'Copy'}</button></div>{response.truncated&&<p className="desktop-truncated">Preview limited to 2 MiB. Remaining data was not downloaded.</p>}<pre id={responsePanelId} role="tabpanel" aria-label={`${tab} response`} tabIndex={0}><ResponseText text={responseText || 'Empty response body'}/></pre></>:<div className="desktop-response-empty"><span>{running===draft.id?'Waiting for the server…':draft.error?'No response received':'Send a request to inspect its response.'}</span><p>{running===draft.id?'Cancel stops this request. Requests time out after 30 seconds.':draft.error?'Check the request or server, then send again.':'Status, timing, headers and the response body appear here.'}</p></div>}
   </section>
  </main>
 </div>;
}
