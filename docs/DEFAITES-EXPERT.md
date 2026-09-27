# Défaites de l'IA Expert

Jouer normalement contre l'Expert, le battre, et que la partie serve
directement à améliorer l'IA : sans activer l'autopsie, sans repérer soi-même
le tour fautif.

## Côté joueur

1. Lancer une partie **Solo** en difficulté **Expert** (plateau classique,
   symétrique ou personnalisé). Rien à activer : toute partie locale humain
   contre Expert est enregistrée automatiquement.
2. Si vous gagnez, l'écran de victoire propose **🧠 Analyser cette défaite de
   l'IA**. Un clic télécharge `ilyos-defaite-AAAA-MM-JJ-HHhMM.json` et affiche
   le récapitulatif des tours à regarder.
3. La partie est déjà rangée dans la **bibliothèque des défaites**, ouverte par
   le bouton de l'écran de victoire, ou par **📚 Défaites de l'IA Expert** en bas
   à gauche du menu. Elle garde les 12 dernières défaites, plus celles qu'on
   épingle. Pour chaque défaite :
   - **👁 Voir la partie** ouvre la visionneuse (ci-dessous) ;
   - **Exporter** télécharge son dossier ;
   - **Épingler** la protège du renouvellement ;
   - cocher plusieurs défaites puis **Exporter la sélection** produit un seul
     fichier, pratique pour transmettre un lot.

Seules les victoires humaines sont gardées. Les données restent dans le
navigateur (IndexedDB) : vider les données du site les efface.

## La visionneuse (« Voir la partie »)

Toute la partie, telle qu'elle a été jouée, avec ce que l'IA pensait :

- **navigation** : ◀ ▶ tour par tour, ◁ ▷ action par action (clavier : ← →
  action, Maj + ← → tour) ; un clic sur la courbe va au tour ;
- **courbe de confiance de l'IA** : sa note au début de chacun de SES tours
  (au-dessus de l'axe, elle pense mener) ; points rouges : tours signalés,
  dorés : tours annotés, blancs sur l'axe : vos tours. L'IA ne juge pas une
  position pareil selon qui a le trait : on compare un tour au prochain tour
  du même joueur, jamais un tour IA à un tour humain ;
- **pour chaque tour** : ce qui a été joué, la note de la position et ce qui
  la compose ; pour l'IA, sa réflexion — notes au départ, en fin de tour,
  après la riposte qu'elle craignait, et ce qui a été constaté à son tour
  suivant, riposte redoutée, ses meilleurs plans, positions explorées, et le
  motif du signalement ;
- **« Que jouerait l'IA aujourd'hui ? »** : le plan de l'Expert actuel à la
  place du joueur au trait (vous ou elle), ses notes, les autres plans
  envisagés, visibles sur le plateau ;
- **annotation** : un texte et des étiquettes (erreur de l'IA, bon coup,
  moment clé, à revoir) par tour ;
- **✏ Proposer un meilleur coup** : le tour redevient jouable, avec les
  cartes qu'avait le joueur ; jouez-le à la souris puis « ✓ Valider » (ou
  « Fin du tour »). Votre coup est noté comme l'IA note les siens — en fin
  de tour et après sa meilleure riposte — à côté du coup réellement joué,
  avec les termes du barème qui les séparent. Si l'évaluateur préfère le
  coup joué alors que vous avez raison, c'est son barème qu'il faut
  corriger : c'est le signal le plus utile ;
- **▶ Reprendre la partie ici** : relance une partie vivante, vous contre
  l'Expert, depuis ce tour (l'ancien « Rejouer »).

Annotations et coups proposés sont gardés dans le dossier (bibliothèque et
export) et lus par `analyser-defaite.js`, qui examine d'office les tours
annotés ou corrigés.

Limites : les actions une par une n'existent que pour les parties jouées
depuis cette version (avant : le plan de l'IA seulement, et « avant / après »
pour vos tours) ; l'apparition d'un gardien et le dépôt d'une couronne se
voient à l'action suivante. Pour un tour humain, le « coup joué » est
comparé à partir du tour suivant, remis à votre trait (approximation).

