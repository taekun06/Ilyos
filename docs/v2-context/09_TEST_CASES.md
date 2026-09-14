# 09 — Scénarios de référence V1

Ces scénarios sont des **golden cases de comparaison**, pas des règles immuables de V2. Si V2 modifie volontairement une règle, mettre à jour l'attendu V2 en expliquant pourquoi.

Le meilleur oracle reste le code/test V1 de la baseline identifiée dans `05_REFERENCE_BUILD.md`.

## A. Déplacement orthogonal

Position : un Gardien possède du terrain libre orthogonal adjacent et au moins 1 `MOVE`.

Attendu V1 : il peut atteindre cette case pour un coût de 1 `MOVE`.

Preuve existante : scénarios de `diagnostics.js` / calcul de portée dans `core.js`.

## B. Déplacement diagonal

Position : diagonale autorisée par le terrain, 2 `MOVE` disponibles.

Attendu V1 : la diagonale coûte **2** et non 1.

Le dépôt contient explicitement un scénario déterministe `MOVE diagonal (coût 2)`.

## C. Ramassage de Couronne

Position : un Gardien arrive sur une Couronne libre.

Attendu V1 : si le Gardien ne porte pas déjà une Couronne, la Couronne devient portée par ce Gardien. Le coût est celui de l'action qui l'a amené sur la case, pas un coût supplémentaire de ramassage.

## D. Transmission / dépôt

Position : porteur et allié dans une configuration autorisée par la règle courante.

Attendu V1 : certaines interactions de Couronne (transmission/dépôt/ramassage selon le chemin) sont gratuites et ne doivent pas consommer artificiellement une décision payante dans le planner.

Important : vérifier le chemin exact dans `ui.js`/règles de la ref testée ; #109/#111 ajoutent encore des variantes non présentes dans la baseline.

## E. Validation d'une Couronne

Position : Gardien allié porteur sur une case de validation de son village.

Attendu V1 : validation au début du tour du joueur si la zone n'est pas bloquée par l'adversaire.

Contre-cas : une Couronne seule au sol sur la case ne marque pas.

Contre-cas : un adversaire remplissant la condition de blocage empêche la validation.

## F. Victoire

Attendu V1 : après la troisième Couronne marquée, `state.winner` devient l'identifiant du joueur.

## G. Poussée d'un Gardien

Position : pousseur adjacent orthogonalement à une ligne contiguë, avec une force `PUSH` choisie.

Attendu V1 actuel : **il n'existe plus de force minimale liée au nombre de pièces poussées**. Tout le bloc collé au pousseur se déplace du nombre de cases correspondant à la force dépensée. Un obstacle séparé du bloc par un trou l'arrête juste avant lui.

Cas critique : si un Gardien entre dans le vide ou sort du plateau, il chute et est retiré du jeu.

Preuve dédiée : `scripts/verif-poussee.js`.

## H. Chute d'un porteur

Position : Gardien porteur poussé jusqu'à la chute.

Attendu V1 : le Gardien disparaît ; sa Couronne est conservée/lâchée sur la dernière case valide prévue par les règles, pas détruite avec lui.

## I. Poussée d'une Couronne libre

Position : Couronne libre adjacente à un pousseur.

Attendu V1 : la Couronne peut être poussée ; contrairement à un Gardien, elle n'est pas éliminée par le vide. Elle survole le vide et se pose sur sa case d'arrivée, ou à défaut sur la dernière case d'île libre franchie selon la règle actuelle.

La campagne contient des niveaux construits autour du voyage autonome d'une Couronne : utiles comme oracle complémentaire.

## J. Rotation magique

Position : île sélectionnable, pivot/rotation valides, 1 `MAGIC`.

Attendu V1 : une seule ressource `MAGIC` permet la rotation choisie ; les cellules de l'île sont transformées et les Gardiens/Couronnes transportés avec l'île sont déplacés de façon cohérente.

## K. Pose d'île + apparition

Position : forme encore disponible, placement légal, plafond de Gardiens non atteint.

Attendu V1 : la pose crée l'île et peut créer immédiatement un Gardien sur une case libre de celle-ci. Le moteur possède un choix automatique historique et permet aussi une case de spawn explicite dans son noyau.

Ce cas est important pour l'IA : une pose n'est pas seulement « ajouter du terrain », elle peut aussi ajouter une pièce jouable.

## L. Réserve physique

Début : main contenant des cartes inutilisées en fin de tour.

Attendu V1 : les cartes rangeables vont physiquement en réserve jusqu'au plafond **5 par type** ; le surplus va à la défausse. Jouer une carte de réserve la déplace vers la défausse.

Preuve : `card-rules-physical-reserve.js` + `scripts/verif-reserve.js`.

## M. Undo intra-tour

Après plusieurs actions réussies du même tour : chaque action doit pouvoir correspondre à un snapshot restaurable, jusqu'au plafond actuel de l'historique. Un changement de tour vide la pile.

À la baseline, vérifier les actions effectivement couvertes. La PR #110 travaille encore sur la pose d'île et l'invocation.

## N. État stratégique déterministe

À seed et position identiques, deux simulations de règle/IA doivent pouvoir être comparées sans dépendre du timing d'animation. L'ordre secret de la pioche ne doit pas être exposé au planner via l'état canonique.

## O. Campagne

Les **22 Sanctuaires** et leurs solutions de référence constituent un corpus plus large. Ne pas exiger que V2 reproduise leurs solutions à l'identique si les règles changent ; utiliser plutôt chaque niveau comme question tactique :
- quelle mécanique cherche-t-il à isoler ?
- V2 possède-t-elle encore cette mécanique ?
- si oui, le niveau ou un équivalent reste-t-il intéressant ?

## P. Manette

Golden properties V1 utiles :
- le curseur suit la direction **visuelle** après rotation de caméra ;
- les cibles sont dérivées des options légales publiées par le moteur ;
- le focus menu survit aux reconstructions de l'UI ;
- durant le tour IA, la navigation gameplay n'agit pas sur des cibles périmées ; la caméra reste consultable.

Les sensations (deadzone, répétition, seuil d'appui long, vitesse caméra) exigent encore une validation sur matériel réel.

## Comment utiliser ces cas en V2

Au début de V2, convertir seulement les scénarios pertinents en tests du nouveau système. Leur rôle est de donner à Astra une **preuve compacte de comportements appris** et d'éviter de relire tout V1 pour chaque refonte.
