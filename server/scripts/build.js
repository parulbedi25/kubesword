// Copies src -> dist (plain JS, no compilation needed) so electron-builder
// packages a clean server directory.
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'src');
const dist = path.join(__dirname, '..', 'dist');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

function copyDir(from, to) {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}
copyDir(src, dist);
console.log('server build: src -> dist OK');
