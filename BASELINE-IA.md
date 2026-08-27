# Baseline Expert Legacy — banc d'essai tactique

Mesure enregistrée **avant toute modification stratégique de l'IA**, sur la
branche `ai-expert-v2-foundations`. Elle sert de point de comparaison à toutes
les versions ultérieures et ne doit pas être réécrite : pour comparer, ajouter
une nouvelle section plutôt que modifier celle-ci.

Reproduire : `node scripts/bench-ia.js` (serveur de développement sur le port 8123).

## Expert Legacy — 11 / 16

| # | Puzzle | Résultat | Observation |
|---|--------|----------|-------------|
| 01 | Diagonale vers couronne | FAIL | coût réel inchangé (7 → 7), aucune action jouée |
| 02 | Validation immédiate | PASS | porteur amené en (0,0) |
| 03 | Empêcher une validation adverse | PASS | porteur adverse neutralisé |
| 04 | Protéger un porteur menacé de chute | FAIL | porteur laissé expulsable, aucune action jouée |
| 05 | Éliminer un porteur adverse | PASS | porteur adverse neutralisé |
| 06 | Éliminer un gardien rentable | PASS | gardiens adverses 1 → 0 |
| 07 | Transmission gratuite utile | FAIL | couronne à distance 5 → 5, aucune action jouée |
| 08 | Poussée de couronne utile | PASS | couronne récupérée |
| 09 | Magie ouvrant une route | FAIL | aucune route ouverte, aucune action jouée |
| 10 | Magie coupant une route adverse | PASS | route adverse coupée |
| 11 | Agir avant de poser l'île | FAIL | pose automatique avant toute action |
| 12 | Poser tôt est préférable | PASS | île posée, gardiens 1 → 2 |
| 13 | Conserver la réserve | PASS | 5 cartes mises en réserve |
| 14 | Dépenser une grosse réserve | PASS | validation atteinte |
| 15 | Préparer une couronne en attente | PASS | gardien à 1 case du sanctuaire |
| 16 | Forme limitée | PASS | île posée sans consommer la dernière croix |

Reproductibilité vérifiée sur 01, 05, 08, 12, 16 — trois passages à graine
fixe, séquences de coups identiques à chaque fois.

## Échecs attendus par construction

Trois échecs ne sont pas des accidents mais la mesure elle-même. Ils ne doivent
pas être « réparés » en modifiant les puzzles.

- **11** — `runAITurn()` appelle `createAutomaticIslandAndSpawn()` avant sa
  boucle d'actions. L'IA actuelle ne peut structurellement pas agir avant de
  poser son île.
- **01, 07, 09** — trois symptômes d'une même cause : la distance stratégique
  ignore les diagonales (voir ci-dessous).

## Note sur le puzzle 15

Il passe, mais pour une raison qui ne tient pas à une véritable anticipation :
quand aucune couronne active n'est libre, `aiStrategicTargetsForCharacter()`
renvoie le centre du plateau par défaut, et les gardiens dérivent donc vers le
sanctuaire sans jamais raisonner sur `couronnesEnAttente`. Le puzzle valide le
résultat, pas le raisonnement : c'est un discriminant faible, à renforcer quand
l'évaluateur stratégique existera.

---

# Après correction des distances — 13 / 16

Seule modification stratégique appliquée depuis la baseline :
`aiLandDistanceToTargets()` utilise désormais la topologie réelle du
déplacement (Dijkstra, orthogonal 1 / diagonale 2) au lieu d'un parcours en
largeur orthogonal à coût uniforme. Rien d'autre n'a été touché, afin que
l'écart mesuré soit imputable à cette seule correction.

| # | Puzzle | Avant | Après | |
|---|--------|-------|-------|---|
| 01 | Diagonale vers couronne | FAIL | **PASS** | coût réel 7 → 5 |
| 02 | Validation immédiate | PASS | PASS | |
| 03 | Empêcher une validation adverse | PASS | PASS | |
| 04 | Protéger un porteur menacé de chute | FAIL | FAIL | |
| 05 | Éliminer un porteur adverse | PASS | PASS | |
| 06 | Éliminer un gardien rentable | PASS | PASS | |
| 07 | Transmission gratuite utile | FAIL | **PASS** | couronne 5 → 2 du village |
| 08 | Poussée de couronne utile | PASS | PASS | |
| 09 | Magie ouvrant une route | FAIL | FAIL | |
| 10 | Magie coupant une route adverse | PASS | PASS | |
| 11 | Agir avant de poser l'île | FAIL | FAIL | |
| 12 | Poser tôt est préférable | PASS | PASS | |
| 13 | Conserver la réserve | PASS | PASS | |
| 14 | Dépenser une grosse réserve | PASS | PASS | |
| 15 | Préparer une couronne en attente | PASS | PASS | |
| 16 | Forme limitée | PASS | PASS | |

