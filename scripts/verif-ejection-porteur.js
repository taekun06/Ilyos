/* Éjecter le porteur adverse plutôt que lui voler la couronne dans son coin.

     npm start   puis   node scripts/verif-ejection-porteur.js   (port 8123)

   Partie solo du 30/09 (tests/positions-defaites/revue-2026-09-30-t10.json),
   tour 10 : le porteur jaune est en (1,0), adossé au vide. L'Expert allait en
   (0,0), volait la couronne et restait éjectable dans le coin (−4 941 après
   riposte). Le coup juste — se poster en (1,1) et pousser (1,0) dans le
   vide — était généré mais élagué du faisceau : « aller en (1,1) » ne valait
   rien avant la poussée. La fermeture de tri PLAN_POIDS.fermeturePoussee le
   garde (−475 après riposte, ~+530 avec un faisceau de 80). */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

(async () => {
  const position = JSON.parse(fs.readFileSync(
    path.join(__dirname, '../tests/positions-defaites/revue-2026-09-30-t10.json'), 'utf8'));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
    await page.goto(process.env.ILYOS_BENCH_URL || 'http://localhost:8123/');
    await page.waitForFunction(() => typeof window.ILYOS_SELFPLAY?.analyser === 'function', null, { timeout: 60000 });
    await page.evaluate(() => { window.ILYOS_BENCH.vitesse(0.05); window.ILYOS_TEST.playAIvsAI({ difficulty: 'expert', maxTurns: 1 }); });
    await page.waitForTimeout(3000);
    await page.evaluate(() => { window.ILYOS_TEST.stopAutoplay?.(); window.ILYOS_BENCH.reinitialiser(); window.requestAnimationFrame = () => 0; });

    const r = await page.evaluate(j => window.ILYOS_SELFPLAY.analyser(j, { graine: 1, grille: 11 }), position.etat);
    const [er, ec] = position.attendu.ejecterPorteur;
    const ejecte = r.detail.some(a => a.type === 'PUSH' && a.r === er && a.c === ec
      && !(a.pusherId && r.detail.some(v => v.type === 'VOL' && v.charId === a.pusherId)));
    const robuste = r.anticipation && r.anticipation.noteRobuste;
    console.log(`plan : ${r.detail.map(a => a.type).join(' ')} · après riposte ${robuste}`);
    assert.ok(ejecte, 'le porteur adossé au vide doit être éjecté');
    assert.ok(robuste > -2000, `après riposte ${robuste} : le voleur resté dans le coin (−4 941) est de retour`);
    console.log('verif-ejection-porteur : 1/1');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
