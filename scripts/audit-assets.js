#!/usr/bin/env node
// Disk inventory, not a measurement of network traffic or proof of unused files.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const files = [];
function collect(directory) {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) collect(file);
    else if (entry.isFile()) files.push({ path: file, bytes: fs.statSync(path.join(root, file)).size });
  }
}
for (const directory of ['assets', 'menu/assets', 'vendor']) collect(directory);
files.sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path));
const groups = {};
for (const file of files) {
  const key = file.path.startsWith('assets/kaykit/') ? file.path.split('/').slice(0, 3).join('/') : file.path.split('/').slice(0, 2).join('/');
  const group = groups[key] ||= { files: 0, bytes: 0 };
  group.files++;
  group.bytes += file.bytes;
}
const report = { files: files.length, bytes: files.reduce((sum, f) => sum + f.bytes, 0), groups, largest: files.slice(0, 15) };
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  const mb = bytes => `${(bytes / 1e6).toFixed(2)} Mo`;
  console.log(`${report.files} fichiers — ${mb(report.bytes)} sur disque (assets, menu/assets, vendor).`);
  console.log('\nDossiers :');
  for (const [name, group] of Object.entries(groups).sort((a, b) => b[1].bytes - a[1].bytes)) {
    console.log(`${mb(group.bytes).padStart(10)}  ${String(group.files).padStart(4)} fichiers  ${name}`);
  }
  console.log('\n15 fichiers les plus lourds :');
  for (const file of report.largest) console.log(`${mb(file.bytes).padStart(10)}  ${file.path}`);
  console.log('\nCe total ne représente pas le chargement initial. Aucun fichier supprimé ou optimisé.');
  console.log('Provenance, licences et circuit d’import : docs/ASSETS.md');
}
