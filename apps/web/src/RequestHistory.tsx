import {useRef,useState,useSyncExternalStore} from "react";
import {SessionHistory,type HistoryEntry} from "./history";
import type {Endpoint} from "./types";
export default function RequestHistory({history,endpoint,busy,restore}:{history:SessionHistory;endpoint:Endpoint;busy:boolean;restore:(entry:HistoryEntry,reviewed:boolean)=>void}) {
 const details=useRef<HTMLDetailsElement>(null);
 const entries=useSyncExternalStore(history.subscribe,history.snapshot);
 const rows=entries.filter(entry=>entry.endpointId===endpoint.id).slice().reverse();
 const [selected,setSelected]=useState<number|null>(null);
 const [reviewed,setReviewed]=useState(false);
 const entry=rows.find(row=>row.id===selected);
 const changed=entry?.fingerprint!==endpoint.fingerprint;
 return <details ref={details} className="request-history">
  <summary>Request history <span>({rows.length})</span></summary>
  <p className="muted">This tab only. Restore inputs, then execute when ready. Responses and authorization credentials are not copied into history.</p>
  <div className="history-actions"><button className="text-button" disabled={!rows.length} onClick={()=>history.clear(endpoint.id)}>Clear endpoint history</button><button className="text-button" disabled={!entries.length} onClick={()=>history.clear()}>Clear all history</button></div>
  {!rows.length && <p>No requests recorded in this tab.</p>}
  <ol className="history-list">{rows.map(row=><li key={row.id}>
   <time dateTime={row.at}>{new Date(row.at).toLocaleTimeString()}</time>
   <strong>{row.outcome==='network_error'?'Network error':`HTTP ${row.status}`}</strong>
   {row.duration!==undefined && <span>{row.duration} ms</span>}
   {row.truncated && <span>Response was truncated</span>}
   <button className="secondary-button" disabled={busy} aria-label={`Review request ${row.id}`} aria-expanded={selected===row.id} onClick={()=>{setSelected(selected===row.id?null:row.id);setReviewed(false);}}>Review inputs</button>
   <button className="text-button" aria-label={`Remove request ${row.id}`} onClick={()=>history.remove(row.id)}>Remove</button>
  </li>)}</ol>
  {entry && <section className="history-preview" aria-label="Historical request inputs">
   <h3>Review before restoring</h3>
   <p>Current inputs will be replaced where compatible. Your current response, body when omitted, and authorization settings stay available.</p>
   {entry.omitted && <p role="status">Sensitive inputs or an unsupported body were omitted. Re-enter missing values before executing.</p>}
   {changed && <label><input type="checkbox" checked={reviewed} onChange={event=>setReviewed(event.target.checked)}/> I reviewed the current contract. Restore matching parameters only.</label>}
   <pre tabIndex={0}>{JSON.stringify({parameters:entry.inputs.values,headers:entry.inputs.headers,content_type:entry.inputs.mediaType},null,2)}</pre>
   <pre tabIndex={0}>{entry.inputs.body??'Body not retained; current body will be kept.'}</pre>
   <div className="history-actions"><button className="secondary-button" disabled={busy || changed && !reviewed} onClick={()=>{restore(entry,reviewed);setSelected(null);if(details.current){details.current.open=false;details.current.querySelector("summary")?.focus();}}}>Restore inputs</button><button className="text-button" onClick={()=>setSelected(null)}>Cancel restore</button></div>
  </section>}
 </details>;
}
