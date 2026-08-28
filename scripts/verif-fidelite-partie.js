/* Fidélité d'une PARTIE ENTIÈRE — simulation contre jeu réel.

     node scripts/verif-fidelite-partie.js

   verif-fidelite.js vérifie douze transitions ISOLÉES : une action, appliquée
   des deux façons, doit donner le même état. C'est nécessaire, et insuffisant.
   Le premier self-play a échoué sur un défaut qu'aucune transition prise seule
   ne révélait : les cartes jouées n'allaient plus à la défausse, la pioche se
   vidait sans se reconstituer, et une partie simulée durait 121 tours sans
   qu'un point soit marqué. Seule l'ACCUMULATION le montrait.

   Ce banc-ci fait jouer une vraie partie, puis rejoue en simulation les actions
   que l'IA y a réellement jouées, et compare le plateau tour par tour.

   Il ne rejoue pas les DÉCISIONS : elles dépendent du temps de réflexion et du
   tirage, deux choses qu'on ne peut pas reproduire à l'identique. Il rejoue les
   ACTIONS et vérifie qu'elles produisent le même plateau — c'est exactement ce
   que veut dire fidélité, et c'est ce qui autorise à régler les poids de l'IA
   sur des parties simulées.

   La main et l'ordre de la pioche sont exclus de la comparaison : ils dépendent
   d'un tirage que la simulation ne rejoue pas, et ne décrivent aucune règle. */

const { chromium } = require('playwright');
const ORIGINE = process.env.ILYOS_BENCH_URL || 'http://localhost:8123/';
const TOURS_VISES = Number(process.env.ILYOS_FIDELITE_TOURS || 14);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const incidents = [];
  page.on('pageerror', e => incidents.push('exception: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') incidents.push('console.error: ' + m.text()); });

  await page.goto(ORIGINE);
  await page.waitForFunction(() => typeof window.ILYOS_AUTOPSIE?.activer === 'function', null, { timeout: 45000 });

  /* L'autopsie fournit la matière : position d'avant chaque décision et plan
     joué. Sans elle, il faudrait instrumenter la partie une seconde fois. */
  await page.evaluate(() => window.ILYOS_AUTOPSIE.activer());
  await page.evaluate(() => window.ILYOS_TEST.playAIvsAI({ difficulty: 'expert' }));
  await page.waitForFunction(
    cible => (window.ILYOS_AUTOPSIE.journal() || []).length >= cible,
    TOURS_VISES,
    { timeout: 300000 }
  );
  await page.evaluate(() => window.ILYOS_TEST.stopAutoplay?.());
  await page.waitForTimeout(1500);

  const r = await page.evaluate(() => window.ILYOS_SELFPLAY.fidelitePartie());

  console.log('');
  console.log('FIDÉLITÉ D\'UNE PARTIE ENTIÈRE');
  console.log('='.repeat(72));
  if (r.erreur) {
    console.log('Impossible de mesurer : ' + r.erreur);
    await browser.close();
    process.exitCode = 1;
    return;
  }

  console.log(`${r.fideles} / ${r.comparables} tours reproduits à l'identique`
    + ` (${r.tours} tours enregistrés)`);

  (r.nonComparables || []).forEach(x => {
    console.log(`   tour ${x.tour} non comparable : ${x.raison}`);
  });

  (r.divergences || []).forEach(d => {
    console.log('');
    console.log(`   DIVERGENCE au tour ${d.tour} (${d.joueur})`);
    console.log(`     jeu réel  : ${d.attendu}`);
    console.log(`     simulation: ${d.obtenu}`);
  });

  console.log('='.repeat(72));
  console.log(`Incidents console : ${incidents.length ? incidents.join(' | ') : 'aucun'}`);
  await browser.close();
  // Un tour non comparable n'est pas une faute : la pose automatique du jeu
  // réel n'est pas enregistrée et ne peut donc pas être rejouée.
  process.exitCode = (r.comparables > 0 && r.fideles === r.comparables) ? 0 : 1;
}

main();
