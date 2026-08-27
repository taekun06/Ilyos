/* Contrôle de la RÈGLE DE POUSSÉE (V67).

     node scripts/verif-poussee.js

   Ce banc ne mesure aucune décision d'IA : il vérifie la règle elle-même, sur
   les cas exacts validés avec l'auteur du jeu.

   Rappel de la règle. La poussée déplace tout le bloc collé au pousseur du
   nombre de cases de la force employée — il n'existe plus de « force requise ».
   Un obstacle séparé du bloc par un trou l'arrête juste avant lui. Un gardien
   qui entre dans le vide tombe. Une couronne ne tombe jamais : elle survole le
   vide et se pose sur sa case d'arrivée, ou à défaut sur la dernière case d'île
   libre franchie, plafonnant du même coup tout ce qui la suit.

   Toutes les positions tiennent sur la rangée 3, lue de gauche à droite, ce qui
   rend chaque cas lisible d'un coup d'oeil :

     P pousseur   G gardien   C couronne   I île libre   ~ vide            */

const { chromium } = require('playwright');
const ORIGINE = process.env.ILYOS_BENCH_URL || 'http://localhost:8123/';

const R = 3;
const ile = cells => ({ shapeKey: "line3", owner: 0, cells: cells.map(c => [R, c]) });
const gardien = (id, c, player = 0) => ({ id, player, r: R, c });

/* Chaque cas nomme sa bande, la force employée, et les arrivées EXIGÉES par la
   règle — jamais celles que le code produit. */
const CAS = [
  {
    nom: "1. Le bloc entier avance de la force",
    bande: "P G G I I I",
    spec: {
      islands: [ile([0, 1, 2, 3, 4, 5])],
      characters: [gardien("p", 0, 1), gardien("a", 1), gardien("b", 2)]
    },
    depart: [R, 1], direction: [0, 1], force: 2,
    attendu: { a: { vers: [R, 3] }, b: { vers: [R, 4] } }
  },
  {
    nom: "2a. Chacun tombe en atteignant le vide (force 1)",
    bande: "P G G ~ ~",
    spec: {
      islands: [ile([0, 1, 2])],
      characters: [gardien("p", 0, 1), gardien("a", 1), gardien("b", 2)]
    },
    depart: [R, 1], direction: [0, 1], force: 1,
    attendu: { a: { vers: [R, 2] }, b: { chute: true } }
  },
  {
    nom: "2b. Les deux tombent (force 2)",
    bande: "P G G ~ ~",
    spec: {
      islands: [ile([0, 1, 2])],
      characters: [gardien("p", 0, 1), gardien("a", 1), gardien("b", 2)]
    },
    depart: [R, 1], direction: [0, 1], force: 2,
    attendu: { a: { chute: true }, b: { chute: true } }
  },
  {
    nom: "3. L'obstacle arrête le bloc juste avant lui",
    bande: "P G I G I",
    spec: {
      islands: [ile([0, 1, 2, 3, 4])],
      characters: [gardien("p", 0, 1), gardien("a", 1), gardien("obstacle", 3, 1)]
    },
    depart: [R, 1], direction: [0, 1], force: 3,
    attendu: { a: { vers: [R, 2] }, obstacle: { absent: true } }
  },
  {
    nom: "4a. La couronne bloquée immobilise tout le bloc",
    bande: "P G C ~ I I",
    spec: {
      islands: [ile([0, 1, 2]), ile([4, 5])],
      characters: [gardien("p", 0, 1), gardien("a", 1)],
      crowns: [{ r: R, c: 2, active: true }]
    },
    depart: [R, 1], direction: [0, 1], force: 1,
    attendu: { rienNeBouge: true }
  },
  {
    nom: "4b. La couronne survole, le gardien derrière tombe",
    bande: "P G C ~ I I",
    spec: {
      islands: [ile([0, 1, 2]), ile([4, 5])],
      characters: [gardien("p", 0, 1), gardien("a", 1)],
      crowns: [{ r: R, c: 2, active: true }]
    },
    depart: [R, 1], direction: [0, 1], force: 2,
    attendu: { a: { chute: true }, couronne: { vers: [R, 4] } }
  },
  {
    nom: "5. Le gardien arrête la couronne juste avant lui",
    bande: "P C I G",
    spec: {
      islands: [ile([0, 1, 2, 3])],
      characters: [gardien("p", 0, 1), gardien("obstacle", 3, 1)],
      crowns: [{ r: R, c: 1, active: true }]
    },
    depart: [R, 1], direction: [0, 1], force: 2,
    attendu: { couronne: { vers: [R, 2] } }
  },

  /* Tableau de la décision A, décalé d'une case pour loger le pousseur.
     Bande lue à partir de la colonne 1 :  C I I ~ ~ I G I  */
  {
    nom: "6a. Force trop courte : dernière île franchie",
    bande: "P C I I ~ ~ I G I",
    spec: {
      islands: [ile([0, 1, 2, 3]), ile([6, 7, 8])],
      characters: [gardien("p", 0, 1), gardien("obstacle", 7, 1)],
      crowns: [{ r: R, c: 1, active: true }]
    },
    depart: [R, 1], direction: [0, 1], force: 3,
    attendu: { couronne: { vers: [R, 3] } }
  },
  {
    nom: "6b. Force juste : la couronne survole le vide et atterrit",
    bande: "P C I I ~ ~ I G I",
    spec: {
      islands: [ile([0, 1, 2, 3]), ile([6, 7, 8])],
      characters: [gardien("p", 0, 1), gardien("obstacle", 7, 1)],
      crowns: [{ r: R, c: 1, active: true }]
    },
    depart: [R, 1], direction: [0, 1], force: 5,
    attendu: { couronne: { vers: [R, 6] } }
  },
  {
    nom: "6c. Force excédentaire : le gardien lointain l'arrête",
    bande: "P C I I ~ ~ I G I",
    spec: {
      islands: [ile([0, 1, 2, 3]), ile([6, 7, 8])],
      characters: [gardien("p", 0, 1), gardien("obstacle", 7, 1)],
      crowns: [{ r: R, c: 1, active: true }]
    },
    depart: [R, 1], direction: [0, 1], force: 6,
    attendu: { couronne: { vers: [R, 6] } }
  }
];

