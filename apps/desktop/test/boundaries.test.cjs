const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');

function source(file) {
  if (!process.env.RELAY_DESKTOP_ARCHIVE) return fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  const desktopRequire=createRequire(path.join(__dirname,'../package.json'));
  const packagerRequire=createRequire(desktopRequire.resolve('@electron/packager'));
  return packagerRequire('@electron/asar').extractFile(process.env.RELAY_DESKTOP_ARCHIVE,file).toString('utf8');
}

async function harness() {
  const handlers=new Map(),listeners=new Map(),calls=[];
  let options,window,protocolHandler,permissionRequest,permissionCheck,popup;
  const webContents={mainFrame:{url:'relay://desktop/index.html'},
    setWindowOpenHandler:fn=>{popup=fn;},on:(name,fn)=>listeners.set(name,fn)};
  const electron={
    app:{setAppUserModelId(){},isPackaged:true,whenReady:()=>Promise.resolve(),on(){},quit(){}},
    BrowserWindow:class {constructor(input){options=input;window=this;this.webContents=webContents;}
      on(name,fn){listeners.set('window:'+name,fn);}async loadURL(url){calls.push(['load',url]);}},
    ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},
    protocol:{registerSchemesAsPrivileged(){},handle:(_scheme,fn)=>{protocolHandler=fn;}},
    session:{defaultSession:{setPermissionRequestHandler:fn=>{permissionRequest=fn;},setPermissionCheckHandler:fn=>{permissionCheck=fn;}}},
    clipboard:{writeText:text=>calls.push(['copy',text])},
  };
  const files={'index.html':'<!doctype html>','bundle.js':'/* bundled script */'};
  const dependencies={electron,'node:path':path,'node:fs/promises':{
    readdir:async()=>Object.keys(files).map(name=>({name,isDirectory:()=>false,isFile:()=>true})),
    readFile:async file=>files[path.basename(file)],
  },'./request.cjs':{execute:async(input,settings)=>{calls.push(['execute',input,settings]);return {status:200};}}};
  vm.runInNewContext(source('main.cjs'),{require:name=>{assert.ok(Object.hasOwn(dependencies,name));return dependencies[name];},
    __dirname:path.join(__dirname,'..'),Response,URL,AbortController,Buffer,console});
  // The main module initializes its window through an asynchronous asset scan.
  for(let i=0;i<20 && !calls.some(c=>c[0]==='load');i++) await Promise.resolve();
  assert.ok(window && protocolHandler);
  return {options,handlers,listeners,calls,webContents,protocolHandler,permissionRequest,permissionCheck,popup,
    trusted:()=>({sender:webContents,senderFrame:webContents.mainFrame})};
}

test('main keeps the packaged renderer isolated and blocks ambient permissions/navigation',async()=>{
  const h=await harness();
  assert.deepEqual({...h.options.webPreferences}, {
    preload:path.join(__dirname,'../preload.cjs'),contextIsolation:true,sandbox:true,
    nodeIntegration:false,webSecurity:true,devTools:false,
  });
  assert.equal(h.permissionCheck({},'media'),false);
  let allowed;
  h.permissionRequest({},'clipboard-read',value=>{allowed=value;});
  assert.equal(allowed,false);
  assert.equal(h.popup({url:'https://example.test'}).action,'deny');
  for(const name of ['will-navigate','will-attach-webview']) {
    let blocked=false;h.listeners.get(name)({preventDefault(){blocked=true;}});
    assert.equal(blocked,true);
  }
});

test('custom protocol serves only bundled paths with restrictive response policy',async()=>{
  const h=await harness();
  const result=await h.protocolHandler({url:'relay://desktop/index.html',method:'GET'});
  assert.equal(result.status,200);
  assert.match(result.headers.get('content-security-policy'),/connect-src 'none'/);
  assert.match(result.headers.get('content-security-policy'),/frame-src 'none'/);
  assert.equal(result.headers.get('x-content-type-options'),'nosniff');
  assert.equal(await result.text(),'<!doctype html>');
  for(const [url,method] of [['relay://elsewhere/index.html','GET'],['relay://desktop/missing','GET'],['relay://desktop/index.html','POST'],['relay://desktop/../main.cjs','GET']])
    assert.equal((await h.protocolHandler({url,method})).status,404);
  assert.equal(await (await h.protocolHandler({url:'relay://desktop/index.html',method:'HEAD'})).text(),'');
});

test('IPC rejects other renderers, subframes and documents before execution or copying',async()=>{
  const h=await harness(),input={id:'request-one'};
  const events=[{sender:{},senderFrame:h.webContents.mainFrame},
    {sender:h.webContents,senderFrame:{url:'relay://desktop/index.html'}},
    {sender:h.webContents,senderFrame:null}];
  for(const event of events) {
    await assert.rejects(h.handlers.get('request:execute')(event,input),/origin rejected/);
    assert.equal(h.handlers.get('request:cancel')(event,input.id),false);
    assert.throws(()=>h.handlers.get('response:copy')(event,'text'),/rejected/);
  }
  h.webContents.mainFrame.url='relay://desktop/bundle.js';
  await assert.rejects(h.handlers.get('request:execute')(h.trusted(),input),/origin rejected/);
  assert.equal(h.calls.some(c=>['copy','execute'].includes(c[0])),false);
  h.webContents.mainFrame.url='relay://desktop/index.html';
  const response=await h.handlers.get('request:execute')(h.trusted(),input);
  assert.equal(response.response.status,200);
  assert.equal(h.handlers.get('response:copy')(h.trusted(),'response'),true);
  assert.equal(h.calls.filter(c=>c[0]==='execute').length,1);
});

test('preload exposes only the frozen execute/cancel/copy bridge',async()=>{
  let bridge;const calls=[];
  vm.runInNewContext(source('preload.cjs'),{require:name=>{
    assert.equal(name,'electron');
    return {contextBridge:{exposeInMainWorld:(key,value)=>{assert.equal(key,'relayDesktop');bridge=value;}},
      ipcRenderer:{invoke:(...args)=>{calls.push(args);return Promise.resolve();}}};
  }});
  assert.deepEqual(Object.keys(bridge).sort(),['cancel','copy','execute']);
  assert.equal(Object.isFrozen(bridge),true);
  await bridge.execute({id:'one'});await bridge.cancel('one');await bridge.copy('text');
  assert.deepEqual(calls.map(c=>c[0]),['request:execute','request:cancel','response:copy']);
});
