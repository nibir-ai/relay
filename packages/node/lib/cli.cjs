#!/usr/bin/env node
const http = require('node:http');
const { relay, version } = require('./index.cjs');

async function main(args = process.argv.slice(2)) {
  if (args.includes('--version')) { console.log(version); return; }
  if (args.includes('--help') || !args.length) {
    console.log('Relay API testing\n\nnpx relay-backend --target http://127.0.0.1:3000 [--spec-path /openapi.json] [--port 4477] [--project <directory>] [--sync-status]\nnpx relay-backend open <report.relay>\n\nFor native /relay on your existing backend port, mount the relay middleware or relayFastify plugin.'); return;
  }
  if (args[0]==='open') {
    const { openReport } = require('./reports.cjs');
    if (args.length!==2) throw new Error('Usage: relay-backend open <report.relay>');
    console.log('Opened '+await openReport(args[1])); return;
  }
  const options={}; let port=4477;
  for (let i=0;i<args.length;i++) {
    const key=args[i];
    if (key==='--sync-status') { options.syncStatus=true; continue; }
    if (!['--target','--spec-path','--port','--project'].includes(key) || !args[i+1]) throw new Error('Unknown or missing argument. Run relay-backend --help.');
    const value=args[++i];
    if (key==='--port') port=Number(value);
    else options[{'--target':'target','--spec-path':'specPath','--project':'project'}[key]]=value;
  }
  if (!options.target || !Number.isInteger(port) || port<1 || port>65535) throw new Error('Provide --target and a valid port. Run relay-backend --help.');
  const tester=relay(options), server=http.createServer(tester);
  server.on('error',error=> { console.error('Relay could not listen: '+error.code); process.exitCode=1; });
  server.listen(port,'127.0.0.1',()=>console.log(`Relay: http://127.0.0.1:${port}/relay/`));
  server.on('close',()=>void tester.close());
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal,()=> { server.close(); server.closeAllConnections(); });
}
if (require.main===module) main().catch(error=> { console.error(error.message); process.exitCode=1; });
module.exports={main};
