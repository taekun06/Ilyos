/* Lanceur du banc d'essai tactique de l'IA.

     node scripts/bench-ia.js                 → les 16 puzzles, rapport lisible
     node scripts/bench-ia.js --json          → même chose en JSON
     node scripts/bench-ia.js --seul 01,03    → seulement ces puzzles
     node scripts/bench-ia.js --repet 3       → chaque puzzle joué N fois
                                                (contrôle de reproductibilité)

   Le serveur de développement doit écouter sur le port 8123 (voir la commande
   habituelle du dépôt). Le banc charge la page, ouvre une partie, puis rejoue
   chaque position via window.ILYOS_BENCH.

   Une remarque importante sur le rythme : les temporisations de l'IA ne sont
   PAS accélérées ici. Elles sont pourtant cosmétiques, mais les animations de
   déplacement, elles, ne se compressent pas — au-delà d'un certain facteur,
   l'IA lit la position d'un gardien avant que son déplacement ne se soit
   matérialisé, rejoue le même coup et le résultat change. Mesuré : à vitesse
   0,12 le journal contient des coups répétés non appliqués, à vitesse 1 il est
   exact. Le banc tourne donc au rythme réel du jeu. */

const path = require('path');
const { chromium } = require('playwright');
const { PUZZLES } = require(path.join(__dirname, '..', 'tests', 'puzzles-ia.js'));

const ORIGINE = process.env.ILYOS_BENCH_URL || 'http://localhost:8123/';
const args = process.argv.slice(2);
const enJson = args.includes('--json');
const repetitions = Number((args.find(a => a.startsWith('--repet')) || '').split(/[= ]/)[1]
  || args[args.indexOf('--repet') + 1] || 1) || 1;
const filtre = (() => {
  const i = args.indexOf('--seul');
  if (i === -1) return null;
  return new Set(String(args[i + 1] || '').split(',').map(s => s.trim()).filter(Boolean));
})();

async function ouvrirPartie(page) {
  await page.goto(ORIGINE);
  await page.waitForFunction(() => typeof window.ILYOS_TEST?.playAIvsAI === 'function', null, { timeout: 45000 });
  // Une partie doit exister pour que `state` existe ; on l'arrête aussitôt,
  // le banc reposant ensuite entièrement sur ses propres positions.
  await page.evaluate(() => window.ILYOS_TEST.playAIvsAI({ difficulty: 'expert', maxTurns: 1 }));
  await page.waitForFunction(() => window.ILYOS_TEST.autoplay?.active === true, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.ILYOS_TEST.stopAutoplay?.());
  await page.waitForTimeout(1200);
  await page.waitForFunction(() => typeof window.ILYOS_BENCH?.run === 'function', null, { timeout: 15000 });
}

async function jouerPuzzle(page, puzzle) {
  const debut = Date.now();
  const res = await page.evaluate(async spec => await window.ILYOS_BENCH.run(spec), puzzle.spec);
  const verdict = puzzle.attendu(res.arrivee, res.depart, res.journal);
  return {
    id: puzzle.id,
    nom: puzzle.nom,
    ok: !!verdict.ok,
    raison: verdict.raison,
    dureeMs: Date.now() - debut,
    journal: res.journal
  };
}

function resumeJournal(journal) {
  if (!journal.length) return 'aucune action';
  return journal.map(e => {
    if (e.type === 'MOVE') return `MOVE ${e.gardien} ${JSON.stringify(e.depuis)}→${JSON.stringify(e.vers)} (${e.cout})${e.applique === false ? ' [refusé]' : ''}`;
    if (e.type === 'PUSH') return `PUSH ${e.pousseur}→${JSON.stringify(e.vers)} force ${e.force}`;
    if (e.type === 'MAGIC') return `MAGIC île ${e.ile} ${e.pas} pas`;
    if (e.type === 'POSE') return 'POSE (automatique, avant actions)';
    return e.type;
  }).join(' · ');
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const incidents = [];
  page.on('pageerror', e => incidents.push('exception: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') incidents.push('console.error: ' + m.text()); });

  await ouvrirPartie(page);

  const aJouer = PUZZLES.filter(p => !filtre || filtre.has(p.id));
  const resultats = [];

  for (const puzzle of aJouer) {
    const passages = [];
    for (let i = 0; i < repetitions; i++) passages.push(await jouerPuzzle(page, puzzle));
    const premier = passages[0];
    // Reproductibilité : à graine fixe, tous les passages doivent conclure
    // pareil ET jouer exactement la même séquence.
    const stable = passages.every(p =>
      p.ok === premier.ok && resumeJournal(p.journal) === resumeJournal(premier.journal));
    resultats.push({ ...premier, passages: passages.length, stable });
  }

  const total = resultats.filter(r => r.ok).length;

  if (enJson) {
    console.log(JSON.stringify({ total, sur: resultats.length, resultats, incidents }, null, 2));
  } else {
    console.log('');
    console.log('BANC D\'ESSAI TACTIQUE — IA ILYOS');
    console.log('='.repeat(72));
    resultats.forEach(r => {
      const etiquette = `${r.id} ${r.nom}`.padEnd(42, '.');
      const stabilite = r.passages > 1 ? (r.stable ? ' [stable]' : ' [INSTABLE]') : '';
      console.log(`${etiquette} ${r.ok ? 'PASS' : 'FAIL'}${stabilite}`);
      console.log(`      ${r.raison}`);
      if (!r.ok) console.log(`      joué : ${resumeJournal(r.journal)}`);
    });
    console.log('='.repeat(72));
    console.log(`TOTAL : ${total} / ${resultats.length}`);
    if (repetitions > 1) {
      const instables = resultats.filter(r => !r.stable).map(r => r.id);
      console.log(`Reproductibilité (${repetitions} passages) : ${instables.length ? 'INSTABLES → ' + instables.join(', ') : 'tous stables'}`);
    }
    console.log(`Incidents console : ${incidents.length ? incidents.join(' | ') : 'aucun'}`);
    console.log('');
  }

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
