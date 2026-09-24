/* Self-play CROISÉ RAPIDE entre deux builds, sans rendu.

     node scripts/selfplay-rapide.js [parties] [graineDeDépart] [parallèle]

   Deux serveurs sont attendus :
     ILYOS_URL_A (défaut 8123) → build candidat
     ILYOS_URL_B (défaut 8125) → build de référence (worktree d'un commit)

   Différence avec selfplay-croise.js : chaque tour est joué en SIMULATION par
   `ILYOS_SELFPLAY.tour`, sans animation, mais avec le budget de réflexion réel
   du jeu. Une partie prend alors une à deux minutes au lieu de dix, ce qui
   rend enfin possible un échantillon qui veut dire quelque chose.

   Chaque graine est jouée DEUX fois, camps inversés : le premier joueur pose et
   agit avant l'autre, et le tirage des cartes doit être le même des deux côtés
   pour qu'une différence vienne du cerveau et non de la chance. */

const { chromium } = require('playwright');

const URL_A = process.env.ILYOS_URL_A || 'http://localhost:8123/';
const URL_B = process.env.ILYOS_URL_B || 'http://localhost:8125/';
const PAIRES = Math.max(1, Math.ceil((Number(process.argv[2]) || 20) / 2));
const GRAINE = Number(process.argv[3]) || 5000;
const PARALLELE = Math.max(1, Number(process.argv[4]) || 2);
const TOURS_MAX = Number(process.env.ILYOS_TOURS_MAX) || 120;
/* Budget de recherche propre à chaque camp (JSON, ex. '{"tempsMaxMs":1000}'),
   pour mesurer ce qu'apporte plus de réflexion dans un même build. */
/* Poids de l'évaluateur propres à chaque camp (JSON, clés de PLAN_POIDS). */
const POIDS = {
  A: process.env.ILYOS_POIDS_A ? JSON.parse(process.env.ILYOS_POIDS_A) : null,
  B: process.env.ILYOS_POIDS_B ? JSON.parse(process.env.ILYOS_POIDS_B) : null
};
const BUDGETS = {
  A: process.env.ILYOS_BUDGET_A ? JSON.parse(process.env.ILYOS_BUDGET_A) : undefined,
  B: process.env.ILYOS_BUDGET_B ? JSON.parse(process.env.ILYOS_BUDGET_B) : undefined
};

