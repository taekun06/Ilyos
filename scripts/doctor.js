#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
let failures = 0;
function check(label, ok, fix) {
  console.log(`${ok ? 'OK' : 'MANQUANT'} — ${label}${ok ? '' : ` : ${fix}`}`);
  if (!ok) failures++;
}
const major = Number(process.versions.node.split('.')[0]);
check(`Node ${process.versions.node}`, major >= 20, 'installer Node 24 LTS');
if (major !== 24) console.log('INFO — Node 24 est la version de référence du projet (.nvmrc).');
const git = spawnSync('git', ['--version'], { encoding: 'utf8' });
check('Git', git.status === 0, 'installer Git');
try {
  const { chromium } = require('@playwright/test');
  const version = require('@playwright/test/package.json').version;
  check(`Playwright ${version}`, true);
  check('Chromium Playwright', fs.existsSync(chromium.executablePath()), 'npm run test:install');
} catch {
  check('Playwright', false, 'npm ci puis npm run test:install');
}
const build = spawnSync(process.execPath, ['scripts/build-game.js'], { cwd: root, encoding: 'utf8' });
check('Bundle synchronisé avec ses sources', build.status === 0, 'npm run build ; si échec, corriger la syntaxe');
for (const file of ['vendor/three.min.js', 'vendor/GLTFLoader.js', 'vendor/OrbitControls.js', 'vendor/SkeletonUtils.js', 'vendor/peerjs.min.js']) {
  check(file, fs.existsSync(path.join(root, file)), 'restaurer le fichier versionné');
}
console.log('\nDémarrer : npm run dev | Vérifier : npm run check | Tester : npm run test:smoke');
console.log('Ce diagnostic ne valide pas les connexions aux abonnements ni le rendu GPU.');
process.exitCode = failures ? 1 : 0;
