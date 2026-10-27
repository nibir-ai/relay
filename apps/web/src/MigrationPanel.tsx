import {useEffect,useRef,useState} from "react";
import {api,type MigrationPlan} from "./api";

export default function MigrationPanel({token,close,changed}:{token:string;close:()=>void;changed:()=>Promise<void>}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [plan,setPlan]=useState<MigrationPlan|null>(null);
  const [selected,setSelected]=useState<string[]>([]);
  const [busy,setBusy]=useState(true);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const element=dialog.current;
    if (element && !element.open) element.showModal();
    let active=true;
    api.migrationPreview().then(value=>{if(active) setPlan(value);}).catch(err=>{if(active) setError(err instanceof Error?err.message:"Import preview unavailable.");}).finally(()=>{if(active) setBusy(false);});
    return ()=>{active=false;if(element?.open) element.close();previous?.focus({preventScroll:true});};
  },[]);
  async function refresh() {
    setBusy(true);setError("");setPlan(null);setSelected([]);
    try {setPlan(await api.migrationPreview());}
    catch(err){setError(err instanceof Error?err.message:"Import preview unavailable.");}
    finally{setBusy(false);}
  }
  async function apply() {
    if (!plan || busy || !selected.length) return;
    setBusy(true);setError("");setMessage("");
    try {
      const result=await api.migrationApply(token,plan.plan_id,selected);
      setMessage(`${result.imported.length} imported. ${result.message}`);
      setPlan(null);setSelected([]);
      await changed();
    } catch(err){setPlan(null);setSelected([]);setError(err instanceof Error?err.message:"Import stopped. Review a new preview.");}
    finally{setBusy(false);}
  }
  return <dialog ref={dialog} className="auth-panel migration-panel" aria-labelledby="migration-title" aria-describedby="migration-description" onCancel={event=>{event.preventDefault();if(!busy) close();}}>
    <div className="auth-panel-top"><h2 id="migration-title">Import Git statuses</h2><button className="secondary-button" onClick={close} disabled={busy}>Close</button></div>
    <p id="migration-description">Choose matching endpoints to import. Existing team statuses stay as they are. The team service records you as the importer; previous Git authors are shown for review.</p>
    <p>Git files, branches, local notes and API credentials stay unchanged.</p>
    {busy && <p role="status">{plan?"Importing selected statuses…":"Loading preview…"}</p>}
    {error && <p className="auth-error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {plan && <div className="migration-entries">{plan.entries.length===0?<p>No Git statuses found.</p>:plan.entries.map(entry=><label key={entry.endpoint_id} className="migration-entry">
      <input type="checkbox" disabled={busy || !entry.eligible} checked={selected.includes(entry.endpoint_id)} onChange={event=>setSelected(current=>event.target.checked?[...current,entry.endpoint_id]:current.filter(id=>id!==entry.endpoint_id))}/>
      <span><code>{entry.endpoint_id}</code><span>{entry.progress.replaceAll("_"," ")} · Previous author: {entry.previous_author || "Unknown"}</span>{entry.reason && <span>{entry.reason}</span>}</span>
    </label>)}</div>}
    <div className="auth-panel-actions"><button className="secondary-button" disabled={busy} onClick={()=>void refresh()}>Refresh preview</button><button className="authorize-button" disabled={busy || !plan || !selected.length} onClick={()=>void apply()}>Import selected ({selected.length})</button></div>
  </dialog>;
}
