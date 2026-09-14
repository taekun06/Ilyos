# 05 — Construire et observer la référence V1

V1 doit servir de **référence observable**, pas de spécification implicite. Quand un comportement est ambigu dans les synthèses, reproduire d'abord le cas dans V1 ou lire son test.

## Baseline de ce pack

Commit `main` audité :

```text
1476a7b7977874e499b173e08c146991786354b5
```

Ce commit fusionne la PR #108. Les PR #109, #110, #111 et #112 étaient encore ouvertes au moment de l'audit et ne doivent pas être attribuées à cette baseline sans changer explicitement de ref.

## Lancer localement

Pré-requis documentés par le dépôt : Node 24 LTS, Git, dépendances npm et Chromium Playwright pour les tests.

```sh
npm ci
npm run test:install
npm run doctor
npm run dev
```

Puis ouvrir :

```text
http://localhost:8123
```

`npm run dev` reconstruit le bundle à partir de `js/game/*.js` et surveille les sources. Un simple rechargement du navigateur applique les changements.

## Contrôles rapides

```sh
npm run check
npm run test:smoke
npm run assets:audit
```

`npm test` exécute une suite plus large comprenant une partie Expert longue : ne pas l'utiliser machinalement pour chaque observation.

## Bundle

`js/game.js` est **généré**. Les sources sont les fragments `js/game/*.js`, ordonnés par `scripts/build-game.js`.

Pour vérifier/reconstruire :

```sh
npm run build
npm run build:check
```

Ne pas étudier `js/game.js` en premier pour comprendre un sous-système : lire le fragment source concerné.

## Version publiée

L'URL GitHub Pages historiquement utilisée pour jouer au projet est :

```text
https://taekun06.github.io/Ilyos/
```

**À vérifier avant toute comparaison de comportement :** une page publiée peut être décalée de `main`, et V1 a déjà rencontré des problèmes de cache lorsque l'URL d'un bundle restait identique après modification.

Pour une comparaison technique ou un test de non-régression, préférer un checkout identifié par commit.

## Observer plutôt que deviner

Avant d'importer une mécanique en V2 :

1. identifier le comportement à comparer ;
2. trouver un scénario V1 reproductible (test, puzzle, bench ou sauvegarde) ;
3. noter entrée → décision → état final ;
4. seulement ensuite comparer le prototype V2.

Le but n'est pas d'obtenir une équivalence pixel ou code par code. Le but est de savoir **ce qu'on améliore et ce qu'on risque de perdre**.
