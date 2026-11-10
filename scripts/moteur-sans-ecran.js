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

/* Objet « à tout faire » pour ce que la simulation ne lit jamais vraiment
   (THREE, contexte de canvas, navigator…) : toute propriété, tout appel et
   tout `new` rendent un autre objet du même genre. */
function leurre() {
  const cible = function () {};
  return new Proxy(cible, {
    get(_, cle) {
      if (cle === Symbol.toPrimitive) return () => '';
      if (cle === 'then') return undefined;
      if (cle === Symbol.iterator) return function* () {};
      if (cle === 'length') return 0;
      return leurre();
    },
    apply: () => leurre(),
    construct: () => leurre(),
    set: () => true,
    has: () => true
  });
}

function creerEcranFactice() {
  /* Minuteurs : file manuelle. Rien ne s'exécute tout seul — sinon les
     boucles d'animation et l'auto-jeu tourneraient en fond pendant un banc.
     `avancer(ms)` déroule ce qui est dû ; seule la mise en place s'en sert. */
  const horloge = { suivant: 0, maintenant: 0, file: [] };
  function avancer(ms) {
    const fin = horloge.maintenant + ms;
    for (;;) {
      horloge.file.sort((a, b) => a.quand - b.quand);
      const tache = horloge.file[0];
      if (!tache || tache.quand > fin) break;
      horloge.file.shift();
      horloge.maintenant = tache.quand;
      try { if (typeof tache.fn === 'function') tache.fn(); } catch (erreur) { /* présentation : sans objet ici */ }
    }
    horloge.maintenant = fin;
  }

  /* Éléments : de vrais objets qui RETIENNENT ce qu'on y écrit. Le lancement
     d'une partie lit des <select> (nombre de joueurs, difficulté, plateau)
     que le banc vient de régler : un leurre rendrait n'importe quoi. */
  const parId = new Map();
  function element(id) {
    if (id && parId.has(id)) return parId.get(id);
    const fond = {
      id, value: '', checked: false, hidden: false, disabled: false,
      textContent: '', innerHTML: '', children: [], options: [], selectedIndex: 0,
      dataset: {},
      style: { setProperty() {}, removeProperty() {}, getPropertyValue: () => '' },
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      // Deux champs de nom : une partie à deux joueurs, comme le formulaire par défaut.
      querySelectorAll: selecteur => (/player-name/.test(selecteur) ? [element(), element()] : []),
      querySelector: selecteur => element('q:' + selecteur),
      getElementsByClassName: () => [],
      appendChild: enfant => enfant, insertBefore: enfant => enfant,
      append() {}, prepend() {}, removeChild() {}, remove() {}, replaceChildren() {},
      addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
      setAttribute() {}, removeAttribute() {}, getAttribute: () => null, hasAttribute: () => false,
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 1280, bottom: 800, width: 1280, height: 800 }),
      focus() {}, blur() {}, click() {}, scrollIntoView() {},
      closest: () => null, matches: () => false, contains: () => false,
      getContext: () => leurre(),
      cloneNode: () => element(),
      animate: () => ({ finished: Promise.resolve(), cancel() {}, onfinish: null }),
      offsetWidth: 1280, offsetHeight: 800, clientWidth: 1280, clientHeight: 800
    };
    const el = new Proxy(fond, {
      get(cible, cle) {
        if (cle in cible) return cible[cle];
        if (typeof cle === 'symbol') return undefined;
        return leurre();
      },
      set(cible, cle, valeur) { cible[cle] = valeur; return true; }
    });
    if (id) parId.set(id, el);
    return el;
  }

  const document = element('document');
  Object.assign(document, {
    getElementById: id => element(id),
    createElement: () => element(), createElementNS: () => element(),
    createTextNode: () => element(), createDocumentFragment: () => element(),
    body: element('body'), documentElement: element('html'), head: element('head'),
    fonts: { ready: Promise.resolve(), load: () => Promise.resolve() },
    visibilityState: 'visible', readyState: 'complete',
    fullscreenElement: null, activeElement: null
  });

  const stockage = {};
  const substituts = {
    document,
    setTimeout: (fn, ms) => {
      const id = ++horloge.suivant;
      horloge.file.push({ id, fn, quand: horloge.maintenant + (ms || 0) });
      return id;
    },
    clearTimeout: id => { horloge.file = horloge.file.filter(t => t.id !== id); },
    setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    localStorage: {
      getItem: cle => stockage[cle] ?? null,
      setItem: (cle, valeur) => { stockage[cle] = String(valeur); },
      removeItem: cle => { delete stockage[cle]; }
    },
    navigator: leurre(), THREE: leurre(),
    location: { search: '', hash: '', href: 'http://localhost/', hostname: 'localhost', pathname: '/' },
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    getComputedStyle: () => leurre(),
    innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
    AudioContext: undefined, indexedDB: undefined,
    fetch: () => new Promise(() => {}),
    Image: function () { return leurre(); },
    CustomEvent: function () {}, Event: function () {}, HTMLElement: function () {}
  };
  return { substituts, avancer };
}

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
