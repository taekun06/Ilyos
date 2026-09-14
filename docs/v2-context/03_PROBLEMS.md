# 03 — Problèmes et limites connus de V1

Le but de ce fichier est d'éviter qu'une V2 réintroduise par accident des difficultés déjà rencontrées. **Il ne prescrit pas leur solution.**

## 1. Dette d'architecture accumulée

**Vérifié V1 :** le jeu reste un site statique en JavaScript classique. `js/game.js` est généré à partir de fragments qui partagent une même fermeture et un même état global. L'ordre de ces fragments est intentionnel.

Cette stratégie a permis de faire évoluer rapidement un prototype existant, mais elle rend certaines frontières de sous-systèmes implicites. Plusieurs scripts historiques existent aussi en dehors du bundle principal.

**Enseignement :** V2 ne doit pas conserver cette organisation uniquement pour réutiliser du code.

## 2. Cascade CSS très profonde

**Mesuré/documenté dans V1 :** le runtime a atteint 39 sources CSS, 2 619 règles et 10 186 déclarations `!important` résolues. Des passes successives (`v54`, `v58`, `v64`, etc.) se superposent ; du CSS mort reste présent.

Conséquences observées : règles visuelles qui semblent correctes mais perdent silencieusement la cascade, correctifs qui nécessitent une spécificité toujours plus forte, difficulté à savoir quel style est réellement actif.

**Leçon V2 :** éviter la sédimentation de couches de correction. La solution exacte est ouverte.

## 3. Couplage historique entre état et animation

Avant l'extraction de `rules-core.js`, certaines mutations de règles se produisaient dans des callbacks de fin d'animation. L'IA pouvait alors lire un état avant que le gameplay logique ait été appliqué.

Le problème a été partiellement corrigé en V1, mais il illustre un risque structurel important : **la vérité du jeu ne doit pas dépendre du timing visuel**.

## 4. IA Expert encore insuffisante en partie réelle

**Observation du propriétaire du jeu :** malgré un planner de plus en plus avancé, l'Expert reste trop facile à battre pour un humain lors de parties normales.

Le dépôt montre une succession récente de corrections ciblées : combinaisons gratuites, ripostes, défense de validation, placement de Gardiens, dépôts, transports par magie, poses tactiques. Les PR #109 à #112 étaient encore ouvertes à la baseline du pack.

**Risque :** améliorer continuellement des symptômes du planner V1 sans réinterroger son modèle global peut coûter beaucoup de temps.

**Décision V2 ouverte :** conserver, adapter ou remplacer totalement l'approche IA.

## 5. Recherche IA nécessairement bornée

Le planner V1 limite profondeur, beam, candidats, états et/ou temps pour rester jouable dans le navigateur. Des PR récentes documentent explicitement des tactiques légalement possibles mais absentes du candidat set avant correction.

**Enseignement :** lorsqu'une IA ne voit pas un coup, distinguer au moins :
- action non générée ;
- action coupée avant évaluation ;
- évaluation incorrecte ;
- anticipation insuffisante ;
- budget/performance.

## 6. Tests parfois instables ou incomplets

Exemple documenté : le test de découverte/tutoriel échoue de façon intermittente autour de la transmission de Couronne (mesuré plusieurs fois à environ 2 échecs sur 3 dans certaines passes). Plusieurs comportements manette réels restent difficiles à juger autrement qu'avec une manette physique.

**Enseignement :** une suite verte une fois n'est pas nécessairement une preuve de stabilité ; distinguer tests fonctionnels, sensations d'input et validation visuelle.

## 7. Rendu/caméra : caches et propriétaires concurrents

Les PR de campagne ont révélé plusieurs problèmes : château/sanctuaire fantôme après changement de scène ou de taille, Couronne à mauvaise hauteur après transformation du terrain, recadrage de resize interrompant une cinématique, plusieurs systèmes reprenant la caméra pendant le même mouvement.

**Enseignement :** les ressources mises en cache, la durée de vie des objets et la propriété temporaire de la caméra doivent être explicites.

## 8. Validation visuelle automatisée limitée

Dans certains environnements de développement, le navigateur de prévisualisation est considéré comme masqué ; `requestAnimationFrame` est fortement ralenti et la scène 3D peut ne pas s'initialiser correctement. V1 a dû s'appuyer sur des assertions DOM/JS puis laisser le jugement pixel/sensation à un vrai navigateur.

V2 devrait choisir son pipeline de validation en connaissance de cette contrainte d'agentisation.

## 9. Assets et licences incomplètement documentés

`docs/ASSETS.md` répertorie des sources connues, mais plusieurs dossiers locaux ont encore une provenance détaillée à compléter. Les assets ne doivent pas être supposés réutilisables uniquement parce qu'ils sont présents dans le dépôt.

## 10. Poids et performance Web

L'audit du 7 septembre 2026 relevait environ 81 Mo dans `assets/`, avec certains personnages individuels autour de plusieurs Mo. Le poids disque n'est pas égal au coût GPU, mais le Web rend le chargement, le cache et la compatibilité des formats particulièrement visibles.

**Décision V2 ouverte :** la cible Web elle-même n'est pas imposée ; les budgets devront être définis selon les plateformes retenues.

## 11. Empilement de fonctionnalités sans re-fondation

V1 a grandi par PR successives : IA, campagne, cinématiques, audio, manette, nouveaux HUD, effets, règles, compatibilité en ligne. C'est normal pour un prototype vivant, mais certaines décisions étaient contraintes par l'existant plutôt que choisies pour un système neuf.

C'est précisément la raison d'être de V2 : **conserver les apprentissages sans hériter automatiquement de toutes les contraintes historiques.**
