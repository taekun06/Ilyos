/* Self-play Expert V3 contre Expert V2.

     node scripts/selfplay-v3-v2.js [nombreDeParties]

   V3 étant exactement V2 plus la couche d'anticipation adverse, on n'embarque
   pas deux planners : on coupe simplement l'anticipation pour un camp, qui joue
   alors comme V2. Les deux camps partagent donc le même code de recherche, la
   seule différence étant celle qu'on veut mesurer.

   Chaque configuration est jouée des DEUX côtés (V3 en joueur 0 puis en joueur
   1) : le premier joueur d'ILYOS pose une île et agit avant l'autre, l'avantage
   du trait doit donc être neutralisé pour que la comparaison veuille dire
   quelque chose.

   Les temporisations sont compressées : depuis la séparation règles/présentation,
   toutes les conséquences de règle sont synchrones et terminées avant que
   l'animation ne commence, donc le rythme n'influence plus les décisions. */

const { chromium } = require('playwright');
const ORIGINE = process.env.ILYOS_BENCH_URL || 'http://localhost:8123/';
const PARTIES = Number(process.argv[2]) || 4;
const DECALAGE = Number(process.argv[3]) || 0;
const VITESSE = 0.12;
const TOURS_MAX = 60;

async function jouerUnePartie(page, camp3, graine) {
  /* Page rechargée à chaque partie : enchaîner plusieurs parties complètes
     dans le même contexte finit par faire tomber l'onglet (scène 3D et
     ressources accumulées). Recharger isole aussi chaque partie de la
     précédente, ce qui est de toute façon souhaitable pour une mesure. */
  await page.goto(ORIGINE);
  await page.waitForFunction(() => typeof window.ILYOS_BENCH?.anticipation === 'function', null, { timeout: 45000 });
  await page.evaluate(async ([sansAnticipation, vitesse, seed, maxTurns]) => {
    window.ILYOS_BENCH.vitesse(vitesse);
    window.ILYOS_BENCH.seed(seed);
    window.ILYOS_BENCH.anticipation(0, true);
    window.ILYOS_BENCH.anticipation(1, true);
    window.ILYOS_BENCH.anticipation(sansAnticipation, false);
    window.ILYOS_TEST.playAIvsAI({ difficulty: 'expert', maxTurns });
  }, [camp3 === 0 ? 1 : 0, VITESSE, graine, TOURS_MAX]);

  await page.waitForFunction(() => window.ILYOS_TEST.autoplay?.active === true, null, { timeout: 60000 });
  await page.waitForFunction(() => window.ILYOS_TEST.autoplay?.active === false, null, { timeout: 15 * 60 * 1000 });

  return await page.evaluate(() => {
    const journal = window.ILYOS_TEST.autoplay.logs || [];
    const dernier = journal[journal.length - 1];
    const etat = window.ILYOS_BENCH.observe(0);
    return {
      message: dernier ? dernier.message : null,
      tour: dernier ? dernier.turn : 0,
      scores: etat.scores,
      vainqueur: etat.vainqueur
    };
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const incidents = [];
  page.on('pageerror', e => incidents.push('exception: ' + e.message));

  await page.goto(ORIGINE);
  await page.waitForFunction(() => typeof window.ILYOS_BENCH?.anticipation === 'function', null, { timeout: 45000 });

  const bilan = { v3: 0, v2: 0, nul: 0, tours: [] };

  for (let i = 0; i < PARTIES; i++) {
    // Alternance stricte des côtés.
    const camp3 = i % 2;
    const graine = 900 + DECALAGE + i;
    const resultat = await jouerUnePartie(page, camp3, graine);
    const vainqueur = resultat.vainqueur;

    let issue = 'nul';
    if (vainqueur === camp3) { bilan.v3++; issue = 'V3'; }
    else if (vainqueur !== null && vainqueur !== undefined) { bilan.v2++; issue = 'V2'; }
    else bilan.nul++;
    bilan.tours.push(resultat.tour);

    console.log(`partie ${i + 1}/${PARTIES} — V3 en joueur ${camp3}, graine ${graine} : `
      + `${issue} (tour ${resultat.tour}, scores ${JSON.stringify(resultat.scores)})`);
    await page.evaluate(() => window.ILYOS_BENCH.reinitialiser());
    await page.waitForTimeout(600);
  }

  const moyenne = bilan.tours.length
    ? (bilan.tours.reduce((a, b) => a + b, 0) / bilan.tours.length).toFixed(1) : 0;

  console.log('');
  console.log('SELF-PLAY V3 contre V2');
  console.log('='.repeat(50));
  console.log(`victoires V3 .......... ${bilan.v3}`);
  console.log(`victoires V2 .......... ${bilan.v2}`);
  console.log(`nulles / non conclues . ${bilan.nul}`);
  console.log(`tours moyens .......... ${moyenne}`);
  console.log(`incidents ............. ${incidents.length ? incidents.join(' | ') : 'aucun'}`);
  console.log('');

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
