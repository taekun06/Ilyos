#!/usr/bin/env node
// Rebuild the existing bundle without adding a bundler or runtime dependency.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
function build() {
  const result = spawnSync(process.execPath, ['scripts/build-game.js', '--write'], {
    cwd: root, stdio: 'inherit'
  });
  if (result.error) console.error(result.error.message);
  return !result.error && result.status === 0;
}

if (!build()) process.exit(1);
let timer;
const watcher = fs.watch(path.join(root, 'js/game'), (_event, filename) => {
  if (filename && !filename.toString().endsWith('.js')) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (build()) console.log('ILYOS : sources reconstruites. Rechargez le navigateur.');
    else console.error('ILYOS : build refusé ; le dernier bundle valide reste servi. Corrigez puis enregistrez.');
  }, 150);
});
watcher.on('error', error => {
  console.error('ILYOS : surveillance interrompue :', error.message);
  process.exit(1);
});
// Same process: stopping the development command also stops its server/watcher.
require('./dev-server.js');
