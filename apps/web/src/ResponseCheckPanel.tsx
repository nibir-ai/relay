import { useRef, useState } from "react";
import { evaluateCheck, type ResponseCheck, type CheckResult } from "./responseChecks";
import type { LiveResponse } from "./types";

export type CheckDraft = { kind: ResponseCheck["kind"]; pointer: string; expected: string };
const labels = { status: "HTTP status", duration: "Maximum duration (ms)", exists: "JSON field exists", equals: "JSON field equals" };
const states = { pass: "Passed", fail: "Failed", invalid: "Invalid check", unavailable: "Unavailable" };
export default function ResponseChecks({ response, value, onChange, busy = false }: {
  response: LiveResponse | null;
  value: CheckDraft[];
  onChange: (value: CheckDraft[]) => void;
  busy?: boolean;
}) {
  const [checked, setChecked] = useState<{ response: LiveResponse; config: CheckDraft[]; results: CheckResult[] } | null>(null);
  const summary = useRef<HTMLElement>(null);
  function evaluate() { return value.map(draft => {
    const check: ResponseCheck = draft.kind === "status" ? { kind: "status", expected: Number(draft.expected) }
      : draft.kind === "duration" ? { kind: "duration", maximum: draft.expected.trim() ? Number(draft.expected) : NaN }
      : draft.kind === "exists" ? { kind: "exists", pointer: draft.pointer }
      : { kind: "equals", pointer: draft.pointer, expected: draft.expected };
    return evaluateCheck(check, response);
  }); }
  const results = checked?.response === response && checked?.config === value ? checked.results : null;
  function edit(index: number, change: Partial<CheckDraft>) {
    setChecked(null);
    onChange(value.map((item, i) => i === index ? { ...item, ...change } : item));
  }
  return <details className="response-checks">
    <summary ref={summary}>Response checks{value.length > 0 && <span> {value.length}{results ? ` · ${results.filter(r => r.state === "pass").length} passed` : ""}</span>}</summary>
    <p>Check the captured response without sending another request. Checks stay in this tab and do not change endpoint status.</p>
    {value.map((draft, index) => <fieldset key={index} className="response-check-row">
      <legend>Check {index + 1}</legend>
      <div className="check-inputs">
        <label>Type<select value={draft.kind} onChange={e => edit(index, { kind: e.target.value as CheckDraft["kind"], expected: "", pointer: "" })}>
          {Object.entries(labels).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
        </select></label>
        {(draft.kind === "exists" || draft.kind === "equals") && <label>JSON Pointer<input value={draft.pointer} maxLength={1024} placeholder="/data/role" onChange={e => edit(index, { pointer: e.target.value })}/><span className="muted">Leave empty for the whole body.</span></label>}
        {draft.kind !== "exists" && <label>{draft.kind === "equals" ? "Expected JSON value" : draft.kind === "status" ? "Expected status" : "Maximum ms"}<input value={draft.expected} maxLength={8192} inputMode={draft.kind === "equals" ? "text" : "decimal"} placeholder={draft.kind === "equals" ? '\"admin\"' : draft.kind === "status" ? "200" : "500"} onChange={e => edit(index, { expected: e.target.value })}/></label>}
        <button type="button" className="text-button" aria-label={`Remove check ${index + 1}`} onClick={() => { setChecked(null); onChange(value.filter((_, i) => i !== index)); summary.current?.focus(); }}>Remove</button>
      </div>
      {results && <div className={`check-result check-${results[index].state}`} role="status">
        <strong>{states[results[index].state]}</strong>
        <dl><div><dt>Expected</dt><dd>{results[index].expected}</dd></div><div><dt>Observed</dt><dd>{results[index].observed}</dd></div></dl>
      </div>}
    </fieldset>)}
    <div className="check-actions">
      <button type="button" className="secondary-button" disabled={value.length >= 10} onClick={() => { setChecked(null); onChange([...value, { kind: "status", expected: "200", pointer: "" }]); }}>Add check</button>
      {value.length > 0 && <><button type="button" className="secondary-button" disabled={!response || busy} onClick={() => { if(response) setChecked({ response, config: value, results: evaluate() }); }}>Check response</button><button type="button" className="text-button" onClick={() => { setChecked(null); onChange([]); summary.current?.focus(); }}>Clear checks</button></>}
    </div>
    {value.length >= 10 && <p className="muted">Limit: 10 checks per endpoint.</p>}
    {!response && <p className="muted">Execute a request to capture a response first.</p>}
    {value.some(d => d.kind === "duration") && <p className="muted">Duration checks cover one observed request, not a performance guarantee.</p>}
  </details>;
}
