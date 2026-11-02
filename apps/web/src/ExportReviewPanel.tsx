import { useEffect, useId, useMemo, useRef, useState } from "react";
import { X, Download } from "lucide-react";
import { downloadExport, endpointExport, exportFilename } from "./export";
import { reviewExport } from "./exportReview";
import ResponseText from "./ResponseText";
export type ExportCapture = { value: ReturnType<typeof endpointExport>; secrets: string[]; format: "json" | "relay" };
export default function ExportReviewPanel({ capture, close }: { capture: ExportCapture; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const [format, setFormat] = useState(capture.format);
  const [requestPaths, setRequestPaths] = useState("");
  const [responsePaths, setResponsePaths] = useState("");
  const [maskSuggested, setMaskSuggested] = useState(true);
  const [omitRequestBody, setOmitRequestBody] = useState(false);
  const [omitResponseBody, setOmitResponseBody] = useState(false);
  const [includeOpaque, setIncludeOpaque] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  const pointers = (text: string) => text.split("\n").map(p => p.trim()).filter(Boolean);
  const pathsInvalid = [requestPaths, responsePaths].some(text => pointers(text).some(p => !p.startsWith("/") || /~(?:[^01]|$)/.test(p)) || pointers(text).length > 256);
  const reviewed = useMemo(() => reviewExport(capture.value, { secrets: capture.secrets, requestPointers: pointers(requestPaths), responsePointers: pointers(responsePaths), requestSuggestions: maskSuggested, responseSuggestions: maskSuggested, omitRequestBody, omitResponseBody, includeOpaque }), [capture, requestPaths, responsePaths, maskSuggested, omitRequestBody, omitResponseBody, includeOpaque]);
  const value = reviewed.value;
  const body = (text: string | null | undefined) => text === null || text === undefined ? "No body" : text || "Empty body";
  return <dialog ref={dialog} className="export-review" aria-labelledby={title} onCancel={event => { event.preventDefault(); close(); }}>
    <div className="export-review-heading"><h2 id={title}>Review export</h2><button type="button" className="icon-button" aria-label="Close export review" onClick={close}><X size={18}/></button></div>
    <p>This is a captured copy. Changes here affect only the downloaded file. Review custom private fields before sharing.</p>
    <div className="export-review-settings">
      <label>File format<select value={format} onChange={e => setFormat(e.target.value as "json" | "relay")}><option value="relay">Relay (.relay)</option><option value="json">JSON (.json)</option></select></label>
      <label><input type="checkbox" checked={maskSuggested} onChange={e => setMaskSuggested(e.target.checked)}/>Mask common sensitive JSON fields</label>
      <label><input type="checkbox" checked={omitRequestBody} onChange={e => setOmitRequestBody(e.target.checked)}/>Omit request body</label>
      <label><input type="checkbox" checked={omitResponseBody} onChange={e => setOmitResponseBody(e.target.checked)}/>Omit response body</label>
      <label><input type="checkbox" checked={includeOpaque} onChange={e => setIncludeOpaque(e.target.checked)}/>Include non-JSON bodies after review</label>
    </div>
    <p className="muted">Configured credentials and sensitive headers remain masked. Non-JSON, malformed and truncated bodies are omitted by default.</p>
    <details className="export-field-controls"><summary>Redact additional JSON fields</summary><p>One JSON Pointer per line, such as /data/email. Select a parent to mask its entire value. Duplicate keys are all selected. To omit the whole body, use the controls above.</p>
      <div className="export-review-grid"><label>Request redaction paths<textarea value={requestPaths} maxLength={32768} rows={3} aria-invalid={pathsInvalid || undefined} onChange={e => setRequestPaths(e.target.value)}/></label><label>Response redaction paths<textarea value={responsePaths} maxLength={32768} rows={3} aria-invalid={pathsInvalid || undefined} onChange={e => setResponsePaths(e.target.value)}/></label></div>
      {reviewed.suggestions.request.length > 0 && <p>Request suggestions: <code>{reviewed.suggestions.request.join(", ")}</code></p>}
      {reviewed.suggestions.response.length > 0 && <p>Response suggestions: <code>{reviewed.suggestions.response.join(", ")}</code></p>}
    </details>
    {pathsInvalid && <p role="alert" className="export-review-error">Use up to 256 JSON Pointers per body. Begin each with / and escape ~ as ~0 and / in a field name as ~1.</p>}
    {reviewed.error && <p role="alert" className="export-review-error">{reviewed.error}</p>}
    {value && <>
      <h3>{value.endpoint.method} {value.endpoint.path}</h3><p>{value.endpoint.summary}</p>
      {value.review.omissions.length > 0 && <ul className="export-omissions">{value.review.omissions.map((note, index) => <li key={index}>{note}</li>)}</ul>}
      <div className="export-review-grid">
        <section><h3>Current request</h3><code className="export-review-url">{value.current_request.url}</code><pre tabIndex={0} aria-label="Reviewed request body"><ResponseText text={body(value.current_request.body)}/></pre><details><summary>Request metadata</summary><pre tabIndex={0}>{JSON.stringify({...value.current_request,body:undefined},null,2)}</pre></details></section>
        <section><h3>Captured response{value.latest_response ? ` · ${value.latest_response.status}` : ""}</h3><p className="muted">{value.latest_response ? `${value.latest_response.duration_ms} ms · ${value.latest_response.bytes} bytes captured` : "No response captured"}</p><pre tabIndex={0} aria-label="Reviewed response body"><ResponseText text={value.latest_response ? body(value.latest_response.body) : "No response captured"}/></pre><details><summary>Response metadata</summary><pre tabIndex={0}>{JSON.stringify(value.latest_response ? {...value.latest_response,body:undefined}:null,null,2)}</pre></details></section>
      </div>
      <details><summary>Complete reviewed data</summary><pre tabIndex={0} aria-label="Complete reviewed data">{JSON.stringify(value,null,2)}</pre></details>
    </>}
    {downloadError && <p role="alert" className="export-review-error">{downloadError}</p>}
    <div className="export-review-actions"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button type="button" className="execute-button" disabled={!value || pathsInvalid} onClick={() => { if(!value || pathsInvalid) return; try { downloadExport(exportFilename(value.endpoint,format), value, format); setDownloadError(""); } catch { setDownloadError("Download failed. Try again or copy the reviewed data manually."); } }}><Download size={15}/>Download {format === "relay" ? ".relay" : "JSON"}</button></div>
  </dialog>;
}
