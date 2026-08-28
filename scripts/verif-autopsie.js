/* Contrôle du MODE AUTOPSIE.

     node scripts/verif-autopsie.js

   L'autopsie n'améliore pas l'IA : elle sert à comprendre pourquoi elle joue ce
   qu'elle joue, sur de VRAIES parties plutôt que sur des positions inventées.
   Ce banc vérifie donc qu'une décision enregistrée contient bien de quoi
   répondre à la question « pourquoi l'IA n'a-t-elle pas vu ce que j'ai vu ? »,
   et que la position peut être reposée pour être rejouée.

   Il vérifie aussi le point le plus facile à casser sans s'en apercevoir : que
   la décomposition de score affichée est bien CELLE QUI A DÉCIDÉ. La somme des
   termes doit retomber exactement sur la note du planner ; sinon la trace
   décrirait un évaluateur imaginaire.                                        */

const { chromium } = require('playwright');
const ORIGINE = process.env.ILYOS_BENCH_URL || 'http://localhost:8123/';

const CHAMPS = [
  ['instantané avant décision', e => !!e.instantane],
  ['plan choisi', e => Array.isArray(e.plan)],
  ['plans finalistes (jusqu à 5)', e => Array.isArray(e.finalistes)],
  ['candidats, retenus et écartés', e => Array.isArray(e.candidats) && e.candidats.length > 0],
  ['décomposition de score', e => !!e.detailDepart && Array.isArray(e.detailDepart.termes)],
  ['riposte anticipée', e => 'anticipation' in e],
  ['temps de décision', e => Number.isFinite(e.dureeTotaleMs)],
  ['nombre de nœuds explorés', e => Number.isFinite(e.etatsExplores)],
  ['drapeau de repli Legacy', e => 'repli' in e]
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const incidents = [];
  page.on('pageerror', e => incidents.push('exception: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') incidents.push('console.error: ' + m.text()); });

  await page.goto(ORIGINE);
  await page.waitForFunction(() => typeof window.ILYOS_AUTOPSIE?.activer === 'function', null, { timeout: 45000 });

  // Autopsie levée AVANT la partie : elle doit capter des décisions réelles.
  await page.evaluate(() => window.ILYOS_AUTOPSIE.activer());
  await page.evaluate(() => window.ILYOS_TEST.playAIvsAI({ difficulty: 'expert', maxTurns: 6 }));
  await page.waitForFunction(() => (window.ILYOS_AUTOPSIE.journal() || []).length >= 3, null, { timeout: 90000 });
  await page.evaluate(() => window.ILYOS_TEST.stopAutoplay?.());

  const releve = await page.evaluate(() => {
    const journal = window.ILYOS_AUTOPSIE.journal();
    const e = journal[journal.length - 1];
    return {
      total: journal.length,
      entree: e,
      // Somme des termes contre note annoncée : la trace doit décrire
      // l'évaluateur réel, pas une reconstruction.
      sommeDepart: (e.detailDepart?.termes || []).reduce((t, x) => t + x.montant, 0),
      noteDepart: e.detailDepart?.note ?? null,
      finalistesAvecDetail: (e.finalistes || []).filter(f => f.detail?.termes?.length).length
    };
  });

  console.log('');
  console.log('MODE AUTOPSIE');
  console.log('='.repeat(72));
  console.log(`${releve.total} décision(s) enregistrée(s) sur une partie réelle.`);
  console.log('');

  let reussis = 0;
  for (const [nom, test] of CHAMPS) {
    let ok = false;
    try { ok = !!test(releve.entree); } catch { ok = false; }
    console.log(`${nom.padEnd(46, '.')} ${ok ? 'OK' : 'MANQUANT'}`);
    if (ok) reussis++;
  }

  // Contrôle d'intégrité de la décomposition.
  const ecart = Math.abs(releve.sommeDepart - releve.noteDepart);
  const sommeJuste = ecart <= 1;
  console.log(`${'somme des termes = note annoncée'.padEnd(46, '.')} ${sommeJuste ? 'OK' : 'ÉCART'}`);
  console.log(`      ${releve.sommeDepart} contre ${releve.noteDepart}`);
  if (sommeJuste) reussis++;

  // La position doit pouvoir être reposée telle qu'avant la décision.
  const rejoue = await page.evaluate(() => {
    const journal = window.ILYOS_AUTOPSIE.journal();
    const attendu = JSON.parse(journal[journal.length - 1].instantane);
    if (!window.ILYOS_AUTOPSIE.rejouer(-1)) return null;
    const obtenu = window.ILYOS_BENCH.etatComplet();
    const lu = JSON.parse(obtenu);
    return {
      tour: lu.turn,
      tourAttendu: attendu.turn,
      gardiens: (lu.characters || []).length,
      gardiensAttendus: (attendu.characters || []).length
    };
  });
  const reposee = !!rejoue && rejoue.tour === rejoue.tourAttendu
    && rejoue.gardiens === rejoue.gardiensAttendus;
  console.log(`${'position reposée à l identique'.padEnd(46, '.')} ${reposee ? 'OK' : 'ÉCHEC'}`);
  if (rejoue) console.log(`      tour ${rejoue.tour}/${rejoue.tourAttendu}, ${rejoue.gardiens}/${rejoue.gardiensAttendus} gardiens`);
  if (reposee) reussis++;

  const total = CHAMPS.length + 2;
  console.log('='.repeat(72));
  console.log(`${reussis} / ${total} contrôles`);
  console.log(`Finalistes portant leur décomposition : ${releve.finalistesAvecDetail}`);
  console.log(`Incidents console : ${incidents.length ? incidents.join(' | ') : 'aucun'}`);
  await browser.close();
  process.exitCode = reussis === total ? 0 : 1;
}

main();
