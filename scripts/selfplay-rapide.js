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
const TOURS_PERTES = 20;
/* Budget de recherche propre à chaque camp (JSON, ex. '{"tempsMaxMs":1000}'),
   pour mesurer ce qu'apporte plus de réflexion dans un même build. */
/* Poids de l'évaluateur propres à chaque camp (JSON, clés de PLAN_POIDS). */
const POIDS = {
  A: process.env.ILYOS_POIDS_A ? JSON.parse(process.env.ILYOS_POIDS_A) : null,
  B: process.env.ILYOS_POIDS_B ? JSON.parse(process.env.ILYOS_POIDS_B) : null
};
/* Mode personnalisé : ILYOS_PERSO="4,2" (îles, gardiens par joueur). La mise
   en place est jouée en simulation ; ILYOS_DRAFT_A / _B donnent à chaque camp
   ses poids pendant SES choix de mise en place (ex. '{"draftExpert":0}'). */
const PERSO = process.env.ILYOS_PERSO ? process.env.ILYOS_PERSO.split(',').map(Number) : null;
const DRAFT = {
  A: process.env.ILYOS_DRAFT_A ? JSON.parse(process.env.ILYOS_DRAFT_A) : null,
  B: process.env.ILYOS_DRAFT_B ? JSON.parse(process.env.ILYOS_DRAFT_B) : null
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
    /* Plus aucune image : la boucle de rendu 3D se reprogramme par
       requestAnimationFrame, et une dizaine de pages qui dessinent en rendu
       logiciel se disputaient le processeur au point de diviser la cadence
       du banc par dix. Les tours simulés n'en ont aucun besoin. */
    window.requestAnimationFrame = () => 0;
  });
  return page;
}

async function jouerPartie(pages, depart, campA, graine) {
  let etat = depart;
  let vainqueur = null;
  let tour = 0;
  const temps = { A: [], B: [] };
  /* Gardiens PERDUS par camp (éjectés, pas partis valider une couronne),
     en début de partie : c'est là qu'une perte coûte le plus cher. */
  const pertes = { A: 0, B: 0 };
  // Tours dont la réflexion a été coupée par un plafond de TEMPS.
  const coupes = { A: 0, B: 0 };
  for (let i = 0; i < TOURS_MAX; i++) {
    const avant = JSON.parse(etat);
    const joueur = avant.currentPlayer;
    const qui = joueur === campA ? 'A' : 'B';
    const r = await pages[qui].evaluate(([json, g, budget, poids]) =>
      window.ILYOS_SELFPLAY.tour(json, { graine: g, budget, poids }),
      [etat, graine * 1000 + i, BUDGETS[qui], POIDS[qui]]);
    temps[qui].push(r.dureeMs);
    if (r.coupures && (r.coupures.principale || r.coupures.ripostes || r.coupures.magie)) coupes[qui]++;
    const apres = JSON.parse(r.etat);
    if (avant.turn <= TOURS_PERTES) {
      // Par identifiant : une apparition dans le même tour ne masque pas une perte.
      const restants = new Set(apres.characters.map(g => g.id));
      const disparus = [0, 1].map(j => avant.characters
        .filter(g => g.player === j && !restants.has(g.id)).length);
      // Un gardien qui valide quitte aussi le jeu : on le retire du décompte.
      const valides = [0, 1].map(j => (apres.players[j].score || 0) - (avant.players[j].score || 0));
      const perdus = [0, 1].map(j => Math.max(0, disparus[j] - valides[j]));
      pertes[campA === 0 ? 'A' : 'B'] += perdus[0];
      pertes[campA === 1 ? 'A' : 'B'] += perdus[1];
    }
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
  return { vainqueur, tour, scores, temps, pertes, coupes };
}

async function travailleur(navigateur, file, bilan, depart0) {
  const pages = { A: await ouvrir(navigateur, URL_A), B: await ouvrir(navigateur, URL_B) };
  const baseDepart = depart0 || pages.A;
  while (file.length) {
    const graine = file.shift();
    const departClassique = PERSO ? null
      : await baseDepart.evaluate(g => window.ILYOS_SELFPLAY.departMelange(g), graine);
    for (const campA of [0, 1]) {
      const depart = departClassique || await baseDepart.evaluate(([g, iles, gardiens, poids]) =>
        window.ILYOS_SELFPLAY.departPerso(g, { iles, gardiens, poids }),
        [graine, PERSO[0], PERSO[1], campA === 0 ? [DRAFT.A, DRAFT.B] : [DRAFT.B, DRAFT.A]]);
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
      bilan.pertesA += r.pertes.A;
      bilan.pertesB += r.pertes.B;
      bilan.coupesA += r.coupes.A;
      bilan.coupesB += r.coupes.B;
      bilan.toursA += r.temps.A.length;
      bilan.toursB += r.temps.B.length;
      bilan.msA.push(...r.temps.A);
      bilan.msB.push(...r.temps.B);
      console.log(`graine ${graine} A=J${campA} : ${issue} ${couronnesA}-${couronnesB} `
        + `(tour ${r.tour}, ms/tour A ${moy(r.temps.A)} B ${moy(r.temps.B)}, `
        + `perdus<${TOURS_PERTES} A ${r.pertes.A} B ${r.pertes.B}, coupés A ${r.coupes.A} B ${r.coupes.B})`);
    }
  }
}

async function main() {
  const navigateur = await chromium.launch({ headless: true });
  const file = Array.from({ length: PAIRES }, (_, i) => GRAINE + i);
  const bilan = { A: 0, B: 0, nul: 0, couronnesA: 0, couronnesB: 0, pertesA: 0, pertesB: 0, coupesA: 0, coupesB: 0, toursA: 0, toursB: 0,
    tours: [], msA: [], msB: [] };
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
  console.log(`gardiens perdus avant le tour ${TOURS_PERTES} : A ${bilan.pertesA}, B ${bilan.pertesB}`);
  console.log(`tours coupés par le temps : A ${bilan.coupesA}/${bilan.toursA}, B ${bilan.coupesB}/${bilan.toursB}`);
  console.log(`tours moyens ${moy(bilan.tours)} ; ms/tour A ${moy(bilan.msA)} (p95 ${q(bilan.msA)}), B ${moy(bilan.msB)} (p95 ${q(bilan.msB)})`);
  await navigateur.close();
}

main().catch(e => { console.error(e); process.exit(1); });
