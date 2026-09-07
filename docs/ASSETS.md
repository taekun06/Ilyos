# Assets ILYOS — catalogue de travail

Relevé initial du 7 septembre 2026 : **801 fichiers / 81,00 Mo dans `assets/`** ;
**810 fichiers / 83,19 Mo** en incluant `menu/assets/` et `vendor/`.
Mo = 1 000 000 octets. C'est le stockage local, pas le téléchargement initial.

Actualiser : `npm run assets:audit`. Sortie exploitable par un outil :
`node scripts/audit-assets.js --json`. L'inventaire ne modifie aucun asset.

## Ressources gratuites à privilégier

| Source | Usage dans ILYOS | Condition |
|---|---|---|
| [KayKit Adventurers](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0) | Gardiens, accessoires, animations ; cohérence avec l'existant | Pack public CC0 ; distinguer les éditions EXTRA payantes |
| [KayKit Skeletons](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0) | Variantes déjà présentes | Pack public CC0 |
| [KayKit Medieval Hexagon](https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0) | Bâtiments et accessoires du plateau | Pack public CC0 |
| [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) | Sélection, boutons et retours d'action | CC0 indiqué sur la fiche |
| [Cloudy Skyboxes](https://screamingbrainstudios.itch.io/cloudy-skyboxes-pack) | Ciels déjà intégrés ; variantes locales disponibles | CC0, historique dans `assets/sky/LICENSE.txt` |
| [Poly Haven](https://polyhaven.com/license) | HDRI/textures si besoin précis | Assets CC0 ; sélectionner de petites résolutions adaptées au web |

Pour commencer, réutiliser KayKit et les ciels locaux. Télécharger seulement les
éléments retenus ; un gros catalogue importé ne rend pas automatiquement le jeu meilleur.

## Provenance des fichiers déjà présents

Les liens de packs ci-dessus correspondent aux origines déclarées par le code.
Ils ne constituent pas une vérification fichier par fichier de toutes les variantes.

| Chemin | Provenance / état du relevé |
|---|---|
| `assets/kaykit/characters`, `adventurerAssets`, `adventurerTextures` | Pack Adventurers référencé dans `kaykit3d.js`. Retrouver l'archive/version exacte des variantes locales avant redistribution isolée |
| `assets/kaykit/skeletonCharacters` | Pack Skeletons référencé dans `kaykit3d.js` |
| `assets/kaykit/medieval`, `medievalTextures` | Pack Medieval Hexagon référencé dans `kaykit3d.js` |
| `assets/kaykit/forestNature`, `blockBits` | Origine exacte et preuve locale à compléter ; ne pas attribuer une licence par le seul nom du dossier |
| `assets/sky/sky-band-*` | Source et transformations consignées dans `assets/sky/LICENSE.txt` |
| `assets/sky/ilyos-horizon-*` | Images générées pour ILYOS d'après le même fichier de provenance |
| `assets/sky/source/*`, atlas et manifeste | Pipeline local `scripts/build-horizon-islands.js` ; historique de génération à compléter |
| `assets/hud`, `assets/image-*`, icônes et `menu/assets/*` | Provenance détaillée à compléter ; ne pas les déclarer CC0 par défaut |
| `vendor/*` | Bibliothèques embarquées ; conserver leurs notices, distinctes des licences des images/modèles |

Pour chaque ajout, noter : chemin final, auteur, URL précise, version/date,
licence/preuve, transformation et rôle dans le jeu. Aucune licence globale des
assets n'est déduite du statut du code du dépôt.

## Circuit d'intégration

1. Choisir une fonction visible : gardien, décor, bouton ou son. Garder la palette,
   les silhouettes lisibles et l'échelle des ressources existantes.
2. Prévisualiser le modèle dans VS Code avec glTF Tools, puis vérifier textures,
   squelette, clips d'animation, origine et orientation.
3. Conserver les sources ; exporter une copie destinée au jeu avec un nom clair.
   Éviter les variantes inutilisées dans le chargement initial.
4. Intégrer dans le système de chargement existant, puis comparer en jeu : pose,
   marche, rotation, chute, ombres, contours et point de vue caméra.
5. Mesurer le poids chargé, le temps d'ouverture et la fluidité dans le navigateur.
   Les personnages sont actuellement les fichiers individuels les plus lourds
   (environ 3,6 à 4,9 Mo). Leur taille seule ne révèle pas leur coût GPU.
6. Si l'URL d'un asset change de contenu, gérer son nom/version et le cache `sw.js`
   avant publication. Le serveur local envoie déjà des en-têtes sans cache.

## Optimisation : compatibilité d'abord

Le jeu utilise Three.js r128 et des chargeurs embarqués. Une compression glTF
moderne peut demander un décodeur ou une extension absente du jeu. Tester chaque
transformation sur une copie ; ne pas lancer une optimisation destructive globale.
[glTF Transform](https://gltf-transform.dev/) propose notamment déduplication,
redimensionnement de textures et compression ; le choix doit suivre les capacités
du chargeur réellement utilisé. Aucun changement de format n'a été appliqué ici.
