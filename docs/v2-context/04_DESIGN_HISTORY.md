# 04 — Histoire de conception utile

Ce document conserve les **raisons** derrière certaines évolutions. Il ne cherche pas à retracer tous les commits.

## Du prototype Web à un jeu 3D plus structuré

ILYOS est resté volontairement un site statique JavaScript/Three.js pendant V1. Ce choix a rendu les itérations et la publication Web très simples, mais les évolutions ont été ajoutées autour d'une base qui n'avait pas été conçue pour tous les systèmes ultérieurs.

**Leçon :** une contrainte de V1 peut être un choix historique raisonnable sans être le meilleur choix pour V2.

## Les règles ont progressivement été séparées du spectacle

À l'origine, certaines actions appliquaient leur mutation logique pendant ou à la fin d'une animation. Cela a produit des divergences temporelles, notamment pour l'IA. `rules-core.js` et le mode simulation ont déplacé progressivement les mutations vers des noyaux synchrones sans rendu.

**Pourquoi :** permettre au jeu réel, aux tests et au planner de partager les mêmes règles et rendre les résultats reproductibles.

## L'IA est passée d'heuristiques locales à un planner

V1 possède encore une logique historique dans `ai.js`, mais l'Expert active `globalPlanning` et s'appuie sur `planner.js`, avec un chemin de repli si le planner échoue.

Le planner a reçu successivement :
- simulation sur état cloné ;
- état stratégique canonique/fingerprint ;
- actions gratuites dans les séquences ;
- anticipation de réponses adverses ;
- approfondissement ciblé sur situations critiques ;
- défense de validation et exposition des porteurs ;
- sélection tactique de poses/spawns ;
- travail récent sur dépôt de Couronne et transport par magie.

**Pourquoi :** l'Expert historique prenait trop de décisions locales sans plan cohérent à l'échelle du tour et de la riposte adverse.

**Constat restant :** le propriétaire du jeu juge encore l'Expert trop facile en partie réelle. V2 ne doit donc pas considérer l'architecture actuelle comme un problème résolu.

## La campagne est née des puzzles

Les énigmes, initialement mode annexe, ont évolué vers **Les Voies d'Ilyos** (PR #93). Le vocabulaire, les Sanctuaires, les vérités de lieux, les voyages et le HUD ont été réorganisés pour faire des puzzles une campagne cohérente.

**Pourquoi :** éviter une simple liste de tests mécaniques et créer une progression solo qui enseigne par les situations.

Des recherches exhaustives ont aussi révélé des barèmes erronés et des solutions inattendues.

**Leçon :** les puzzles sont utiles comme outil de découverte : ils peuvent contredire les intuitions des concepteurs.

## Les transitions ont cherché la continuité du monde

Les PR #96 à #102 ont progressivement supprimé les changements de plateau secs : mouvement du Gardien, déplacement d'archipel, arrivée du Sanctuaire suivant, cinématique d'ouverture depuis le ciel, éclairage et signes célestes.

Plusieurs corrections ont été nécessaires parce que resize, tutoriel et presets caméra pouvaient reprendre la caméra en pleine cinématique.

**Intention de design :** faire sentir que les Sanctuaires appartiennent à un même univers continu plutôt qu'à une succession d'écrans.

## La manette est devenue une grammaire, pas une traduction de la souris

PR #104 : première partie jouable à la manette.

PR #107 : correction des cas structurellement différents — menu iframe, tiroir d'îles, apparition d'un Gardien, destination de chute hors grille, interactions de Couronne.

PR #108 : navigation géométrique partagée, focus stable, réglages manipulés comme objets et snap basé sur les cibles que le moteur publie déjà.

**Leçon :** une bonne manette n'est pas un ensemble de raccourcis vers des boutons DOM ; elle traduit les intentions du jeu.

Les travaux #110 (ouverts à la baseline) poussaient encore cette idée : gâchettes associées à des verbes, Couronne portée par Y, reprise du dernier Gardien, annulation longue jusqu'au début du tour.

## L'UI s'est corrigée par couches

De nombreuses passes HUD/CSS ont été réalisées sans refondation complète, créant une cascade de styles très profonde.

**Pourquoi cela a fonctionné sur le moment :** préserver le jeu jouable pendant chaque amélioration.

**Pourquoi cela ne doit pas être copié aveuglément en V2 :** le coût cumulé de ces couches est désormais documenté et élevé.

## L'annulation a évolué vers une pile

Un seul snapshot ne suffisait pas à une séquence stratégique comportant plusieurs actions. V1 utilise désormais une pile d'instantanés intra-tour. Les travaux récents visent à couvrir également la pose d'île et l'invocation.

**Intention :** permettre au joueur de remonter réellement son raisonnement du tour, sans traverser la frontière du tour précédent.

## Le ciel et la DA se sont consolidés

Le rendu a progressivement centralisé l'atmosphère céleste : dôme/ciel, brouillard, îlots lointains, mer de nuages et contraintes de placement autour du plateau. La direction recherchée privilégie profondeur, lumière dorée, lavande/violet, architectures claires et magie lisible.

**Leçon :** un univers fort vient davantage d'un système visuel cohérent que d'une accumulation d'effets indépendants.

## À retenir pour V2

L'histoire de V1 montre souvent le même motif :

> un besoin légitime a été résolu localement, puis l'accumulation a révélé qu'une abstraction plus profonde était nécessaire.

Pour V2, l'agent peut profiter de ces apprentissages **avant** que l'accumulation ne se reproduise — sans être obligé de reprendre les abstractions choisies après coup en V1.
