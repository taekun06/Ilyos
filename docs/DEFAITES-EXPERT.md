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
   - **Exporter** télécharge son dossier ;
   - **Rejouer** relance la partie, vous contre l'Expert, au début ou à un tour
     signalé ;
   - **Épingler** la protège du renouvellement ;
   - cocher plusieurs défaites puis **Exporter la sélection** produit un seul
     fichier, pratique pour transmettre un lot.

Seules les victoires humaines sont gardées. Les données restent dans le
navigateur (IndexedDB) : vider les données du site les efface.

## Ce que contient un dossier

- version du build, règles, options et mode de départ, joueurs, barème de
  l'IA (`PLAN_POIDS`) au moment de la partie ;
- pour **chaque tour** : la position au début du tour (`snapshotState`,
  rejouable par `applyStateSnapshot`) ;
- pour **chaque décision Expert** : la position juste avant le calcul, le plan
  joué, les notes de départ, de fin de tour et après riposte, la riposte
  anticipée, le classement des finalistes, les états explorés, le temps et un
  éventuel repli sur l'ancienne IA ;
- le résultat, la position finale, et l'état complet de reprise (`cadre`) qui
  permet de rejouer depuis n'importe quel tour ;
- `analyse` : les tours signalés et leur motif.

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

Pour creuser une décision : reposer la position (**Rejouer** depuis la
bibliothèque, ou `ILYOS_DEFAITES.rejouer(dossier, index)`), puis activer
l'autopsie actuelle (`ILYOS_AUTOPSIE`) avant de laisser l'IA jouer.

`--extraire` écrit `tests/positions-defaites/<défaite>-t<tour>.json` : la
position, le plan de l'IA, la suite humaine et un champ `attendu` à remplir
au cas par cas. C'est la matière des futurs scénarios de test.

## API de la page

`window.ILYOS_DEFAITES` : `journal()`, `derniere()`, `analyser(dossier)`,
`exporter(dossier)`, `bibliotheque()`, `lister()`, `lire(id)`,
`supprimer(id)`, `rejouer(dossier, index)`, `decrire(plan, etat)`, `seuils`.
