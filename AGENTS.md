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

- `npm run doctor` : diagnostic de la machine, sans installer ni appeler d'IA.
- `npm run check` : cohérence bundle + syntaxe des scripts autonomes.
- UI/menu/caméra/tutoriel : `npm run test:smoke` (Chromium, serveur port 8124).
  Vérifier aussi le rendu visible pour une modification graphique.
- Règles/IA : banc `scripts/verif-*.js` pertinent, serveur `npm start` port 8123,
  puis tests plus larges si nécessaire. Lire le banc avant de choisir sa commande.
- `npm test` comprend une partie Expert longue ; pas à chaque changement de texte.
  Ne pas assouplir les assertions ou délais pour masquer un échec.
- CSS de cascade : empreintes avant/après selon `tests/README.md`.
- Résumer résultat, contrôles réellement exécutés et limites observées. Ne pas
  annoncer une installation, connexion, publication ou validation non vérifiée.
