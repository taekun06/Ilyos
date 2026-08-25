#!/usr/bin/env node
/* Empreinte de style calculé — l'outil qui rend la refonte de la cascade
   vérifiable au lieu d'être une affaire de confiance.

   Le problème qu'il résout : fusionner huit feuilles empilées en une seule, ou
   retirer un !important devenu inutile, change potentiellement le rendu de
   n'importe lequel des 1 500 éléments de la page — et rien ne le dit. Relire le
   diff ne suffit pas ; comparer deux captures d'écran non plus, un décalage
   d'un pixel ou une couleur voisine passant inaperçus.

   Ce script relève, pour chaque élément de la page et dans plusieurs états de
   jeu, son rectangle et les propriétés calculées qui décident du rendu. Deux
   relevés se comparent ensuite propriété par propriété.

     node scripts/empreinte-css.js relever  avant.json
     ... modifier le CSS ...
     node scripts/empreinte-css.js relever  apres.json
     node scripts/empreinte-css.js comparer avant.json apres.json

   Le déterminisme est la condition de tout : une empreinte qui bouge toute
   seule ne dit plus rien. Deux précautions le garantissent.

   • `Math.random` est remplacé, avant le premier script de la page, par un
     générateur à graine (mulberry32). Les cinquante appels du jeu — tirage des
     cartes, formes d'îles, choix de l'IA — deviennent reproductibles. Le dépôt
     n'utilise aucun `crypto.getRandomValues`, donc rien n'échappe à ce
     remplacement.

   • Toutes les animations en cours sont ramenées à leur première image et mises
     en pause juste avant le relevé, sans quoi une transition à mi-course ferait
     varier des dizaines de valeurs d'une exécution à l'autre.

   Ce que la graine ne suffit PAS à rendre reproductible, mesuré plutôt que
   supposé : un état de partie avancée. Relever après quatre tours d'IA donnait
   134 écarts entre deux exécutions du même code — joueur courant différent,
   plateau différent. La raison est que le nombre d'actions qu'une IA parvient à
   jouer dans un tour dépend du temps réel (elle attend la fin de chaque
   animation), donc les deux parties ne consomment pas la même suite de nombres
   et divergent. Les états relevés ici sont donc tous atteints sans faire jouer
   l'IA. Si un état de mi-partie devient nécessaire un jour, il faudra le
   construire par une suite de coups scriptée, pas en laissant l'IA jouer.

   Une contrainte d'usage, apprise à la dure : **relever sur une machine au
   repos**. Une paire de relevés prise pendant qu'un test de bout en bout
   tournait à côté a produit 93 écarts sur un code pourtant identique — hauteurs
   de texte, disposition du menu, joueur actif. Les mêmes deux relevés, machine
   libre, en donnent zéro. Ne pas lancer `npm test` en parallèle.

   Pour vérifier que l'outil lui-même est fiable : relever deux fois de suite
   sans rien changer, puis comparer. La sortie doit être vide.

   Le serveur de développement doit tourner sur le port visé (par défaut 8126,
   réglable avec --port).  */

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const GRAINE = 20260825;
const PORT_DEFAUT = 8126;

/* Délai laissé au jeu pour se poser avant chaque relevé. Il est calé sur la
   plus longue minuterie d'affichage : un toast reste 1 900 ms, son miroir dans
   le HUD 2 400 ms, et le bandeau d'entrée en mode alternatif 1 450 + 420 ms.
   En deçà, un message encore à l'écran dans une exécution et déjà parti dans
   l'autre suffit à faire diverger l'empreinte. */
const STABILISATION_MS = 5500;

/* Les propriétés retenues sont celles qui décident du rendu : la boîte, le
   flux, le texte et la peinture. Relever les ~340 propriétés calculées
   coûterait dix fois plus cher pour un signal équivalent — la plupart sont des
   valeurs initiales que personne ne touche. */
