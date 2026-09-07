# ILYOS

Jeu de plateau 3D dans le navigateur : îles flottantes, gardiens et couronnes.
Site statique en JavaScript, Three.js et KayKit. Node sert à l'outillage local.

## Commencer

Sur ce poste, Node, les dépendances et Chromium sont déjà présents.

```sh
npm run doctor
npm run dev
```

Sous Windows PowerShell, si `npm.ps1` est bloqué, utiliser `npm.cmd run dev`
(et `npm.cmd run doctor`). Aucun changement des règles de sécurité Windows
n'est nécessaire.

Ouvrir http://localhost:8123. Les modifications de `js/game/*.js` reconstruisent
automatiquement le jeu ; recharger la page pour les voir. Arrêt : `Ctrl+C`.
Un autre port est possible : `npm run dev -- 8130`.

Sur une nouvelle machine : installer Node 24 LTS et Git, puis `npm ci` et
`npm run test:install`. La version des dépendances vient de `package-lock.json`.

Dans VS Code : ouvrir ce dossier, puis `F5` pour lancer le jeu avec Edge.
Les commandes sont aussi disponibles dans **Terminal → Exécuter la tâche**.
La tâche de développement reste active après la fermeture du navigateur ;
l'arrêter via **Terminal → Terminer la tâche**.

## Commandes utiles

| Commande | Usage |
|---|---|
| `npm run dev` | Construire, surveiller les sources et servir le jeu |
| `npm start` | Servir uniquement, sans reconstruire |
| `npm run doctor` | Vérifier les prérequis locaux |
| `npm run check` | Contrôler le bundle et la syntaxe |
| `npm run test:smoke` | Caméra + découverte, limite de 2 min par test |
| `npm run test:ui` | Choisir et observer les tests dans Playwright |
| `npm test` | Suite complète, comprenant une longue partie IA |
| `npm run assets:audit` | Inventorier les fichiers et leur poids |

## Pour continuer

- [Environnement, abonnements IA et méthode de travail](docs/ENVIRONNEMENT.md)
- [Assets : sources, provenance et intégration](docs/ASSETS.md)
- [Instructions communes des assistants](AGENTS.md)
- [Architecture des fragments du jeu](js/game/README.md)
- [Tests et empreintes visuelles](tests/README.md)

`js/game.js` est généré : modifier les fragments, puis exécuter `npm run build`
avant de partager les changements. Aucune clé API n'est nécessaire au jeu local.
