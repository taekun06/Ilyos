# ILYOS V2 — START HERE

Ce dossier est un **pack de contexte**, pas une spécification d'implémentation.

Son but est d'éviter à un agent de développement de redécouvrir l'histoire, les règles et les pièges d'ILYOS V1, tout en lui laissant la responsabilité de concevoir ILYOS V2.

## Principe d'autonomie

Les documents décrivent l'état actuel d'ILYOS et les enseignements tirés de son développement. **Ils n'imposent ni moteur, ni langage, ni architecture, ni renderer, ni framework, ni organisation du code.**

Pour V2, tu peux conserver, modifier ou abandonner n'importe quel élément de V1 lorsqu'une autre solution sert mieux le produit. Ne réutilise pas une décision de V1 par inertie. Inversement, n'effectue pas de changement gratuit : exploite d'abord les apprentissages et les preuves déjà disponibles.

Quand une décision importante est ouverte :
1. établis le problème à résoudre ;
2. compare les options pertinentes ;
3. recommande celle que tu choisirais ;
4. explicite les principaux coûts/risques ;
5. construis une preuve ou un prototype lorsque l'incertitude le justifie.

Le propriétaire du projet reste directeur du jeu ; l'agent est invité à agir comme un **lead developer / technical game designer autonome**, y compris à contester une solution proposée si une meilleure option existe.

## Lecture progressive — économiser le contexte

Ne lis pas tout le dépôt par défaut.

Commence par :
- `00_GOAL.md`
- `01_GAME_CURRENT.md`
- `10_OPEN_DECISIONS.md`

Puis ouvre uniquement le document utile à la tâche :
- expérience réussie → `02_WHAT_WORKS.md`
- dettes / limites → `03_PROBLEMS.md`
- pourquoi V1 a évolué ainsi → `04_DESIGN_HISTORY.md`
- lancer / observer V1 → `05_REFERENCE_BUILD.md`
- trouver le code V1 utile → `06_REPO_MAP.md`
- IA actuelle → `07_AI_CURRENT.md`
- ressources visuelles/sonores → `08_ASSETS.md`
- comportements de référence → `09_TEST_CASES.md`

Ensuite seulement, lis les fichiers V1 pointés par ces documents.

## Statut des informations

Le pack distingue quatre catégories :

- **Vérifié V1** : observé dans `main` ou dans des tests/docs du dépôt.
- **Enseignement** : conclusion utile issue du développement ou du playtest.
- **À valider** : information incomplète, subjective ou susceptible d'avoir changé.
- **Décision V2 ouverte** : aucune solution n'est imposée.

Baseline auditée pour la première version de ce pack : `main` au commit `1476a7b7977874e499b173e08c146991786354b5` (fusion de la PR #108). Les PR #109 à #112 étaient encore ouvertes lors de l'audit ; elles constituent des travaux V1 en cours, pas une vérité déjà présente sur `main`.

## Objectif de ce pack

Une bonne utilisation du pack doit permettre de répondre rapidement à trois questions :

- **Qu'est-ce qu'ILYOS essaie de faire vivre au joueur ?**
- **Qu'avons-nous déjà appris en construisant V1 ?**
- **Qu'est-ce qui reste libre pour concevoir une V2 meilleure ?**

V1 est une source de preuves, de règles, de scénarios et d'enseignements. **Ce n'est pas le squelette obligatoire de V2.**
