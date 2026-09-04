# Tutoriels Ilyos

## Entrée principale : Découverte d'Ilyos

`window.ILYOS_TUTORIAL.start()` lance désormais une première découverte progressive : caméra libre, HUD révélé au fur et à mesure, apprentissage par l'action et aide lumineuse seulement après une période d'inactivité.

Ordre actuel : observer la caméra, toucher le Gardien, se déplacer, rencontrer le vide, poser une île et éveiller un second Gardien, prendre la Couronne, la transmettre, repousser un rival sans chute, puis vivre un vrai tour adverse avant la validation au début du tour suivant.

Le parcours ne présente volontairement ni magie, ni réserve avancée, ni poussée complexe, ni chute volontaire.

## Parcours conservé : La Première Ascension

L'ancien scénario reste accessible via `window.ILYOS_TUTORIAL.startAscension()` afin de pouvoir devenir plus tard une épreuve/puzzle séparée sans perdre le travail de mise en scène et de guidage existant.

Le chapitre de Couronnement ne force plus directement `scoreCrownsAtTurnStart()`. Il fait maintenant passer un vrai tour adverse via `endTurn(true)` avant le retour au joueur, afin que la validation respecte la règle réelle du moteur.
