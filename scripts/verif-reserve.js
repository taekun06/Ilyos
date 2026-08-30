/* Contrôle de la RÉSERVE et de la FIN DE TOUR.

     node scripts/verif-reserve.js

   La règle tient en une phrase : réserve + cartes inutilisées de la main,
   jusqu'à 5 par type, tout surplus à la défausse. Elle était pourtant écrite à
   trois endroits — la vraie fin de tour, le self-play et la transition simulée
   du planner — et la troisième ne touchait que le miroir `stash`, jamais la
   réserve physique que lit availableActionCount.

   Ce banc vérifie deux choses distinctes :
     1. la projection annoncée à l'IA est celle que le rangement applique ;
     2. le surplus quitte bien la main pour la défausse, sinon la pioche ne se
        reconstitue plus.

   Une divergence ici règlerait l'évaluateur sur des ressources fictives.     */

const { chromium } = require('playwright');
const ORIGINE = process.env.ILYOS_BENCH_URL || 'http://localhost:8123/';

const CAS = [
  {
    nom: 'réserve 4 MOVE + main 3 MOVE → 5, pas 7',
    reserve: { MOVE: 4 }, main: ['MOVE', 'MOVE', 'MOVE'],
    futur: { MOVE: 5, PUSH: 0, MAGIC: 0 }, defausse: 2
  },
  {
    nom: 'réserve 5 MOVE + main 3 MOVE → 5, pas 8',
    reserve: { MOVE: 5 }, main: ['MOVE', 'MOVE', 'MOVE'],
    futur: { MOVE: 5, PUSH: 0, MAGIC: 0 }, defausse: 3
  },
  {
    nom: 'réserve 2 MOVE + main 2 MOVE → 4',
    reserve: { MOVE: 2 }, main: ['MOVE', 'MOVE'],
    futur: { MOVE: 4, PUSH: 0, MAGIC: 0 }, defausse: 0
  },
  {
    nom: 'plafond par TYPE, pas global : 5 MOVE + 5 PUSH + 1 MAGIC',
    reserve: { MOVE: 4, PUSH: 5 }, main: ['MOVE', 'MOVE', 'PUSH', 'MAGIC'],
    futur: { MOVE: 5, PUSH: 5, MAGIC: 1 }, defausse: 2
  },
  {
    nom: 'réserve vide, main pleine → rien ne se perd',
    reserve: {}, main: ['MOVE', 'MOVE', 'PUSH', 'PUSH', 'MAGIC'],
    futur: { MOVE: 2, PUSH: 2, MAGIC: 1 }, defausse: 0
  }
];

const memeCompte = (a, b) => ['MOVE', 'PUSH', 'MAGIC'].every(t => (a[t] || 0) === (b[t] || 0));
const lisible = c => `${c.MOVE}/${c.PUSH}/${c.MAGIC}`;

