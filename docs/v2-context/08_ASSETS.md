# 08 — Assets et direction visuelle

Ce fichier aide V2 à savoir **ce qui existe déjà**. Il ne suppose pas que tous les fichiers doivent être réutilisés.

## Inventaire V1

Audit documenté le 7 septembre 2026 :
- environ **801 fichiers / 81,00 Mo** dans `assets/` ;
- environ **810 fichiers / 83,19 Mo** en incluant `menu/assets/` et `vendor/`.

Actualiser avant décision :

```sh
npm run assets:audit
node scripts/audit-assets.js --json
```

## Sources identifiées

`docs/ASSETS.md` documente notamment :

| Source | Usage V1 connu | Statut indiqué |
|---|---|---|
| KayKit Adventurers | Gardiens, accessoires, animations | pack public CC0 ; vérifier les variantes EXTRA |
| KayKit Skeletons | variantes de personnages | pack public CC0 |
| KayKit Medieval Hexagon | bâtiments/accessoires | pack public CC0 |
| Kenney Interface Sounds | sons d'interface | CC0 indiqué sur la source |
| Cloudy Skyboxes | ciel / variantes locales | CC0, historique local |
| Poly Haven | source potentielle HDRI/textures | assets CC0 selon la source |

Toujours vérifier la provenance exacte du fichier réellement utilisé avant redistribution.

## Zones dont la provenance est à compléter

Le dépôt signale explicitement des lacunes pour certains dossiers, notamment :
- `assets/kaykit/forestNature` ;
- `assets/kaykit/blockBits` ;
- certains `assets/hud` ;
- `assets/image-*` ;
- icônes et `menu/assets/*`.

La présence dans le repo n'est **pas** une preuve de licence.

## Direction artistique recherchée

**Direction répétée dans le projet, à préserver comme intention plutôt que comme pipeline :**
- archipels/îles flottantes ;
- fantasy stylisée ;
- architectures crème / pierre claire / or ;
- roche violette ou lavande ;
- lumière chaude dorée, ombres plus froides ;
- grand ciel, nuages et profondeur atmosphérique ;
- cascades et végétation parcimonieuse ;
- magie lumineuse et lisible ;
- silhouettes de Gardiens simples à reconnaître à distance de plateau.

Des assets d'îles 2D/illustrés et des travaux de skybox ont aussi été explorés autour du projet ; vérifier leur présence/licence réelle avant intégration V2.

## Gardiens

V1 utilise des packs KayKit et possède déjà des choix de personnages/animations. Les modèles de personnages font partie des fichiers individuels les plus lourds du projet (plusieurs Mo selon l'audit V1).

Pour V2, décider après prototype si :
- ces modèles sont réutilisés ;
- ils servent seulement de placeholder ;
- une nouvelle DA personnage est préférable.

Ne pas laisser la disponibilité d'un asset décider à elle seule de l'identité V2.

## Ciel et horizon

V1 possède :
- `assets/sky/` ;
- bandes de ciel / horizons ;
- sources et pipeline local de génération d'îlots lointains ;
- un environnement 3D centralisé dans `kaykit3d.js`.

**Enseignement :** la profondeur d'ILYOS dépend beaucoup de l'environnement lointain et pas seulement du plateau. V2 devrait évaluer le ciel, le brouillard, les silhouettes lointaines et la lumière comme un système cohérent.

## Audio

Le repo contient des musiques et bruitages, dont des pistes dédiées à la campagne/Puzzles (`Intro.mp3`, `2.mp3`, `3.mp3`, etc. selon la branche/main). La provenance/licence doit être vérifiée fichier par fichier avant réutilisation dans une nouvelle distribution.

## Règle pour Astra

Avant de télécharger ou générer de nouveaux assets :

1. déterminer la fonction visuelle/sonore requise ;
2. vérifier si un asset V1 couvre déjà cette fonction ;
3. vérifier licence + coût technique ;
4. comparer avec une alternative si l'asset V1 contraint excessivement V2.

Le pack sert à éviter de rechercher deux fois la même ressource, pas à transformer `assets/` en catalogue obligatoire.
