/* Mode personnalisé : un gardien du draft peut se poser sur SON village, pas
   sur celui de l'adversaire (draftGuardianCellAllowed).

     npm start   puis   node scripts/verif-draft-village.js   (port 8123)

   Jusqu'au 01/10, villageAt (qui renvoie le JOUEUR propriétaire) était
   comparé à un identifiant : le village était toujours refusé, à l'humain
   comme à l'IA. */

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
      const hook = `window.TEST_DRAFT_VILLAGE = () => {
        state = state || {};
        benchPoserPosition({ seed: 5, islands: [], characters: [], crowns: [null, null] });
        const [v0] = villagesForPlayer(state.players[0]);
        const [v1] = villagesForPlayer(state.players[1]);
        return {
          sienJ0: draftGuardianCellAllowed(0, v0.r, v0.c),
          adverseJ0: draftGuardianCellAllowed(0, v1.r, v1.c),
          sienJ1: draftGuardianCellAllowed(1, v1.r, v1.c)
        };
      }; window.ILYOS_BENCH = {`;
      await route.fulfill({ contentType: 'application/javascript', body: source.replace('window.ILYOS_BENCH = {', hook) });
    });
    await page.goto(process.env.ILYOS_BENCH_URL || 'http://localhost:8123/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.TEST_DRAFT_VILLAGE === 'function', null, { timeout: 60000 });
    const r = await page.evaluate(() => window.TEST_DRAFT_VILLAGE());
    assert.equal(r.sienJ0, true, 'J1 peut poser son gardien sur son village');
    assert.equal(r.sienJ1, true, 'J2 aussi');
    assert.equal(r.adverseJ0, false, 'jamais sur le village adverse');
    console.log('verif-draft-village : 3/3');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
