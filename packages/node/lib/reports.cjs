const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const REPORT_LIMIT=32*1024*1024;
function readReport(source) {
  const descriptor=fs.openSync(source,'r');
  try {
    const info=fs.fstatSync(descriptor);
    if (!info.isFile()) throw new Error('Choose a regular .relay endpoint report.');
    if (info.size>REPORT_LIMIT) throw new Error('Relay report exceeds the 32 MiB limit.');
    const chunks=[];let total=0;
    // Read one extra byte to detect growth without allocating an unbounded buffer.
    while (total<=REPORT_LIMIT) {
      const chunk=Buffer.allocUnsafe(Math.min(65536,REPORT_LIMIT+1-total));
      const size=fs.readSync(descriptor,chunk,0,chunk.length,null);
      if (!size) return Buffer.concat(chunks,total);
      total+=size;
      if (total>REPORT_LIMIT) throw new Error('Relay report exceeds the 32 MiB limit.');
      chunks.push(chunk.subarray(0,size));
    }
  } finally { fs.closeSync(descriptor); }
}
function prepareReport(file, directory=path.join(os.homedir(),'.relay','reports')) {
  const source=path.resolve(file);
  if (path.extname(source).toLowerCase()!=='.relay') throw new Error('Choose a .relay endpoint report.');
  const bytes=readReport(source), text=new TextDecoder('utf8',{fatal:true}).decode(bytes);
  if (!text.includes('<meta name="relay-format" content="relay.endpoint.report.v1">') || !text.trimStart().toLowerCase().startsWith('<!doctype html>')) throw new Error('This is not a supported Relay browser report.');
  fs.mkdirSync(directory,{recursive:true});
  const destination=path.join(directory,createHash('sha256').update(bytes).digest('hex')+'.html');
  fs.writeFileSync(destination,bytes); return destination;
}
async function openReport(file) {
  const destination=prepareReport(file), url=pathToFileURL(destination).href;
  const command=process.platform==='win32'?['rundll32.exe',['url.dll,FileProtocolHandler',url]]:process.platform==='darwin'?['open',[url]]:['xdg-open',[url]];
  await new Promise((resolve,reject)=> {
    const child=spawn(command[0],command[1],{windowsHide:true,stdio:'ignore'});
    child.once('error',()=>reject(new Error('Could not open the browser. Open '+destination+' manually.')));
    child.once('close',code=>code===0?resolve():reject(new Error('Could not open the browser. Open '+destination+' manually.')));
  });
  return destination;
}
module.exports={prepareReport,openReport};
