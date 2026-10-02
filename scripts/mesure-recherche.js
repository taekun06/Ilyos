/* Mesure de la recherche Expert sur des décisions RÉELLES, jugées par une
   riposte forte et fixe — pas par la riposte courte que l'IA s'applique.

     npm start   puis   node scripts/mesure-recherche.js [fichiers…]

   Sans argument : les décisions de tests/positions-defaites/ et des dossiers
   passés en variable ILYOS_DOSSIERS (chemins séparés par « : »).

   Pour chaque décision et chaque configuration (CONFIGS ci-dessous) : le plan
   choisi, puis sa note après la meilleure riposte trouvée par le JUGE (riposte
   longue, faisceau large). On compare les configurations sur la moyenne de
   cette note, le nombre de décisions meilleures / pires que la référence, et
   le temps de décision. Mesure, pas verdict : aucun seuil.

   ILYOS_CONFIGS='base,finalistes8' pour n'en lancer que certaines. */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const URL_JEU = process.env.ILYOS_URL || 'http://localhost:8123/';

const CONFIGS = {
  base: null,
  finalistes8: { 'PLAN_RIPOSTE.finalistes': 8 },
  riposte6: { 'PLAN_RIPOSTE.decisionsMax': 6, 'PLAN_RIPOSTE.largeurFaisceau': 8,
    'PLAN_RIPOSTE.etatsMax': 800, 'PLAN_RIPOSTE.tempsMaxMs': 300 },
  faisceau48: { 'PLAN_BUDGET.largeurFaisceau': 48, 'PLAN_BUDGET.etatsMax': 12000 },
  faisceau48_riposte6: { 'PLAN_BUDGET.largeurFaisceau': 48, 'PLAN_BUDGET.etatsMax': 12000,
    'PLAN_RIPOSTE.decisionsMax': 6, 'PLAN_RIPOSTE.largeurFaisceau': 8,
    'PLAN_RIPOSTE.etatsMax': 800, 'PLAN_RIPOSTE.tempsMaxMs': 300 },
  faisceau64: { 'PLAN_BUDGET.largeurFaisceau': 64, 'PLAN_BUDGET.etatsMax': 16000 },
  tout: { 'PLAN_RIPOSTE.finalistes': 8, 'PLAN_RIPOSTE.decisionsMax': 6, 'PLAN_RIPOSTE.largeurFaisceau': 8,
    'PLAN_RIPOSTE.etatsMax': 800, 'PLAN_RIPOSTE.tempsMaxMs': 300,
    'PLAN_BUDGET.largeurFaisceau': 48, 'PLAN_BUDGET.etatsMax': 12000 }
};

// Le juge : une riposte nettement plus longue que celle de l'IA, identique
// pour toutes les configurations.
const JUGE = { 'PLAN_RIPOSTE.decisionsMax': 7, 'PLAN_RIPOSTE.largeurFaisceau': 10,
  'PLAN_RIPOSTE.etatsMax': 3000, 'PLAN_RIPOSTE.tempsMaxMs': 4000, 'PLAN_SECURITE.riposteMs': 8000 };

function lireDecisions(chemin) {
  const brut = JSON.parse(fs.readFileSync(chemin, 'utf8'));
  const dossiers = Array.isArray(brut.defaites) ? brut.defaites : [brut];
  const decisions = [];
  for (const d of dossiers) {
    if (d.etat) {   // position extraite
      decisions.push({ source: `${path.basename(chemin)}`, etat: d.etat, grille: null });
      continue;
    }
    for (const t of d.tours || []) {
      if (!t.decision || !t.etat) continue;
      const position = typeof t.etat === 'string' ? JSON.parse(t.etat) : t.etat;
      if (!position.rules && d.regles && d.regles.optionsPartie) position.rules = d.regles.optionsPartie;
      position.aiDifficulty = 'expert';
      decisions.push({ source: `${d.id || path.basename(chemin)} t${t.tour}`, etat: JSON.stringify(position),
        grille: d.regles && d.regles.grille });
    }
  }
  return decisions;
}

(async () => {
  const fichiers = process.argv.slice(2).length ? process.argv.slice(2)
    : (process.env.ILYOS_DOSSIERS || '').split(':').filter(Boolean);
  const decisions = fichiers.flatMap(lireDecisions);
  const noms = (process.env.ILYOS_CONFIGS || Object.keys(CONFIGS).join(',')).split(',');
  console.log(`${decisions.length} décisions · configurations : ${noms.join(', ')}`);

  const navigateur = await chromium.launch({ headless: true });
  const page = await navigateur.newPage({ viewport: { width: 800, height: 500 } });
  page.on('pageerror', e => console.error('[page]', e.message));
  await page.goto(URL_JEU, { timeout: 120000 });
  await page.waitForFunction(() => typeof window.ILYOS_SELFPLAY?.analyser === 'function', null, { timeout: 60000 });
  await page.evaluate(() => { window.ILYOS_BENCH.vitesse(0.05); window.ILYOS_TEST.playAIvsAI({ difficulty: 'expert', maxTurns: 1 }); });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { window.ILYOS_TEST.stopAutoplay?.(); window.ILYOS_BENCH.reinitialiser(); window.requestAnimationFrame = () => 0; });

  const resultats = Object.fromEntries(noms.map(n => [n, []]));
  for (const [i, d] of decisions.entries()) {
    if (process.env.ILYOS_SANS_PERDUES) {
      const depart = await page.evaluate(([j, g]) => window.ILYOS_SELFPLAY.analyser(j, { graine: 1, grille: g,
        budget: { etatsMax: 50 } }), [d.etat, d.grille]).catch(() => null);
      if (depart && depart.noteDepart && depart.noteDepart.note <= -500000) continue;
    }
    const ligne = [];
    for (const nom of noms) {
      const r = await page.evaluate(([j, p, g]) => window.ILYOS_SELFPLAY.analyser(j, { graine: 1, grille: g, poids: p }),
        [d.etat, CONFIGS[nom], d.grille]);
      const juge = await page.evaluate(([j, plan, g, p]) => window.ILYOS_SELFPLAY.robustesse(j, plan, { graine: 1, grille: g, poids: p }),
        [d.etat, r.detail, d.grille, JUGE]);
      const note = juge.erreur ? null : juge.noteRobuste;
      resultats[nom].push({ note, ms: r.dureeMs });
      ligne.push(`${nom} ${note} (${r.dureeMs} ms)`);
    }
    console.log(`${String(i + 1).padStart(3)} ${d.source.padEnd(28)} ${ligne.join(' · ')}`);
  }

  console.log('\nBILAN (note jugée après riposte forte ; plus haut = mieux)');
  const ref = resultats[noms[0]];
  for (const nom of noms) {
    const lignes = resultats[nom].filter(x => x.note !== null);
    const moyenne = Math.round(lignes.reduce((s, x) => s + x.note, 0) / Math.max(1, lignes.length));
    const ms = resultats[nom].map(x => x.ms).sort((a, b) => a - b);
    const mieux = resultats[nom].filter((x, k) => x.note !== null && ref[k].note !== null && x.note > ref[k].note + 50).length;
    const pire = resultats[nom].filter((x, k) => x.note !== null && ref[k].note !== null && x.note < ref[k].note - 50).length;
    console.log(`${nom.padEnd(12)} moyenne ${moyenne} · mieux ${mieux} / pire ${pire} (vs ${noms[0]}) · `
      + `temps médian ${ms[Math.floor(ms.length / 2)]} ms, max ${ms[ms.length - 1]} ms`);
  }
  await navigateur.close();
})().catch(e => { console.error(e); process.exit(1); });
