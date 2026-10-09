import { useEffect, useId, useRef, useState } from "react";
import { Eye, EyeOff, KeyRound, X } from "lucide-react";
import { normalizeToken } from "./auth";
import type { Endpoint, SessionAuth } from "./types";

export default function AuthPanel({ auth, save, close, endpoint, useShared, advanced }: {
  auth: SessionAuth;
  save: (value: SessionAuth) => void;
  close: () => void;
  endpoint?: Endpoint;
  useShared?: () => void;
  advanced?: () => void;
}) {
  const [token, setToken] = useState(auth.token);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    input.current?.focus();
    return () => {
      if (element?.open) element.close();
      previous?.focus({ preventScroll: true });
    };
  }, []);
  function apply() {
    const value = normalizeToken(token);
    if (!value || /[\r\n\s]/.test(value)) {
      setError("Paste a valid bearer token.");
      input.current?.focus();
      return;
    }
    save({ token: value, enabled: true });
    close();
  }
  return (
    <dialog ref={dialog} className="auth-panel" aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-scope`} onCancel={(e) => { e.preventDefault(); close(); }}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const controls = e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)');
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const box = e.currentTarget.getBoundingClientRect();
        if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) close();
      }}>
      <form onSubmit={(e) => { e.preventDefault(); apply(); }}>
        <div className="auth-panel-top">
          <h2 id={`${id}-title`}>{endpoint ? "Authorize endpoint" : "Shared authorization"}</h2>
          <button type="button" className="icon-button" onClick={close} aria-label="Close authorization"><X size={18} /></button>
        </div>
        {endpoint && <code className="auth-endpoint"><strong>{endpoint.method}</strong> {endpoint.path}</code>}
        <p id={`${id}-scope`}>{endpoint ? "Use a bearer token for this endpoint." : "Use a bearer token across this API."}</p>
        <label htmlFor={`${id}-token`}>Bearer token</label>
        <div className="token-input">
          <input id={`${id}-token`} ref={input} type={show ? "text" : "password"}
            autoComplete="off" spellCheck={false} placeholder="Paste token"
            value={token} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
            onChange={(e) => { setToken(e.target.value); setError(""); }} />
          <button type="button" className="icon-button" onClick={() => setShow(!show)} aria-label={show ? "Hide bearer token" : "Show bearer token"}>
            {show ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
        {error && <p className="auth-error" role="alert" id={`${id}-error`}>{error}</p>}
        <div className="auth-options">
          {endpoint && useShared ? <button type="button" className="text-button" onClick={() => { useShared(); close(); }}>Use shared auth</button> : auth.token ? <button type="button" className="text-button danger" onClick={() => { save({token:"",enabled:false}); close(); }}>Clear token</button> : <span />}
          {advanced && <button type="button" className="text-button" onClick={advanced}>Advanced settings</button>}
        </div>
        <div className="auth-panel-actions">
          <button type="button" className="secondary-button" onClick={close}>Cancel</button>
          <button type="submit" className="authorize-button"><KeyRound size={15} /> Authorize</button>
        </div>
      </form>
    </dialog>
  );
}
