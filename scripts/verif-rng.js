/* Vérification du hasard de jeu.

     node scripts/verif-rng.js

   Quatre propriétés doivent tenir ensemble. Les trois premières font du banc
   d'essai un instrument fiable ; la quatrième garantit qu'il n'a rien abîmé du
   jeu réel, et c'est la plus importante :

     1. graine posée → suite strictement reproductible ;
     2. graines différentes → suites différentes (le générateur produit bien du
        hasard, il ne renvoie pas une constante) ;
     3. la suite est correctement distribuée sur [0,1[ ;
     4. AUCUNE graine → hasard normal. Une partie ordinaire ne doit jamais
        devenir prévisible du seul fait que le mécanisme de test existe.

   La reproductibilité de bout en bout — même graine, mêmes coups joués par
   l'IA — est mesurée séparément par le banc lui-même :
     node scripts/bench-ia.js --repet 3 */

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
  await page.waitForTimeout(1200);
  await page.waitForFunction(() => typeof window.ILYOS_BENCH?.tirage === 'function', null, { timeout: 15000 });

  const suite = (graine, combien = 24) => page.evaluate(([g, n]) => {
    window.ILYOS_BENCH.seed(g);
    const out = [];
    for (let i = 0; i < n; i++) out.push(window.ILYOS_BENCH.tirage());
    const seeded = window.ILYOS_BENCH.seeded();
    window.ILYOS_BENCH.seed(null);
    return { valeurs: out, seeded };
  }, [graine, combien]);

  const a = await suite(4242);
  const b = await suite(4242);
  const c = await suite(9999);
  const libre1 = await suite(null);
  const libre2 = await suite(null);

  const memeSuite = (x, y) => x.valeurs.join(',') === y.valeurs.join(',');
  const dansBornes = x => x.valeurs.every(v => v >= 0 && v < 1);
  const moyenne = x => x.valeurs.reduce((s, v) => s + v, 0) / x.valeurs.length;

  const tests = [
    ['Même graine (4242) → suite identique', memeSuite(a, b)],
    ['Graine différente (9999) → suite différente', !memeSuite(a, c)],
    ['Valeurs dans [0,1[', dansBornes(a) && dansBornes(c) && dansBornes(libre1)],
    ['Distribution plausible (moyenne 0,5 ± 0,2)', Math.abs(moyenne(a) - 0.5) < 0.2],
    ['Sans graine → deux suites différentes (hasard normal)', !memeSuite(libre1, libre2)],
    ['Drapeau « graine posée » exact', a.seeded === true && libre1.seeded === false]
  ];

  console.log('');
  console.log('VÉRIFICATION DU HASARD DE JEU');
  console.log('='.repeat(60));
  tests.forEach(([nom, ok]) => console.log(`${nom.padEnd(52, '.')} ${ok ? 'OK' : 'ÉCHEC'}`));
  console.log('='.repeat(60));
  const echecs = tests.filter(([, ok]) => !ok).length;
  console.log(`${tests.length - echecs} / ${tests.length} propriétés vérifiées`);
  console.log(`Incidents console : ${incidents.length ? incidents.join(' | ') : 'aucun'}`);
  console.log('');

  await browser.close();
  process.exit(echecs ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