**Améliorés : 01, 07. Dégradés : aucun. Inchangés : les quatorze autres.**

Dans les deux puzzles corrigés, l'IA ne jouait strictement rien auparavant : la
distance fantôme produisait un terme `- targetDistance * 1.2` supérieur à 40,
qui rendait négatif tout coup pourtant évident. La correction ne rend pas l'IA
plus offensive, elle la débloque.

Stabilité : trois passages complets consécutifs, mêmes seeds — 13/16 à chaque
fois, verdict identique puzzle par puzzle.

## Limitation connue : séquences non reproductibles

À graine fixe, les **verdicts** sont reproductibles mais les **séquences de
coups** ne le sont pas toujours. Sur le puzzle 07, le premier passage joue une
transmission de plus que les suivants pour un résultat stratégique identique.

Le hasard n'est pas en cause : il est figé par la graine, et le générateur est
vérifié séparément (`node scripts/verif-rng.js`, 6/6). La cause est le couplage
entre exécution et présentation : `aiPerformMove()` déclenche une animation puis
attend, et la position du gardien n'est mise à jour qu'au cours de cette
animation. L'IA peut donc lire une position périmée, et son enchaînement dépend
du temps réel. Mesuré aussi en compressant les temporisations : à vitesse 0,12
le journal se remplit de coups répétés non appliqués.

Aucun contournement n'a été ajouté — ni tour de chauffe, ni attente
supplémentaire — pour ne pas masquer le symptôme. C'est le premier point à
traiter lors de la séparation règles / présentation.

## Faiblesses observées, volontairement NON corrigées

Relevées pendant la mesure, laissées intactes pour que l'écart mesuré reste
imputable à la seule correction des distances.

1. **L'IA n'évalue jamais l'option « rester en place ».** `aiBestMove()` ne
   compare que des destinations. Un porteur menacé dont tous les déplacements
   font reculer la distance au village voit donc chaque option notée
   négativement, passe sous le seuil `value > 12`, et l'IA ne joue rien — alors
   même que rester est précisément le pire choix. C'est la cause de l'échec du
   puzzle 04, et cela explique aussi pourquoi ses paralysies se traduisent par
   « aucune action » plutôt que par un mauvais coup.

2. **Coups répétés.** Le journal du puzzle 11 montre le même déplacement
   redemandé après avoir été refusé (`MOVE [5,5]→[5,5]`). La boucle
   n'incrémente `actionsPlayed` que pour certaines branches, donc rien ne borne
   les tentatives improductives.

3. **Utilités non comparables.** `aiExpertActionChoice()` classe ensemble
   `move.utility`, `-push.priority` et `-magic.score`, produits par trois
   fonctions d'échelles différentes, puis leur applique un seuil unique de 12.

4. **Le puzzle 15 réussit pour la mauvaise raison.** Faute de couronne active
   libre, `aiStrategicTargetsForCharacter()` renvoie le centre du plateau par
   défaut : les gardiens dérivent vers le sanctuaire sans jamais consulter
   `couronnesEnAttente`. Discriminant faible, à renforcer quand l'évaluateur
   stratégique existera.

## Correction d'une hypothèse : le stock de formes est actif en classique

Il avait été supposé que le stock par forme ne concernait que le duel
symétrique, `state.rules` ne contenant `shapeLimitPerOwner` que dans ce mode.
C'est faux. `shapeLimitPerOwner()` (js/game/bootstrap.js) retombe sur
`SHAPE_LIMIT_PER_OWNER_DEFAULT = 2` dès que la règle est absente :

```js
const limite = state?.rules?.shapeLimitPerOwner;
return Number.isFinite(limite) ? limite : SHAPE_LIMIT_PER_OWNER_DEFAULT;
```

Une partie classique applique donc bien un stock de **2 exemplaires par forme
et par joueur**, et `findAutomaticIslandPlacement()` le respecte déjà. Le duel
symétrique ne fait que rendre cette valeur réglable au menu.

Conséquence pour la suite : le coût d'opportunité des formes est un terme
d'évaluation valable dans TOUS les modes, et non une règle marginale. Il doit
tout de même lire `shapeLimitPerOwner()` plutôt que la constante, la valeur 0
signifiant « illimité ».

---

# Référence corrigée (puzzle 15 durci) — 12 / 16