function verifier(cas, resultat) {
  const parId = new Map(resultat.arrivees.map(a => [a.id, a]));
  const couronne = resultat.arrivees.find(a => a.genre === "crown");
  const att = cas.attendu;
  const ecarts = [];

  if (att.rienNeBouge) {
    if (resultat.arrivees.length) ecarts.push(`${resultat.arrivees.length} pièce(s) ont bougé`);
    return ecarts;
  }

  for (const [id, exig] of Object.entries(att)) {
    if (id === "couronne") {
      if (!couronne) { ecarts.push("la couronne n'a pas bougé"); continue; }
      const v = couronne.vers;
      if (v[0] !== exig.vers[0] || v[1] !== exig.vers[1]) {
        ecarts.push(`couronne en [${v}] au lieu de [${exig.vers}]`);
      }
      continue;
    }
    const mv = parId.get(id);
    if (exig.absent) {
      if (mv) ecarts.push(`${id} a bougé alors qu'il est hors du bloc`);
      continue;
    }
    if (!mv) { ecarts.push(`${id} n'a pas bougé`); continue; }
    if (exig.chute && !mv.chute) ecarts.push(`${id} devait tomber`);
    if (!exig.chute && mv.chute) ecarts.push(`${id} est tombé à tort`);
    if (exig.vers && (mv.vers[0] !== exig.vers[0] || mv.vers[1] !== exig.vers[1])) {
      ecarts.push(`${id} en [${mv.vers}] au lieu de [${exig.vers}]`);
    }
  }
  return ecarts;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const incidents = [];
  page.on('pageerror', e => incidents.push('exception: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') incidents.push('console.error: ' + m.text()); });

  await page.goto(ORIGINE);
  // Une partie doit exister avant qu'une position puisse être posée : le banc
  // écrit dans `state`, qui n'est créé qu'au lancement.
  await page.waitForFunction(() => typeof window.ILYOS_TEST?.playAIvsAI === 'function', null, { timeout: 45000 });
  await page.evaluate(() => window.ILYOS_TEST.playAIvsAI({ difficulty: 'expert', maxTurns: 1 }));
  await page.waitForFunction(() => window.ILYOS_TEST.autoplay?.active === true, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.ILYOS_TEST.stopAutoplay?.());
  await page.waitForFunction(() => typeof window.ILYOS_BENCH?.poussee === 'function', null, { timeout: 15000 });
  await page.evaluate(() => window.ILYOS_BENCH.reinitialiser());
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.ILYOS_BENCH.reinitialiser());

  console.log('');
  console.log('RÈGLE DE POUSSÉE (V67)');
  console.log('='.repeat(72));

  let reussis = 0;
  for (const cas of CAS) {
    const resultat = await page.evaluate(c => window.ILYOS_BENCH.poussee(c), {
      spec: Object.assign({ seed: 1, islandPlacedThisTurn: true, hands: { 0: [], 1: [] } }, cas.spec),
      depart: cas.depart,
      direction: cas.direction,
      force: cas.force
    });
    const ecarts = verifier(cas, resultat);
    console.log(`${cas.nom.padEnd(58, '.')} ${ecarts.length ? 'ÉCHEC' : 'OK'}`);
    console.log(`      ${cas.bande}   force ${cas.force}`);
    ecarts.forEach(e => console.log(`      → ${e}`));
    if (!ecarts.length) reussis++;
  }

  console.log('='.repeat(72));
  console.log(`${reussis} / ${CAS.length} cas conformes à la règle`);
  console.log(`Incidents console : ${incidents.length ? incidents.join(' | ') : 'aucun'}`);
  await browser.close();
  process.exitCode = reussis === CAS.length ? 0 : 1;
}

main();
