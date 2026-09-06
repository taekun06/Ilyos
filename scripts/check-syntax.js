#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const files = ['sw.js', 'playwright.config.js'];
function collect(directory) {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const file = `${directory}/${entry.name}`;
    // Fragments share an enclosing closure; build:check parses them assembled.
    if (file === 'js/game' || file === 'js/game.js') continue;
    if (entry.isDirectory()) collect(file);
    else if (/\.(?:js|mjs|cjs)$/.test(file)) files.push(file);
  }
}
for (const directory of ['js', 'menu', 'scripts', 'tests']) collect(directory);
let failures = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    failures++;
    console.error(`${file}\n${result.error?.message || result.stderr}`);
  }
}
console.log(`${files.length} fichiers JavaScript autonomes contrôlés ; ${failures} erreur(s).`);
process.exitCode = failures ? 1 : 0;
