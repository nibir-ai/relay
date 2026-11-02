const {app,BrowserWindow,ipcMain,protocol,session,clipboard}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const {execute}=require('./request.cjs');
const ORIGIN='relay://desktop';
protocol.registerSchemesAsPrivileged([{scheme:'relay',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
app.setAppUserModelId('online.nibir.relay');
let window; const active=new Map();
function trusted(event) { return window && event.sender===window.webContents && event.senderFrame===window.webContents.mainFrame && event.senderFrame.url===ORIGIN+'/index.html'; }
async function createWindow() {
  const root=path.join(__dirname,'dist');const assets=new Map();
  async function scan(dir) { for(const entry of await fs.readdir(dir,{withFileTypes:true})) { const file=path.join(dir,entry.name);if(entry.isDirectory()) await scan(file);else if(entry.isFile()) assets.set('/'+path.relative(root,file).split(path.sep).join('/'),file); } }
  await scan(root);
  if(!assets.has("/index.html")) throw Error("Desktop UI entry point is missing.");
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.json':'application/json'};
  protocol.handle('relay',async request=>{
    const url=new URL(request.url);const file=assets.get(url.pathname);
    if(url.host!=='desktop' || !file || !['GET','HEAD'].includes(request.method)) return new Response('Not found',{status:404});
    return new Response(request.method==='HEAD' ? null : await fs.readFile(file),{headers:{'Content-Type':types[path.extname(file)] || 'application/octet-stream','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'",'X-Content-Type-Options':'nosniff'}});
  });
  session.defaultSession.setPermissionRequestHandler((_web,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  window=new BrowserWindow({title:'Relay',width:1360,height:960,minWidth:960,minHeight:680,backgroundColor:'#10191d',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,devTools:!app.isPackaged}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',event=>event.preventDefault());
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  window.on('closed',()=>{for(const controller of active.values()) controller.abort();active.clear();window=null;});
  await window.loadURL(ORIGIN+'/index.html');
}
ipcMain.handle('request:execute',async(event,input)=>{
  if(!trusted(event)) throw Error('Request origin rejected.');
  if(active.size) return {error:'Cancel the running request before sending another.'};
  if(!input || typeof input.id!=='string' || input.id.length>64) return {error:'Invalid request id.'};
  const controller=new AbortController();active.set(input.id,controller);
  try{return {response:await execute(input,{signal:controller.signal})};}
  catch(error){return {error:error.message};}
  finally{active.delete(input.id);}
});
ipcMain.handle('request:cancel',(event,id)=>{
  if(!trusted(event) || typeof id!=='string') return false;
  const controller=active.get(id);controller?.abort();return !!controller;
});
ipcMain.handle('response:copy',(event,text)=>{if(!trusted(event) || typeof text!=='string' || Buffer.byteLength(text)>6*1024*1024) throw Error('Copy rejected.');clipboard.writeText(text);return true;});
app.whenReady().then(createWindow).catch(()=>{console.error('Relay could not start. Build the desktop assets before launching.');app.quit();});
app.on('window-all-closed',()=>app.quit());
