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

---

# Expert V3 — anticipation adverse

| Banc | V2 | V3 |
|---|---|---|
| Historique (16 puzzles) | 15/16 | **15/16** |
| Adversarial (8 scénarios) | 7/8 | **8/8** |
| Self-play, 6 parties côtés alternés | 0 | **6** |

## Ce que V3 ajoute

Les meilleurs plans terminaux de la recherche V2 (4 finalistes) sont soumis à
une réplique adverse courte, puis reclassés sur leur valeur APRÈS cette
réplique. Pas de minimax : le coût est proportionnel au nombre de finalistes,
pas à la taille de l'arbre, et la réplique n'en déclenche jamais elle-même.

La transition de tour est reproduite par `applyTurnTransitionCore`, qui suit
l'ordre réel du moteur. C'est essentiel : `scoreCrownsAtTurnStart` s'exécute au
début du tour de son propriétaire, donc les couronnes ne se valident qu'APRÈS
un tour adverse complet. Un porteur garé sur une case de validation reste
expulsable pendant toute cette fenêtre.

## Deux corrections révélées par la mesure

**Paranoïa.** Le premier jet prêtait à l'adversaire une main plausible
contenant une MAGIE garantie. Il faisait alors tourner l'île sous les pieds du
porteur, aucune case de validation ne paraissait tenable, et Expert renonçait à
marquer — P02 est passé en échec. Or la magie est UNE carte sur treize. La main
plausible suit désormais l'espérance réelle (3 MOVE, 2 PUSH, 0 MAGIC) ; les
menaces de magie restent modélisées quand l'adversaire en a une en réserve,
information connue.

**Explosion de coût.** Une partie complète se figeait au tour 28.
`plannerCandidatsMagic` clone et simule chaque rotation pour la pré-classer,
soit île × case × 3, et le plafond de temps n'était vérifié qu'ENTRE les nœuds.
La génération dépassait à elle seule le budget de toute la recherche. Bornée à
36 rotations et 25 ms, îles triées par proximité de l'action.

## Performance (22 positions des deux bancs)

| Mesure | p50 | p95 | max |
|---|---|---|---|
| Recherche principale | 5 ms | 50 ms | 137 ms |
| Anticipation adverse | 124 ms | 266 ms | 314 ms |
| **Total** | **148 ms** | **270 ms** | **322 ms** |

États principaux : 36 en moyenne, 251 au maximum. Finalistes examinés : 3,9.

## Limites de la mesure

Le banc adversarial discrimine peu : V2 y obtenait déjà 7/8, seul A2 (menace en
deux temps) lui échappait. V2 gérait donc déjà bien les menaces immédiates.

Le self-play porte sur 6 parties seulement — l'onglet sature après deux ou trois
parties complètes, limite du harnais et non du jeu. 6-0 côtés alternés est
encourageant mais reste un petit échantillon.

---

# Refonte des règles V67

Quatre règles ont été corrigées avec l'auteur du jeu, après qu'une lecture du
code a révélé que l'IA raisonnait sur des règles fausses. Elles sont mesurées
par deux bancs neufs, `verif-poussee.js` et `verif-validation.js`, qui testent
la RÈGLE elle-même et non une décision d'IA.

## Ce qui change

**Poussée unifiée.** La notion de « force requise » disparaît. La poussée
déplace tout le bloc collé au pousseur du nombre de cases de la force employée :
une force 1 recule désormais un bloc de quatre gardiens d'une case, là où il en
fallait quatre. Un obstacle séparé du bloc par un trou l'arrête juste avant lui.
Un gardien qui entre dans le vide tombe ; une couronne ne tombe jamais — elle
survole le vide et se pose sur sa case d'arrivée, ou à défaut sur la dernière
case d'île libre franchie, plafonnant du même coup tout ce qui la suit.

La règle vivait auparavant en **quatre copies** : le moteur, l'aperçu de
l'interface, le simulateur des IA historiques et le générateur du planner. Elles
tiennent maintenant dans un seul résolveur pur, `resoudrePousseeBloc()`, que
tous lisent.

