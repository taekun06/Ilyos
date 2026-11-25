# Retours des joueurs

Ce que le jeu envoie à la fonction Netlify `/api/retours`
(`netlify/functions/retours/`), et où le lire.

| Envoi | Déclenché par | Contenu |
|---|---|---|
| Bug ou avis | ⚙ › SIGNALER UN BUG (accueil) ou Menu › Partie › Aider ILYOS | texte, contact facultatif, version, navigateur, écran, 8 dernières erreurs ; en partie, la partie en cours si la case est cochée |
| Erreur du jeu | toute erreur JavaScript non rattrapée (`js/retours.js`) | message, fichier/ligne, pile ; au plus 5 par session ; regroupées côté serveur |
| Victoire contre l'Expert | fin de partie gagnée par un humain contre le CPU Expert (`js/game/defaites.js`) | le dossier « defaite-expert » complet, lisible par `scripts/analyser-defaite.js` ; le joueur peut refuser (Menu › Partie › Aider ILYOS, clé `ilyosEnvoyerVictoires`) |

## Réglages Netlify (à faire une fois)

Netlify › site batbat › Site configuration › Environment variables :

- `RETOURS_CODE` : code secret de la page privée `retours.html`
  (https://taekun.fr/retours.html).
- `RETOURS_DISCORD` (facultatif) : adresse d'un webhook Discord
  (Discord › ton serveur › salon › Modifier › Intégrations › Webhooks ›
  Nouveau webhook › Copier l'URL). Une notification par bug, avis, victoire
  et nouvelle erreur, la partie jointe en fichier.

Les variables sont lues au déploiement suivant. L'adresse Discord ne sort
jamais du serveur.

## Où c'est rangé

Netlify Blobs, magasin `retours` (commun à la production et aux préversions).
Tant que la production Netlify est figée, taekun.fr appelle la préversion de
la PR qui a ajouté la fonction (voir `URLS` dans `js/retours.js` et
`retours.html`), comme pour la sauvegarde en ligne.

## Vérifier

`node scripts/verif-retours.mjs` (logique seule). En local, `npm start` sert
aussi `/api/retours` en mémoire ; code de la page privée : `dev`.

## Analyser les victoires pour améliorer le CPU

Chaque partie est rangée compressée (≈ 30 Ko au lieu de ≈ 0,6 Mo).

Les victoires contre l'Expert se lisent **sans code** (lecture seule : rien
que les coups de la partie, jamais les bugs, avis, contacts ni erreurs, qui
restent derrière `RETOURS_CODE`) :

```
node scripts/recuperer-victoires.mjs retours-victoires
npm start
node scripts/analyser-defaite.js retours-victoires/ilyos-defaite-<id>.json
```

Sans code, le script reprend toutes les victoires et saute celles déjà
présentes dans le dossier : dans une session Claude, utiliser un dossier qui
dure (`/mnt/project-files/analyse-defaites/victoires/`).

Avec le code (`ILYOS_RETOURS_CODE=<code> … --marquer`), `recuperer-victoires.mjs` ne prend que les victoires pas encore analysées et,
avec `--marquer`, les marque sur le serveur : la session suivante ne reprend
que les nouvelles. Dans une session Claude, donner le code par une variable
d'environnement secrète de l'environnement (`ILYOS_RETOURS_CODE`) plutôt que
dans la conversation.
