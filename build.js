const fs = require('fs');
const path = require('path');

const root = __dirname;
const source = path.join(root, 'prototypes', 'seeker-city-3d');
const out = path.join(root, 'dist');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const file of ['index.html', 'style.css', 'world.js']) {
  const from = path.join(source, file);
  if (!fs.existsSync(from)) throw new Error(`Missing production source: ${from}`);
  fs.copyFileSync(from, path.join(out, file));
}

const assets = path.join(source, 'assets');
if (!fs.existsSync(assets)) throw new Error(`Missing production assets: ${assets}`);
fs.cpSync(assets, path.join(out, 'assets'), { recursive: true });

console.log('Seeker Summer 3D production site built in dist/');
