# ILYOS — instructions communes

Jeu de plateau 3D web, JavaScript classique + Three.js r128 et KayKit.
Budget outils/assets supplémentaires : **0 €**. Priorités : jeu web existant,
qualité visuelle, itérations courtes. Communiquer en français.

## Portée : maintenance V1 vs conception V2

Les consignes techniques de ce fichier — notamment préserver le site statique,
Three.js r128, le bundle et l'architecture existante — concernent **la maintenance
d'ILYOS V1**.

Pour un travail explicitement consacré à **ILYOS V2 / reconstruction V2**, commencer
par `docs/v2-context/START_HERE.md`. Les choix de moteur, langage, architecture,
plateformes et règles y sont volontairement ouverts : les contraintes techniques
V1 de ce fichier ne doivent pas être interprétées comme des contraintes V2.

Les règles générales de prudence restent utiles dans tous les cas : préserver les
changements présents, vérifier ce qui est réellement modifié, documenter les
preuves et ne pas annoncer une validation non exécutée.

## Se repérer sans charger tout le dépôt

- Lire `git status --short` avant de modifier ; préserver les changements présents.
- Chercher avec `rg` dans le sous-système concerné. Ne pas lire d'emblée
  `js/game.js`, `vendor/`, les images, ni toute `BASELINE-IA.md`.
- `js/game/*.js` : fragments sources partageant une fermeture ; ordre dans
  `scripts/build-game.js`. **Ne jamais éditer `js/game.js` directement.**
- Rendu/caméra/assets : `js/game/kaykit3d.js`. Règles : `core.js`,
  `rules-core.js`, `card-rules-physical-reserve.js`, `turns.js`.
- IA : `ai.js`, `planner.js`, `autopsie.js`. UI : `ui.js`, `css/`, `index.html`.
- Menu : `menu/`. Tutoriel : `tutorial.js`, `tutorial-discovery.js`.
- API/harnais : `diagnostics.js`, tests dans `tests/` et `scripts/verif-*.js`.
- Consulter `js/game/README.md` pour les conventions du sous-système ; vérifier
  les notes historiques contre le code présent. `docs/ENVIRONNEMENT.md` pour l'outillage.

## Travailler

- `npm run dev` construit puis surveille les fragments ; serveur port 8123.
  Recharger le navigateur après sauvegarde. `npm start` sert sans reconstruire.
- Après une modification de fragment : `npm run build`, puis `npm run check`.
  Livrer aussi le bundle généré. Ne pas charger les fragments séparément dans HTML.
- Préserver le site statique, les scripts classiques et la compatibilité Three.js
  r128 ; pas de migration de moteur, de framework ou de dépendances opportuniste.
- Avant de corriger le visuel, identifier le script/style réellement actif.
  Modifier le système existant ; éviter une nouvelle couche de correctifs CSS.
- Assets remplacés à URL identique : vérifier le cache dans `sw.js`. Documenter
  provenance/licence dans `docs/ASSETS.md` ; ne pas écraser un original sans copie.
- Une tâche précise à la fois. Ne pas lancer plusieurs assistants sur les mêmes
  fichiers. N'ajouter des plugins ou serveurs MCP que pour un besoin concret.

## Vérifier proportionnellement

Une vérification doit pouvoir échouer à cause du changement. Sinon elle coûte
du temps sans rien apprendre : ne pas la lancer.

| Ce qui change | À lancer | Pas la peine |
|---|---|---|
| Texte, style, visuel, menu sans logique | `npm run build` + `npm run check`, une capture du rendu | bancs, smoke local, self-play |
| UI avec logique, caméra, tutoriel | idem + la spec Playwright concernée (`npx playwright test tests/<spec>`) | bancs de l'IA, self-play |
| Règle du jeu | idem + les bancs du sujet (`npm run verif:ia -- <mots>`) + `npm run verif:moteur` | self-play |
| IA (planner, évaluation, budgets) | `npm run verif:ia` complet une fois, avant de livrer ; self-play seulement pour affirmer « plus fort » | smoke local |
| Outils, docs, bancs | `npm run check` | tout le reste |

- `npm run check` (quelques secondes, sans serveur) : bundle fidèle aux
  fragments, syntaxe, et chargement du jeu sans écran (`scripts/check-moteur.js` ;
  s'il échoue, le Worker du CPU Expert ne démarrerait pas).
- La CI rejoue `check` et le smoke sur chaque PR : inutile de relancer le smoke
  complet en local avant de pousser, sauf pour reproduire un échec.
- Un banc rouge sur `main` se répare ou se retire tout de suite. Ne jamais
  livrer « rouge aussi sur main » deux fois de suite : c'est du temps perdu à
  chaque PR suivante.
- Un banc juge un résultat (une couronne prise, un état identique), pas une
  tactique précise ni une vitesse de machine.
- Plusieurs PR prêtes en même temps : les regrouper en un lot (une seule passe
  de CI) plutôt que les remettre à jour une par une.
- Ne plus toucher au `?v=` de `js/game.js` dans `index.html` : il reste à
  `dev` dans le dépôt, et la mise en ligne (`.github/workflows/pages.yml`,
  `scripts/estampiller.js`) le remplace par l'empreinte du bundle publié.
- Toute action de joueur ajoutée ou modifiée (`ui.js`) doit exister dans le
  planner et dans `scripts/verif-couverture-regles.js`. Un banc ne recopie
  jamais une règle : il interroge le moteur (ex. `ILYOS_BENCH.actionGratuite`).
- `npm run doctor` : diagnostic de la machine. `npm test` comprend une partie
  Expert longue : seulement sur demande.
- Ne pas assouplir une assertion pour masquer un échec.
- CSS de cascade : empreintes avant/après selon `tests/README.md`.
- Résumer résultat, contrôles réellement exécutés et limites observées. Ne pas
  annoncer une installation, connexion, publication ou validation non vérifiée.
