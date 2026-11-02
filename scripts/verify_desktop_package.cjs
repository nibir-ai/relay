const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'..');const desktop=path.join(root,'apps/desktop');const requireDesktop=createRequire(path.join(desktop,'package.json'));const packagerRequire=createRequire(requireDesktop.resolve('@electron/packager'));const asar=packagerRequire('@electron/asar');
const directory=path.join(root,'dist/desktop/Relay-win32-x64');const archive=path.join(directory,'resources/app.asar');const files=new Set(asar.listPackage(archive).map(file=>file.replaceAll('\\','/')));
for(const file of ['/main.cjs','/preload.cjs','/request.cjs','/dist/index.html','/LICENSE','/THIRD_PARTY_NOTICES.md']) assert.ok(files.has(file),'Packaged file missing: '+file);
const html=asar.extractFile(archive,'dist/index.html').toString('utf8');
for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g)){const relative=match[1].replace(/^\.\//,'');assert.ok(!relative.includes('..')&&!relative.startsWith('http'));assert.ok(files.has('/dist/'+relative),'UI asset missing: '+relative);}
assert.ok(fs.existsSync(path.join(directory,'Relay.exe')));assert.ok(fs.existsSync(path.join(directory,'LICENSES.chromium.html')));
assert.ok(![...files].some(file=>file.startsWith('/node_modules/') || file.startsWith('/src/') || file.startsWith('/test/')));
console.log('Packaged Windows executable, entry page, assets and license notices verified.');