**Le gardien devient obligatoire pour marquer.** La règle V66, qui validait une
couronne posée seule sur une case de village, est abandonnée. Elle produisait
une conséquence que personne ne voulait : éjecter un porteur adverse hors du
plateau déposait sa couronne sur la case de validation, et lui donnait le point
malgré tout. La poussée faible refusait le point, la poussée mortelle l'offrait.

**Blocage de zone.** Un gardien adverse posté sur l'une des trois cases d'un
village y interdit toute validation, même si le porteur se tient sur une autre
case. Le blocage est propre à chaque village.

**Le gardien qui apparaît agit immédiatement.** Aucun verrou n'existait dans le
code ; c'est le raisonnement de l'IA qui l'ignorait.

## Ce que l'IA ignorait

Trois défauts mesurés, tous génériques, aucun taillé pour un puzzle.

**La pose d'île fuyait la zone adverse.** `findAutomaticIslandPlacement` notait
`+ enemyZoneCells * 4.4` avec un tri croissant : couvrir une case de validation
adverse rendait la pose PIRE. Le coup défensif le plus fort du jeu n'était
jamais proposé comme candidat. Le planner demande désormais des candidates avec
le biais inversé ; les IA Easy / Normal / Hard appellent sans l'option et
conservent exactement leur comportement.

**L'évaluateur ignorait le blocage de zone.** Se tenir sur une case de
validation ne vaut plus rien si l'adversaire tient le village, et un porteur
adverse posté sur un village déjà bloqué ne compte plus comme une menace. La
défense se compte par village et non par case : un seul gardien suffit, en
empiler deux n'apporte rien.

**Toutes les forces de poussée étaient explorées.** Une fois la cible jetée hors
du plateau, pousser plus fort ne change rien qu'une carte dépensée en trop. Le
générateur ne retient plus que la plus PETITE force menant à chaque résultat
distinct — moins de branches, et jamais de gaspillage.

Sans cette déduplication, la charge supplémentaire saturait le harnais : A11
échouait dans le banc complet tout en réussissant 6 fois sur 6 en isolation. Le
symptôme était une saturation de l'instrument, pas une faiblesse de l'IA.

## Mesures après refonte

| Banc | Avant V67 | Après V67 |
|---|---|---|
| Règle de poussée (`verif-poussee`) | — | **10 / 10** |
| Règles de validation (`verif-validation`) | — | **5 / 5** |
| Fidélité simulation ↔ jeu | 12 / 12 | **12 / 12** |
| Puzzles historiques | 15 / 16 | **15 / 16** |
| Banc adversarial | 11 / 11 | **12 / 12** |
| RNG déterministe | 6 / 6 | **6 / 6** |
| Playwright bout en bout | 2 / 2 | **2 / 2** |

P13 reste le seul échec historique, inchangé et volontairement conservé.

A12 est le scénario neuf : le point adverse est imminent et aucun gardien n'est
à portée. La seule parade est de POSER une île sur les cases vides du village
adverse et d'utiliser le gardien qui y apparaît, dans le même tour. L'IA la
trouve et condamne le village en (0,9).

## Ce qui n'a pas été fait

Le **dépôt gratuit** (poser la couronne sur une case adjacente) n'a pas été
ajouté au planner. Il était justifié tant que V66 permettait de marquer sans
porteur : c'était alors un point gratuit qui économisait un gardien. Le gardien
étant devenu obligatoire, ce coup ne sert plus qu'à des relais marginaux, et
ajouter un générateur élargirait une recherche déjà contrainte par le temps.
À reconsidérer si une position réelle en montre le besoin.

---

# La pose comme moyen de transport

Deuxième plainte de l'auteur : « je ne comprends pas pourquoi il gaspille des
actions alors qu'il suffit plein de fois de placer son île et son gardien plus
proche de l'action ». Deux causes distinctes, mesurées par le puzzle P17.

## La case d'apparition n'était pas une décision

Un joueur humain qui pose une île CHOISIT la case où son gardien apparaît :
c'est la phase `PLACE_SPAWN`. L'IA, elle, subissait une heuristique —
`applyIslandPlacementCore` prenait la case libre la plus proche d'une cible
calculée ailleurs, hors de toute planification.

L'asymétrie coûtait cher : poser l'île contre la couronne ne sert à rien si le
gardien surgit à l'autre bout de la forme. `applyIslandPlacementCore` accepte
désormais une case explicite, et le planner en propose plusieurs par pose,
entrelacées pour ne pas sacrifier la diversité des emplacements. Sans case
explicite, le comportement historique est conservé au bit près.

