#!/usr/bin/env node
/* Audit des déclarations !important — lesquelles portent réellement quelque
   chose, et lesquelles ne font que du bruit.

   Le dépôt en compte 10 186 à l'exécution, réparties sur 39 sources. Les
   retirer au jugé est hors de question ; les garder toutes interdit de mettre
   la cascade en couches, puisque entre déclarations prioritaires l'ordre des
   couches s'inverse. Il faut donc savoir lesquelles sont réellement en
   compétition.

   Le critère est simple et vérifiable. Pour chaque règle et chaque propriété
   qu'elle déclare en !important, on regarde les éléments que son sélecteur
   atteint réellement dans le jeu, et on compte combien de règles déclarent
   cette même propriété sur ces mêmes éléments :

   • une seule règle  → le !important n'arbitre rien. Il peut tomber sans que
     le rendu bouge, et c'est autant de moins à démêler pour les couches ;
   • plusieurs règles → le !important arbitre peut-être un conflit réel. Il
     demande à être regardé de près, pas à être supprimé en masse.

   Une règle dont le sélecteur n'atteint aucun élément, dans aucun état de jeu,
   est signalée à part : elle est morte, drapeau ou pas.

   Le verdict est rendu sur les quatre mêmes états que scripts/empreinte-css.js
   et avec les mêmes précautions de déterminisme — une propriété contestée dans
   un seul état compte comme contestée partout.

     node scripts/audit-important.js [--port 8127] [--sources 20]

   Trois limites à garder en tête.

   • Le compte porte sur ce que les quatre états font apparaître. Une règle qui
     ne sert qu'à un écran jamais atteint ici — la victoire, le mode en ligne,
     une partie à quatre — sera comptée morte à tort. « Morte » se lit donc
     « à vérifier », pas « à supprimer ».

   • Les états d'interaction et les pseudo-éléments sont retirés du sélecteur
     avant de chercher les éléments, faute de quoi toute règle de survol serait
     comptée morte. La question devient « l'élément de base existe-t-il », ce
     qui est la bonne, mais elle ne dit rien de la pertinence du survol lui-même.

   • « Non contestée » veut dire « aucun concurrent aujourd'hui ». Une passe
     future qui déclarerait la même propriété rouvrirait le conflit. */

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const PORT_DEFAUT = 8127;
const GRAINE = 20260825;
const STABILISATION_MS = 5500;

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

const ETATS = {
  async menu(page) {
    await page.waitForTimeout(STABILISATION_MS);
  },
  async partieNeuve(page) {
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
    await ETATS.partieNeuve(page);
    await page.evaluate(() => document.getElementById('rulesModal')?.classList.remove('hidden'));
    await page.waitForTimeout(2500);
  },
  async menuSon(page) {
    await ETATS.partieNeuve(page);
    await page.evaluate(() => document.getElementById('soundMenu')?.classList.remove('hidden'));
    await page.waitForTimeout(2500);
  }
};

/* Exécutée dans la page. L'ordre de parcours des feuilles et des règles est
   celui du navigateur, donc identique d'un état à l'autre : les index renvoyés
   ici servent de clé pour recouper les quatre états côté Node. */
