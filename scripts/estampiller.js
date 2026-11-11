/* Version de js/game.js posée À LA MISE EN LIGNE, plus à la main.

     node scripts/estampiller.js [dossier]      (défaut : le dépôt)

   index.html charge `js/game.js?v=dev`, et cette ligne ne change plus jamais
   dans le dépôt. Avant, chaque PR y écrivait sa propre version : toutes les PR
   ouvertes entraient en conflit dès qu'une seule était fusionnée, et un oubli
   laissait les joueurs sur l'ancien jeu (03/11).

   Ici, `dev` est remplacé par l'empreinte du bundle réellement publié : la
   version change si et seulement si le jeu change. Lancé par
   .github/workflows/pages.yml ; ne pas committer son résultat. */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const dossier = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const page = path.join(dossier, 'index.html');
const bundle = path.join(dossier, 'js', 'game.js');

const empreinte = crypto.createHash('sha256').update(fs.readFileSync(bundle)).digest('hex').slice(0, 12);
const avant = fs.readFileSync(page, 'utf8');
const motif = /(js\/game\.js\?v=)[^"'\s>]+/g;
const occurrences = (avant.match(motif) || []).length;
if (occurrences !== 1) {
  console.error(`estampiller : ${occurrences} référence(s) à js/game.js?v= dans index.html, une seule attendue.`);
  process.exit(1);
}
fs.writeFileSync(page, avant.replace(motif, `$1${empreinte}`));
console.log(`estampiller : js/game.js?v=${empreinte}`);