Le puzzle 15 était un **faux positif** : il passait sans que l'IA consulte
jamais `couronnesEnAttente`. Une couronne libre traînait au nord-ouest, l'IA
courait dessus, et sa trajectoire frôlait le sanctuaire par accident.

Version durcie : plus aucune couronne libre, la seule couronne active est
portée par l'adversaire — ce qui envoie explicitement le comportement actuel
dans la direction opposée. Le gardien démarre à distance 2 du sanctuaire sur un
couloir fermé, donc l'immobilité échoue aussi. Seule une approche délibérée
réussit. L'assertion reste formulée en termes de règles.

L'Expert corrigé (distances) y échoue désormais, en restant immobile.

| Version | Score |
|---|---|
| Legacy (avant tout) | 11/16 |
| Après correction des distances | 13/16 |
| **Référence corrigée, puzzle 15 durci** | **12/16** |

C'est **12/16** qui sert de point de comparaison à Expert V2, l'ancien 13/16
comptant un puzzle réussi pour la mauvaise raison.

Échecs restants : **04** (aucune comparaison entre agir et rester), **09**
(magie non comprise comme transformation du graphe), **11** (pose automatique
en début de tour), **15** (aucune anticipation de la couronne à venir).

---

# Expert V2 — planner de tour — 15 / 16

| Version | Score |
|---|---|
| Legacy | 11/16 |
| + distances corrigées | 13/16 |
| référence (puzzle 15 durci) | 12/16 |
| **Expert V2 — planner** | **15/16** |

Les quatre échecs de la référence passent, chacun par la capacité générale
qu'il désignait — aucun code ne mentionne un numéro de puzzle :

- **04** l'arrêt est devenu un coup comparable aux autres, donc un porteur
  menacé compare enfin « fuir » à « rester » ;
- **09** la magie est pré-classée par son effet mesuré sur les distances
  stratégiques, pas par une géométrie locale ;
- **11** la pose est une action candidate, plus un préambule imposé ;
- **15** `couronnesEnAttente` est un terme explicite de l'évaluateur.

## Seul échec restant : P13

**Sa prémisse est désormais fausse.** Le puzzle suppose qu'aucun gain n'est
disponible et attend donc que l'IA conserve ses cartes. Le planner démontre le
contraire : il tourne une île pour ouvrir une route, puis amène son gardien de
(7,7) à (6,5), soit à une case de la seule couronne du plateau. Se placer pour
prendre une couronne vaut mieux que thésauriser cinq cartes.

Le puzzle n'a PAS été modifié. Il ne mesure simplement plus ce qu'il annonce, et
c'est à arbitrer : soit on le rebâtit sur une position réellement stérile, soit
on accepte 15/16 comme plafond de ce banc.

## Recalibrage effectué

Premier jet à 14/16 avec une régression sur P01 : l'IA refusait d'avancer vers
une couronne à sa portée. Cause générale — `carteConservee` (22) dépassait le
gain d'approche `couronneLibre` × écart de proximité (20,3 pour 44 de cartes
dépensées). Le gradient d'approche était plus faible que la valeur de
thésaurisation. Corrigé en portant `couronneLibre` à 900 et `carteConservee` à
12, ce qui rétablit P01 sans toucher au reste.

## Séquences réellement trouvées

```
P11  MOVE -> PUSH -> MOVE -> POSE     gain 1604, 156 ms, 251 états
P09  MAGIC -> MOVE                    gain  426,   6 ms,   7 états
P05  PUSH -> RAMASSAGE                gain  968,   1 ms,   5 états
P12  MOVE -> POSE                     gain  346,  81 ms,  81 états
P13  MAGIC -> MOVE                    gain  552,  14 ms,  76 états
```

P11 est la démonstration la plus nette : quatre actions, la pose placée en
DERNIER, ce qui était structurellement impossible auparavant.

## Performance (16 positions du banc)

| Mesure | Valeur |
|---|---|
| Temps de recherche p50 | 3 ms |
| p95 | 156 ms |
| max | 156 ms |
| États explorés, moyenne | 39 |
| États explorés, max | 251 |
| Longueur moyenne de plan | 1,5 |
| Longueur maximale | 4 |

Budget : faisceau 10, 6 décisions coûteuses, 900 états, 350 ms. Jamais atteint
sur ces positions.

## Effet secondaire : P07 est devenu reproductible

La variance de séquence documentée aux Prompts 1 et 2 a disparu d'elle-même.
Elle venait des actions gratuites, jouées par des scripts avant le cerveau ;
devenues des transitions de la recherche, elles sont décidées avec le reste du
plan. Cinq passages, séquences identiques. Aucun correctif ne visait ce
symptôme.
