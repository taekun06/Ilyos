/* Analyse hors ligne d'une défaite de l'IA Expert exportée depuis le jeu
   (bouton « 🧠 Analyser cette défaite de l'IA » ou bibliothèque des défaites).

     node scripts/analyser-defaite.js <fichier.json>                tours signalés
     node scripts/analyser-defaite.js <fichier.json> --tour 17      un tour précis
     node scripts/analyser-defaite.js <fichier.json> --tous         toutes les décisions
     node scripts/analyser-defaite.js <fichier.json> --extraire 17  position de test

   Le fichier peut être une défaite, un lot de défaites (export groupé de la
   bibliothèque) ou une position déjà extraite (tests/positions-defaites/).

   Pour chaque décision examinée, trois lectures côte à côte :
     1. le plan que l'IA a JOUÉ pendant la partie, et ce qu'il vaut face à la
        riposte avec le code d'aujourd'hui ;
     2. le plan que le planner d'AUJOURD'HUI choisirait sur la même position ;
     3. ce que l'humain a joué ensuite (différence de positions).
   Si 2 diffère de 1 et résiste mieux, le défaut est peut-être déjà corrigé ;
   sinon, c'est une position à instruire (autopsie, puis scénario de test).

   Serveur de développement attendu sur le port 8123 (npm start), ou
   ILYOS_URL=http://localhost:XXXX/. */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const URL_JEU = process.env.ILYOS_URL || 'http://localhost:8123/';
const args = process.argv.slice(2);
const fichier = args.find(a => !a.startsWith('--') && !/^\d+$/.test(a));
const option = nom => {
  const i = args.indexOf(nom);
  return i < 0 ? null : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true);
};

if (!fichier) {
  console.error('usage : node scripts/analyser-defaite.js <fichier.json> [--tour N | --tous | --extraire N]');
  process.exit(1);
}

function lireDossiers(chemin) {
  const brut = JSON.parse(fs.readFileSync(chemin, 'utf8'));
  if (brut.type === 'lot-defaites-expert') return brut.defaites;
  if (brut.type === 'defaite-expert') return [brut];
  if (brut.type === 'position-defaite-expert') return [brut];
  throw new Error(`format inconnu : ${brut.type || 'sans type'}`);
}

/* Position jouable par le simulateur : l'instantané du tour, complété des
   options de partie qu'un instantané ne porte pas. */
function positionJouable(dossier, etat) {
  const position = JSON.parse(etat);
  if (dossier.regles && dossier.regles.optionsPartie) position.rules = dossier.regles.optionsPartie;
  return JSON.stringify(position);
}

function toursAExaminer(dossier) {
  if (dossier.type === 'position-defaite-expert') return [dossier.index];
  const tours = dossier.tours || [];
  const tour = option('--tour') || option('--extraire');
  if (tour && tour !== true) {
    const i = tours.findIndex(t => t.tour === Number(tour) && t.joueur === dossier.ia && t.etat);
    if (i < 0) throw new Error(`aucune décision de l'IA au tour ${tour}`);
    return [i];
  }
  if (option('--tous')) return tours.map((t, i) => i).filter(i => tours[i].decision);
  return ((dossier.analyse && dossier.analyse.signales) || []).map(s => s.index);
}

function suiteHumaine(dossier, index) {
  const signal = ((dossier.analyse && dossier.analyse.signales) || []).find(s => s.index === index);
  return signal && signal.suiteHumaine ? signal.suiteHumaine.join(' · ') : '—';
}

function extraire(dossier, index) {
  const t = dossier.tours[index];
  const sortie = path.join('tests', 'positions-defaites');
  fs.mkdirSync(sortie, { recursive: true });
  const nom = `${dossier.id}-t${t.tour}.json`;
  const position = {
    jeu: 'ILYOS',
    type: 'position-defaite-expert',
    schema: 1,
    source: { defaite: dossier.id, date: dossier.fin && dossier.fin.date, version: dossier.version },
    id: `${dossier.id}-t${t.tour}`,
    ia: dossier.ia,
    humain: dossier.humain,
    regles: dossier.regles,
    index: 0,
    tours: [t],
    planIA: t.decision ? t.decision.plan : null,
    planIALisible: t.decision ? t.decision.planLisible : null,
    suiteHumaine: suiteHumaine(dossier, index),
    /* À compléter à la main : ce qu'on attend de l'IA sur cette position
       (coup à trouver, coup à éviter, condition sur l'état). Au cas par cas. */
    attendu: null,
    note: ''
  };
  fs.writeFileSync(path.join(sortie, nom), JSON.stringify(position, null, 1));
  return path.join(sortie, nom);
}

