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
