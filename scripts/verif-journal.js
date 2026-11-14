/* JOURNAL DES COUPS ET ARBITRE EN LIGNE (js/game/regles.js)

     npm start                          (serveur 8123, dans un autre terminal)
     node scripts/verif-journal.js [tours] [secondes]

   Une partie CPU contre CPU dans le vrai jeu (Chromium). À chaque tour, le
   banc garde l'état du début du tour, puis, le tour fini, rejoue avec le
   moteur le journal que la partie a noté (state.journalTourPrecedent) : le
   plateau rejoué doit être celui de la partie. C'est exactement ce que fait
   l'hôte d'une partie en ligne avec les coups de l'invité. Le banc vérifie
   aussi qu'un plateau trafiqué (un gardien déplacé) est repéré. */

const { chromium } = require('playwright');

const sortie = console;
const TOURS = Math.max(2, Number(process.argv[2]) || 12);
const DUREE_MAX = (Number(process.argv[3]) || 420) * 1000;
const URL_JEU = process.env.ILYOS_URL || 'http://localhost:8123/';

(async () => {
  const navigateur = await chromium.launch({ headless: true });
  const erreurs = [];
  try {
    const page = await navigateur.newPage({ viewport: { width: 800, height: 500 } });
    page.on('pageerror', e => erreurs.push(String(e)));
    await page.goto(URL_JEU, { timeout: 120000 });
    await page.waitForFunction(() => window.ILYOS_REGLES && window.ILYOS_TEST && window.ILYOS_BENCH, null, { timeout: 60000 });
    await page.evaluate(tours => {
      window.ILYOS_BENCH.vitesse(0.05);
      const R = window.ILYOS_REGLES;
      const B = window.__journal = { tours: 0, accords: 0, coups: 0, trucages: 0, desaccords: [], ref: null, tour: null };
      setInterval(() => {
        try {
          const e = JSON.parse(window.ILYOS_BENCH.etatComplet());
          if (B.tour === null) {
            if (!(e.journalCoups || []).length) { B.tour = e.turn; B.ref = JSON.stringify(e); }
            return;
          }
          if (e.turn === B.tour) return;
          if (B.ref) {
            const coups = e.journalTourPrecedent || [];
            const r = R.rejouer(B.ref, coups);
            B.tours++;
            B.coups += coups.length;
            if (r.ok && r.empreinte === R.empreintePlateau(e)) B.accords++;
            else B.desaccords.push({ tour: B.tour, raison: r.raison || 'plateau différent', coups: coups.map(a => a.type).join(',') });
            const truque = JSON.parse(JSON.stringify(e));
            if (truque.characters[0]) truque.characters[0].r = (truque.characters[0].r + 1) % 11;
            else truque.players[0].score++;
            if (!(r.ok && r.empreinte === R.empreintePlateau(truque))) B.trucages++;
          }
          B.tour = e.turn;
          B.ref = (e.journalCoups || []).length ? null : JSON.stringify(e);
        } catch (x) { B.erreur = String(x); }
      }, 60);
      window.ILYOS_TEST.playAIvsAI({ difficulty: 'expert', maxTurns: tours + 2 });
    }, TOURS);
    await page.waitForFunction(() => window.ILYOS_TEST.autoplay?.active === true, null, { timeout: 60000 });
    await page.waitForFunction(n => window.__journal.tours >= n || window.ILYOS_TEST.autoplay?.active === false,
      TOURS, { timeout: DUREE_MAX, polling: 1000 });
    const b = await page.evaluate(() => { const { ref, ...reste } = window.__journal; return reste; });
    sortie.log(`Journal : ${b.tours} tours, ${b.coups} coups rejoués, ${b.accords} d'accord, ${b.trucages} trucages repérés.`);
    const echecs = [];
    if (b.erreur) echecs.push('banc : ' + b.erreur);
    if (b.tours < 2) echecs.push(`trop peu de tours contrôlés (${b.tours})`);
    if (b.coups < b.tours) echecs.push('journal presque vide : les coups ne sont pas notés');
    b.desaccords.slice(0, 10).forEach(d => echecs.push(`tour ${d.tour} : ${d.raison} [${d.coups}]`));
    if (b.trucages !== b.tours) echecs.push(`trucage non repéré (${b.trucages}/${b.tours})`);
    erreurs.slice(0, 5).forEach(e => echecs.push('erreur de page : ' + e));
    if (echecs.length) {
      sortie.error('ÉCHEC :');
      echecs.forEach(e => sortie.error('  - ' + e));
      process.exitCode = 1;
    } else {
      sortie.log('OK : chaque tour rejoué par le moteur redonne le plateau de la partie.');
    }
  } finally {
    await navigateur.close();
  }
})().catch(e => { sortie.error(e); process.exit(1); });
