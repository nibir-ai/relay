export type JsonRedaction = {
  body: string | null;
  suggestions: string[];
  suggestionsTruncated: boolean;
  changed: boolean;
  error: string | null;
};
type Edit = { start: number; end: number };
const MASK = JSON.stringify("[REDACTED]");
const sensitive = /password|passwd|token|secret|authorization|cookie|credential|api[-_]?key/i;
const escapedPart = (value: string) => value.replace(/~/g, "~0").replace(/\//g, "~1");

// Replace source spans rather than round-tripping through numeric JS values.
// A pointer selects every occurrence when an object contains duplicate keys.
export function redactJson(text: string, options: { pointers?: string[]; secrets?: string[]; suggested?: boolean } = {}): JsonRedaction {
  const suggestions = new Set<string>();
  const fail = (error: string): JsonRedaction => ({ body: null, suggestions: [], suggestionsTruncated: false, changed: false, error });
  try {
    if (text.length > 2 * 1024 * 1024) throw Error("JSON exceeds the redaction size limit; omit this body from the export.");
    if ((options.pointers?.length ?? 0) > 256 || (options.secrets?.length ?? 0) > 32) throw Error("Too many redaction selections or configured secrets.");
    const pointers = new Set(options.pointers ?? []);
    for (const pointer of pointers) if (pointer !== "" && (!pointer.startsWith("/") || /~(?:[^01]|$)/.test(pointer))) throw Error("Invalid JSON Pointer redaction selection.");
    const secrets = (options.secrets ?? []).filter(Boolean);
    if (secrets.some(value => value.length > 8192)) throw Error("Configured secret exceeds the redaction limit.");
    const containsSecret = (value: string) => secrets.some(secret => value.includes(secret));
    let at = 0, nodes = 0, suggestionsTruncated = false;
    const edits: Edit[] = [];
    const number = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
    const space = () => { while (at < text.length && /[\x20\t\r\n]/.test(text[at])) at++; };
    function string(): { start: number; end: number; value: string } {
      const start = at++;
      while (at < text.length) {
        const c = text[at++];
        if (c === '"') return { start, end: at, value: JSON.parse(text.slice(start, at)) as string };
        if (c === "\\") at++;
      }
      throw Error("Invalid JSON; omit this body or correct it before exporting.");
    }
    function read(pointer: string, depth: number, suggested = false) {
      if (depth > 128 || ++nodes > 100000) throw Error("JSON exceeds the redaction complexity limit; omit this body from the export.");
      space(); const start = at, c = text[at];
      let secret = false;
      if (c === '"') secret = containsSecret(string().value);
      else if (c === "{" || c === "[") {
        at++; space(); let index = 0;
        const end = c === "{" ? "}" : "]";
        if (text[at] !== end) while (true) {
          space();
          if (c === "{") {
            if (text[at] !== '"') throw Error("Invalid JSON object; omit this body or correct it before exporting.");
            const key = string(); space();
            if (text[at++] !== ":") throw Error("Invalid JSON object; omit this body or correct it before exporting.");
            if (containsSecret(key.value)) edits.push(key);
            const child = `${pointer}/${escapedPart(key.value)}`;
            const hint = sensitive.test(key.value);
            if (hint && !containsSecret(child) && !suggestions.has(child)) {
              if (suggestions.size < 256) suggestions.add(child);
              else suggestionsTruncated = true;
            }
            read(child, depth + 1, hint);
          } else read(`${pointer}/${index++}`, depth + 1);
          space(); if (text[at] !== ",") break; at++;
        }
        if (text[at++] !== end) throw Error("Invalid JSON container; omit this body or correct it before exporting.");
      } else {
        let primitive = "";
        for (const word of ["true", "false", "null"]) if (text.startsWith(word, at)) { primitive = word; break; }
        if (!primitive) { number.lastIndex = at; primitive = number.exec(text)?.[0] ?? ""; }
        if (!primitive) throw Error("Invalid or empty JSON; omit this body or correct it before exporting.");
        at += primitive.length; secret = containsSecret(primitive);
      }
      if (pointers.has(pointer) || secret || suggested && options.suggested !== false) edits.push({ start, end: at });
    }
    read("", 0); space();
    if (at !== text.length) throw Error("Invalid JSON trailing content; omit this body or correct it before exporting.");
    edits.sort((a, b) => a.start - b.start || b.end - a.end);
    let cursor = 0, body = "";
    for (const edit of edits) {
      if (edit.start < cursor) continue;
      body += text.slice(cursor, edit.start) + MASK;
      cursor = edit.end;
    }
    body += text.slice(cursor);
    return { body, suggestions: [...suggestions], suggestionsTruncated, changed: edits.length > 0, error: null };
  } catch (error) {
    // Never include parser excerpts, which may contain a credential.
    return fail(error instanceof SyntaxError ? "Invalid JSON string; omit this body or correct it before exporting." : error instanceof Error ? error.message : "JSON could not be reviewed; omit this body from the export.");
  }
}
