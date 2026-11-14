#!/usr/bin/env node
/* Règles CSS mortes — celles qui ne peuvent plus rien atteindre.

   La question posée est plus étroite que « cette règle sert-elle ? », et c'est
   ce qui la rend décidable sans navigateur : **le nom de classe ou
   d'identifiant qu'elle exige existe-t-il encore quelque part hors du CSS ?**
   Si aucun fichier HTML ou JavaScript du dépôt ne contient ce nom — ni entier,
   ni comme morceau recollé à l'exécution — aucun élément ne le portera jamais,
   et la règle est morte dans tous les états du jeu, pas seulement dans ceux
   qu'une empreinte sait atteindre.

     node scripts/audit-css-mort.js              état des lieux
     node scripts/audit-css-mort.js --corriger   retire les règles mortes

   Le doute profite toujours à la règle :

   • un nom est vivant dès qu'il apparaît comme sous-chaîne dans une source ;
   • il l'est aussi si l'un de ses débuts est suivi dans une source d'une
     interpolation ou d'une concaténation (`joueur-p${i}`, `'is-' + etat`), ou
     si un début finissant par « - » ou « _ » y termine une chaîne ; de même
     pour ses fins ;
   • ce qui se trouve dans :not(), :is(), :where(), :has() et dans les
     sélecteurs d'attribut n'est jamais retenu comme preuve de mort ;
   • dans une liste de sélecteurs, seuls les sélecteurs morts sont retirés.

   Après `--corriger`, l'empreinte (tests/README.md) doit rester sans écart. */

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..');
const IGNORES = new Set(['node_modules', '.git', 'vendor', '.empreintes', 'test-results', 'playwright-report', 'docs', 'assets']);

function lister(dossier, extensions, sortie = []) {
  for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
    if (IGNORES.has(entree.name)) continue;
    const chemin = path.join(dossier, entree.name);
    if (entree.isDirectory()) lister(chemin, extensions, sortie);
    else if (extensions.some(e => entree.name.endsWith(e))) sortie.push(chemin);
  }
  return sortie;
}

const RE_STYLE = /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/g;

/* ── Les sources où un nom peut naître ─────────────────────────────────── */
function chargerSources() {
  const morceaux = [];
  for (const fichier of lister(RACINE, ['.js', '.html', '.mjs'])) {
    // Les outils et les tests citent des noms sans jamais les poser dans le jeu…
    // mais les compter vivants ne coûte que de la prudence : on les garde.
    let texte = fs.readFileSync(fichier, 'utf8');
    if (fichier.endsWith('.html')) texte = texte.replace(RE_STYLE, '$1$3');
    morceaux.push(texte);
  }
  return morceaux.join('\n');
}

function fabriquerOracle(sources) {
  const cache = new Map();
  const echapper = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const FIN = '(?:[\'"`+]|\\$\\{)';
  const DEBUT = '(?:[\'"`+}])';
  const COLLE_APRES = '(?:\\$\\{|[\'"`]\\s*\\+)';
  const COLLE_AVANT = '(?:\\}|\\+\\s*[\'"`])';
  return nom => {
    if (cache.has(nom)) return cache.get(nom);
    let vivant = sources.includes(nom);
    for (let i = 2; !vivant && i < nom.length; i++) {
      const debut = echapper(nom.slice(0, i));
      const fin = echapper(nom.slice(i)) + '(?![A-Za-z0-9_-])';
      // Recollage certain, à n'importe quelle coupure : `joueur-p${i}`, 'p' + i.
      if (new RegExp(debut + COLLE_APRES).test(sources) || new RegExp(COLLE_AVANT + fin).test(sources)) vivant = true;
      // À une coupure naturelle (- ou _), une simple fin de chaîne suffit au doute.
      else if ('-_'.includes(nom[i - 1]) && new RegExp(debut + FIN).test(sources)) vivant = true;
      else if ('-_'.includes(nom[i]) && new RegExp(DEBUT + fin).test(sources)) vivant = true;
    }
    cache.set(nom, vivant);
    return vivant;
  };
}

/* ── Lecture du CSS ────────────────────────────────────────────────────── */

/* Avance jusqu'au caractère `cible` de même profondeur, en sautant chaînes,
   commentaires et blocs imbriqués. Renvoie son index, ou -1. */
function chercher(css, depart, cibles) {
  let profondeur = 0;
  for (let i = depart; i < css.length; i++) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') { i = css.indexOf('*/', i + 2); if (i < 0) return -1; i++; continue; }
    if (c === '"' || c === "'") {
      for (i++; i < css.length && css[i] !== c; i++) if (css[i] === '\\') i++;
      continue;
    }
    if (profondeur === 0 && cibles.includes(c)) return i;
    if (c === '{' || c === '(' || c === '[') profondeur++;
    else if (c === '}' || c === ')' || c === ']') profondeur--;
  }
  return -1;
}

function decouperListe(selecteur) {
  const parts = [];
  let debut = 0;
  for (;;) {
    const i = chercher(selecteur, debut, ',');
    if (i < 0) { parts.push(selecteur.slice(debut)); break; }
    parts.push(selecteur.slice(debut, i));
    debut = i + 1;
  }
  return parts;
}

