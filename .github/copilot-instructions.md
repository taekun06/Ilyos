# ILYOS

Lire `AGENTS.md` à la racine pour les conventions communes. Répondre en français.
Jeu web statique JavaScript, Three.js r128, KayKit. Budget supplémentaire : 0 €.
Modifier les sources `js/game/*.js`, jamais le bundle `js/game.js` directement.
Reconstruire avec `npm run build`, contrôler avec `npm run check`.
Pour UI/caméra/tutoriel, lancer `npm run test:smoke` ; les tests complets sont longs.
Préserver les changements locaux et les règles du jeu. Éviter les migrations,
les couches CSS supplémentaires et les dépendances sans besoin démontré.
Chercher dans les sources ciblées plutôt que lire le bundle, les assets et vendor.
Documenter la provenance des nouveaux assets dans `docs/ASSETS.md`.
