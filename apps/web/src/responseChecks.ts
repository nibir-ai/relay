import type { LiveResponse } from "./types";

export type ResponseCheck =
  | { kind: "status"; expected: number }
  | { kind: "duration"; maximum: number }
  | { kind: "exists"; pointer: string }
  | { kind: "equals"; pointer: string; expected: string };
export type CheckResult = { state: "pass" | "fail" | "unavailable" | "invalid"; expected: string; observed: string };
type Value = { kind: "number"; value: string } | { kind: "scalar"; value: string | boolean | null } | { kind: "array"; value: Value[] } | { kind: "object"; value: Map<string, Value> };
const MAX_TEXT = 2 * 1024 * 1024;

// Keep numeric lexemes intact. Object duplicates are ambiguous for field checks.
function parse(text: string): Value {
  if (text.length > MAX_TEXT) throw Error("JSON exceeds the check size limit.");
  let at = 0, nodes = 0;
  const numberToken = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const space = () => { while (/[\x20\t\r\n]/.test(text[at] ?? "") && at < text.length) at++; };
  function string(): string {
    const start = at++;
    while (at < text.length) {
      const c = text[at++];
      if (c === '"') return JSON.parse(text.slice(start, at)) as string;
      if (c === "\\") at++;
    }
    throw Error("Invalid JSON string.");
  }
  function read(depth: number): Value {
    if (depth > 128 || ++nodes > 100000) throw Error("JSON exceeds the check complexity limit.");
    space();
    const c = text[at];
    if (c === '"') return { kind: "scalar", value: string() };
    if (c === "{" || c === "[") {
      at++; space();
      const object = new Map<string, Value>(), array: Value[] = [];
      const end = c === "{" ? "}" : "]";
      if (text[at] !== end) {
        while (true) {
          space();
          if (c === "{") {
            if (text[at] !== '"') throw Error("Invalid JSON object key.");
            const key = string(); space();
            if (text[at++] !== ":") throw Error("Invalid JSON object.");
            if (object.has(key)) throw Error("Duplicate JSON keys cannot be checked unambiguously.");
            object.set(key, read(depth + 1));
          } else array.push(read(depth + 1));
          space();
          if (text[at] !== ",") break;
          at++;
        }
      }
      if (text[at++] !== end) throw Error("Invalid JSON container.");
      return c === "{" ? { kind: "object", value: object } : { kind: "array", value: array };
    }
    for (const [word, value] of [["true", true], ["false", false], ["null", null]] as const) {
      if (text.startsWith(word, at)) { at += word.length; return { kind: "scalar", value }; }
    }
    numberToken.lastIndex = at;
    const number = numberToken.exec(text);
    if (!number) throw Error("Invalid or empty JSON.");
    if (number[0].length > 4096) throw Error("JSON number exceeds the check precision budget.");
    at += number[0].length;
    return { kind: "number", value: number[0] };
  }
  const result = read(0); space();
  if (at !== text.length) throw Error("Invalid JSON trailing content.");
  return result;
}
function numeric(value: string): string {
  const [mantissa, exponent = "0"] = value.toLowerCase().split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  let digits = (whole + fraction).replace(/^-/, "").replace(/^0+/, "");
  if (!digits) return "0";
  const zeros = digits.length - digits.replace(/0+$/, "").length;
  digits = digits.slice(0, digits.length - zeros);
  return `${value.startsWith("-") ? "-" : ""}${digits}e${BigInt(exponent) - BigInt(fraction.length) + BigInt(zeros)}`;
}
function equal(a: Value, b: Value): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "number" && b.kind === "number") return numeric(a.value) === numeric(b.value);
  if (a.kind === "scalar" && b.kind === "scalar") return a.value === b.value;
  if (a.kind === "array" && b.kind === "array") return a.value.length === b.value.length && a.value.every((v, i) => equal(v, b.value[i]));
  if (a.kind === "object" && b.kind === "object") return a.value.size === b.value.size && [...a.value].every(([k, v]) => b.value.has(k) && equal(v, b.value.get(k)!));
  return false;
}
function render(value: Value): string {
  if (value.kind === "number") return value.value;
  if (value.kind === "scalar") return JSON.stringify(value.value);
  if (value.kind === "array") return `[${value.value.map(render).join(",")}]`;
  return `{${[...value.value].map(([k, v]) => `${JSON.stringify(k)}:${render(v)}`).join(",")}}`;
}
function parts(pointer: string): string[] {
  if (pointer === "") return [];
  if (!pointer.startsWith("/") || /~(?:[^01]|$)/.test(pointer)) throw Error("Use a JSON Pointer such as /data/role; escape ~ as ~0 and / as ~1.");
  return pointer.slice(1).split("/").map(p => p.replace(/~1/g, "/").replace(/~0/g, "~"));
}
export function evaluateCheck(check: ResponseCheck, response: LiveResponse | null): CheckResult {
  const expected: string = check.kind === "status" ? String(check.expected) : check.kind === "duration" ? `at most ${check.maximum} ms` : check.kind === "exists" ? "field exists" : check.expected;
  const result = (state: CheckResult["state"], observed: string): CheckResult => ({ state, expected, observed });
  try {
    if (check.kind === "status" && (!Number.isInteger(check.expected) || check.expected < 100 || check.expected > 599)) throw Error("Expected status must be an integer from 100 to 599.");
    if (check.kind === "duration" && (!Number.isFinite(check.maximum) || check.maximum < 0)) throw Error("Maximum duration must be a finite non-negative number.");
    const path = check.kind === "exists" || check.kind === "equals" ? parts(check.pointer) : [];
    const wanted = check.kind === "equals" ? parse(check.expected) : null;
    if (!response) return result("unavailable", "No captured response.");
    if (check.kind === "status") return result(response.status === check.expected ? "pass" : "fail", String(response.status));
    if (check.kind === "duration") return Number.isFinite(response.duration_ms) && response.duration_ms >= 0 ? result(response.duration_ms <= check.maximum ? "pass" : "fail", `${response.duration_ms} ms`) : result("unavailable", "Response duration is unavailable.");
    if (response.truncated) return result("unavailable", "Response is truncated; JSON checks require the complete body.");
    if (!/(?:^|\/)json(?:\s*;|$)|\+json(?:\s*;|$)/i.test(response.content_type)) return result("unavailable", "Response content type is not JSON.");
    let value: Value | undefined;
    try { value = parse(response.body); } catch (error) { return result("unavailable", error instanceof Error ? error.message : "Cannot read response JSON."); }
    for (const part of path) {
      if (value?.kind === "object") value = value.value.get(part);
      else if (value?.kind === "array" && /^(?:0|[1-9]\d*)$/.test(part) && Number.isSafeInteger(Number(part))) value = value.value[Number(part)];
      else value = undefined;
    }
    if (!value) return result("fail", "Field is missing.");
    if (check.kind === "exists") return result("pass", render(value));
    return result(equal(value, wanted!) ? "pass" : "fail", render(value));
  } catch (error) { return result("invalid", error instanceof Error ? error.message : "Invalid check configuration."); }
}
