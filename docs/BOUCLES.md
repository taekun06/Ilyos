# Mode Boucles — note de conception

Mode solo où le temps revient en arrière. Code : `js/game/boucles.js`
(fragment du bundle, placé après `puzzle-levels.js`). Test :
`tests/boucles.spec.js`.

## Règles

- Un sanctuaire fixe un nombre de **battements** par boucle et un nombre de
  **boucles**. À chaque battement, chaque Gardien fait une seule action.
- Chaque Gardien a une **main** pour sa boucle : pas, poussées, magies (la
  main est fixée par le sanctuaire). Attendre est toujours possible.
- À la fin d'une boucle, le plateau revient au départ. Ton Gardien devient un
  **écho** qui rejoue ses ordres, et tu te réveilles sur le socle suivant.
- Un écho est **aveugle** : il retient « un pas vers l'est », jamais une
  destination. S'il est bloqué, il **reste sur place**.
- Les plus anciens agissent d'abord, le Gardien vivant en dernier.
- **Pas** : vers une case d'île libre. **Poussée** (force 1) : déplace toute
  la ligne contiguë devant soi ; un Gardien poussé hors d'une île tombe ; la
  couronne poussée au-dessus du vide glisse jusqu'à la première île (échec si
  la case est occupée ou hors du plateau).
- **Magie** : quart de tour horaire de l'île sous soi autour de son pivot, avec
  tout ce qu'elle porte ; échec si elle chevauche une autre île ou sort.
- **Victoire** : la couronne posée (pas portée) sur la porte dorée.

## Sanctuaires

| Id | Nom | Plateau | Battements | Boucles | Main (pas/poussée/magie) |
|----|-----|---------|-----------|---------|------|
| b1-relais | Le Relais | 6×3 | 3 | 2 | 2/1/0 |
| b2-pivot | Le Pivot | 6×6 | 3 | 3 | 2/1/1 |
| b3-cascade | La Cascade | 7×8 | 5 | 5 | 3/1/1 |

Le nombre de boucles est un **minimum prouvé** : chaque Gardien n'a qu'une
poussée, et en relâchant le problème (plateau sans Gardiens, poussées libres)
la couronne a besoin d'exactement ce nombre de poussées pour atteindre la
porte. Pour le Relais et le Pivot, un solveur exhaustif a aussi confirmé
qu'aucune solution n'existe avec une boucle de moins.

`ILYOS_BOUCLES.verifier()` rejoue la solution de référence de chaque
sanctuaire sur le noyau de règles pur (`bouclesMoteur`) et contrôle la
victoire, le nombre de boucles et le respect des mains.

## Rendu

Le mode garde son propre noyau de règles et recopie l'état dans `state` pour
le rendu KayKit (îles, Gardiens, couronne), comme le mode puzzle. Les échos
sont les mêmes modèles rendus translucides. Repères 3D légers (anneaux de
couleur, flèches de choix, porte, socles) dans un seul groupe ajouté à la
scène, sans particules.

Commandes : flèches (relatives à la caméra) = pas, Maj + flèche ou P = poussée,
M = magie, Espace = attendre, Z ou Retour arrière = annuler.