function fonctionAudit() {
  return () => {
    const regles = [];

    for (const feuille of document.styleSheets) {
      let liste;
      try { liste = feuille.cssRules; } catch { continue; }
      const source = feuille.href
        ? feuille.href.split('/').pop().split('?')[0]
        : `<style ${feuille.ownerNode && feuille.ownerNode.id ? '#' + feuille.ownerNode.id : 'anonyme'}>`;

      const parcourir = liste2 => {
        for (const regle of liste2) {
          /* Depuis le CSS imbriqué, CSSStyleRule porte aussi un cssRules vide
             mais truthy : on teste la nature de la règle, pas la propriété. */
          if (regle.selectorText === undefined) {
            if (regle.cssRules) parcourir(regle.cssRules);
            continue;
          }
          const proprietes = [];
          for (let i = 0; i < regle.style.length; i++) {
            const nom = regle.style[i];
            proprietes.push([nom, regle.style.getPropertyPriority(nom) === 'important']);
          }
          regles.push({ source, selecteur: regle.selectorText, proprietes });
          if (regle.cssRules && regle.cssRules.length) parcourir(regle.cssRules);
        }
      };
      parcourir(liste);
    }

    /* `querySelectorAll` ne fait jamais correspondre un état d'interaction ni
       un pseudo-élément : `.x:hover` ne rend rien tant que la souris n'y est
       pas, et `.x::before` rien du tout. Sans ce nettoyage, toute règle de
       survol ou d'ornement serait comptée morte — hover-feedback.css sortait
       « mort à 68 % » alors qu'il fait exactement son travail.

       On retire donc ce qui dépend de l'interaction ou vise une boîte générée,
       et on garde tout ce qui est structurel (:not, :nth-child, :is, :where…) :
       la question posée devient « l'élément de base existe-t-il quelque part »,
       ce qui est la bonne. */
    const ETATS_DYNAMIQUES = /:{1,2}(hover|focus|focus-visible|focus-within|active|visited|target|any-link|autofill|placeholder-shown|user-invalid|user-valid)\b/g;
    const PSEUDO_ELEMENTS = /::[a-z-]+(\([^)]*\))?/g;
    const normaliser = selecteur => selecteur
      .replace(PSEUDO_ELEMENTS, '')
      .replace(ETATS_DYNAMIQUES, '')
      .split(',')
      .map(part => part.trim())
      .filter(part => part.length)
      .join(', ');

    /* Combien de règles déclarent chaque propriété sur chaque élément. On passe
       une fois par règle (querySelectorAll), pas une fois par couple. */
    const parElement = new Map();
    const atteints = regles.map(regle => {
      let elements = [];
      const cible = normaliser(regle.selecteur);
      try { if (cible) elements = [...document.querySelectorAll(cible)]; } catch { /* sélecteur non pris en charge */ }
      for (const element of elements) {
        let compte = parElement.get(element);
        if (!compte) { compte = new Map(); parElement.set(element, compte); }
        for (const [nom] of regle.proprietes) compte.set(nom, (compte.get(nom) || 0) + 1);
      }
      return elements;
    });

    return regles.map((regle, index) => {
      const elements = atteints[index];
      const contestees = [];
      let importantTotal = 0;
      for (const [nom, important] of regle.proprietes) {
        if (!important) continue;
        importantTotal++;
        if (elements.some(element => (parElement.get(element).get(nom) || 0) > 1)) contestees.push(nom);
      }
      return {
        source: regle.source,
        selecteur: regle.selecteur,
        elements: elements.length,
        importantTotal,
        contestees
      };
    });
  };
}

