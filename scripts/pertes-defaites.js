/* Gardiens de l'IA perdus dans des défaites HUMAINES exportées (lot de la
   bibliothèque des défaites, bouton d'export groupé).

     npm start   puis   node scripts/pertes-defaites.js <lot.json>

   Pour chaque tour humain, on prend la position de départ (vraies cartes de
   l'humain) et on regarde les gardiens IA disparus à la fin du tour :
     vu-accepté           l'IA voyait la menace (gravité > 0) ;
     invisible-poussée    gravité 0, mais un gardien humain déjà en jeu pouvait
                          le pousser dans le vide avec ses vraies cartes ;
     apparition-poussée   un gardien humain apparu ce tour-ci à deux cases ;
     magie / autre        île tournée / le reste.
   ILYOS_POIDS='{"clé":valeur}' pour juger avec d'autres poids.
   Mesure, pas verdict : aucun seuil n'est imposé.                           */

const fs = require('fs');
const { chromium } = require('playwright');
const lot = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const POIDS = process.env.ILYOS_POIDS ? JSON.parse(process.env.ILYOS_POIDS) : null;
(async () => {
  const nav = await chromium.launch({ headless: true });
  const page = await nav.newPage({ viewport: { width: 640, height: 400 } });
  page.on('pageerror', e => console.error('[page]', e.message));
  await page.goto(process.env.ILYOS_BENCH_URL || 'http://localhost:8123/');
  await page.waitForFunction(() => typeof window.ILYOS_SELFPLAY?.exposes === 'function', null, { timeout: 60000 });
  const bilan = {};
  for (const [n, d] of lot.defaites.entries()) {
    const ia = d.joueurs.find(j => j.ia).id;
    const T = d.tours;
    for (let i = 0; i + 1 < T.length; i++) {
      if (!T[i].ia || T[i + 1].ia || !T[i + 1].etat) continue;
      const debut = T[i + 1].etat;
      const fin = (T[i + 2] && T[i + 2].etat) || d.etatFinal;
      if (!fin) continue;
      const avant = JSON.parse(debut), apres = JSON.parse(fin);
      const g = await page.evaluate(([j, m, p]) => window.ILYOS_SELFPLAY.exposes(j, m, p), [debut, ia, POIDS]);
      const vivants = new Set(apres.characters.map(c => c.id));
      const ids = new Set(avant.characters.map(c => c.id));
      const apparus = apres.characters.filter(c => !ids.has(c.id) && c.player !== ia);
      const iles = new Map(avant.islands.map(x => [x.id, JSON.stringify(x.cells)]));
      const magie = apres.islands.some(x => iles.has(x.id) && iles.get(x.id) !== JSON.stringify(x.cells));
      const main = g[0] ? `main ${g[0].mainReelle.move}M/${g[0].mainReelle.push}P` : '';
      for (const v of g) {
        const mort = !vivants.has(v.id);
        let cle = null;
        if (mort) {
          if (v.graviteVue > 0) cle = 'vu-accepté';
          else if (v.forceReelle > 0) cle = 'invisible-poussée (pièces déjà là)';
          else if (apparus.some(a => Math.abs(a.r - v.r) + Math.abs(a.c - v.c) <= 2)) cle = 'apparition-poussée';
          else if (magie) cle = 'magie';
          else cle = 'autre';
          cle += v.porteur ? ' (porteur)' : '';
          bilan[cle] = (bilan[cle] || 0) + 1;
        }
        if (mort || v.forceReelle > 0) console.log(`#${n} T${T[i+1].tour} ${v.id}@${v.r},${v.c}${v.porteur ? '*' : ''} force ${v.forceReelle} vue ${v.graviteVue.toFixed(2)} ${main} res ${JSON.stringify(v.reserve)} ${mort ? '→ PERDU ' + cle : 'survit'}`);
      }
    }
  }
  const total = Object.values(bilan).reduce((a, b) => a + b, 0);
  console.log(`\nGardiens IA perdus : ${total}`);
  for (const [k, v] of Object.entries(bilan).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(40)} ${v}`);
  await nav.close();
})().catch(e => { console.error(e); process.exit(1); });
