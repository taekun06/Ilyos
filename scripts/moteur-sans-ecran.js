/* MOTEUR SANS ÉCRAN — fait tourner js/game.js sous Node, sans navigateur.

     const moteur = require('./moteur-sans-ecran').charger();
     const depart = moteur.selfplay.departMelange(7100);
     const r = moteur.selfplay.tour(depart, { graine: 1 });

   Pourquoi. Les règles et l'IA vivent dans la même fermeture que le rendu.
   Elles n'en dépendent pourtant pas pour CALCULER : en simulation
   (`ilyosSimulationActive`), toute la présentation est sautée. Il suffit donc
   d'offrir au bundle un écran factice pour qu'il se charge, puis de ne lui
   demander que des tours simulés (`ILYOS_SELFPLAY`). Les bancs n'ont alors
   plus besoin de Chromium, et le même chargement servira à un Worker.

   Ce que ce fichier N'EST PAS : une émulation du navigateur. Rien n'est
   dessiné, aucun son, aucune sauvegarde. Seuls les chemins de simulation sont
   garantis ; `scripts/verif-moteur.js` vérifie qu'ils donnent, tour après
   tour, exactement le même état que dans le navigateur.

   Un seul moteur par processus : les substituts sont posés sur `globalThis`.
   Un contexte `vm` séparé a été essayé et écarté — chaque accès à Math,
   performance… y traverse un intercepteur, la réflexion ralentit, et comme
   les budgets de l'IA sont en millisecondes, les décisions changeaient. */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { creer: creerEcranFactice } = require('../js/moteur/ecran-factice');

let dejaCharge = null;

/** Charge le bundle et prépare une partie de référence (2 joueurs, plateau
 *  classique, Expert), exactement comme le font les bancs dans le navigateur.
 *  `bundle` : chemin d'un js/game.js (défaut : celui du dépôt), pour pouvoir
 *  opposer deux builds. `silencieux` : fait taire le journal du jeu. */
function charger({ bundle, silencieux = true } = {}) {
  const chemin = path.resolve(bundle || path.join(__dirname, '..', 'js', 'game.js'));
  if (dejaCharge) {
    if (dejaCharge.chemin !== chemin) throw new Error('Un seul moteur par processus : ' + dejaCharge.chemin + ' est déjà chargé.');
    return dejaCharge.moteur;
  }

  const { substituts, avancer } = creerEcranFactice();
  const journal = globalThis.console;
  if (silencieux) {
    const muet = {};
    for (const cle of Object.keys(journal)) muet[cle] = () => {};
    substituts.console = muet;
  }
  for (const [cle, valeur] of Object.entries(substituts)) {
    Object.defineProperty(globalThis, cle, { value: valeur, writable: true, configurable: true });
  }
  globalThis.window = globalThis;
  globalThis.self = globalThis;

  vm.runInThisContext(fs.readFileSync(chemin, 'utf8'), { filename: chemin });

  const test = globalThis.ILYOS_TEST;
  const banc = globalThis.ILYOS_BENCH;
  const selfplay = globalThis.ILYOS_SELFPLAY;
  if (!test || !banc || !selfplay || typeof selfplay.tour !== 'function') {
    throw new Error('Bundle chargé, mais ILYOS_SELFPLAY.tour est absent : ' + chemin);
  }

  /* Même préchauffage que scripts/selfplay-rapide.js : une partie doit
     exister, elle sert de support à la simulation. */
  banc.vitesse(0.05);
  test.playAIvsAI({ difficulty: 'expert', maxTurns: 1 });
  for (let i = 0; i < 100 && !(test.autoplay && test.autoplay.active); i++) avancer(100);
  if (!(test.autoplay && test.autoplay.active)) throw new Error('La partie de référence ne s\'est pas lancée.');
  if (test.stopAutoplay) test.stopAutoplay();
  banc.reinitialiser();

  const moteur = { chemin, selfplay, banc, test, avancer, journal };
  dejaCharge = { chemin, moteur };
  return moteur;
}

module.exports = { charger };