## Un biais défensif que j'avais rendu permanent

En corrigeant la fuite de la zone adverse (V67), j'avais rendu ces cases
attractives SANS CONDITION. Le résultat se lit dans le premier passage de P17 :
la couronne libre attendait en (2,5), et le planner posait une croix en
(0,9)–(1,10), au village adverse, sans aucun porteur adverse en jeu.

Les huit finalistes portaient alors **la même note, 209** : le pré-filtre ne
proposait que des poses du même coin, et l'évaluateur n'avait plus rien à
départager. Une note uniforme entre finalistes est le symptôme à surveiller —
elle signale que la décision s'est jouée AVANT l'évaluateur.

Le biais est maintenant conditionné au même signal que la défense dans
l'évaluateur : un porteur adverse à 3 cases ou moins de SES cases de validation.
Sans menace réelle, la pose suit l'action.

## Mesure

| Banc | Avant | Après |
|---|---|---|
| Puzzles historiques | 15 / 17 | **16 / 17** |
| Banc adversarial | 12 / 12 | **12 / 12** |

P17 : la couronne est hors d'atteinte à pied — aucun chemin de terrain n'y mène.
L'IA pose une île en (3,4)(3,5)(4,3)(4,4), fait apparaître son gardien en (3,5)
juste sous la couronne, la RAMASSE gratuitement puis avance. Note 49 → 1485, là
où le meilleur plan précédent plafonnait à 209.

La défense ne régresse pas : A11 et A12 passent toujours, la menace y étant
réelle et le biais donc actif.

---

# Mode autopsie — comprendre les décisions, pas les noter

Les bancs d'essai jugent des positions choisies d'avance. Ils ne peuvent donc
pas montrer ce qu'un adversaire humain repère en jouant, et c'est bien un humain
qui a trouvé les deux faiblesses les plus coûteuses de cette IA.

L'autopsie enregistre chaque décision Expert d'une VRAIE partie, avec de quoi
répondre à une seule question : « pourquoi l'IA n'a-t-elle pas vu ce que j'ai
vu ? ». Le relevé permet de distinguer quatre causes sans les deviner :

| Où se trouve le bon coup | Cause |
|---|---|
| nulle part dans le relevé | générateurs de candidats |
| parmi les **écartés** | pré-filtre, avant tout évaluateur |
| présent, bien noté, non retenu | recherche ou anticipation de riposte |
| présent, mal noté | évaluateur |

## Usage

```js
ILYOS_AUTOPSIE.activer();   // avant de commencer la partie
// ... on joue contre Expert ...
ILYOS_AUTOPSIE.liste();     // toutes les décisions, une ligne chacune
ILYOS_AUTOPSIE.detail(4);   // la décision suspecte, en entier
ILYOS_AUTOPSIE.rejouer(4);  // repose la position telle qu'AVANT la décision
ILYOS_AUTOPSIE.exporter(4); // JSON, pour en faire un cas d'étude reproductible
```

`rejouer` rend la main sur la position exacte : on peut y essayer soi-même le
coup qu'on avait vu, ou relancer le planner après avoir modifié un poids.

## Ce qui est conservé par décision

Instantané d'avant décision (rejouable), plan retenu, cinq plans finalistes avec
leur décomposition, tous les candidats de la racine — retenus ET écartés par les
plafonds, chacun noté à un coup de profondeur —, décomposition de score terme à
terme, riposte adverse anticipée avec la menace chiffrée, temps de recherche et
de riposte, nombre d'états explorés, et le drapeau de repli sur la logique
historique.

Ce dernier point compte : un journal qui n'enregistrerait que les décisions
réussies rendrait invisibles les tours où le cerveau Expert n'a pas décidé du
tout.

## Deux garde-fous

**La décomposition doit être celle qui a décidé.** Toute contribution passe par
une fonction unique, et `verif-autopsie` contrôle que la somme des termes
retombe exactement sur la note du planner. Sans ce contrôle, la trace pourrait
décrire un évaluateur imaginaire et orienter les corrections à côté.