function nomsExiges(selecteur) {
  let s = selecteur.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Retire ce qui n'est pas une exigence : attributs, puis pseudo-classes à
  // argument (de l'intérieur vers l'extérieur).
  s = s.replace(/\[[^\]]*\]/g, ' ');
  let precedent;
  do { precedent = s; s = s.replace(/:{1,2}[a-zA-Z-]+\([^()]*\)/g, ' '); } while (s !== precedent);
  const noms = [];
  const re = /[.#](-?[_a-zA-Z -￿](?:[_a-zA-Z0-9 -￿-]|\\.)*)/g;
  let m;
  while ((m = re.exec(s))) if (!m[1].includes('\\')) noms.push(m[1]);
  return noms;
}

const BLOCS_A_REGLES = /^@(media|supports|layer|container|document)\b/i;

/* Réécrit une suite de règles. Renvoie le texte nettoyé et tient le compte. */
function nettoyer(css, vivant, compte) {
  let sortie = '';
  let i = 0;
  while (i < css.length) {
    const fin = chercher(css, i, '{;}');
    if (fin < 0) { sortie += css.slice(i); break; }
    if (css[fin] !== '{') { sortie += css.slice(i, fin + 1); i = fin + 1; continue; }
    const fermeture = chercher(css, fin + 1, '}');
    if (fermeture < 0) { sortie += css.slice(i); break; }

    const entete = css.slice(i, fin);
    const corps = css.slice(fin + 1, fermeture);
    // Les commentaires et blancs qui précèdent le sélecteur restent en place.
    const prefixe = entete.match(/^(?:\s|\/\*[\s\S]*?\*\/)*/)[0];
    const prelude = entete.slice(prefixe.length);
    i = fermeture + 1;

    if (prelude.startsWith('@')) {
      if (BLOCS_A_REGLES.test(prelude)) {
        const interieur = nettoyer(corps, vivant, compte);
        if (interieur.replace(/\/\*[\s\S]*?\*\//g, '').trim() === '' && corps.replace(/\/\*[\s\S]*?\*\//g, '').trim() !== '') {
          compte.blocs++;
          sortie += prefixe.replace(/[ \t]+$/, '');
        } else {
          sortie += prefixe + prelude + '{' + interieur + '}';
        }
      } else {
        sortie += prefixe + prelude + '{' + corps + '}';
      }
      continue;
    }

    compte.regles++;
    const liste = decouperListe(prelude);
    const gardes = liste.filter(s => nomsExiges(s).every(vivant));
    if (gardes.length === liste.length) {
      sortie += prefixe + prelude + '{' + corps + '}';
    } else if (gardes.length === 0) {
      compte.reglesMortes++;
      compte.declarations += corps.split(';').filter(d => d.includes(':')).length;
      for (const s of liste) for (const n of nomsExiges(s)) if (!vivant(n)) compte.noms.add(n);
      sortie += prefixe.replace(/[ \t]+$/, '');
    } else {
      compte.selecteursMorts += liste.length - gardes.length;
      for (const s of liste) for (const n of nomsExiges(s)) if (!vivant(n)) compte.noms.add(n);
      // Garde l'indentation et le blanc final d'origine autour de la liste.
      const queue = prelude.match(/\s*$/)[0];
      sortie += prefixe + gardes.map((s, k) => (k === 0 ? s.replace(/^\s+/, '') : s)).join(',').replace(/\s*$/, '') + queue + '{' + corps + '}';
    }
  }
  return sortie;
}

function main() {
  const corriger = process.argv.includes('--corriger');
  const detail = process.argv.includes('--noms');
  const vivant = fabriquerOracle(chargerSources());
  const total = { regles: 0, reglesMortes: 0, selecteursMorts: 0, declarations: 0, blocs: 0, noms: new Set() };
  const lignes = [];

  const traiter = (fichier, texte, reecrire) => {
    const compte = { regles: 0, reglesMortes: 0, selecteursMorts: 0, declarations: 0, blocs: 0, noms: total.noms };
    const propre = reecrire(css => nettoyer(css, vivant, compte));
    for (const cle of ['regles', 'reglesMortes', 'selecteursMorts', 'declarations', 'blocs']) total[cle] += compte[cle];
    if (compte.reglesMortes || compte.selecteursMorts) {
      lignes.push([path.relative(RACINE, fichier), compte, texte.length - propre.length]);
      if (corriger) fs.writeFileSync(fichier, propre);
    }
  };

  for (const fichier of lister(RACINE, ['.css'])) {
    const texte = fs.readFileSync(fichier, 'utf8');
    traiter(fichier, texte, f => f(texte));
  }
  for (const fichier of lister(RACINE, ['.html'])) {
    const texte = fs.readFileSync(fichier, 'utf8');
    if (!RE_STYLE.test(texte)) continue;
    RE_STYLE.lastIndex = 0;
    traiter(fichier, texte, f => texte.replace(RE_STYLE, (_, a, css, b) => a + f(css) + b));
  }

  lignes.sort((a, b) => b[2] - a[2]);
  for (const [nom, c, octets] of lignes) {
    console.log(`${String(c.reglesMortes).padStart(5)} règles  ${String(c.selecteursMorts).padStart(5)} sélecteurs  ${String(Math.round(octets / 1024)).padStart(4)} ko  ${nom}`);
  }
  console.log(`\n${total.regles} règles lues. Mortes : ${total.reglesMortes} règles entières (${total.declarations} déclarations), `
    + `${total.selecteursMorts} sélecteurs dans des listes, ${total.blocs} blocs @ vidés. ${total.noms.size} noms introuvables hors du CSS.`);
  if (detail) console.log([...total.noms].sort().join('\n'));
  console.log(corriger ? 'Fichiers réécrits. Relever une empreinte et la comparer.' : 'Rien modifié (--corriger pour retirer, --noms pour la liste).');
}

main();
