/* FIDÉLITÉ DU MOTEUR SANS ÉCRAN — même partie sous Node et dans le navigateur.

     npm start                      (serveur 8123, dans un autre terminal)
     node scripts/verif-moteur.js [tours] [graine]

   Joue les mêmes tours d'une partie Expert contre Expert des deux côtés, à
   partir de la même graine, et compare l'état COMPLET après chaque tour
   (empreinte SHA-1 du JSON rendu par ILYOS_SELFPLAY.tour). Une seule
   différence et le banc échoue, en nommant le premier tour divergent.

   Les budgets de l'IA sont en nombre d'états ; ses plafonds de TEMPS ne sont
   que des filets (PLAN_SECURITE), mais un filet atteint change la décision.
   Le banc les écarte donc (securiteFacteur) : les deux côtés doivent alors
   donner exactement le même état, quelle que soit la charge de la machine. */

const crypto = require('node:crypto');
const { chromium } = require('playwright');
const { charger } = require('./moteur-sans-ecran');

// Pris AVANT le chargement : le moteur fait taire le `console` global du jeu.
const sortie = console;

const TOURS = Math.max(1, Number(process.argv[2]) || 6);
const GRAINE = Number(process.argv[3]) || 7101;
const URL_JEU = process.env.ILYOS_URL || 'http://localhost:8123/';
/* Filets de temps écartés (×20) : la recherche n'est plus bornée que par ses
   budgets en nombre d'états, donc la décision ne dépend plus de la vitesse
   de la machine ni de sa charge. */
const POIDS = { securiteFacteur: 20 };

const empreinte = texte => crypto.createHash('sha1').update(texte).digest('hex').slice(0, 12);
const resume = r => `${r.dureeMs} ms${r.coupures && (r.coupures.principale || r.coupures.ripostes || r.coupures.magie) ? ' COUPÉ ' + JSON.stringify(r.coupures) : ''}`;
const fini = r => r.fin || (r.vainqueur !== null && r.vainqueur !== undefined);

function jouerSousNode() {
  const { selfplay } = charger();
  const releve = [];
  let etat = selfplay.departMelange(GRAINE);
  releve.push({ empreinte: empreinte(etat) });
  for (let i = 0; i < TOURS; i++) {
    const r = selfplay.tour(etat, { graine: GRAINE * 1000 + i, poids: POIDS });
    etat = r.etat;
    releve.push({ empreinte: empreinte(etat), resume: resume(r) });
    if (fini(r)) break;
  }
  return releve;
}

async function jouerDansLeNavigateur() {
  const navigateur = await chromium.launch({ headless: true });
  try {
    const page = await navigateur.newPage({ viewport: { width: 640, height: 400 } });
    await page.goto(URL_JEU, { timeout: 120000 });
    await page.waitForFunction(() => typeof window.ILYOS_SELFPLAY?.tour === 'function', null, { timeout: 60000 });
    await page.evaluate(() => {
      window.ILYOS_BENCH.vitesse(0.05);
      window.ILYOS_TEST.playAIvsAI({ difficulty: 'expert', maxTurns: 1 });
    });
    await page.waitForFunction(() => window.ILYOS_TEST.autoplay?.active === true, null, { timeout: 60000 });
    await page.evaluate(() => {
      window.ILYOS_TEST.stopAutoplay?.();
      window.ILYOS_BENCH.reinitialiser();
      window.requestAnimationFrame = () => 0;
    });
    const releve = [];
    let etat = await page.evaluate(g => window.ILYOS_SELFPLAY.departMelange(g), GRAINE);
    releve.push({ empreinte: empreinte(etat) });
    for (let i = 0; i < TOURS; i++) {
      const r = await page.evaluate(([json, graine, poids]) =>
        window.ILYOS_SELFPLAY.tour(json, { graine, poids }), [etat, GRAINE * 1000 + i, POIDS]);
      etat = r.etat;
      releve.push({ empreinte: empreinte(etat), resume: resume(r) });
      if (fini(r)) break;
    }
    return releve;
  } finally {
    await navigateur.close();
  }
}

async function main() {
  // L'un après l'autre : en parallèle, ils se voleraient le processeur.
  const node = jouerSousNode();
  const nav = await jouerDansLeNavigateur();
  let echecs = 0;
  const n = Math.max(node.length, nav.length);
  for (let i = 0; i < n; i++) {
    const a = node[i];
    const b = nav[i];
    const pareil = !!a && !!b && a.empreinte === b.empreinte;
    if (!pareil) echecs++;
    const nom = i === 0 ? 'départ ' : `tour ${String(i).padStart(2)}`;
    sortie.log(`${pareil ? 'OK  ' : 'DIFF'} ${nom}  Node ${a ? a.empreinte : '—'} ${a && a.resume ? '(' + a.resume + ')' : ''}`
      + `  navigateur ${b ? b.empreinte : '—'} ${b && b.resume ? '(' + b.resume + ')' : ''}`);
  }
  sortie.log('');
  sortie.log(echecs
    ? `ÉCHEC — ${echecs} état(s) différent(s) sur ${n} (graine ${GRAINE}).`
    : `OK — ${n - 1} tour(s) identiques sous Node et dans le navigateur (graine ${GRAINE}).`);
  process.exit(echecs ? 1 : 0);
}

main().catch(erreur => { sortie.error(erreur); process.exit(1); });
