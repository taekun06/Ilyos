/* Contrôle des RÈGLES DE VALIDATION (V67).

     node scripts/verif-validation.js

   Deux règles y sont vérifiées, indépendamment de toute décision d'IA.

   1. Un gardien est OBLIGATOIRE pour marquer. Une couronne posée seule sur une
      case de village ne vaut plus rien — la règle V66, qui la validait sans
      porteur, est abandonnée.

   2. BLOCAGE DE ZONE : un gardien adverse posté sur l'une des trois cases d'un
      village y interdit toute validation, même si le porteur se tient sur une
      autre case de ce village. Le blocage est propre à chaque village : tenir
      l'un ne neutralise pas l'autre, à l'opposé du plateau.

   Le premier cas est un TÉMOIN POSITIF : sans lui, un test qui ne marque jamais
   passerait pour un test réussi.

   Repères (plateau 11×11) :
     Villages joueur 0 ......... (0,0) et (10,10)
     Cases de validation J0 .... (0,0) (1,0) (0,1) · (10,10) (9,10) (10,9)   */

const { chromium } = require('playwright');
const ORIGINE = process.env.ILYOS_BENCH_URL || 'http://localhost:8123/';

/* Les deux villages de J0 sont reliés au reste du plateau par des îles, sinon
   les cases de validation autres que le village lui-même ne sont pas du
   terrain et aucun gardien ne peut s'y tenir. */
const TERRAIN = [
  { shapeKey: "line3", owner: 0, cells: [[0, 1], [1, 0], [1, 1]] },
  { shapeKey: "line3", owner: 0, cells: [[9, 10], [10, 9], [9, 9]] }
];

const CAS = [
  {
    nom: "Témoin : porteur sur sa case de validation, village libre",
    attendu: 1,
    spec: {
      islands: TERRAIN,
      characters: [{ id: "porteur", player: 0, r: 0, c: 0 }],
      crowns: [{ r: 0, c: 0, active: true, carrierId: "porteur" }]
    }
  },
  {
    nom: "Couronne posée seule sur une case de validation",
    attendu: 0,
    spec: {
      islands: TERRAIN,
      characters: [{ id: "temoin", player: 0, r: 5, c: 5 }],
      crowns: [{ r: 0, c: 0, active: true }]
    }
  },
  {
    nom: "Blocage de zone : l'adversaire tient une AUTRE case du village",
    attendu: 0,
    spec: {
      islands: TERRAIN,
      characters: [
        { id: "porteur", player: 0, r: 0, c: 0 },
        { id: "bloqueur", player: 1, r: 1, c: 0 }
      ],
      crowns: [{ r: 0, c: 0, active: true, carrierId: "porteur" }]
    }
  },
  {
    nom: "Le blocage est propre à un village : l'autre reste jouable",
    attendu: 1,
    spec: {
      islands: TERRAIN,
      characters: [
        { id: "porteur", player: 0, r: 0, c: 0 },
        { id: "bloqueur", player: 1, r: 9, c: 10 }
      ],
      crowns: [{ r: 0, c: 0, active: true, carrierId: "porteur" }]
    }
  },
  {
    nom: "Blocage par la case du village elle-même",
    attendu: 0,
    spec: {
      islands: TERRAIN,
      characters: [
        { id: "porteur", player: 0, r: 1, c: 0 },
        { id: "bloqueur", player: 1, r: 0, c: 0 }
      ],
      crowns: [{ r: 1, c: 0, active: true, carrierId: "porteur" }]
    }
  }
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const incidents = [];
  page.on('pageerror', e => incidents.push('exception: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') incidents.push('console.error: ' + m.text()); });

  await page.goto(ORIGINE);
  // Une partie doit exister avant qu'une position puisse être posée.
  await page.waitForFunction(() => typeof window.ILYOS_TEST?.playAIvsAI === 'function', null, { timeout: 45000 });
  await page.evaluate(() => window.ILYOS_TEST.playAIvsAI({ difficulty: 'expert', maxTurns: 1 }));
  await page.waitForFunction(() => window.ILYOS_TEST.autoplay?.active === true, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.ILYOS_TEST.stopAutoplay?.());
  await page.waitForFunction(() => typeof window.ILYOS_BENCH?.validation === 'function', null, { timeout: 15000 });
  await page.evaluate(() => window.ILYOS_BENCH.reinitialiser());
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.ILYOS_BENCH.reinitialiser());

  console.log('');
  console.log('RÈGLES DE VALIDATION (V67)');
  console.log('='.repeat(72));

  let reussis = 0;
  for (const cas of CAS) {
    const r = await page.evaluate(c => window.ILYOS_BENCH.validation(c), {
      spec: Object.assign({ seed: 1, islandPlacedThisTurn: true, hands: { 0: [], 1: [] } }, cas.spec),
      joueur: 0
    });
    const ok = r.marques === cas.attendu;
    console.log(`${cas.nom.padEnd(62, '.')} ${ok ? 'OK' : 'ÉCHEC'}`);
    console.log(`      points marqués : ${r.marques} (attendu ${cas.attendu})`);
    if (ok) reussis++;
    // La position suivante repart d'un instantané neuf : rien à nettoyer ici.
  }

  console.log('='.repeat(72));
  console.log(`${reussis} / ${CAS.length} cas conformes à la règle`);
  console.log(`Incidents console : ${incidents.length ? incidents.join(' | ') : 'aucun'}`);
  await browser.close();
  process.exitCode = reussis === CAS.length ? 0 : 1;
}

main();
