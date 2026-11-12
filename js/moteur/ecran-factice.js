/* ÉCRAN FACTICE — ce qu'il faut au bundle js/game.js pour se charger là où il
   n'y a ni page ni 3D : sous Node (scripts/moteur-sans-ecran.js) et dans un
   Web Worker (js/moteur/worker.js).

   Ce n'est pas une émulation du navigateur. Rien n'est dessiné, aucun son,
   aucune sauvegarde : le bundle n'y est utilisé que pour ses chemins de
   SIMULATION (règles et IA), qui sautent toute la présentation.

   Script classique ET module CommonJS : `require()` sous Node,
   `importScripts()` dans un Worker (il pose alors ILYOS_ECRAN_FACTICE). */
(function (racine) {
  "use strict";

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
    function Observateur() {}
    Observateur.prototype = { observe() {}, unobserve() {}, disconnect() {}, takeRecords: () => [] };
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
      CustomEvent: function () {}, Event: function () {}, HTMLElement: function () {},
      /* Observateurs du navigateur : rien n'est dessiné, ils n'ont rien à voir. */
      MutationObserver: Observateur, ResizeObserver: Observateur, IntersectionObserver: Observateur
    };
    return { substituts, avancer };
  }

  const api = { creer: creerEcranFactice };
  if (typeof module === "object" && module.exports) module.exports = api;
  else racine.ILYOS_ECRAN_FACTICE = api;
})(typeof self !== "undefined" ? self : globalThis);
