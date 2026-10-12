import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import Operations from "./Operations";
import { formatted } from "./request";
import type { Endpoint } from "./types";

it("renders a 1,000-endpoint snapshot and retains near-limit response text without formatting", () => {
  const endpoints: Endpoint[] = Array.from({length:1000},(_,index)=>({id:`GET /items/${index}`,method:"GET",path:`/items/${index}`,summary:"Scale fixture",description:"",tags:["Items"],deprecated:false,parameters:[],requestBody:null,responses:{},security:[],fingerprint:String(index)}));
  const start=performance.now();
  const markup=renderToStaticMarkup(<Operations snapshot={{title:"Scale fixture",version:"1",hash:"scale",securitySchemes:{},endpoints}}
    workspace={{endpoints:{},activity:[]}} selected="" select={()=>{}} search="" setSearch={()=>{}} searchRef={createRef()}
    loading={false} busy={false} update={()=>{}} render={()=>null} authorize={()=>{}} />);
  const renderMs=performance.now()-start;
  expect(markup).toContain("/items/999"); expect(markup).toContain("1000 endpoints");
  const response='"'+'x'.repeat(2*1024*1024-2)+'"',responseStart=performance.now();
  expect(formatted(response)).toBe(response);
  console.info(`Scale check: 1,000 endpoint SSR render ${renderMs.toFixed(1)}ms; near-2 MiB response formatting bypass ${(performance.now()-responseStart).toFixed(1)}ms. SSR timings are not browser interaction measurements.`);
});
