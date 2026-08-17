# ILYOS — Character Materials V1

Branche : `visual-characters-materials-v1`

## Diagnostic factuel

- `assets/kaykit/characters/Knight.glb` et `Mage.glb` sont les fichiers officiels KayKit non modifiés : leurs SHA Git correspondent aux fichiers du dépôt officiel KayKit.
- Chaque personnage possède sa texture dédiée (`knight_texture.png`, `mage_texture.png`). Le pack KayKit Adventures documente une texturation par atlas de gradient unique, ce qui signifie qu'un même matériau texturé peut représenter plusieurs zones visuelles.
- `repairKayKitAssetMaterials()` configure les textures et limite seulement roughness/metalness ; il ne recolore pas les personnages.
- La dérive apparaît ensuite dans `styleKnightMetalArmor()` et `styleMagePalette()` : ces fonctions cloneraient les matériaux et remplacent `material.color` en fonction de noms génériques.
- Mage : les motifs `body`, `torso`, `cloth`, etc. peuvent entraîner une teinte violette sur un atlas partagé. Tout matériau non préservé est actuellement forcé vers violet principal/ombre ou cyan.
- Knight : tout matériau non identifié comme peau/visage est actuellement forcé vers un gris métallique avec `metalness=.78` et `roughness=.26`, d'où l'aspect acier uniforme.

## Limite de l'audit hors navigateur

Les noms internes exacts de meshes/materials sont stockés dans le GLB binaire. L'API GitHub utilisée ici confirme les fichiers, tailles, SHA et textures, mais ne décode pas la table JSON interne du GLB.

La branche expose donc un audit runtime exact :

```js
window.ILYOS_CHARACTER_MATERIAL_AUDIT.report()
```

À lancer dans la console une fois une partie ouverte. Le résultat contient pour `hero0` (Knight) et `hero1` (Mage) :

- nom de chaque mesh ;
- nom de chaque matériau ;
- présence d'une texture ;
- nom/source de texture lorsqu'exposé par Three.js ;
- couleur ;
- roughness ;
- metalness ;
- emissive ;
- liste des accents réellement appliqués.

## Stratégie V1

Le module `js/character-materials-v1.js` s'applique au moment où un `CharacterVisual` est enregistré.

1. Il retrouve la scène source officielle dans `kaykit3D.assets`.
2. Il restaure les propriétés natives du matériau source sur le clone affiché.
3. Si le matériau possède une `map` (texture atlas), aucune couleur de faction n'est appliquée.
4. Seuls les matériaux sans texture et portant des noms explicites peuvent recevoir un accent.

### Mage

Accents possibles uniquement sur matériau non texturé :

- gem/orb/crystal/magic/arcane/jewel -> cyan `#55C8D0` ;
- hat/hood/cape/robe/dress/sleeve -> violet `#8052BC`.

Les termes génériques `body`, `torso`, `cloth` ne sont volontairement plus utilisés pour décider une recoloration.

### Knight

Accents possibles uniquement sur matériau non texturé :

- trim/emblem/badge/buckle/ornament/gold/jewel -> or `#DDB653` ;
- armor/armour/plate/helmet/helm/gauntlet/pauldron/mail/metal -> acier chaud `#AEB2B0`.

Tout matériau texturé conserve sa couleur KayKit native.

## Sécurité

Cette passe ne modifie pas :

- GLB ou PNG KayKit ;
- AnimationMixer / clips ;
- positions, tailles ou collisions ;
- ombres Three.js ;
- caméra ;
- ciel ;
- terrain ;
- villages ;
- effets de magie ;
- gameplay ;
- HUD / portraits HUD ;
- menu / typographies.

Aucun nouveau renderer, shader, post-processing ou boucle par frame n'est ajouté.

## Contrôle visuel

Tester au minimum :

1. lancer un Solo ;
2. regarder le Mage en pleine lumière et dans l'ombre ;
3. vérifier que visage/peau ne deviennent plus cyan/violet ;
4. vérifier que le Knight retrouve les nuances de sa texture KayKit au lieu d'un gris uniforme ;
5. déplacer/pousser/lancer une magie pour confirmer que les animations restent intactes ;
6. sélectionner les gardiens pour vérifier que les effets de sélection existants fonctionnent toujours ;
7. contrôler les ombres au sol ;
8. exécuter `ILYOS_CHARACTER_MATERIAL_AUDIT.report()` pour connaître les noms réels et voir quels accents ont effectivement été appliqués.
