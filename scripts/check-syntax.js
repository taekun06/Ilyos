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

/* Textures partagées entre modèles KayKit (KAYKIT_TEXTURES_IDENTIQUES,
   js/game/kaykit3d.js) : le jeu charge UNE seule fois chaque nom de cette
   liste, quel que soit le dossier du .gltf. Toutes les copies doivent donc
   rester identiques octet pour octet ; sinon un modèle prendrait l'atlas
   d'un autre sans bruit. */
{
  const crypto = require('node:crypto');
  const source = fs.readFileSync(path.join(root, 'js/game/kaykit3d.js'), 'utf8');
  const liste = /KAYKIT_TEXTURES_IDENTIQUES = new Set\(\[([^\]]*)\]/.exec(source);
  const noms = liste ? [...liste[1].matchAll(/"([^"]+)"/g)].map(m => m[1]) : [];
  const empreintes = new Map();
  (function parcourir(dossier) {
    for (const entree of fs.readdirSync(path.join(root, dossier), { withFileTypes: true })) {
      const fichier = `${dossier}/${entree.name}`;
      if (entree.isDirectory()) parcourir(fichier);
      else if (noms.includes(entree.name)) {
        const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, fichier))).digest('hex');
        if (!empreintes.has(entree.name)) empreintes.set(entree.name, new Map());
        empreintes.get(entree.name).set(h, fichier);
      }
    }
  })('assets/kaykit');
  let differentes = 0;
  for (const [nom, versions] of empreintes) {
    if (versions.size > 1) { differentes++; console.error(`Copies différentes de ${nom} : ${[...versions.values()].join(', ')}`); }
  }
  if (!noms.length) { differentes++; console.error('Liste KAYKIT_TEXTURES_IDENTIQUES introuvable dans kaykit3d.js'); }
  console.log(`Textures KayKit partagées : ${noms.length} noms, ${differentes} incohérence(s).`);
  if (differentes) process.exitCode = 1;
}
process.exitCode = failures ? 1 : 0;