const PROPRIETES = [
  'display', 'visibility', 'opacity', 'position', 'top', 'right', 'bottom', 'left', 'z-index',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-color', 'border-radius', 'box-shadow', 'outline',
  'color', 'background-color', 'background-image',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
  'text-align', 'text-transform', 'text-shadow', 'white-space',
  'transform', 'filter', 'overflow-x', 'overflow-y', 'pointer-events',
  'flex-direction', 'justify-content', 'align-items', 'gap',
  'grid-template-columns', 'grid-template-rows'
];

function scriptDeterminisme(graine) {
  return `(() => {
    let etat = ${graine} >>> 0;
    Math.random = function () {
      etat |= 0; etat = (etat + 0x6D2B79F5) | 0;
      let t = Math.imul(etat ^ (etat >>> 15), 1 | etat);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();`;
}

/* Les états relevés. Chacun doit être atteignable sans intervention humaine et
   se stabiliser avant le relevé : un état encore en mouvement produirait du
   bruit à chaque exécution.

   Chaque état part d'une page neuve, et non de l'état précédent. Enchaîner les
   quatre sur une même page était plus rapide, mais rendait chaque relevé
   dépendant de ce que le précédent avait laissé derrière lui — minuteries en
   cours, animations à mi-course, classes posées puis jamais retirées. Le prix
   est de recharger le jeu quatre fois ; le gain est que chaque état ne dépend
   que de lui-même. */
const ETATS = {
  async menu(page) {
    // L'état de départ : menu affiché, aucune partie lancée.
    await page.waitForTimeout(STABILISATION_MS);
  },

  async partieNeuve(page) {
    /* Deux joueurs locaux, et non le mode contre l'ordinateur : c'est ce qui
       rend l'état figé. Avec une IA, la partie continue de se jouer pendant les
       relevés suivants — mesuré, ça suffisait à faire apparaître `ai-turn` dans
       une exécution sur deux et à décaler 93 éléments.

       La minuterie de tour est coupée (`turnTime: 0`) pour la même raison. */
    await page.evaluate(() => window.ILYOS_API.launchConfiguredGame({
      opponent: '2', board: 'classic', difficulty: 'normal', turnTime: 0, autoplay: false
    }));
    await page.waitForFunction(
      () => !document.getElementById('gameScreen')?.classList.contains('hidden'),
      null, { timeout: 30000 }
    );
    await page.waitForTimeout(STABILISATION_MS);
  },

  async regles(page) {
    /* La fenêtre des règles, ouverte par-dessus la partie. Tant qu'elle est
       masquée, ses éléments n'ont pas de disposition réelle — c'est donc du
       DOM que les deux états précédents ne mesurent pas vraiment. */
    await ETATS.partieNeuve(page);
    await page.evaluate(() => document.getElementById('rulesModal')?.classList.remove('hidden'));
    await page.waitForTimeout(2500);
  },

  async menuSon(page) {
    /* Même raison pour le menu Son, et il porte ses propres composants —
       curseurs, bascules — qu'on ne trouve nulle part ailleurs. On retire la
       classe plutôt que de cliquer le bouton : celui-ci vit dans un popover
       qu'il faudrait ouvrir d'abord, et c'est bien l'état visuel qu'on relève,
       pas le câblage qui y mène. */
    await ETATS.partieNeuve(page);
    await page.evaluate(() => document.getElementById('soundMenu')?.classList.remove('hidden'));
    await page.waitForTimeout(2500);
  }
};

/* Exécutée dans la page. Renvoie un objet { chemin → { propriété → valeur } }.

   La clé est le chemin structurel de l'élément (`body>div:nth-of-type(2)>span`)
   et non ses classes : une passe CSS ne doit rien changer à la structure du
   DOM, alors qu'elle peut parfaitement faire basculer une classe. Avec cette
   clé, un changement de classe se lit comme une différence sur l'élément
   concerné, au lieu de le faire disparaître puis réapparaître ailleurs. */