async function auditer(options) {
  const navigateur = await chromium.launch();
  const parEtat = {};

  for (const [nom, preparer] of Object.entries(ETATS)) {
    process.stdout.write(`  ${nom}… `);
    const contexte = await navigateur.newContext({ viewport: { width: 1280, height: 800 } });
    await contexte.addInitScript(scriptDeterminisme(GRAINE));
    const page = await contexte.newPage();
    await page.goto(`http://127.0.0.1:${options.port}/`);
    await page.waitForFunction(
      () => typeof window.ILYOS_TEST?.playAIvsAI === 'function',
      null, { timeout: 45000 }
    );
    await preparer(page);
    parEtat[nom] = await page.evaluate(fonctionAudit());
    await contexte.close();
    console.log(`${parEtat[nom].length} règles`);
  }
  await navigateur.close();

  /* Fusion des quatre états. Une propriété contestée dans un seul état l'est
     partout ; une règle n'est morte que si elle n'atteint rien nulle part. */
  const etats = Object.values(parEtat);
  const reference = etats[0];
  const sources = new Map();
  let totalImportant = 0, totalNonContestees = 0, totalMortes = 0, totalRegles = reference.length;

  reference.forEach((regle, index) => {
    const variantes = etats.map(e => e[index]).filter(Boolean);
    const elements = Math.max(...variantes.map(v => v.elements));
    /* Une propriété contestée dans un seul état l'est partout : le drapeau y
       arbitre un conflit réel, et le retirer changerait ce rendu-là. */
    const contestees = new Set(variantes.flatMap(v => v.contestees));
    /* Le nombre de !important d'une règle est une donnée du CSS, identique dans
       les quatre états — le maximum les couvre tous, y compris si un état a
       échoué à relever cette règle. */
    const importantDeLaRegle = Math.max(...variantes.map(v => v.importantTotal));
    const nonContestees = importantDeLaRegle - contestees.size;

    let bilan = sources.get(regle.source);
    if (!bilan) {
      bilan = { regles: 0, mortes: 0, important: 0, contestees: 0, nonContestees: 0, exemples: [] };
      sources.set(regle.source, bilan);
    }
    bilan.regles++;
    bilan.important += importantDeLaRegle;
    bilan.contestees += contestees.size;
    bilan.nonContestees += nonContestees;
    totalImportant += importantDeLaRegle;
    totalNonContestees += nonContestees;

    if (elements === 0) {
      bilan.mortes++;
      totalMortes++;
      if (bilan.exemples.length < 3) bilan.exemples.push(regle.selecteur);
    }

    /* Règles entièrement libérables : vivantes, et dont aucune déclaration
       prioritaire n'est contestée. Ce sont les seules que --corriger touche. */
    if (elements > 0 && importantDeLaRegle > 0 && contestees.size === 0) {
      bilan.liberables = (bilan.liberables || 0) + 1;
      bilan.liberablesDecl = (bilan.liberablesDecl || 0) + importantDeLaRegle;
    }
  });

  return { sources, totalImportant, totalNonContestees, totalMortes, totalRegles, parEtat };
}

/* Les sélecteurs d'une source dont TOUTES les déclarations !important sont sans
   concurrent. La condition est volontairement tout ou rien : un raccourci comme
   `margin: 0 !important` s'écrit une fois mais produit quatre déclarations
   longues. Si l'une d'elles est contestée et pas les autres, on ne peut pas
   retirer le drapeau du raccourci sans changer le rendu — alors on ne touche
   pas à la règle du tout.

   Deuxième condition, et elle est décisive : la règle doit atteindre au moins
   un élément. Une règle qui n'atteint rien ressort mécaniquement « sans
   concurrent », faute de concurrent observable — mais c'est une absence de
   preuve, pas une preuve d'absence : elle sert peut-être un écran que les
   quatre états ne visitent pas, où le conflit existe bel et bien. L'empreinte
   ne pourrait pas davantage l'infirmer, puisqu'elle mesure les mêmes états. On
   ne touche donc qu'à ce qu'on a vu vivre. */
function selecteursLiberables(parEtat, source) {
  const etats = Object.values(parEtat);
  const reference = etats[0];
  const liberables = [];
  reference.forEach((regle, index) => {
    if (regle.source !== source) return;
    const variantes = etats.map(e => e[index]).filter(Boolean);
    const important = Math.max(...variantes.map(v => v.importantTotal));
    if (!important) return;
    if (!variantes.some(v => v.elements > 0)) return;
    const contestees = new Set(variantes.flatMap(v => v.contestees));
    if (contestees.size === 0) liberables.push({ selecteur: regle.selecteur, important });
  });
  return liberables;
}

const normaliserSelecteur = s => s.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',').trim().toLowerCase();

/* Retire ` !important` des blocs dont le sélecteur figure dans la liste.

   Le fichier est parcouru en comptant les accolades plutôt qu'en s'appuyant sur
   une expression régulière : les blocs @media imbriqués rendraient tout motif
   naïf faux. Les sélecteurs sont comparés après normalisation, le navigateur ne
   restituant pas l'espacement d'origine. */
