# Tests de bout en bout

Une partie entière, IA contre IA, jouée dans un vrai navigateur — du chargement
de la page à l'écran de victoire. C'est le seul test automatisé du dépôt, et il
couvre volontairement large plutôt que fin : pose d'île, invocation, marche,
poussée, magie, couronnes, alternance des tours, détection du vainqueur.

Il ne teste aucune règle une par une. Il vérifie qu'une partie **se joue**, et
que rien ne tombe en route : aucune exception non rattrapée, aucun
`console.error`, aucune ressource manquante.

## Lancer les tests

```
npm install
npm run test:install   # une seule fois : télécharge Chromium
npm test
```

Pour voir la partie se jouer :

```
npm run test:headed
```

Le serveur de développement est démarré et arrêté par Playwright, sur le port
**8124** — pas 8123, pour ne pas se disputer le port avec une session de travail
ouverte à côté. Après un échec, `npx playwright show-trace test-results/…` rejoue
la partie pas à pas, avec le DOM, la console et le réseau de chaque instant.

## Durée

Une partie Expert contre Expert se conclut en une trentaine de tours, soit
environ quatre minutes. C'est du temps réel : les bots attendent la fin de
chaque animation, comme un joueur humain. Le test échoue au bout de 90 secondes
sans que le compteur de tours bouge, plutôt que d'attendre son expiration.

## Ce sur quoi il s'appuie

Rien n'a été ajouté au jeu pour ces tests. Ils pilotent `window.ILYOS_TEST`,
le harnais qui vit déjà dans [`js/game/diagnostics.js`](../js/game/diagnostics.js) :

- `ILYOS_TEST.playAIvsAI({ difficulty, maxTurns })` — prépare un duel sur
  plateau classique, bascule les deux joueurs en IA et lance la partie ;
- `ILYOS_TEST.autoplay` — l'état vivant de la partie automatique : `active`,
  et un journal `logs` dont la dernière entrée porte la raison de l'arrêt
  (« Victoire de … en N tours », ou la limite de tours atteinte).

Si un test doit un jour piloter une configuration précise (nombre de joueurs,
préréglage symétrique, taille de plateau, minuterie), c'est
`window.ILYOS_API.launchConfiguredGame()` qu'il faut appeler — même fichier.