function fonctionDeReleve() {
  return (proprietes) => {
    document.getAnimations().forEach(animation => {
      try { animation.currentTime = 0; animation.pause(); } catch { /* animation déjà terminée */ }
    });

    /* `v69-fps-low` est posée sur <html> par js/complete-polish.js selon la
       fréquence d'images mesurée, et elle éteint deux effets (v67-turn-wash,
       v67-event-layer). Elle dépend donc de la charge de la machine, pas du
       CSS : la laisser rendrait l'empreinte instable pour une raison qui
       n'apprend rien. On relève toujours le chemin haute qualité. */
    document.documentElement.classList.remove('v69-fps-low');

    const chemin = element => {
      const morceaux = [];
      let noeud = element;
      while (noeud && noeud.nodeType === 1 && noeud.parentNode && noeud !== document.documentElement) {
        const memeBalise = [...noeud.parentNode.children].filter(enfant => enfant.tagName === noeud.tagName);
        const rang = memeBalise.indexOf(noeud) + 1;
        morceaux.unshift(memeBalise.length > 1
          ? `${noeud.tagName.toLowerCase()}:nth-of-type(${rang})`
          : noeud.tagName.toLowerCase());
        noeud = noeud.parentNode;
      }
      return morceaux.join('>');
    };

    const ignores = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'TITLE', 'HEAD', 'BASE']);
    const releve = {};
    for (const element of document.querySelectorAll('*')) {
      if (ignores.has(element.tagName)) continue;
      const calcule = getComputedStyle(element);
      const rectangle = element.getBoundingClientRect();
      const valeurs = {
        '@classes': typeof element.className === 'string' ? element.className.trim() : '',
        '@rect': [rectangle.x, rectangle.y, rectangle.width, rectangle.height].map(Math.round).join(' ')
      };
      for (const propriete of proprietes) valeurs[propriete] = calcule.getPropertyValue(propriete);
      releve[chemin(element)] = valeurs;
    }
    return releve;
  };
}

async function relever(destination, options) {
  const navigateur = await chromium.launch();
  const empreinte = { graine: options.graine, releveLe: new Date().toISOString(), etats: {} };
  const incidents = [];

  for (const [nom, preparer] of Object.entries(ETATS)) {
    process.stdout.write(`  ${nom}… `);
    const contexte = await navigateur.newContext({ viewport: { width: 1280, height: 800 } });
    await contexte.addInitScript(scriptDeterminisme(options.graine));
    const page = await contexte.newPage();
    page.on('pageerror', erreur => incidents.push(`${nom} · ${erreur.message}`));

    await page.goto(`http://127.0.0.1:${options.port}/`);
    await page.waitForFunction(
      () => typeof window.ILYOS_TEST?.playAIvsAI === 'function',
      null, { timeout: 45000 }
    );
    await preparer(page);

    const cadres = {};
    for (const cadre of page.frames()) {
      const etiquette = cadre === page.mainFrame()
        ? 'document'
        : cadre.url().split('/').pop().split('?')[0] || 'cadre';
      try {
        cadres[etiquette] = await cadre.evaluate(fonctionDeReleve(), PROPRIETES);
      } catch { /* cadre détaché entre-temps */ }
    }
    empreinte.etats[nom] = cadres;
    await contexte.close();

    const total = Object.values(cadres).reduce((somme, c) => somme + Object.keys(c).length, 0);
    console.log(`${total} éléments`);
  }

  if (incidents.length) {
    console.log(`  ⚠ ${incidents.length} exception(s) pendant le relevé — la première : ${incidents[0]}`);
  }

  const absolu = path.resolve(destination);
  fs.mkdirSync(path.dirname(absolu), { recursive: true });
  fs.writeFileSync(absolu, JSON.stringify(empreinte));
  console.log(`\nEmpreinte écrite dans ${destination} (${Math.round(fs.statSync(absolu).size / 1024)} ko).`);
  await navigateur.close();
}

