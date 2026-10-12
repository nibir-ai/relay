const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { targetOrigin, pathOnly, MAX_RESPONSE } = require('./security.cjs');
const { normalize } = require('./openapi.cjs');
const SKIP = new Set(['node_modules','.git','.relay','.venv','dist','build','coverage']);

function sources(project) {
  const root = fs.realpathSync(project), files = [];
  if (!fs.statSync(root).isDirectory()) throw new Error('Project must be a directory.');
  function walk(dir, depth) {
    for (const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
      const file = path.join(dir,entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory() && depth < 5 && !SKIP.has(entry.name) && !entry.name.startsWith('.')) walk(file,depth+1);
      else if (entry.isFile() && /\.[cm]?[jt]s$/.test(entry.name) && fs.statSync(file).size <= 512*1024) {
        if (files.length >= 500) throw new Error('Too many source files. Select a smaller backend project directory.');
        files.push({file,text:fs.readFileSync(file,'utf8')});
      }
    }
  }
  walk(root,0); return {root,files};
}

function initialize(project, apply=false, write=console.log) {
  const {root,files} = sources(project);
  let framework='not detected'; const candidates=[]; let integrated=false;
  for (const source of files) {
    const {text} = source;
    for (const kind of ['express','fastify']) {
      const dependency = new RegExp(`(?:from\\s*['"]${kind}['"]|require\\(['"]${kind}['"]\\))`);
      if (!dependency.test(text)) continue;
      framework=kind;
      if (/(?:from\s*['"]relay-backend['"]|require\(['"]relay-backend['"]\))/.test(text)) integrated=true;
      // Edit only a deliberately small, unambiguous Express entry pattern.
      // Factories, TS, comments/templates, Fastify plugin ordering and other layouts are guided.
      if (kind !== 'express' || /\.ts$/.test(source.file) || /\/\*|`/.test(text)) continue;
      const imports=[...text.matchAll(/^(?:import\s+(\w+)\s+from\s+['"]express['"]\s*;?|const\s+(\w+)\s*=\s*require\(['"]express['"]\)\s*;?)\s*$/gm)];
      if (imports.length !== 1) continue;
      const constructor=imports[0][1] || imports[0][2];
      const assignments=[...text.matchAll(new RegExp(`^const (\\w+) = ${constructor}\\(\\);?\\r?$`,'gm'))];
      if (assignments.length!==1) continue;
      const found=assignments[0];
      // Before the constructor permit only blank/comment, directive or one-line import/require statements.
      // This excludes constructors nested in functions/blocks and parsers registered earlier.
      const prefix=text.slice(0,found.index).replace(/^#![^\n]*\n/,'');
      if (prefix.split(/\r?\n/).some(line => line.trim() && !/^\s*(?:\/\/.*|['"]use strict['"];?|import(?:\s+[\w{},* ]+\s+from)?\s*['"][^'"]+['"];?|const\s+\w+\s*=\s*require\(['"][^'"]+['"]\);?)\s*$/.test(line))) continue;
      if ((text.match(new RegExp(`\\b${constructor}\\s*\\(`,'g')) || []).length!==1) continue;
      candidates.push({...source,match:found,name:found[1],esm:Boolean(imports[0][1])});
    }
  }
  write('Framework: '+framework);
  write('Install if needed: npm install relay-backend');
  if (integrated) { write('Relay import already present. Review the existing mount; no source changes.'); return false; }
  if (candidates.length!==1) {
    write('No source changes. Review your entry file and application lifecycle.');
    write(framework==='fastify' ? "After registering @fastify/swagger, before starting the server:\nimport { relayFastify } from 'relay-backend';\nawait app.register(relayFastify);" : "After creating app, before body parsers:\nimport { relay } from 'relay-backend';\napp.use(relay());");
    write('Node requires generated OpenAPI: expose /openapi.json or supply the openapi option. Restart normally and open /relay.');
    return false;
  }
  const source=candidates[0];
  if (/['"]relay-backend['"]|\brelay\b/.test(source.text)) {
    write('Relay import/name already present. Review the existing mount; no source changes.'); return false;
  }
  const newline=source.text.includes('\r\n')?'\r\n':'\n';
  const importLine=source.esm ? "import { relay } from 'relay-backend';" : "const { relay } = require('relay-backend');";
  const declaration=source.match[0].replace(/\r$/,'');
  const replacement=importLine+newline+declaration+newline+source.name+'.use(relay());'+(source.match[0].endsWith('\r')?'\r':'');
  const edited=source.text.slice(0,source.match.index)+replacement+source.text.slice(source.match.index+source.match[0].length);
  write('Entry: '+path.relative(root,source.file));
  write('Replace:\n'+declaration+'\nWith:\n'+replacement);
  if (apply) {
    if (fs.readFileSync(source.file,'utf8')!==source.text) throw new Error('Entry file changed. Preview again before applying.');
    const temporary=source.file+'.relay-'+randomBytes(8).toString('hex');
    try {
      fs.writeFileSync(temporary,edited,{flag:'wx',mode:fs.statSync(source.file).mode});
      fs.renameSync(temporary,source.file);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    write('Applied integration.');
  } else write('Preview only. Run npx relay-backend init --project <directory> --apply to write this change.');
  write('Expose generated /openapi.json or pass openapi to relay(). Restart normally and open /relay on the existing backend port.');
  return true;
}

function readJson(url) {
  return new Promise((resolve,reject)=> {
    const req=(url.protocol==='https:'?https:http).get(url,{agent:false},res=> {
      const chunks=[]; let size=0;
      res.on('data',chunk=> { size+=chunk.length; if (size>MAX_RESPONSE) req.destroy(new Error('oversize')); else chunks.push(chunk); });
      res.on('error',reject);
      res.on('end',()=> { try { resolve({status:res.statusCode,data:JSON.parse(Buffer.concat(chunks).toString('utf8'))}); } catch { resolve({status:res.statusCode,data:null}); } });
    });
    const timer=setTimeout(()=>req.destroy(new Error('timeout')),5000);
    req.once('error',reject); req.once('close',()=>clearTimeout(timer));
  });
}

async function doctor(project, target, specPath='/openapi.json') {
  const checks=[{name:'runtime',state:'ok',message:`Node ${process.versions.node}; Relay ${require('../package.json').version}`}];
  if (!fs.existsSync(project) || !fs.statSync(project).isDirectory()) { checks.push({name:'project',state:'error',message:'Select an existing backend directory with --project.'}); return {checks}; }
  const git=(...args)=>spawnSync('git',['-C',path.resolve(project),...args],{encoding:'utf8',timeout:5000,windowsHide:true});
  const repo=git('rev-parse','--is-inside-work-tree');
  const remote=repo.status===0 ? git('config','--get','remote.origin.url') : null;
  checks.push({name:'git',state:'info',message:repo.error ? 'Git unavailable or timed out. Install Git for optional status sharing.' : repo.status!==0 ? 'No Git repository. Local testing still works.' : remote?.status===0 ? 'Origin configured; remote access is not tested. Enable syncStatus explicitly for automatic sharing.' : 'No origin remote. Configure one before enabling automatic status sharing.'});
  if (!target) { checks.push({name:'backend',state:'info',message:'Supply --target to check OpenAPI and the native /relay mount.'}); return {checks}; }
  let base;
  try { base=targetOrigin(target); pathOnly(specPath); }
  catch { checks.push({name:'target',state:'error',message:'Use a loopback HTTP origin with a port and a relative spec path.'}); return {checks}; }
  for (const [name,route] of [['openapi',specPath],['mount','/relay/__relay/health']]) {
    try {
      const result=await readJson(new URL(base+route));
      if (result.status!==200) { checks.push({name,state:name==='mount' && result.status===404?'info':'error',message:`HTTP ${result.status}. `+(name==='openapi'?'Check --spec-path or provide generated OpenAPI; redirects are not followed.':'Native mount unavailable; standalone testers do not require it. Verify the Relay mount, restart and check any proxy prefix.')}); continue; }
      try {
        if (name==='openapi') checks.push({name,state:'ok',message:`Valid OpenAPI; ${normalize(result.data).endpoints.length} endpoints.`});
        else if (result.data?.status==='ok' && result.data.mode==='local') checks.push({name,state:'ok',message:'Native /relay mount responds. Standalone testers do not require this mount.'});
        else throw new Error();
      } catch { checks.push({name,state:'error',message:name==='openapi'?'Invalid OpenAPI JSON. Check the schema generator.':'Not a Relay health response. Check the mount and any proxy prefix.'}); }
    } catch { checks.push({name,state:'error',message:'Backend unreachable, oversized or timed out. Start it, check its port/schema and retry.'}); }
  }
  return {checks};
}

module.exports={initialize,doctor};