async function main() {
  const navigateur = await chromium.launch({ headless: true });
  const page = await navigateur.newPage({ viewport: { width: 1280, height: 800 } });
  const incidents = [];
  page.on('pageerror', e => incidents.push('exception: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') incidents.push('console.error: ' + m.text()); });

  await page.goto(ORIGINE);
  await page.waitForFunction(() => typeof window.ILYOS_BENCH?.reserve === 'function', null, { timeout: 45000 });

  console.log('');
  console.log('RÉSERVE — PROJECTION, RANGEMENT ET DÉFAUSSE');
  console.log('='.repeat(72));

  let reussis = 0;
  for (const cas of CAS) {
    const r = await page.evaluate(c => window.ILYOS_BENCH.reserve(c), cas);
    const projectionJuste = memeCompte(r.projete, cas.futur);
    const rangementJuste = memeCompte(r.reel, cas.futur);
    const accord = memeCompte(r.projete, r.reel);
    const defausseJuste = r.defausse === cas.defausse;
    const mainVidee = r.mainRestante === 0;
    const miroirJuste = memeCompte(r.stash, cas.futur);
    const ok = projectionJuste && rangementJuste && accord && defausseJuste && mainVidee && miroirJuste;
    if (ok) reussis++;

    console.log(`${cas.nom.padEnd(56, '.')} ${ok ? 'OK' : 'ÉCHEC'}`);
    if (!ok) {
      console.log(`     attendu    : réserve ${lisible(cas.futur)}, ${cas.defausse} défaussée(s)`);
      console.log(`     projection : ${lisible(r.projete)}`);
      console.log(`     rangement  : ${lisible(r.reel)}`);
      console.log(`     miroir     : ${lisible(r.stash)}`);
      console.log(`     défausse   : ${r.defausse} · main restante ${r.mainRestante}`);
      if (!accord) console.log('     >>> la projection lue par l IA contredit le rangement appliqué');
    }
  }

  /* Deuxième moitié : la vraie fin de tour et la transition simulée du
     planner, sur la même position. Les mains diffèrent par construction —
     l'anticipation distribue une main plausible — mais tout ce qui décrit les
     ressources du joueur SORTANT doit coïncider. */
  const ETATS = [
    { nom: 'transition · réserve 4 MOVE + main 3 MOVE', reserve: { MOVE: 4 }, main: ['MOVE', 'MOVE', 'MOVE'] },
    { nom: 'transition · réserve pleine, main débordante', reserve: { MOVE: 5, PUSH: 5 }, main: ['MOVE', 'PUSH', 'MAGIC'] },
    { nom: 'transition · réserve vide, main ordinaire', reserve: {}, main: ['MOVE', 'MOVE', 'PUSH'] }
  ];

  /* Une partie doit exister : le banc écrit dans `state`, créé au lancement. */
  await page.waitForFunction(() => typeof window.ILYOS_TEST?.playAIvsAI === 'function', null, { timeout: 45000 });
  await page.evaluate(() => window.ILYOS_TEST.playAIvsAI({ difficulty: 'expert', maxTurns: 1 }));
  await page.waitForFunction(() => window.ILYOS_TEST.autoplay?.active === true, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.ILYOS_TEST.stopAutoplay?.());
  await page.evaluate(() => window.ILYOS_BENCH.reinitialiser());
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.ILYOS_BENCH.reinitialiser());

  console.log('');
  console.log('VRAIE FIN DE TOUR ↔ TRANSITION SIMULÉE (joueur sortant)');
  console.log('='.repeat(72));

  let accords = 0;
  for (const etat of ETATS) {
    const r = await page.evaluate(e => window.ILYOS_BENCH.transitionReserve(e), etat);
    const champs = [
      ['réserve physique', memeCompte(r.simule.reserve, r.reel.reserve)],
      ['miroir stash', memeCompte(r.simule.stash, r.reel.stash)],
      ['main', r.simule.main === r.reel.main],
      ['défausse', r.simule.defausse === r.reel.defausse],
      ['actions au tour suivant', memeCompte(r.simule.disponibles, r.reel.disponibles)]
    ];
    const ok = champs.every(([, bon]) => bon);
    if (ok) accords++;
    console.log(`${etat.nom.padEnd(56, '.')} ${ok ? 'OK' : 'DIVERGENCE'}`);
    if (!ok) {
      champs.filter(([, bon]) => !bon).forEach(([nom]) => console.log(`     >>> ${nom} diffère`));
      console.log(`     simulé : réserve ${lisible(r.simule.reserve)} · miroir ${lisible(r.simule.stash)}`
        + ` · main ${r.simule.main} · défausse ${r.simule.defausse} · dispo ${lisible(r.simule.disponibles)}`);
      console.log(`     réel   : réserve ${lisible(r.reel.reserve)} · miroir ${lisible(r.reel.stash)}`
        + ` · main ${r.reel.main} · défausse ${r.reel.defausse} · dispo ${lisible(r.reel.disponibles)}`);
    }
  }

  /* G. SURPLUS DE RÉSERVE — ce que l'évaluateur accorde aux cartes.

     Une main contient plus de cartes d'un type que la réserve ne pourra en
     accueillir. Le surplus ne verra jamais le tour suivant : il ne doit donc
     porter AUCUNE valeur de conservation. Mesuré sur le terme lui-même, parce
     qu'à 5 points la carte, le comportement ne trahirait pas le défaut. */
  const TERMES = [
    {
      nom: 'G · réserve pleine + 3 MOVE en main → 5 comptées, pas 8',
      spec: { seed: 301, islandPlacedThisTurn: true, stash: { 0: { MOVE: 5 } },
        hands: { 0: ['MOVE', 'MOVE', 'MOVE'], 1: [] },
        islands: [{ shapeKey: 'line3', owner: 0, cells: [[9, 1], [9, 2], [9, 3]] }],
        characters: [{ id: 'ia-1', player: 0, r: 9, c: 2 }] },
      jouables: 8, conservables: 5
    },
    {
      nom: 'G · réserve 4 MOVE + 3 MOVE en main → 5 comptées, pas 7',
      spec: { seed: 302, islandPlacedThisTurn: true, stash: { 0: { MOVE: 4 } },
        hands: { 0: ['MOVE', 'MOVE', 'MOVE'], 1: [] },
        islands: [{ shapeKey: 'line3', owner: 0, cells: [[9, 1], [9, 2], [9, 3]] }],
        characters: [{ id: 'ia-1', player: 0, r: 9, c: 2 }] },
      jouables: 7, conservables: 5
    },
    {
      nom: 'G · aucun surplus : les deux lectures coïncident',
      spec: { seed: 303, islandPlacedThisTurn: true, stash: { 0: { MOVE: 2 } },
        hands: { 0: ['MOVE', 'PUSH'], 1: [] },
        islands: [{ shapeKey: 'line3', owner: 0, cells: [[9, 1], [9, 2], [9, 3]] }],
        characters: [{ id: 'ia-1', player: 0, r: 9, c: 2 }] },
      jouables: 4, conservables: 4
    }
  ];

  console.log('');
  console.log('G. SURPLUS DE RÉSERVE — VALEUR ACCORDÉE PAR L ÉVALUATEUR');
  console.log('='.repeat(72));

  let termesJustes = 0;
  for (const t of TERMES) {
    const r = await page.evaluate(s => window.ILYOS_BENCH.termeReserve(s), t.spec);
    const attendu = t.conservables * r.poidsUnitaire;
    const ok = r.jouables === t.jouables
      && r.conservables === t.conservables
      && r.montant === attendu;
    if (ok) termesJustes++;
    console.log(`${t.nom.padEnd(56, '.')} ${ok ? 'OK' : 'ÉCHEC'}`);
    if (!ok) {
      console.log(`     attendu : ${t.conservables} conservable(s) sur ${t.jouables} jouable(s)`
        + ` → terme ${attendu}`);
      console.log(`     obtenu  : ${r.conservables} conservable(s) sur ${r.jouables} jouable(s)`
        + ` → terme ${r.montant} (« ${r.libelle} »)`);
    }
  }

  console.log('='.repeat(72));
  console.log(`${reussis} / ${CAS.length} cas conformes à la règle`);
  console.log(`${accords} / ${ETATS.length} transitions identiques au jeu réel`);
  console.log(`${termesJustes} / ${TERMES.length} évaluations du surplus correctes`);
  console.log(`Incidents console : ${incidents.length ? incidents.join(' | ') : 'aucun'}`);

  await navigateur.close();
  process.exitCode = reussis === CAS.length && accords === ETATS.length
    && termesJustes === TERMES.length && incidents.length === 0 ? 0 : 1;
}

main().catch(erreur => { console.error(erreur); process.exit(1); });
