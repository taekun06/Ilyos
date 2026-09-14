# 01 — ILYOS V1 aujourd'hui

Cette page décrit **le comportement et les systèmes observables de la V1 auditée**, pas les règles obligatoires de V2.

Baseline : `main` @ `1476a7b7977874e499b173e08c146991786354b5`.

## Forme générale

**Vérifié V1 :** ILYOS est un jeu de plateau 3D dans le navigateur, site statique en JavaScript classique avec Three.js r128 et des assets KayKit. Le menu expose Solo contre CPU, duel local à 2, 2 contre 2 et jeu en ligne. La campagne solo de puzzles est présentée comme **Les Voies d'Ilyos**.

## Plateau et terrain

- tailles actuellement proposées : **11×11 et 13×13** ;
- taille impaire requise par la logique actuelle du sanctuaire/case centrale ;
- le terrain est constitué de villages et d'îles posées sur la grille ;
- plusieurs formes d'île existent (`domino`, `line3`, `l3`, `square`, `t4`, `s4`, `cross5`, `crossHollow`, `v3`) ;
- le stock de formes et certaines limites de placement sont configurables selon le mode ;
- poser une île peut faire apparaître immédiatement un Gardien sur cette île.

## Gardiens

- les Gardiens occupent des cases ;
- plafond V1 actuel : **6 Gardiens par joueur** ;
- ils peuvent se déplacer, pousser, porter/transmettre/déposer une Couronne et être transportés par la rotation d'une île ;
- un Gardien poussé dans le vide ou hors plateau chute et quitte le jeu ; sa Couronne est lâchée sur la dernière case valide.

## Ressources d'action

Paquet V1 d'un joueur : **13 cartes** :
- 8 `MOVE` ;
- 4 `PUSH` ;
- 1 `MAGIC`.

Début de tour : pioche de 5 cartes.

Les cartes inutilisées peuvent aller dans une réserve physique, avec un plafond actuel de **5 cartes par type** (`MOVE`, `PUSH`, `MAGIC`). Une carte jouée passe à la défausse. La défausse reconstitue la pioche lorsque nécessaire.

## Déplacement

- orthogonal : coût 1 `MOVE` par case ;
- diagonal : coût 2 ;
- le moteur calcule les cases atteignables et les coûts ;
- les chemins de règles servent aussi à la simulation stratégique de l'IA.

## Poussée

- le pousseur vise une cible adjacente orthogonalement ;
- la poussée peut agir sur un Gardien ou une Couronne libre ;
- une force est choisie/consommée en cartes `PUSH` ;
- le moteur calcule la ligne, la force minimale, la destination et une éventuelle chute ;
- **différence importante** : un Gardien peut chuter, mais une Couronne libre ne disparaît pas dans le vide ; la logique V1 la fait voyager jusqu'à sa dernière destination autorisée selon les règles de poussée.

Pour toute reconstruction exacte de la poussée, lire le noyau actuel plutôt que cette synthèse (`rules-core.js`, fonctions de poussée appelées par ce noyau).

## Magie

Une carte `MAGIC` permet la rotation d'une île. Le système V1 prend en charge les rotations autour d'un pivot et transporte avec l'île les Gardiens et Couronnes concernés. Les angles proposés à l'interface sont 90°, 180°, 270° ou 360°.

## Couronnes et victoire

- V1 gère deux objets Couronne (`artifact`, `secondArtifact`), dont l'entrée en jeu dépend de l'état de la partie ;
- ramassage, dépôt et transmission font partie du système de jeu ; plusieurs de ces interactions sont gratuites ;
- pour marquer, un Gardien doit **porter** une Couronne sur une case de validation de son village ; une Couronne simplement posée au sol ne marque pas ;
- un adversaire placé dans la zone de validation peut bloquer la validation selon la règle actuelle ;
- la validation est évaluée au début du tour du joueur ;
- **3 Couronnes marquées = victoire** dans la règle V1 actuelle ;
- le plateau plein possède également une règle de fin de partie.

## Tour et annulation

- la partie suit un cycle de tours avec main, réserve et pose de terrain ;
- la pose d'île est structurante et peut être obligatoire selon les règles/limites du mode ;
- V1 possède une pile d'annulation intra-tour, plafonnée actuellement à 20 instantanés ;
- l'historique est réinitialisé au changement de tour.

## Contrôles et présentation

V1 possède :
- interaction souris/clavier ;
- navigation manette avec curseur spatial et cibles publiées par le moteur ;
- caméra orbitale/zoom ;
- rendu 3D des îles, villages, Gardiens, Couronnes, ciel et effets ;
- HUD de duel et variante de présentation pour la campagne ;
- audio, musique et cinématiques de transition.

## Campagne / puzzles

**Vérifié V1 :** le dépôt contient **22 Sanctuaires** avec définitions, solutions de référence et tests. La campagne utilise les mécaniques du jeu pour enseigner ou isoler des idées tactiques : déplacement, diagonale, poussée, transmission, dépôt, transport de Couronne, magie, etc.

Certains barèmes ont été prouvés par recherche exhaustive ; d'autres scénarios multi-tours ne sont pas entièrement prouvés. Ne transformer ni un par ni une solution V1 en contrainte V2 sans vérifier son statut.

## Important pour V2

Cette page répond à « comment fonctionne V1 ? ». Elle ne répond pas à « comment V2 doit fonctionner ? ». Toute règle ci-dessus peut être réévaluée si un prototype V2 démontre une solution meilleure.