async function main() {
  const dossiers = lireDossiers(fichier);
  if (option('--extraire')) {
    for (const d of dossiers) {
      for (const i of toursAExaminer(d)) console.log(`position extraite : ${extraire(d, i)}`);
    }
    return;
  }

  const navigateur = await chromium.launch({ headless: true });
  const page = await navigateur.newPage({ viewport: { width: 800, height: 500 } });
  page.on('pageerror', e => console.error(`[page] ${e.message}`));
  await page.goto(URL_JEU, { timeout: 120000 });
  await page.waitForFunction(() => typeof window.ILYOS_SELFPLAY?.analyser === 'function', null, { timeout: 60000 });
  // Une partie doit exister comme support de simulation ; on l'arrête aussitôt.
  await page.evaluate(() => { window.ILYOS_BENCH.vitesse(0.05); window.ILYOS_TEST.playAIvsAI({ difficulty: 'expert', maxTurns: 1 }); });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { window.ILYOS_TEST.stopAutoplay?.(); window.ILYOS_BENCH.reinitialiser(); window.requestAnimationFrame = () => 0; });

  for (const d of dossiers) {
    console.log('');
    console.log('='.repeat(78));
    if (d.type === 'position-defaite-expert') {
      console.log(`POSITION ${d.id} (défaite ${d.source.defaite})${d.attendu ? ' · attendu : ' + JSON.stringify(d.attendu) : ''}`);
    } else {
      console.log(d.analyse ? d.analyse.resume : `Défaite ${d.id}`);
      console.log(`version ${d.version || '?'} · plateau ${d.regles && d.regles.grille} · départ ${d.regles && d.regles.depart}`);
    }
    const grille = d.regles && d.regles.grille;
    for (const i of toursAExaminer(d)) {
      const t = d.tours[i];
      const json = positionJouable(d, t.etat);
      console.log('-'.repeat(78));
      console.log(`TOUR ${t.tour}${t.decision && t.decision.repli ? ' · REPLI : ' + t.decision.repli : ''}`);
      const signal = ((d.analyse && d.analyse.signales) || []).find(s => s.index === i);
      if (signal) console.log(`signal     : ${signal.raisons.join(' ; ')}`);
      if (t.decision && t.decision.plan && t.decision.plan.length) {
        const joue = await page.evaluate(([j, p, g]) => window.ILYOS_SELFPLAY.robustesse(j, p, { graine: 1, grille: g }),
          [json, t.decision.plan, grille]);
        console.log(`IA a joué  : ${t.decision.planLisible}`);
        console.log(`   en partie : fin de tour ${t.decision.noteArrivee}, après riposte ${t.decision.noteRobuste}${t.decision.coupee ? ' — ⚠ recherche COUPÉE par le temps en partie : non reproductible' : ''}`);
        console.log(`   aujourd'hui : ${joue.erreur ? joue.erreur : `fin de tour ${joue.noteFinTour}, après riposte ${joue.noteRobuste} (riposte ${(joue.riposte || []).join('+')})`}`);
      }
      const r = await page.evaluate(([j, g]) => window.ILYOS_SELFPLAY.analyser(j, { graine: 1, grille: g }), [json, grille]);
      const a = r.anticipation || {};
      const lisible = await page.evaluate(([p, e]) => window.ILYOS_DEFAITES.decrire(p, e), [r.detail, t.etat]);
      console.log(`IA actuelle: ${lisible}`);
      console.log(`   fin de tour ${Math.round(r.noteArrivee.note)}, après riposte ${a.noteRobuste ?? '—'}, ${r.etatsExplores} états, ${r.dureeMs} ms${a.principaleCoupee || a.ripostesCoupees ? ' — ⚠ coupée par le temps ici aussi' : ''}`);
      const termes = (r.noteDepart.termes || []).slice().sort((x, y) => Math.abs(y.montant) - Math.abs(x.montant)).slice(0, 5)
        .map(x => `${x.terme} ${x.montant > 0 ? '+' : ''}${Math.round(x.montant)}`).join(', ');
      console.log(`   position de départ ${Math.round(r.noteDepart.note)} : ${termes}`);
      console.log(`humain ensuite : ${d.type === 'position-defaite-expert' ? d.suiteHumaine : suiteHumaine(d, i)}`);
    }
  }
  await navigateur.close();
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
