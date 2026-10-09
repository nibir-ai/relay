const fs = require('node:fs');
const path = require('node:path');
const root=path.resolve(__dirname,'..');
if (!fs.existsSync(path.join(root,'static/index.html')) || !fs.existsSync(path.join(root,'static/brand/relay-symbol.svg')))
  throw new Error('Bundled UI is missing. Maintainers must run node scripts/package_node.cjs before packing.');
console.log('Bundled Relay UI is present.');
