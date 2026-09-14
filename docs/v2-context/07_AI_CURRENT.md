# 07 — IA V1 : état actuel et enseignements

Ce document décrit le cerveau V1 pour éviter de le redécouvrir. **V2 n'est pas tenue de conserver cette architecture.**

## Architecture générale

**Vérifié V1 :**

- `ai.js` contient l'IA historique, ses heuristiques et l'orchestration du tour CPU ;
- le niveau Expert active notamment `globalPlanning: true` ;
- `planner.js` construit/recherche des séquences d'actions sur un état simulé ;
- `rules-core.js` fournit des noyaux de règles appelables par le vrai jeu et la simulation ;
- `autopsie.js` rend les décisions lisibles en termes de jeu ;
- `diagnostics.js` expose des positions déterministes et des outils de bench ;
- si le planner lève une exception, `ai.js` peut revenir à la logique historique plutôt que bloquer la partie.

## Propriété importante : simulation avec les vraies règles

Le mode `withSimulatedState` travaille sur un clone de l'état et coupe rendu, sons, animations et effets. L'objectif de la refonte V1 était d'éviter une seconde implémentation des règles réservée à l'IA.

`canonicalStrategicState()` retire les informations de présentation et, notamment, **ne révèle pas l'ordre caché de la pioche** au planner. `strategicStateFingerprint()` permet la comparaison/déduplication d'états.

Le hasard influençant le gameplay peut être seedé pour rejouer une position à l'identique.

## Nature de la recherche

Le planner V1 :
- génère des transitions légales ;
- explore des séquences avec budgets bornés ;
- distingue les décisions payantes de certaines actions gratuites ;
- évalue les états/plans avec un ensemble de poids stratégiques ;
- peut rechercher des ripostes adverses ;
- possède un approfondissement ciblé pour certains finalistes critiques ;
- déduplique des états via fingerprint ;
- sélectionne un nombre borné de candidats pour contenir le coût.

Les détails exacts de beam, profondeurs, plafonds et poids changent régulièrement : lire `planner.js` de la ref réellement testée plutôt que les figer dans ce document.

## Types d'idées déjà modélisées

Selon `main` et les PR récentes, le travail IA couvre notamment :
- atteindre/valider une Couronne ;
- ramassage et transmission ;
- déplacement orthogonal/diagonal avec vrais coûts ;
- poussée, chute et exposition ;
- rotation d'île ;
- pose d'île et apparition d'un Gardien ;
- défense d'une zone de validation ;
- conservation des ressources/réserve ;
- anticipation d'une réponse adverse ;
- comparaison de positions finales plutôt que simple score du prochain coup.

## Travaux V1 récents au moment du pack

Baseline `main` = PR #108 fusionnée.

Travaux encore ouverts :
- **#109** : priorités défensives contre validation adverse, placement de spawn moins exposé, relais gratuits ;
- **#111** : dépôt gratuit + transport de Couronne par rotation magique ;
- **#112** : poses tactiques permettant action immédiate/poussée/connexion ; dépend de #111.

#110 concerne surtout manette/undo, pas le planner.

Ces PR montrent des capacités envisagées mais ne font pas partie de la baseline tant qu'elles ne sont pas fusionnées.

## Limite produit actuelle

**Observation du propriétaire : l'Expert est encore trop facile à battre en vraie partie.**

Ne déduire ni de l'existence du planner ni des bancs ciblés que l'objectif « adversaire Expert fort » est atteint.

## Diagnostic utile avant toute amélioration

Quand l'IA rate un coup, classifier le défaut avant de modifier les poids :

1. la règle/l'action n'existe pas dans le simulateur ;
2. l'action légale n'est pas générée ;
3. elle est générée mais coupée par la présélection ;
4. elle survit mais reçoit une mauvaise évaluation ;
5. elle est bonne à court terme mais la recherche ne voit pas assez loin ;
6. la riposte adverse est mal modélisée ;
7. le bon plan existe mais dépasse le budget ;
8. l'exécution réelle diverge de la simulation.

Cette classification a déjà évité plusieurs réglages de poids inutiles en V1.

## Corpus à réutiliser

Avant de jeter toute l'IA V1, récupérer au minimum :
- les positions déterministes de `diagnostics.js` ;
- les `scripts/verif-*.js` pertinents ;
- les puzzles qui isolent une mécanique ;
- les échecs documentés dans `BASELINE-IA.md` ;
- les scénarios des PR #103, #109, #111 et #112 ;
- les fingerprints/états canoniques ou leur équivalent conceptuel.

Ils peuvent servir de **benchmark V2**, même si V2 utilise une IA totalement différente.

## Décisions V2 explicitement ouvertes

Ne pas imposer :
- minimax / MCTS / beam search / utility AI / planification symbolique / apprentissage ;
- profondeur de recherche ;
- représentation de l'état ;
- langage ou moteur ;
- exécution locale ou service séparé ;
- poids heuristiques V1 ;
- architecture `ai.js` + `planner.js`.

La seule exigence de produit actuellement claire est : **un niveau Expert doit être intéressant et difficile pour un bon joueur, avec un coût compatible avec les plateformes finalement choisies.**