**Une note identique chez tous les finalistes est signalée.** C'est le symptôme
d'une décision jouée AVANT l'évaluateur : le pré-filtre n'a proposé que des
variantes équivalentes. Il est apparu dès la première partie observée — cinq
finalistes à −2066 ne différant que par la forme de l'île posée.

## Coût

Inactive par défaut. Hors autopsie, le surcoût se limite à un test de drapeau
par terme d'évaluation et par décision : les relevés de candidats et les
décompositions ne sont calculés que si l'enregistrement est levé, et les états
nécessaires ne sont même pas conservés. Les bancs le confirment — aucun score ne
bouge, dans aucun sens.

L'autopsie vit dans son propre fragment, `js/game/autopsie.js`, et non dans
`diagnostics.js` : elle doit fonctionner en partie réelle, alors que
l'outillage de banc a vocation à sortir du bundle en fin de chantier.

---

# Fidélité de la réserve — trois écritures d'une même règle

La règle tient en une phrase : réserve + cartes inutilisées de la main, jusqu'à
**5 par type**, tout surplus à la défausse. Elle était écrite à trois endroits.

## Ce que la troisième écriture faisait

`applyTurnTransitionCore`, la transition utilisée par l'anticipation V3,
recopiait la règle sur le seul `stash` :

```js
stash[type] = Math.min(5, stash[type] + fraîches);
hand = [];
```

`stash` n'est qu'un miroir. La réserve réelle est faite de cartes, et c'est elle
que lit `availableActionCount`. L'anticipation voyait donc, au tour suivant, une
réserve qui n'était pas celle que la partie aurait eue — et le surplus ne
partait jamais à la défausse, d'où la pioche se reconstitue.

Mesuré en remettant l'ancien code une minute, sur trois positions :

| position | actions vues au tour suivant | réellement |
|---|---|---|
| réserve 4 MOVE + main 3 MOVE | 4 / 0 / 0 | 5 / 0 / 0 |
| réserve pleine, main débordante | 5 / 5 / 0 | 5 / 5 / 1 |
| réserve vide, main ordinaire | **0 / 0 / 0** | 2 / 1 / 0 |

Le dernier cas est le plus parlant : l'IA anticipait un adversaire **sans une
seule action**. Elle sous-estimait donc systématiquement les ripostes.

Il n'y a plus qu'un corps, `rangerEtDefausserFinDeTour`, appelé par la vraie fin
de tour, le self-play et la transition simulée. Le prédicat « cette carte
survit-elle ? » est écrit une fois, et la projection pure lue par l'IA le
partage avec le rangement qui l'applique.

## Ce qui est jouable n'est pas ce qui est conservable

Le terme `reserve` comptait les cartes **disponibles maintenant**. Une sixième
MOVE ne verra jamais le tour suivant : lui donner une valeur de conservation
revenait à payer l'IA pour garder une carte qui allait être défaussée de toute
façon. `plannerRessourcesConservables` projette le plafond par type ; seules ces
cartes-là comptent.

Cela ne force rien : l'IA n'est pas poussée à dépenser son surplus. Une carte
qui ne peut plus être conservée ne vaut simplement plus rien à garder — si son
seul usage abîme la position, la recherche préfère toujours finir le tour et la
perdre.

## Le banc des scénarios adverses ne testait pas ce qu'il annonçait

Trouvé en écrivant les contrôles : `benchBuildSnapshot` posait `stash`, et la
migration qui fabrique les vraies cartes de réserve les puise dans la pioche —
que le banc laisse vide pour ne dépendre d'aucun tirage. **La réserve demandée
par un puzzle restait donc à zéro.** Les douze scénarios adverses, dont l'objet
même est d'anticiper ce que l'adversaire peut faire avec sa réserve, mesuraient
un adversaire sans moyens.

La réserve du banc est maintenant posée directement. Les douze scénarios passent
toujours — cette fois contre un adversaire réellement armé.

## Contrôles

`node scripts/verif-reserve.js` — 5 cas de rangement, 3 comparaisons vraie fin
de tour ↔ transition simulée, 3 mesures du terme d'évaluation.

Le terme est mesuré directement, et non par le comportement : à 5 points la
carte, une IA réglée sur des ressources fictives jouerait presque toujours
pareil. Le défaut serait resté invisible jusqu'à une position serrée.
