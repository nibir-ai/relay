import { useEffect, useId, useState } from "react";
import type { ActivityEvent, Endpoint, EndpointMeta } from "./types";
import { progressLabels } from "./progress";

export type NoteDraft = { value: string; saved: string; fingerprint: string };
const eventNames: Record<string, string> = {
  discovered: "Discovered", removed: "Removed from source", contract_changed: "Contract changed",
  progress_changed: "Status changed", note_updated: "Local note saved", contract_reviewed: "Contract reviewed",
};

export default function Handoff({ endpoint, meta, activity, drafts, save, busy }: {
  endpoint: Endpoint; meta?: EndpointMeta; activity: ActivityEvent[];
  drafts: Map<string, NoteDraft>; save: (note: string) => Promise<void>; busy: boolean;
}) {
  const id = useId();
  const stored = drafts.get(endpoint.id);
  const [draft, setDraft] = useState<NoteDraft>(stored ?? { value: meta?.note ?? "", saved: meta?.note ?? "", fingerprint: endpoint.fingerprint });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const dirty = draft.value !== draft.saved;
  const stale = dirty && draft.fingerprint !== endpoint.fingerprint;
  useEffect(() => {
    if (draft.value === draft.saved) {
      const next = { value: meta?.note ?? "", saved: meta?.note ?? "", fingerprint: endpoint.fingerprint };
      setDraft(next); drafts.delete(endpoint.id);
    }
  }, [meta?.note, endpoint.fingerprint, endpoint.id, drafts]);
  function edit(value: string) {
    const next = { ...draft, value };
    setDraft(next); drafts.set(endpoint.id, next); setError(""); setMessage("");
  }
  async function submit() {
    if (pending || busy || !dirty) return;
    if (stale) { setError("The contract changed. Review it, then use the current contract before saving."); return; }
    setPending(true); setError(""); setMessage("");
    const note = draft.value;
    try {
      await save(note);
      setDraft({ value: note, saved: note, fingerprint: endpoint.fingerprint });
      const current = drafts.get(endpoint.id);
      if (!current || current.value === note) drafts.delete(endpoint.id);
      else drafts.set(endpoint.id, { ...current, saved: note });
      setMessage("Local note saved.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save. Your edit is retained."); }
    finally { setPending(false); }
  }
  const events = activity.filter(event => event.endpoint_id === endpoint.id).slice(0, 10);
  return <details className="handoff">
    <summary>Notes &amp; activity{dirty ? " · Unsaved edit" : meta?.note ? " · Has note" : ""}</summary>
    <p className="muted">Done is a manual team status. Request success does not approve an API. Notes stay local; Git shares statuses only.</p>
    <label htmlFor={id}>Local endpoint note</label>
    <textarea id={id} value={draft.value} maxLength={4000} disabled={pending} rows={3}
      onChange={event => edit(event.target.value)} aria-describedby={`${id}-help`} />
    <small id={`${id}-help`}>{draft.value.length}/4000 characters · Saved in this Relay workspace</small>
    {stale && <p role="status">Contract changed while this note was being edited. Review the current definition before saving.</p>}
    <div className="handoff-actions">
      <button className="secondary-button" disabled={!dirty || pending || busy} onClick={() => void submit()}>{pending ? "Saving…" : "Save note"}</button>
      <button className="text-button" disabled={!dirty || pending} onClick={() => {
        setDraft({ value: meta?.note ?? "", saved: meta?.note ?? "", fingerprint: endpoint.fingerprint });
        drafts.delete(endpoint.id); setMessage(""); setError("");
      }}>Cancel edit</button>
      {stale && <button className="text-button" onClick={() => {
        const next = { ...draft, fingerprint: endpoint.fingerprint }; setDraft(next); drafts.set(endpoint.id, next); setError("");
      }}>Use current contract</button>}
    </div>
    {error && <p className="auth-error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    <h3>Recent local activity</h3>
    {!events.length ? <p className="muted">No recorded activity for this endpoint.</p> : <ol className="endpoint-activity">{events.map(event => <li key={event.id}>
      <span>{eventNames[event.kind] ?? event.kind}{event.value && event.kind !== "note_updated" ? ` · ${progressLabels[event.value as keyof typeof progressLabels] ?? event.value}` : ""}</span>
      <time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time>
    </li>)}</ol>}
  </details>;
}
