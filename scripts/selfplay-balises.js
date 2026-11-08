/* Self-play du mode Balises, sans rendu : J0 commence toujours, donc « premier » = victoire du joueur qui commence.
     node scripts/selfplay-balises.js [parties] [graine] [parallèle]   (serveur npm start, port 8123) */
const { chromium } = require('playwright') ;
const URL = process.env.ILYOS_URL || 'http://localhost:8123/';
const N = Number(process.argv[2]) || 10, G = Number(process.argv[3]) || 9000, PAR = Number(process.argv[4]) || 3;
const BUDGET = process.env.ILYOS_BUDGET ? JSON.parse(process.env.ILYOS_BUDGET) : undefined;
async function ouvrir(nav) {
  const page = await nav.newPage({ viewport: { width: 640, height: 400 } });
  page.on('pageerror', e => console.error('ERR', e.message));
  await page.goto(URL, { timeout: 120000 });
  await page.waitForFunction(() => typeof window.ILYOS_SELFPLAY?.tour === 'function', null, { timeout: 60000 });
  await page.evaluate(() => { window.ILYOS_BENCH.vitesse(0.05); window.ILYOS_TEST.playAIvsAI({ difficulty: 'expert', maxTurns: 1 }); });
  await page.waitForFunction(() => window.ILYOS_BENCH.observe(0) && window.ILYOS_TEST.autoplay?.active === true, null, { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { window.ILYOS_TEST.stopAutoplay?.(); window.ILYOS_BENCH.reinitialiser(); window.requestAnimationFrame = () => 0; });
  return page;
}
async function partie(page, g) {
  let etat = await page.evaluate(g => window.ILYOS_ROTATION.departBalises(window.ILYOS_SELFPLAY.departMelange(g)), g);
  let r = null;
  for (let i = 0; i < 160; i++) {
    r = await page.evaluate(([e, s, b]) => window.ILYOS_SELFPLAY.tour(e, { graine: s, budget: b }), [etat, g * 1000 + i, BUDGET]);
    etat = r.etat;
    if (r.fin || (r.vainqueur !== null && r.vainqueur !== undefined)) break;
  }
  const s = JSON.parse(etat).players.map(p => p.score || 0);
  let v = r.vainqueur;
  if (typeof v !== 'number' || v < 0) v = s[0] === s[1] ? null : (s[0] > s[1] ? 0 : 1);
  return { v, s, tour: r.tour, fin: r.fin, brut: r.vainqueur };
}
(async () => {
  const nav = await chromium.launch({ headless: true });
  const file = Array.from({ length: N }, (_, i) => G + i);
  const b = { p: 0, s: 0, n: 0, tours: [], ecarts: [] };
  await Promise.all(Array.from({ length: PAR }, async () => {
    const page = await ouvrir(nav);
    while (file.length) {
      const g = file.shift();
      const t0 = Date.now();
      const x = await partie(page, g);
      if (x.v === 0) b.p++; else if (x.v === 1) b.s++; else b.n++;
      b.tours.push(x.tour);
      console.log(`graine ${g} : ${x.v === 0 ? 'PREMIER' : x.v === 1 ? 'second' : 'nul'} ${x.s.join('-')} tour ${x.tour} brut ${x.brut} (${Math.round((Date.now() - t0) / 1000)} s)`);
    }
  }));
  const n = b.p + b.s + b.n, p = (b.p + b.n / 2) / n;
  console.log(`\n${n} parties, premier ${b.p}, second ${b.s}, nuls ${b.n} -> premier ${(100 * p).toFixed(1)} % ± ${(100 * Math.sqrt(p * (1 - p) / n)).toFixed(1)} ; tours moyens ${Math.round(b.tours.reduce((a, c) => a + c, 0) / n)}`);
  await nav.close();
})();
