/* Éjecter le porteur adverse plutôt que lui voler la couronne dans son coin.

     npm start   puis   node scripts/verif-ejection-porteur.js   (port 8123)

   Partie solo du 30/09 (tests/positions-defaites/revue-2026-09-30-t10.json),
   tour 10 : le porteur jaune est en (1,0), adossé au vide. L'Expert allait en
   (0,0), volait la couronne et restait éjectable dans le coin (−4 941 après
   riposte). Le coup juste — se poster en (1,1) et pousser (1,0) dans le
   vide — était généré mais élagué du faisceau : « aller en (1,1) » ne valait
   rien avant la poussée. La fermeture de tri PLAN_POIDS.fermeturePoussee le
   garde (−475 après riposte, ~+530 avec un faisceau de 80). Depuis le
   faisceau 48 (02/10), l'IA vole d'abord puis éjecte (−460). */

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
    /* Le banc juge le RÉSULTAT : à la fin du plan, le gardien qui portait la
       couronne en (1,0) a quitté le plateau. Jusqu'au 25/11 il exigeait aussi
       la tactique (pousser depuis (1,1), vers l'ouest) ; avec la place
       d'intervention, l'Expert vole depuis (2,0) puis éjecte de là, force 2 —
       même issue. Pousser (1,0) depuis le coin sans éjecter reste refusé. */
    const avant = JSON.parse(position.etat).characters.find(ch => ch.r === er && ch.c === ec);
    const fin = await page.evaluate(([j, plan]) => window.ILYOS_SELFPLAY.jouer(j, plan, { apercu: true }), [position.etat, r.detail]);
    assert.ok(!fin.erreur, `plan injouable : ${fin.erreur}`);
    const etatFin = typeof fin.etat === 'string' ? JSON.parse(fin.etat) : fin.etat;
    const ejecte = !!avant && !etatFin.characters.some(ch => ch.id === avant.id);
    const robuste = r.anticipation && r.anticipation.noteRobuste;
    console.log(`plan : ${r.detail.map(a => a.type).join(' ')} · après riposte ${robuste}`);
    assert.ok(ejecte, 'le porteur adossé au vide doit être éjecté');
    /* Seuil en points de l'évaluateur, donc lié à son échelle. Depuis le
       09/11 (PLAN_RIPOSTE.poidsMenacePlausible 0,65 → 1), le MÊME plan note
       −2 218 au lieu de −649 ; « voler puis rester » (POSE, MOVE, VOL) passe
       de −6 214 à −7 738. L'écart qui distingue les deux reste ~5 500. */
    assert.ok(robuste > -3500, `après riposte ${robuste} : le voleur resté dans le coin est de retour`);
    console.log('verif-ejection-porteur : 1/1');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
