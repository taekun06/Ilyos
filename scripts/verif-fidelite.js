/* Tests de fidélité simulation ↔ jeu réel.

     node scripts/verif-fidelite.js

   Pour une même position et une même action, le noyau de règle exécuté sur un
   clone (présentation coupée) et le chemin complet du jeu réel doivent aboutir
   au même état stratégique canonique.

   C'est le contrôle qui autorise la construction d'un planner : sans lui, une
   divergence entre ce que l'IA prévoit et ce que le jeu applique passerait
   inaperçue et contaminerait silencieusement toute la recherche. */

const { chromium } = require('playwright');
const ORIGINE = process.env.ILYOS_BENCH_URL || 'http://localhost:8123/';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const incidents = [];
  page.on('pageerror', e => incidents.push('exception: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') incidents.push('console.error: ' + m.text()); });

  await page.goto(ORIGINE);
  await page.waitForFunction(() => typeof window.ILYOS_TEST?.playAIvsAI === 'function', null, { timeout: 45000 });
  await page.evaluate(() => window.ILYOS_TEST.playAIvsAI({ difficulty: 'expert', maxTurns: 1 }));
  await page.waitForFunction(() => window.ILYOS_TEST.autoplay?.active === true, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.ILYOS_TEST.stopAutoplay?.());
  await page.waitForFunction(() => typeof window.ILYOS_BENCH?.fidelite === 'function', null, { timeout: 15000 });
  await page.evaluate(() => window.ILYOS_BENCH.reinitialiser());
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.ILYOS_BENCH.reinitialiser());

  const resultats = await page.evaluate(async () => await window.ILYOS_BENCH.fidelite());

  console.log('');
  console.log('FIDÉLITÉ SIMULATION ↔ JEU RÉEL');
  console.log('='.repeat(70));
  resultats.forEach(r => {
    console.log(`${r.nom.padEnd(50, '.')} ${r.ok ? 'OK' : 'DIVERGENCE'}`);
    if (r.erreur) console.log(`     erreur : ${r.erreur}`);
    if (!r.ok && !r.erreur) {
      // Montrer le premier point de désaccord plutôt que deux pavés JSON.
      const a = JSON.parse(r.simule);
      const b = JSON.parse(r.reel);
      Object.keys(a).forEach(cle => {
        const ga = JSON.stringify(a[cle]);
        const gb = JSON.stringify(b[cle]);
        if (ga !== gb) {
          console.log(`     ${cle}`);
          console.log(`       simulé : ${ga}`);
          console.log(`       réel   : ${gb}`);
        }
      });
    }
  });
  const echecs = resultats.filter(r => !r.ok).length;
  console.log('='.repeat(70));
  console.log(`${resultats.length - echecs} / ${resultats.length} transitions fidèles`);
  console.log(`Incidents console : ${incidents.length ? incidents.join(' | ') : 'aucun'}`);
  console.log('');

  await browser.close();
  process.exit(echecs ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
