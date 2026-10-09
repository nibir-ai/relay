const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root=path.resolve(__dirname,'..'), packageRoot=path.join(root,'packages/node');
const npm=path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const npmBinary=fs.existsSync(npm)?process.execPath:'npm';
const npmPrefix=fs.existsSync(npm)?[npm]:[];
function run(args) {
  const result=spawnSync(npmBinary,[...npmPrefix,...args],{cwd:root,stdio:'inherit'});
  if (result.status!==0) throw new Error('npm command failed.');
}
run(['--prefix',path.join(root,'apps/web'),'run','build']);
const destination=path.join(packageRoot,'static');
if (fs.existsSync(destination)) {
  if (fs.realpathSync(destination)!==destination) throw new Error('Unexpected asset directory.');
  fs.rmSync(destination,{recursive:true});
}
fs.cpSync(path.join(root,'apps/web/dist'),destination,{recursive:true});
fs.mkdirSync(path.join(root,'dist'),{recursive:true});
run(['pack',packageRoot,'--pack-destination',path.join(root,'dist')]);
