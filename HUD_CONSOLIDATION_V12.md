# ILYOS — HUD Consolidation V12

Cette branche est la base de consolidation du HUD Organique V2.

## Source de vérité

- Base : `main` au moment de création de `hud-consolidation-v12`.
- Ne pas réactiver en bloc `hud-organique-v2`, `hud-context-fixes-v11` ou `hud-v2`.
- Les anciennes branches servent seulement de banque de correctifs à comparer.

## Choix visuels verrouillés

- HUD Organique V2 direct au-dessus du rendu Three.js.
- Portrait KayKit Knight à gauche, Mage à droite.
- Taille actuelle des icônes d'action conservée.
- Bouton Menu/engrenage entre TOUR et le timer.
- Textes et quantités toujours lisibles, même lorsqu'une action est indisponible.
- Pas de compteur Undo.
- La ligne dorée reste sous les quantités et conserve sa longueur actuelle.
- Le fondu des rubans joueurs dans le ciel est volontaire : ne pas le supprimer par une ombre ou un fond opaque supplémentaire.
- Profondeur/socles V10 conservés.

## Correctifs récupérés dans V12

- Positionnement des tiroirs contextuels au-dessus de l'instruction.
- Espacement supplémentaire entre les formes du tiroir d'île uniquement.
- Fermeture fiable du tiroir d'île lors d'Undo, y compris après rerender.
- Une seule barre de rotation dédiée au placement d'île.
- Détection de la rotation de placement via la visibilité de `#hudV2IslandRotate`, afin d'éviter le doublon pendant Magie.
- Réutilisation des vrais boutons `rotateLeftBtn`, `rotateRightBtn` et `cancelCardBtn`.
- Positionnement cohérent des contrôles Magie et Poussée.
- Étoiles d'instruction attachées à la largeur réelle du texte.

## Fichiers canoniques ajoutés

- `css/hud-consolidation-v12.css`
- `js/hud-consolidation-v12.js`

Ils sont chargés en dernier par `js/version-bootstrap.js` avec `?v=12`.

## Important

Aucune règle de jeu n'est définie dans ces fichiers. Ils ne font que présenter le HUD et relayer vers les contrôles/handlers historiques déjà présents dans le moteur.

Ne pas fusionner cette branche dans `main` avant validation visuelle et fonctionnelle du tiroir d'île, Undo, rotation, Magie, Poussée et rendu responsive.