function comparer(cheminAvant, cheminApres, options) {
  const avant = JSON.parse(fs.readFileSync(cheminAvant, 'utf8'));
  const apres = JSON.parse(fs.readFileSync(cheminApres, 'utf8'));
  let ecarts = 0;
  const parPropriete = {};

  for (const nomEtat of Object.keys(avant.etats)) {
    const cadresAvant = avant.etats[nomEtat] || {};
    const cadresApres = apres.etats[nomEtat] || {};

    for (const cadre of Object.keys(cadresAvant)) {
      const a = cadresAvant[cadre] || {};
      const b = cadresApres[cadre] || {};

      const disparus = Object.keys(a).filter(cle => !(cle in b));
      const apparus = Object.keys(b).filter(cle => !(cle in a));
      if (disparus.length || apparus.length) {
        console.log(`\n[${nomEtat} · ${cadre}] la structure du DOM a changé`);
        disparus.slice(0, 8).forEach(cle => console.log(`  − ${cle}`));
        apparus.slice(0, 8).forEach(cle => console.log(`  + ${cle}`));
        if (disparus.length > 8 || apparus.length > 8) {
          console.log(`  … ${disparus.length} disparu(s) et ${apparus.length} apparu(s) au total`);
        }
        ecarts += disparus.length + apparus.length;
      }

      const modifies = [];
      for (const cle of Object.keys(a)) {
        if (!(cle in b)) continue;
        const changements = [];
        for (const propriete of Object.keys(a[cle])) {
          if (a[cle][propriete] !== b[cle][propriete]) {
            changements.push([propriete, a[cle][propriete], b[cle][propriete]]);
            parPropriete[propriete] = (parPropriete[propriete] || 0) + 1;
          }
        }
        if (changements.length) modifies.push([cle, changements]);
      }

      if (modifies.length) {
        console.log(`\n[${nomEtat} · ${cadre}] ${modifies.length} élément(s) rendus différemment`);
        for (const [cle, changements] of modifies.slice(0, options.detail)) {
          console.log(`  ${cle}`);
          for (const [propriete, valeurAvant, valeurApres] of changements.slice(0, 6)) {
            console.log(`      ${propriete} : ${valeurAvant}  →  ${valeurApres}`);
          }
          if (changements.length > 6) console.log(`      … ${changements.length - 6} autre(s) propriété(s)`);
        }
        if (modifies.length > options.detail) {
          console.log(`  … ${modifies.length - options.detail} autre(s) élément(s)`);
        }
        ecarts += modifies.length;
      }
    }
  }

  if (!ecarts) {
    console.log('Aucun écart. Le rendu calculé est identique, élément par élément, propriété par propriété.');
    return 0;
  }
  console.log(`\n${ecarts} écart(s) au total. Propriétés les plus touchées :`);
  Object.entries(parPropriete)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 10)
    .forEach(([propriete, nombre]) => console.log(`  ${String(nombre).padStart(5)}  ${propriete}`));
  return 1;
}

(async () => {
  const args = process.argv.slice(2);
  const commande = args[0];
  const option = (nom, defaut) => {
    const index = args.indexOf(`--${nom}`);
    return index === -1 ? defaut : Number(args[index + 1]);
  };
  const options = {
    port: option('port', PORT_DEFAUT),
    graine: option('graine', GRAINE),
    detail: option('detail', 12)
  };
  const fichiers = [];
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) { i++; continue; }
    fichiers.push(args[i]);
  }

  if (commande === 'relever' && fichiers[0]) {
    await relever(fichiers[0], options);
    return;
  }
  if (commande === 'comparer' && fichiers[1]) {
    process.exitCode = comparer(fichiers[0], fichiers[1], options);
    return;
  }
  console.error('Usage :\n'
    + '  node scripts/empreinte-css.js relever  <sortie.json>        [--port 8126] [--graine 20260825]\n'
    + '  node scripts/empreinte-css.js comparer <avant.json> <apres.json> [--detail 12]');
  process.exitCode = 2;
})();
