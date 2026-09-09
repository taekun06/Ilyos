# Musique ILYOS

Ce dossier accueille les soundtracks longues du jeu.

## V1 simple

Pour la première intégration, utiliser un seul fichier principal :

- `gameplay-01.mp3`

Le fichier sera lu en boucle par le moteur audio existant d’ILYOS, avec le volume Musique du menu Son et le système de cache des assets déjà présent.

## Format conseillé

- MP3
- 44,1 ou 48 kHz
- stéréo
- 160 à 192 kb/s pour une bonne qualité sans poids excessif

Ne pas normaliser trop fort : garder un peu de marge afin que les bruitages restent lisibles par-dessus la musique.

## Licence

Avant publication, renseigner la provenance et la licence de chaque morceau dans `docs/ASSETS.md` et vérifier que l’utilisation dans un jeu distribué/commercial est autorisée.