## Ce que contient un dossier

- version du build, règles, options et mode de départ, joueurs, barème de
  l'IA (`PLAN_POIDS`) au moment de la partie ;
- pour **chaque tour** : la position au début du tour (`snapshotState`,
  rejouable par `applyStateSnapshot`), et chaque action jouée avec le
  plateau qui en résulte (`actions`) ;
- pour **chaque décision Expert** : la position juste avant le calcul, le plan
  joué, les notes de départ, de fin de tour et après riposte, la riposte
  anticipée, le classement des finalistes, les états explorés, le temps et un
  éventuel repli sur l'ancienne IA ;
- le résultat, la position finale, et l'état complet de reprise (`cadre`) qui
  permet de rejouer depuis n'importe quel tour ;
- `analyse` : les tours signalés et leur motif ;
- `annotations` et `propositions` : ce que vous avez noté et proposé dans la
  visionneuse.

Coût en partie : un instantané d'environ 8 Ko par tour (0,02 ms), et la
version légère d'un rapport que le planner produit de toute façon. Les
décompositions de score et les candidats écartés de l'autopsie ne sont **pas**
calculés en partie : on les recalcule après coup, sur les tours retenus.

## Tours signalés

Le récapitulatif ne dit jamais qu'un coup était mauvais parce que l'IA a
perdu. Il signale ce qui mérite un regard (seuils dans `DEFAITES_SEUILS`,
`js/game/defaites.js`) :

- **menace humaine non anticipée** : la note au tour suivant de l'IA est bien
  plus basse que ce qu'elle prévoyait après riposte (800 points ou plus ; une
  couronne validée vaut 4 000) ;
- **forte bascule** : chute de 1 500 points ou plus d'une décision à la
  suivante ;
- gardien IA perdu avant sa décision suivante ; point marqué par l'humain ;
  porteur humain arrivé au bord de la validation ;
- repli sur l'ancienne IA, finalistes à moins de 120 points l'un de l'autre,
  peu d'états explorés ;
- contexte : l'IA porte une couronne, porteur humain près de son village
  (jamais signalé seul) ;
- la dernière décision avant la défaite.

Au plus huit tours sont retenus, les plus marquants, affichés dans l'ordre de
la partie.

## Côté analyse

```text
npm start                                               # serveur port 8123
node scripts/analyser-defaite.js ilyos-defaite-….json   # tours signalés
node scripts/analyser-defaite.js <fichier> --tour 17    # un tour précis
node scripts/analyser-defaite.js <fichier> --tous       # toutes les décisions
node scripts/analyser-defaite.js <fichier> --extraire 17
```

Le fichier peut être une défaite, un lot exporté ou une position extraite.
Pour chaque décision, trois lectures côte à côte :

1. le plan joué en partie, et ce qu'il vaut face à la riposte avec le code
   d'aujourd'hui ;
2. le plan que le planner d'aujourd'hui choisirait, avec les principaux termes
   de la position de départ ;
3. ce que l'humain a joué ensuite.

Pour creuser une décision : la visionneuse (`ILYOS_DEFAITES.voir(dossier,
index)`), ou reposer la position en partie vivante (« Reprendre la partie
ici », `ILYOS_DEFAITES.rejouer(dossier, index)`) puis activer l'autopsie
(`ILYOS_AUTOPSIE`) avant de laisser l'IA jouer.

`--extraire` écrit `tests/positions-defaites/<défaite>-t<tour>.json` : la
position, le plan de l'IA, la suite humaine et un champ `attendu` à remplir
au cas par cas. C'est la matière des futurs scénarios de test.

## API de la page

`window.ILYOS_DEFAITES` : `journal()`, `derniere()`, `analyser(dossier)`,
`exporter(dossier)`, `bibliotheque()`, `lister()`, `lire(id)`,
`supprimer(id)`, `rejouer(dossier, index)`, `voir(dossier, index)`, `vue()`,
`decrire(plan, etat)`, `seuils`.
