# 06 — Carte compacte du dépôt V1

But : trouver rapidement la preuve utile sans charger tout le dépôt dans le contexte.

## Entrées générales

| Chemin | Rôle |
|---|---|
| `README.md` | démarrage local et commandes utiles |
| `AGENTS.md` | conventions de travail V1 et où chercher |
| `package.json` | scripts Node/Playwright ; le jeu lui-même reste statique |
| `index.html` | page principale + une partie importante de l'historique UI/CSS |
| `menu/` | menu principal, configuration des modes, iframe et navigation manette du menu |
| `docs/ENVIRONNEMENT.md` | environnement/outillage V1 |
| `docs/ASSETS.md` | inventaire, provenance et licences connues |
| `BASELINE-IA.md` | historique/baseline IA ; volumineux, ne pas lire par défaut |

## Le bundle principal

`js/game.js` est généré. **Ne pas l'utiliser comme source primaire.**

Ordre V1 actuel des 17 fragments (`scripts/build-game.js`) :

1. `js/game/bootstrap.js` — constantes, DOM, état partagé, hasard déterministe, tailles de plateau.
2. `js/game/kaykit3d.js` — scène Three.js/KayKit, caméra, environnement, interactions 3D.
3. `js/game/core.js` — règles historiques, setup, persistance, online, helpers de gameplay.
4. `js/game/ai.js` — IA historique, évaluation/actions et orchestration de l'Expert.
5. `js/game/turns.js` — cycle de tour, score au début du tour, undo/snapshots.
6. `js/game/audio.js` — audio et musique intégrés au bundle.
7. `js/game/ui.js` — rendu du plateau/HUD et interactions joueur.
8. `js/game/card-rules-physical-reserve.js` — cycle réel main/réserve/défausse/pioche.
9. `js/game/rules-core.js` — noyaux synchrones utilisés par jeu réel et simulation.
10. `js/game/planner.js` — planner Expert.
11. `js/game/autopsie.js` — explication/journal des décisions IA.
12. `js/game/tutorial.js` — moteur/scénario historique La Première Ascension.
13. `js/game/tutorial-discovery.js` — tutoriel/découverte plus récente.
14. `js/game/puzzle.js` — moteur de campagne/puzzles.
15. `js/game/puzzle-levels.js` — données des Sanctuaires.
16. `js/game/gamepad.js` — couche manette dans le jeu.
17. `js/game/diagnostics.js` — API de diagnostic, benchs et wiring de fin de bundle.

Tous ces fragments partagent la même fermeture : ils ne sont pas des modules autonomes.

## Chercher une règle

Commencer par :

```text
js/game/rules-core.js
js/game/core.js
js/game/card-rules-physical-reserve.js
js/game/turns.js
```

La logique V1 n'est pas encore intégralement migrée dans `rules-core.js` ; vérifier les appels et pas seulement le nom du fichier.

## Chercher l'IA

```text
js/game/ai.js
js/game/planner.js
js/game/autopsie.js
js/game/diagnostics.js
BASELINE-IA.md          # seulement si l'historique est réellement nécessaire
scripts/verif-*.js
```

`ai.js` garde les comportements historiques et appelle le planner lorsque `globalPlanning` est actif. Le planner doit pouvoir échouer sans bloquer le jeu : un repli historique existe.

## Chercher campagne / tutoriel

```text
js/game/tutorial.js
js/game/tutorial-discovery.js
js/game/puzzle.js
js/game/puzzle-levels.js
tests/puzzles.spec.js
```

Les PR #93 à #102 contiennent beaucoup de contexte de conception sur Les Voies d'Ilyos et les transitions.

## Chercher input/manette

```text
js/game/gamepad.js
js/gamepad-navigation.js
menu/gamepad.js
menu/frame.js
menu/menu-config.js
tests/manette.spec.js
```

PR utiles : #104, #107, #108. À la baseline du pack, #110 contient des travaux manette/undo encore ouverts.

## Chercher rendu / caméra / environnement

```text
js/game/kaykit3d.js
js/version-bootstrap.js
css/
index.html
assets/sky/
```

PR utiles pour les propriétaires de caméra et transitions : #94, #96, #98, #100, #101, #102.

## Chercher audio

```text
js/game/audio.js
js/puzzle-music-v1.js
assets/audio/
```

PR utiles : #95 et #97.

## Chercher tests/outillage

```text
tests/
scripts/verif-*.js
scripts/build-game.js
scripts/check-syntax.js
scripts/doctor.js
scripts/audit-assets.js
scripts/empreinte-css.js
```

`tests/README.md` documente les empreintes/tests visuels existants.

## Règle de lecture pour Astra

Avant une exploration large :

1. lire le document du context pack correspondant ;
2. chercher le symbole/règle exact avec une recherche de code ;
3. ouvrir seulement les quelques fichiers qui portent cette règle ;
4. élargir ensuite si le flux d'appel le nécessite.

Le coût à éviter est de relire `js/game.js`, tout `assets/`, tout `css/` ou toute l'histoire IA pour une question locale.
