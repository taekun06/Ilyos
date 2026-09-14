# 10 — Décisions V2 ouvertes

Ce fichier existe pour empêcher le context pack de devenir une spécification figée.

**Par défaut, une décision de V1 n'est pas une décision V2.**

## Technologie

Ouvert :
- moteur ou absence de moteur généraliste ;
- langage(s) ;
- architecture du projet ;
- ECS, objets/scènes, data-oriented ou autre ;
- moteur physique éventuel ;
- renderer / pipeline de rendu ;
- système UI ;
- pipeline assets ;
- audio ;
- réseau ;
- sauvegarde ;
- build/deploy ;
- tests et CI.

Ne pas choisir une technologie parce qu'elle ressemble à V1. Ne pas non plus changer de technologie pour le principe. Comparer selon les cibles, le jeu et la capacité d'agents IA à construire/tester efficacement.

## Plateformes et distribution

Ouvert : priorité relative entre :
- PC ;
- mobile ;
- Web ;
- stores ;
- éventuellement autres plateformes.

V1 est Web-first. **V2 n'est pas obligée de l'être.**

Le choix de plateforme peut modifier fortement les décisions de moteur, input, performance, taille d'assets, réseau et modèle de publication : le résoudre tôt lorsqu'il devient bloquant.

## Règles

Ouvert, même si V1 possède une réponse :
- taille(s) du plateau ;
- nombre maximum de Gardiens ;
- nombre de Couronnes ;
- objectif de victoire / score cible ;
- paquet de cartes et probabilités ;
- taille de main ;
- réserve et ses limites ;
- obligation de poser une île ;
- formes et stocks d'îles ;
- coûts de déplacement ;
- règle exacte des diagonales ;
- force et géométrie des poussées ;
- comportement d'une Couronne dans le vide ;
- fonctionnement de la magie ;
- dépôt/transmission/ramassage ;
- blocage de validation ;
- fin de partie plateau plein ;
- undo ;
- équipes / 2v2 ;
- ordre et structure des tours.

Les comportements V1 doivent servir de **baseline de comparaison**, pas d'interdiction de changer.

## IA

Ouvert :
- représentation de l'état ;
- planner ou autre paradigme ;
- recherche adverse ;
- déterminisme ;
- heuristiques ;
- apprentissage éventuel ;
- temps de calcul autorisé ;
- niveaux de difficulté ;
- où tourne l'IA ;
- comment elle est benchmarkée.

Contrainte produit actuelle : l'Expert doit être réellement intéressant contre un bon humain. L'architecture V1 n'est pas présumée être la meilleure route vers cet objectif.

## Caméra et contrôles

Ouvert :
- caméra libre, semi-assistée ou davantage dirigée ;
- angle par défaut ;
- zoom ;
- manière de sélectionner cases/objets ;
- mapping manette ;
- usage ou non du D-pad ;
- curseur spatial ;
- raccourcis ;
- appuis longs ;
- vibration ;
- tactile/mobile.

Enseignements V1 à conserver dans l'évaluation : la direction du stick doit rester intuitive quand la caméra tourne et l'input ne doit pas dupliquer les règles de légalité.

## UI / information tactique

Ouvert :
- HUD permanent ou contextuel ;
- cartes visibles comme objets ou ressources abstraites ;
- affichage des coûts ;
- previews ;
- affordances 3D ;
- objectifs de campagne ;
- tutoriel ;
- journal/autopsie de l'IA.

Intention : garder le monde immersif sans cacher l'information nécessaire à une stratégie précise.

## Direction artistique

Ouvert :
- niveau de stylisation ;
- pipeline 2D/3D hybride ou full 3D ;
- modèles de personnages ;
- matériaux ;
- lumière ;
- VFX ;
- skybox/environnement ;
- cinématiques in-engine ou pré-rendues ;
- quantité d'animation.

Identité à considérer sérieusement : fantasy céleste, îles flottantes, profondeur, lumière dorée/lavande, architecture claire, magie lisible. **Les assets V1 ne sont pas imposés.**

## Campagne / contenu

Ouvert :
- conserver ou reconstruire les 22 Sanctuaires ;
- nombre d'actes ;
- narration ;
- voix ;
- ordre pédagogique ;
- objectifs spéciaux ;
- transitions ;
- rejouabilité ;
- mode puzzle séparé ou campagne intégrée.

Les niveaux V1 peuvent être traités comme corpus de problèmes plutôt que comme contenu à porter tel quel.

## Multiplayer

Ouvert :
- modes réellement prioritaires ;
- local/hot-seat ;
- 2v2 ;
- réseau synchrone/asynchrone ;
- autorité client/serveur ;
- anti-triche ;
- reconnexion ;
- matchmaking ;
- spectateur/replay.

Ne pas laisser l'existence d'un chemin online V1 imposer l'architecture réseau V2.

## Performance

Les budgets V2 doivent être décidés **après les cibles** :
- FPS minimum/cible ;
- temps de chargement ;
- mémoire ;
- taille de build ;
- draw calls / GPU ;
- budget IA par tour ;
- appareils minimum.

Éviter de recopier des optimisations Web V1 si les contraintes changent.

## Organisation du travail avec Astra

Ouvert : structure précise du repo V2 et découpage des agents.

Principes recommandés, non imposés :
- petits documents d'entrée plutôt qu'un prompt géant ;
- décisions importantes enregistrées une fois ;
- tests reproductibles pour éviter de redécouvrir un bug ;
- exploration ciblée du V1 seulement quand nécessaire ;
- mesurer avant d'optimiser ;
- garder des prototypes jetables pour les décisions risquées.

## Première décision attendue d'un agent V2

Après lecture de `START_HERE.md`, `00_GOAL.md`, `01_GAME_CURRENT.md` et de ce fichier, **ne commence pas automatiquement à coder**.

Produis d'abord un audit court :

1. ce qui semble constituer l'identité essentielle d'ILYOS ;
2. les principaux risques d'une reconstruction ;
3. les décisions qui doivent être prises avant un vertical slice ;
4. les décisions qui peuvent rester différées ;
5. les 2–4 stacks/approches les plus crédibles ;
6. ta recommandation actuelle, avec les raisons et les incertitudes ;
7. le plus petit prototype qui permettrait de falsifier cette recommandation.

C'est une demande d'analyse, **pas une obligation d'obtenir l'autorisation pour chaque choix réversible ensuite**.
