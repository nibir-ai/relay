import { expect, it } from "vitest";
import { redactJson } from "./jsonRedaction";
it("preserves untouched JSON text, numeric lexemes, duplicate keys and whitespace exactly", () => {
 const text=' { "id":9007199254740993, "n":1.2300e+999999, "x":1,"x":2, "a":false }\n';
 expect(redactJson(text).body).toBe(text);expect(redactJson(text).changed).toBe(false);
 const changed=redactJson(text,{pointers:["/a"]});
 expect(changed.body).toBe(text.replace('false','"[REDACTED]"'));
});
it("masks common sensitive keys including escaped names in nested objects and arrays", () => {
 const result=redactJson('{"PASSWORD":"p","rows":[{"api_key":"a"},{"access_\\u0074oken":"b"}],"keep":9007199254740993}');
 expect(result.body).toBe('{"PASSWORD":"[REDACTED]","rows":[{"api_key":"[REDACTED]"},{"access_\\u0074oken":"[REDACTED]"}],"keep":9007199254740993}');
 expect(result.suggestions).toEqual(['/PASSWORD','/rows/0/api_key','/rows/1/access_token']);
});
it("redacts every duplicate occurrence and overlapping parent/child selections", () => {
 expect(redactJson('{"v":{"secret":"one"},"v":{"secret":"two"}}',{pointers:['/v','/v/secret']}).body).toBe('{"v":"[REDACTED]","v":"[REDACTED]"}');
 expect(redactJson('{"v":1,"\\u0076":2}',{pointers:['/v']}).body).toBe('{"v":"[REDACTED]","\\u0076":"[REDACTED]"}');
});
it("uses escaped JSON Pointer keys, root selection and exact array positions", () => {
 const text='{"a/b":{"~key":[false,0,null]},"":true}';
 expect(redactJson(text,{pointers:['/a~1b/~0key/1','/']}).body).toBe('{"a/b":{"~key":[false,"[REDACTED]",null]},"":"[REDACTED]"}');
 expect(redactJson(text,{pointers:['']}).body).toBe('"[REDACTED]"');
 expect(redactJson('[1,2]',{pointers:['/01']}).body).toBe('[1,2]');
});
it("masks known credentials in encoded strings, object keys and numeric values without leaking excerpts", () => {
 const result=redactJson('{"field":"prefix user-\\u0074oken suffix","admin-token":"safe","number":123456}',{secrets:['user-token','admin-token','123456']});
 expect(result.body).toBe('{"field":"[REDACTED]","[REDACTED]":"[REDACTED]","number":"[REDACTED]"}');
 expect(JSON.stringify(result)).not.toContain('admin-token');
 const bad=redactJson('{"field":"user-token\n"}',{secrets:['user-token']});
 expect(bad.body).toBeNull();expect(JSON.stringify(bad)).not.toContain('user-token');
});
it("allows review of suggestions while configured secrets remain mandatory", () => {
 expect(redactJson('{"token":"example","custom":"real"}',{suggested:false,secrets:['real']}).body).toBe('{"token":"example","custom":"[REDACTED]"}');
});
it("returns no partially transformed body for malformed, empty or excessive input", () => {
 for (const text of ['', '{', '[1,]', '{"x":01}', '{"x":true false}', 'NaN', '"unterminated', '['.repeat(130)+'0'+']'.repeat(130), '"'+'x'.repeat(2*1024*1024)+'"', '['+'0,'.repeat(100001)+'0]']) {
  const result=redactJson(text);expect(result.body).toBeNull();expect(result.error).toBeTruthy();expect(result.suggestions).toEqual([]);
 }
});
it("bounds configuration and validates pointers before reading sensitive input", () => {
 for (const pointer of ['x','/~2','/~']) expect(redactJson('{"token":"private"}',{pointers:[pointer]}).body).toBeNull();
 expect(redactJson('{}',{pointers:Array(257).fill('/x')}).body).toBeNull();
 expect(redactJson('{}',{secrets:Array(33).fill('secret')}).body).toBeNull();
 expect(redactJson('{}',{secrets:['x'.repeat(8193)]}).body).toBeNull();
});
it("never evaluates string contents or treats prototype properties as paths", () => {
 const text='{"__proto__":{"constructor":"safe"},"code":"<script>throw new Error()</script>"}';
 expect(redactJson(text,{pointers:['/constructor']}).body).toBe(text);
 expect(redactJson(text,{pointers:['/__proto__/constructor']}).body).toContain('"constructor":"[REDACTED]"');
});

it("caps suggestion metadata explicitly while masking every sensitive field", () => {
 const text='{'+Array.from({length:257},(_,i)=>`"token_${i}":"private_${i}"`).join(',')+'}';
 const result=redactJson(text);
 expect(result.suggestions).toHaveLength(256);expect(result.suggestionsTruncated).toBe(true);
 expect(result.body).not.toContain('private_');expect(result.body?.match(/REDACTED/g)).toHaveLength(257);
});
