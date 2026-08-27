/* Self-play CROISÉ entre deux builds du jeu.

     node scripts/selfplay-croise.js [parties] [décalageDeGraine]

   Pourquoi ce script existe. Le premier self-play coupait l'anticipation
   adverse pour un camp et appelait ce camp « V2 ». C'était faux : plusieurs
   modifications du Prompt 3 touchent du code PARTAGÉ par le planner — la notion
   de menace élargie utilisée par l'évaluateur et le générateur de déplacements,
   et le plafonnement de la génération MAGIC. L'interrupteur ne les désactivait
   pas. Le camp dit « V2 » bénéficiait donc d'améliorations postérieures au
   commit de référence, et la comparaison ne mesurait pas ce qu'elle annonçait.

   Ici, chaque camp joue dans SON build. Une partie faisant normalement jouer les
   deux IA dans la même page, l'état est transporté d'un build à l'autre entre
   chaque tour via ILYOS_BENCH.jouerUnTour / etatComplet.

   Deux serveurs sont attendus :
     8123 → HEAD (Expert V3)
     8125 → worktree du commit de référence (Expert V2)
   Les côtés sont alternés d'une partie à l'autre : le premier joueur d'ILYOS
   pose et agit avant l'autre, cet avantage doit être neutralisé. */

const { chromium } = require('playwright');

const URL_V3 = process.env.ILYOS_URL_V3 || 'http://localhost:8123/';
const URL_V2 = process.env.ILYOS_URL_V2 || 'http://localhost:8125/';
const PARTIES = Number(process.argv[2]) || 4;
const DECALAGE = Number(process.argv[3]) || 0;
const TOURS_MAX = 60;
const VITESSE = 0.12;

async function ouvrir(navigateur, url) {
  const page = await navigateur.newPage({ viewport: { width: 900, height: 600 } });
  await page.goto(url);
  await page.waitForFunction(() => typeof window.ILYOS_BENCH?.jouerUnTour === 'function', null, { timeout: 45000 });
  return page;
}

async function preparerPartie(page, graine) {
  await page.evaluate(async ([seed, vitesse]) => {
    window.ILYOS_BENCH.vitesse(vitesse);
    window.ILYOS_BENCH.seed(seed);
    window.ILYOS_TEST.playAIvsAI({ difficulty: 'expert', maxTurns: 1 });
  }, [graine, VITESSE]);
  await page.waitForFunction(() => window.ILYOS_TEST.autoplay?.active === true, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    window.ILYOS_TEST.stopAutoplay?.();
    window.ILYOS_BENCH.reinitialiser();
  });
  await page.waitForTimeout(1200);
  return await page.evaluate(() => window.ILYOS_BENCH.etatComplet());
}

async function jouerPartie(pageV3, pageV2, campV3, graine) {
  // La position de départ vient toujours du même build, pour que les deux
  // parties d'un couple partent réellement de la même position.
  let etat = await preparerPartie(pageV3, graine);
  /* Le build V2 doit lui aussi avoir une partie en cours : sans cela son
     `state` est nul et le chargement d'instantané n'a rien à écrire. La
     position qu'il crée est aussitôt remplacée par celle du relais. */
  await preparerPartie(pageV2, graine);

  let vainqueur = null;
  let tour = 0;

  for (let i = 0; i < TOURS_MAX && vainqueur === null; i++) {
    const joueurCourant = JSON.parse(etat).currentPlayer;
    const page = joueurCourant === campV3 ? pageV3 : pageV2;
    const resultat = await page.evaluate(async json => await window.ILYOS_BENCH.jouerUnTour(json), etat);
    etat = resultat.etat;
    tour = resultat.tour;
    vainqueur = resultat.vainqueur;
  }

  return { vainqueur, tour, scores: JSON.parse(etat).players.map(p => p.score || 0) };
}

async function main() {
  const navigateur = await chromium.launch({ headless: true });
  const pageV3 = await ouvrir(navigateur, URL_V3);
  const pageV2 = await ouvrir(navigateur, URL_V2);

  const bilan = { v3: 0, v2: 0, nul: 0, tours: [] };

  for (let i = 0; i < PARTIES; i++) {
    const campV3 = i % 2;
    const graine = 700 + DECALAGE + i;
    const r = await jouerPartie(pageV3, pageV2, campV3, graine);

    let issue = 'non conclue';
    if (r.vainqueur === campV3) { bilan.v3++; issue = 'V3'; }
    else if (r.vainqueur !== null && r.vainqueur !== undefined) { bilan.v2++; issue = 'V2'; }
    else bilan.nul++;
    bilan.tours.push(r.tour);

    console.log(`partie ${i + 1}/${PARTIES} — V3 en joueur ${campV3}, graine ${graine} : `
      + `${issue} (tour ${r.tour}, scores ${JSON.stringify(r.scores)})`);
  }

  const moyenne = bilan.tours.length
    ? (bilan.tours.reduce((a, b) => a + b, 0) / bilan.tours.length).toFixed(1) : 0;

  console.log('');
  console.log('SELF-PLAY CROISÉ — HEAD (V3) contre build de référence (V2)');
  console.log('='.repeat(58));
  console.log(`victoires V3 .............. ${bilan.v3}`);
  console.log(`victoires V2 .............. ${bilan.v2}`);
  console.log(`non conclues .............. ${bilan.nul}`);
  console.log(`tours moyens .............. ${moyenne}`);
  console.log('');

  await navigateur.close();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
