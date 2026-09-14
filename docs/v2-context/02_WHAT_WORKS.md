# 02 — Ce qui mérite d'être emporté de V1

Ce fichier ne dit pas « recopier ces solutions ». Il recense des **idées, comportements et méthodes qui ont produit de la valeur** dans V1.

## 1. Le noyau spatial d'ILYOS

**Enseignement :** la combinaison terrain + Gardiens + Couronnes + poussée + rotation crée des interactions qui se renforcent mutuellement.

La position n'est pas seulement une distance vers un objectif :
- le terrain peut être créé ;
- une île peut être transformée ;
- un Gardien peut servir de porteur, bloqueur, pousseur ou relais ;
- une Couronne peut changer de porteur ou être déplacée sans Gardien ;
- l'espace vide est une menace parce qu'un Gardien peut chuter.

Cette interdépendance est une partie forte de l'identité du jeu, même si les règles exactes sont ouvertes pour V2.

## 2. Une règle autoritaire séparée de la mise en scène

**Vérifié V1 :** `rules-core.js` a commencé à extraire les mutations de gameplay hors des animations, sons, DOM et temporisations. Le jeu réel et le planner peuvent alors appeler les mêmes noyaux synchrones.

**Enseignement :** éviter deux versions d'une même règle — une pour le joueur et une pour l'IA — a supprimé une classe de divergences et rendu les scénarios déterministes plus fiables.

V2 n'a pas à reprendre cette implémentation, mais la propriété recherchée est précieuse : **une seule vérité de règle testable sans dépendre du rendu**.

## 3. Déterminisme stratégique et états reproductibles

**Vérifié V1 :** V1 dispose d'un générateur aléatoire testable, d'un état stratégique canonique, de fingerprints et d'un mode simulation. Des positions peuvent être rejouées avec une graine fixe.

**Enseignement :** pour développer une IA forte ou comparer deux versions, une position doit être reproductible. C'est beaucoup plus rentable que de déboguer des parties aléatoires à l'œil.

## 4. Les puzzles comme laboratoire de règles

**Vérifié V1 :** 22 Sanctuaires utilisent les mécaniques du jeu et disposent de solutions de référence/tests.

**Enseignement :** ces niveaux servent à la fois de campagne, de tutoriel implicite et de corpus de positions. Ils sont potentiellement plus précieux pour V2 comme **batterie de comportements et de problèmes tactiques** que comme niveaux à recopier à l'identique.

## 5. Montrer les possibilités décidées par le moteur

**Vérifié V1 :** la navigation manette lit autant que possible les cibles déjà publiées par le jeu (`reachable`, `spawn-choice`, `crown-claimable`, destinations de poussée, etc.) au lieu de recalculer elle-même les règles.

**Enseignement :** rendu, souris, manette et tutoriel devraient consommer la même information d'intention/légalité plutôt que chacun inventer sa propre version.

## 6. Navigation spatiale à la manette

Les passes #104, #107 et #108 ont convergé vers une grammaire où le stick choisit ce qui est réellement dans la direction visuelle demandée et où le focus survit aux reconstructions du DOM.

**Enseignement :** pour un plateau dont la caméra peut tourner, une navigation basée uniquement sur l'ordre des éléments ou sur les axes logiques de la grille devient contre-intuitive. Le mapping doit suivre ce que le joueur voit.

## 7. Annulation intra-tour

V1 possède une vraie pile d'instantanés plutôt qu'un unique « undo ».

**Enseignement :** dans un jeu stratégique à nombreuses micro-actions, pouvoir explorer puis corriger son tour est confortable et facilite aussi le test. Le comportement exact de V2 reste ouvert.

## 8. Campagne sans coupure brutale

Les Voies d'Ilyos ont progressivement remplacé les changements d'écran secs par des mouvements de caméra et des voyages entre Sanctuaires. Les PR récentes montrent une intention constante : le monde doit sembler continu plutôt qu'une succession de tableaux techniques.

**Direction appréciée / à valider en V2 :** immersion par la continuité, mouvements de caméra, ciel, profondeur et transitions plutôt que par des écrans de chargement visibles.

## 9. Direction artistique céleste

Le projet converge vers : îles flottantes, architecture claire/dorée, roche violette/lavande, lumière chaude, grands horizons, nuages, cascades et effets magiques lisibles.

**Direction appréciée / à valider :** conserver l'identité fantasy céleste et la profondeur du monde, sans imposer les assets ni le pipeline V1.

## 10. Outillage proportionné

Le dépôt possède déjà plusieurs idées utiles :
- `npm run check` pour cohérence/syntaxe ;
- Playwright pour les parcours visibles ;
- bancs `scripts/verif-*.js` pour règles/IA ;
- audit d'assets ;
- empreinte de styles ;
- autopsie des décisions IA.

**Enseignement :** choisir le test le moins coûteux qui prouve réellement le changement. Ne pas lancer une suite lourde pour une retouche sans rapport, mais ne pas remplacer une validation requise par une simple relecture.

## À ne pas confondre avec une obligation

Une idée peut être bonne et son implémentation V1 mauvaise ou trop coûteuse. Pour V2, préserver **l'effet utile** plutôt que le mécanisme historique est généralement le meilleur point de départ.
