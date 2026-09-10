# Musiques ILYOS

## Mode Puzzle — séquence V1

Le Cabinet d’énigmes utilise trois fichiers :

- `Intro.mp3` — joué une seule fois à l’entrée du mode Puzzle ;
- `2.mp3` — première ambiance de jeu ;
- `3.mp3` — seconde ambiance de jeu.

Ordre de lecture :

```text
Intro → 2 → 3 → 2 → 3 → …
```

Recommencer une énigme ou revenir à la liste des Sanctuaires ne relance pas l’Intro. La playlist s’arrête seulement lorsque le joueur quitte complètement le mode Puzzle. Les bruitages restent actifs et le volume suit les réglages Son d’ILYOS.

Le contrôleur est `js/puzzle-music-v2.js`. Si un fichier est absent ou illisible, le jeu revient proprement à son ambiance normale sans bloquer le mode Puzzle.

## Fichiers fournis

- MP3, stéréo, 44,1 kHz ;
- `Intro.mp3` : environ 1 min 47 s ;
- `2.mp3` : environ 1 min 40 s ;
- `3.mp3` : environ 2 min 20 s.

## Licence

Avant publication, renseigner la provenance et la licence de chaque morceau dans `docs/ASSETS.md` et vérifier que l’utilisation dans un jeu distribué ou commercial est autorisée.
