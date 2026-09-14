# 00 — But d'ILYOS V2

## Mission

Créer une **nouvelle version d'ILYOS** en utilisant V1 comme capital d'apprentissage, et non comme contrainte de compatibilité.

Le résultat recherché n'est pas une migration fidèle ligne par ligne. Il s'agit de récupérer ce qui donne à ILYOS son identité, de comprendre ce qui fonctionne ou non, puis de reconstruire une version plus forte, plus cohérente et plus facile à faire évoluer.

## Liberté de conception

**Décision V2 ouverte :** moteur, langage, architecture, pipeline graphique, modèle de données, IA, réseau, UI, outils et stratégie de distribution.

Aucune technologie de V1 n'est sacrée. JavaScript classique, Three.js r128, le bundle unique, la fermeture partagée ou l'organisation actuelle ne sont pas des contraintes V2.

Aucune règle n'est sacrée non plus. Une mécanique peut être conservée, ajustée ou retirée si l'alternative améliore clairement le jeu. Toute modification importante de gameplay doit toutefois partir d'un problème ou d'une opportunité identifiable et être comparée au comportement V1.

## Ce que V2 doit préserver au niveau du produit

**À valider avec le directeur du jeu au fil des prototypes**, mais les intentions répétées de V1 sont :

- un jeu de stratégie lisible autour d'un archipel céleste transformable ;
- une forte identité visuelle fantasy, belle et immersive sans sacrifier la compréhension tactique ;
- des décisions spatiales où terrain, positionnement des Gardiens, poussée, magie et Couronnes interagissent ;
- une profondeur suffisante pour qu'un adversaire Expert reste intéressant contre un bon humain ;
- une expérience confortable à la manette autant qu'à la souris/clavier ;
- un mode solo/campagne qui enseigne le jeu par la situation et la mise en scène, pas uniquement par du texte ;
- une architecture de production permettant à des agents IA de travailler efficacement, de tester leurs hypothèses et de revenir sur leurs choix.

## Critère de succès

V2 doit être jugée sur le produit final, pas sur la quantité de code V1 réutilisée.

Un changement est bon s'il améliore de façon démontrable une ou plusieurs dimensions — profondeur, lisibilité, plaisir, immersion, robustesse, performance, maintenabilité, vitesse d'itération — sans dégrader de façon injustifiée les autres.

## Manière attendue de travailler

L'agent ne doit pas attendre une micro-instruction pour chaque décision réversible. Il peut explorer, comparer, prototyper et recommander.

Pour les décisions coûteuses ou difficilement réversibles (moteur, réseau, format de sauvegarde, architecture stratégique, direction artistique structurante), produire d'abord une courte note de décision ou une preuve technique.

Le propriétaire du projet souhaite **économiser les crédits de raisonnement sans brider l'agent** : utiliser les synthèses de ce dossier pour éviter les explorations répétitives, mais revenir au code V1, aux tests ou au jeu de référence lorsqu'une décision en dépend réellement.
