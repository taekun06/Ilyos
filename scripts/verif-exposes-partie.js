/* Gardiens de l'IA laissés éjectables, sur une vraie partie perdue par l'Expert.

     npm start   puis   node scripts/verif-exposes-partie.js [--rejouer] [fichier]

   Fichier par défaut : tests/positions-defaites/partie-gagnee-expert-t29.json
   (une entrée par tour, instantané après le tour).

   Pour chaque tour de l'IA, on regarde la position où l'humain reprend la
   main avec ses VRAIES cartes : un gardien IA qu'il peut éjecter d'un
   déplacement puis d'une poussée est « exposé » (ILYOS_SELFPLAY.exposes ; la
   MAGIE n'est pas comptée). Sans option, on lit les décisions jouées dans la
   partie ; avec --rejouer, le code courant rejoue chaque décision de l'IA
   depuis la même position (ILYOS_POIDS='{"clé":valeur}' pour comparer des
   poids). La recherche de l'IA n'étant pas strictement reproductible d'une
   page à l'autre, comparer plusieurs passages plutôt qu'un seul.

   Mesure, pas verdict : aucun seuil n'est imposé.                           */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const rejouer = args.includes('--rejouer');
const fichier = args.find(a => !a.startsWith('--'))
  || path.join(__dirname, '../tests/positions-defaites/partie-gagnee-expert-t29.json');
const POIDS = process.env.ILYOS_POIDS ? JSON.parse(process.env.ILYOS_POIDS) : null;

(async () => {
  const tours = JSON.parse(fs.readFileSync(fichier, 'utf8')).tours
    .map(t => ({ ...t, etat: JSON.stringify(t.etat) }));
  const ia = Number(process.env.ILYOS_JOUEUR_IA ?? 1); // l'humain tenait J0
  const navigateur = await chromium.launch({ headless: true });
  try {
    const page = await navigateur.newPage({ viewport: { width: 800, height: 500 } });
    page.on('pageerror', e => console.error('[page]', e.message));
    await page.goto(process.env.ILYOS_BENCH_URL || 'http://localhost:8123/');
    await page.waitForFunction(() => typeof window.ILYOS_SELFPLAY?.exposes === 'function', null, { timeout: 60000 });
    let exposees = 0, decisions = 0;
    for (let i = 1; i < tours.length; i++) {
      if (tours[i].qui !== 'IA') continue;
      let etat = tours[i].etat;
      if (rejouer) {
        const r = await page.evaluate(([j, p]) => window.ILYOS_SELFPLAY.tour(j, { graine: 1, poids: p }),
          [tours[i - 1].etat, POIDS]);
        if (r.fin) continue;
        etat = r.etat;
      }
      const gardiens = await page.evaluate(([j, joueur, p]) => window.ILYOS_SELFPLAY.exposes(j, joueur, p),
        [etat, ia, POIDS]);
      const touches = gardiens.filter(g => g.forceReelle > 0);
      decisions++;
      if (touches.length) exposees++;
      console.log(`tour ${JSON.parse(etat).turn} ${touches.length ? 'EXPOSÉ' : 'ok    '} `
        + gardiens.map(g => `${g.id}@${g.r},${g.c}${g.porteur ? '*' : ''} force ${g.forceReelle} vue ${g.graviteVue.toFixed(2)}`).join(' | '));
    }
    console.log(`décisions de l'IA laissant un gardien éjectable : ${exposees}/${decisions}`
      + (rejouer ? ' (rejouées avec le code courant)' : ' (jouées dans la partie)'));
  } finally {
    await navigateur.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
