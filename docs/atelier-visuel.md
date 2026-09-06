# Atelier visuel local

Lancer `node scripts/dev-server.js 8138`, puis ouvrir
`http://localhost:8138/index.html?visualEditor=1`.
Un lien est également présent en haut de `ether-preview.html`.

Lancer une partie en 3D. Le panneau règle les objets de cette partie :
exposition, sélection du gardien, contour de déplacement, cible et destinations
de poussée, crâne de chute. Sélectionner un gardien et survoler les actions pour
faire apparaître leurs effets. Les marqueurs absents ne sont pas simulés.

- Un réglage « jeu » laisse le moteur décider. « modifié » applique une surcharge.
- Les valeurs × multiplient la valeur animée du jeu ; elles ne changent pas les hitboxes.
- « Essayer Éther » active une variante inspirée du laboratoire, dont son dessin de crâne.
- « Voir mes réglages » permet de comparer au rendu original à tout moment.
- Chaque flèche ↺ annule un réglage ; « Tout réinitialiser » annule tous les essais.
- Sauvegarder/Recharger conserve un profil dans ce navigateur et sur cette origine.
  Une sauvegarde n'est pas chargée automatiquement lors de l'ouverture.
- Exporter/Importer JSON permet de conserver et d'échanger les profils v1.
  Le JSON historique de la preview n'est pas compatible : ses paramètres avaient
  d'autres unités et portaient sur une scène différente.

Les profils s'appliquent uniquement au mode atelier. Pour adopter définitivement
un profil dans le jeu distribué, intégrer ses réglages validés aux sources du
rendu ; importer un JSON ne publie rien et n'écrit pas de fichiers du projet.

## Architecture

`immersion-fluidity.js` charge `visual-editor.js` seulement avec `visualEditor=1`.
Le panneau charge sa propre feuille de style, limitée à `#ilyosVisualEditor`.
Le rendu appelle `apply(kaykit3D)` avant le dessin et restaure les propriétés dans
un `finally`. Les animations, le thème existant, l'état de partie et les objets
de collision restent indépendants des essais. Aucune boucle d'animation ajoutée.
Les objets ajustables portent un `userData.visualRole` explicite ; pas de détection
fragile fondée sur leur couleur. Les ressources Éther sont réutilisées pendant
l'affichage d'une chute puis libérées lorsque le marqueur disparaît.

Pour ajouter un élément : lui attribuer un rôle dans `js/game/kaykit3d.js`,
déclarer les contrôles et leur validation dans `visual-editor.js`, puis appliquer
les propriétés avec restauration dans `apply`. Reconstruire `js/game.js` avec
`node scripts/build-game.js --write`.

Validation : `node tests/visual-editor.cjs` et `node scripts/build-game.js`.
