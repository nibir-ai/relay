import {afterEach,describe,expect,it} from 'vitest';
// @ts-expect-error The documentation site is a standalone browser module.
import {mountSearch} from '../../../website/search.mjs';

const entry={title:'FastAPI',section:'Bearer auth',url:'/guides/fastapi/#bearer-auth',text:'Paste a bearer token.'};
function setup(load:()=>Promise<unknown>){
 document.body.innerHTML='<search id="doc-search" hidden><input id="docs-query"><button id="search-clear" hidden>Clear</button><p id="search-status"></p><button id="search-retry" hidden>Retry</button><ol id="search-results" hidden></ol></search>';
 mountSearch(document,load);
 return document.querySelector('input')!;
}
async function type(input:HTMLInputElement,text:string){input.value=text;input.dispatchEvent(new Event('input'));await new Promise(resolve=>setTimeout(resolve,0));}
afterEach(()=>{document.body.replaceChildren();});
describe('documentation search',()=>{
 it('loads once, creates section links and supports keyboard focus and clear',async()=>{
  let calls=0;const input=setup(async()=>{calls++;return[entry];});
  await type(input,'bearer');
  expect(document.querySelector('a')?.getAttribute('href')).toBe(entry.url);
  expect(document.getElementById('search-status')?.textContent).toBe('1 matching section.');
  input.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
  expect(document.activeElement).toBe(document.querySelector('a'));
  await type(input,'auth');expect(calls).toBe(1);
  document.getElementById('search-clear')!.click();
  expect(input.value).toBe('');expect(document.activeElement).toBe(input);
  expect(document.querySelector('a')).toBeNull();
 });
 it('handles no matches and Escape without loading for short queries',async()=>{
  let calls=0;const input=setup(async()=>{calls++;return[entry];});
  await type(input,'a');expect(calls).toBe(0);
  await type(input,'unknown');expect(document.getElementById('search-status')?.textContent).toContain('No matching sections');
  input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
  expect(input.value).toBe('');expect(document.getElementById('search-results')!.hidden).toBe(true);
 });
 it('allows retry after a failed index request',async()=>{
  let calls=0;const input=setup(async()=>{if(++calls===1)throw Error('offline');return[entry];});
  await type(input,'bearer');expect(document.getElementById('search-retry')!.hidden).toBe(false);
  document.getElementById('search-retry')!.click();await new Promise(resolve=>setTimeout(resolve,0));
  expect(calls).toBe(2);expect(document.querySelector('a')).not.toBeNull();
 });
 it('does not revive results when the query is cleared while loading',async()=>{
  let finish!:(value:unknown)=>void;const input=setup(()=>new Promise(resolve=>{finish=resolve;}));
  await type(input,'bearer');await type(input,'');finish([entry]);await new Promise(resolve=>setTimeout(resolve,0));
  expect(document.querySelector('a')).toBeNull();
  expect(document.getElementById('doc-search')!.hasAttribute('aria-busy')).toBe(false);
 });
 it('renders source text safely and ignores external or protocol-relative routes',async()=>{
  const input=setup(async()=>[{...entry,section:'<img src=x onerror=alert(1)> bearer'}, {...entry,url:'//outside.example/'}, {...entry,url:'javascript:alert(1)'}]);
  await type(input,'bearer');expect(document.querySelectorAll('a')).toHaveLength(1);
  expect(document.querySelector('img')).toBeNull();
  expect(document.querySelector('strong')?.textContent).toContain('<img');
 });
 it('keeps versioned guide routes searchable',async()=>{
  const input=setup(async()=>[{...entry,url:'/guides/release-0.0.6/#bearer-auth'}]);
  await type(input,'bearer');
  expect(document.querySelector('a')?.getAttribute('href')).toBe('/guides/release-0.0.6/#bearer-auth');
 });
});
