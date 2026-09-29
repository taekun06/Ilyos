/* Tous les bancs de l'IA, d'une commande, avec un bilan clair.

     npm start   puis   npm run verif:ia        (serveur port 8123)

   Chaque scripts/verif-*.js est lancé tour à tour ; le bilan liste les échecs
   et la commande échoue s'il y en a un. Des bancs rouges ont longtemps passé
   inaperçus faute d'être lancés ensemble (verif-finalistes, cassé par le
   commit 8665a7c du 24/09 ; verif-spawn-sur ; verif-depot-magic).

   Exclu : verif-exposes-partie, une mesure sans seuil.                      */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MESURES = new Set(['verif-exposes-partie.js', 'verif-ia.js']);
const bancs = fs.readdirSync(__dirname)
  .filter(f => /^verif-.*\.js$/.test(f) && !MESURES.has(f))
  .sort();

(async () => {
// Sans serveur, chaque banc échouerait sur une connexion refusée : le dire une fois.
const url = process.env.ILYOS_BENCH_URL || 'http://localhost:8123/';
try { await fetch(url); } catch (erreur) {
  console.error(`Serveur injoignable (${url}) : lancer « npm start » avant « npm run verif:ia ».`);
  process.exitCode = 1;
  return;
}
const echecs = [];
for (const banc of bancs) {
  const debut = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, banc)], {
    env: process.env, encoding: 'utf8', timeout: 15 * 60 * 1000
  });
  const secondes = Math.round((Date.now() - debut) / 1000);
  const ok = r.status === 0;
  console.log(`${ok ? 'ok    ' : 'ÉCHEC '} ${banc.padEnd(34)} ${String(secondes).padStart(4)} s`);
  if (!ok) {
    echecs.push(banc);
    const sortie = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(-12).join('\n');
    console.log(sortie.replace(/^/gm, '        '));
  }
}
console.log(`\n${bancs.length - echecs.length}/${bancs.length} bancs verts${echecs.length ? ` — en échec : ${echecs.join(', ')}` : ''}`);
process.exitCode = echecs.length ? 1 : 0;
})();