function libererFichier(chemin, selecteurs) {
  const cibles = new Set(selecteurs.map(s => normaliserSelecteur(s.selecteur)));
  const source = fs.readFileSync(chemin, 'utf8');
  let sortie = '';
  let i = 0;
  let liberees = 0;
  let blocs = 0;

  while (i < source.length) {
    const ouverture = source.indexOf('{', i);
    if (ouverture === -1) { sortie += source.slice(i); break; }

    const entete = source.slice(i, ouverture);
    const selecteur = normaliserSelecteur(entete);

    // Un bloc conditionnel (@media, @supports…) contient d'autres blocs : on le
    // recopie tel quel et on poursuit à l'intérieur.
    if (/@(media|supports|layer|container)/i.test(entete)) {
      sortie += source.slice(i, ouverture + 1);
      i = ouverture + 1;
      continue;
    }

    let profondeur = 1;
    let j = ouverture + 1;
    while (j < source.length && profondeur > 0) {
      if (source[j] === '{') profondeur++;
      else if (source[j] === '}') profondeur--;
      j++;
    }

    const corps = source.slice(ouverture + 1, j - 1);
    if (cibles.has(selecteur) && corps.includes('!important')) {
      const nettoye = corps.replace(/\s*!important/g, '');
      liberees += (corps.match(/!important/g) || []).length;
      blocs++;
      sortie += entete + '{' + nettoye + '}';
    } else {
      sortie += source.slice(i, j);
    }
    i = j;
  }

  fs.writeFileSync(chemin, sortie, 'utf8');
  return { liberees, blocs };
}

(async () => {
  const args = process.argv.slice(2);
  const option = (nom, defaut) => {
    const i = args.indexOf(`--${nom}`);
    return i === -1 ? defaut : Number(args[i + 1]);
  };
  const indexCorriger = args.indexOf('--corriger');
  const aCorriger = indexCorriger === -1 ? null : args[indexCorriger + 1];
  const options = { port: option('port', PORT_DEFAUT), sources: option('sources', 20) };

  const bilan = await auditer(options);

  if (aCorriger) {
    const source = path.basename(aCorriger);
    const liberables = selecteursLiberables(bilan.parEtat, source);
    if (!liberables.length) {
      console.log(`\nRien à libérer dans ${source} : aucune règle n'a toutes ses déclarations !important sans concurrent.`);
      return;
    }
    const { liberees, blocs } = libererFichier(aCorriger, liberables);
    console.log(`\n${source} : ${liberees} déclarations !important retirées sur ${blocs} règles.`);
    console.log('Relever une empreinte et comparer avant de commiter — le compte est un pari, la comparaison est la preuve.');
    return;
  }

  console.log(`\n${bilan.totalRegles} règles · ${bilan.totalImportant} déclarations !important`);
  console.log(`${bilan.totalNonContestees} sans aucun concurrent `
    + `(${Math.round(100 * bilan.totalNonContestees / (bilan.totalImportant || 1))} %) — retirables sans changer le rendu`);
  console.log(`${bilan.totalMortes} règles n'atteignent aucun élément dans les quatre états relevés\n`);

  const lignes = [...bilan.sources.entries()]
    .sort((a, b) => b[1].nonContestees - a[1].nonContestees)
    .slice(0, options.sources);

  console.log('  source                                   règles  mortes  !import.  sans conc.   libérables');
  for (const [source, b] of lignes) {
    const part = b.important ? Math.round(100 * b.nonContestees / b.important) : 0;
    const lib = b.liberablesDecl || 0;
    console.log(`  ${source.padEnd(39).slice(0, 39)} ${String(b.regles).padStart(6)} ${String(b.mortes).padStart(7)} `
      + `${String(b.important).padStart(9)} ${String(b.nonContestees).padStart(8)} (${String(part).padStart(3)} %) `
      + `${String(lib).padStart(6)} sur ${b.liberables || 0} règles`);
  }

  const totalLiberables = [...bilan.sources.values()].reduce((t, b) => t + (b.liberablesDecl || 0), 0);
  console.log(`
Libérables sans discussion (règle vivante, aucune de ses déclarations contestée) : ${totalLiberables}`);
})();