async function ouvrir(navigateur, url) {
  const page = await navigateur.newPage({ viewport: { width: 640, height: 400 } });
  page.on('pageerror', e => console.error(`[${url}] ${e.message}`));
  await page.goto(url, { timeout: 120000 });
  await page.waitForFunction(() => typeof window.ILYOS_SELFPLAY?.tour === 'function', null, { timeout: 60000 });
  /* Une partie doit exister : `state` sert de position de départ et de
     support à la simulation. On l'arrête avant que l'IA n'agisse. */
  await page.evaluate(() => {
    window.ILYOS_BENCH.vitesse(0.05);
    window.ILYOS_TEST.playAIvsAI({ difficulty: 'expert', maxTurns: 1 });
  });
  await page.waitForFunction(() => window.ILYOS_BENCH.observe(0) && window.ILYOS_TEST.autoplay?.active === true,
    null, { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => {
    window.ILYOS_TEST.stopAutoplay?.();
    window.ILYOS_BENCH.reinitialiser();
  });
  return page;
}

async function jouerPartie(pages, depart, campA, graine) {
  let etat = depart;
  let vainqueur = null;
  let tour = 0;
  const temps = { A: [], B: [] };
  for (let i = 0; i < TOURS_MAX; i++) {
    const joueur = JSON.parse(etat).currentPlayer;
    const qui = joueur === campA ? 'A' : 'B';
    const r = await pages[qui].evaluate(([json, g, budget, poids]) =>
      window.ILYOS_SELFPLAY.tour(json, { graine: g, budget, poids }),
      [etat, graine * 1000 + i, BUDGETS[qui], POIDS[qui]]);
    temps[qui].push(r.dureeMs);
    etat = r.etat;
    tour = r.tour;
    vainqueur = r.vainqueur;
    if (r.fin || (vainqueur !== null && vainqueur !== undefined)) break;
  }
  const scores = JSON.parse(etat).players.map(p => p.score || 0);
  // Partie coupée ou plateau saturé : départage aux couronnes.
  if (vainqueur === null || vainqueur === undefined || vainqueur === -1 || typeof vainqueur !== 'number') {
    vainqueur = scores[0] === scores[1] ? null : (scores[0] > scores[1] ? 0 : 1);
  }
  return { vainqueur, tour, scores, temps };
}

async function travailleur(navigateur, file, bilan, depart0) {
  const pages = { A: await ouvrir(navigateur, URL_A), B: await ouvrir(navigateur, URL_B) };
  const baseDepart = depart0 || pages.A;
  while (file.length) {
    const graine = file.shift();
    const depart = await baseDepart.evaluate(g => window.ILYOS_SELFPLAY.departMelange(g), graine);
    for (const campA of [0, 1]) {
      const r = await jouerPartie(pages, depart, campA, graine);
      const couronnesA = r.scores[campA];
      const couronnesB = r.scores[1 - campA];
      bilan.couronnesA += couronnesA;
      bilan.couronnesB += couronnesB;
      let issue = 'nul';
      if (r.vainqueur === campA) { bilan.A++; issue = 'A'; }
      else if (r.vainqueur !== null) { bilan.B++; issue = 'B'; }
      else bilan.nul++;
      bilan.tours.push(r.tour);
      const moy = t => t.length ? Math.round(t.reduce((a, b) => a + b, 0) / t.length) : 0;
      bilan.msA.push(...r.temps.A);
      bilan.msB.push(...r.temps.B);
      console.log(`graine ${graine} A=J${campA} : ${issue} ${couronnesA}-${couronnesB} `
        + `(tour ${r.tour}, ms/tour A ${moy(r.temps.A)} B ${moy(r.temps.B)})`);
    }
  }
}

async function main() {
  const navigateur = await chromium.launch({ headless: true });
  const file = Array.from({ length: PAIRES }, (_, i) => GRAINE + i);
  const bilan = { A: 0, B: 0, nul: 0, couronnesA: 0, couronnesB: 0, tours: [], msA: [], msB: [] };
  /* La position de départ vient toujours de la même page, pour que toutes les
     paires partent réellement du même plateau. */
  const reference = await ouvrir(navigateur, URL_A);
  await Promise.all(Array.from({ length: PARALLELE }, () => travailleur(navigateur, file, bilan, reference)));

  const n = bilan.A + bilan.B + bilan.nul;
  const p = n ? (bilan.A + bilan.nul / 2) / n : 0;
  const ecart = n ? Math.sqrt(p * (1 - p) / n) : 0;
  const q = t => { const s = [...t].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length * 0.95)] : 0; };
  const moy = t => t.length ? Math.round(t.reduce((a, b) => a + b, 0) / t.length) : 0;
  console.log('');
  console.log(`SELF-PLAY RAPIDE — A ${URL_A} contre B ${URL_B}`);
  console.log(`parties ${n} : A ${bilan.A}, B ${bilan.B}, nuls ${bilan.nul}`);
  console.log(`score A ${(100 * p).toFixed(1)} % ± ${(100 * ecart).toFixed(1)} (1σ)`);
  console.log(`couronnes A ${bilan.couronnesA}, B ${bilan.couronnesB}`);
  console.log(`tours moyens ${moy(bilan.tours)} ; ms/tour A ${moy(bilan.msA)} (p95 ${q(bilan.msA)}), B ${moy(bilan.msB)} (p95 ${q(bilan.msB)})`);
  await navigateur.close();
}

main().catch(e => { console.error(e); process.exit(1); });
