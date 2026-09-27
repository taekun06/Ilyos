/* Gardien éjectable par une poussée LONGUE que l'adversaire n'a pas encore
   en réserve, mais qu'il piochera probablement.

     npm start   puis   node scripts/verif-gardien-expose.js   (port 8123)

   Partie gagnée contre l'Expert (BASELINE-IA.md) : 11 décisions sur 14
   laissaient un gardien IA éjectable par une force 2, vu à gravité 0, parce
   que la force 2 n'était prêtée à l'adversaire qu'avec deux PUSH EN RÉSERVE.

   Rangée 3, lue de gauche à droite :   I P G I ~
     P gardien humain (joueur 0), G gardien de l'IA (joueur 1), ~ vide.
   Une force 2 depuis P envoie G dans le vide.                               */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/js/game.js*', async route => {
      const source = fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8');
      const hook = `window.TEST_EXPOSE = (reservePush, porteur, mode) => {
        state = state || {};
        benchPoserPosition({ seed: 5, islandPlacedThisTurn: false, aiPlayer: 1,
          islands: [{ owner: 0, cells: [[3,1],[3,2],[3,3],[3,4]] }],
          characters: [{ id: 'humain', player: 0, r: 3, c: 2 }, { id: 'ia', player: 1, r: 3, c: 3 }],
          crowns: porteur ? [{ r: 3, c: 3, carrierId: 'ia', active: true }, null] : [],
          stash: [{ PUSH: reservePush }, {}] });
        const memoire = PLAN_POIDS.piochePush, apparition = PLAN_POIDS.menacePoseAdverse;
        PLAN_POIDS.piochePush = mode;
        PLAN_POIDS.menacePoseAdverse = 0; // les postes vides (rangées 2 et 4) sont un autre sujet
        try {
          return {
            certaine: plannerForceExpulsion(1, 3, 3),
            gravite: plannerGraviteExpulsion(1, 3, 3, !porteur),
            p1: plannerProbaPiocherPush(1), p2: plannerProbaPiocherPush(2)
          };
        } finally { PLAN_POIDS.piochePush = memoire; PLAN_POIDS.menacePoseAdverse = apparition; }
      }; window.ILYOS_BENCH = {`;
      await route.fulfill({ contentType: 'application/javascript',
        body: source.replace('window.ILYOS_BENCH = {', hook) });
    });
    await page.goto(process.env.ILYOS_BENCH_URL || 'http://localhost:8123/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.TEST_EXPOSE === 'function', null, { timeout: 60000 });
    const t = (push, porteur, mode) => page.evaluate(a => window.TEST_EXPOSE(...a), [push, porteur, mode]);

    // Loi hypergéométrique : 5 cartes parmi 13 dont 4 PUSH.
    const base = await t(1, false, 1);
    assert.ok(Math.abs(base.p1 - 1161 / 1287) < 1e-9, `P(≥1 PUSH) ${base.p1}`);
    assert.ok(Math.abs(base.p2 - 657 / 1287) < 1e-9, `P(≥2 PUSH) ${base.p2}`);

    const cas = [
      // [réserve PUSH, porteur, mode, gravité attendue]
      [1, false, 0, 0, 'ancien calcul : force 2 invisible avec une seule PUSH en réserve'],
      [1, false, 1, 0.75 * 1161 / 1287, 'une PUSH en réserve + une piochée neuf fois sur dix'],
      [0, false, 1, 0.75 * 657 / 1287, 'aucune en réserve : deux à piocher'],
      [2, false, 1, 0.75, 'deux en réserve : menace certaine, inchangée'],
      [1, true, 1, 0, 'porteur : hors du mode 1'],
      [1, true, 2, 0.75 * 1161 / 1287, 'porteur : compris au mode 2']
    ];
    for (const [push, porteur, mode, attendu, nom] of cas) {
      const r = await t(push, porteur, mode);
      assert.ok(Math.abs(r.gravite - attendu) < 1e-9, `${nom} : gravité ${r.gravite}, attendu ${attendu}`);
      console.log(`ok  ${nom} — gravité ${r.gravite.toFixed(3)} (force certaine ${r.certaine})`);
    }
    console.log('verif-gardien-expose : 6/6');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
