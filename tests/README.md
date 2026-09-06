# Tests de bout en bout

Une partie entière, IA contre IA, jouée dans un vrai navigateur — du chargement
de la page à l'écran de victoire. C'est le test le plus large du dépôt, et il
couvre volontairement large plutôt que fin : pose d'île, invocation, marche,
poussée, magie, couronnes, alternance des tours, détection du vainqueur. Deux
autres l'accompagnent, plus ciblés : le tutoriel Découverte et le contrat de la
caméra, décrits plus bas.

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

---

# Contrat de la caméra

`camera-partie-solo.spec.js` vérifie une règle et une seule : **la caméra
assistée possède le sujet, le joueur possède le point de vue**. Tourner,
incliner et zoomer ne font donc pas sortir du mode AUTO ; seul le pan, qui
revendique le même point visé que l'AUTO, rend la main.

Il verrouille aussi le cadrage canonique de la vue de face, aux deux bouts : à
l'ouverture de la partie et après ESPACE. C'est ce qui manquait quand trois
fonctions différentes répondaient à « à quelle distance est la vue de face »
— le preset à 17, `kaykitFitDistance` à 11,85, et `kaykitPositionForView` qui
gonflait la demande de 4,2 %. La partie s'ouvrait alors sur un cadrage et
ESPACE en rendait un autre, sans que rien ne le signale.

**Il démarre une vraie partie solo, par le menu.** L'écran de configuration solo
vit dans l'iframe du menu, pas dans la page hôte : `#setupScreen` existe mais
n'est jamais visible, et le bouton de lancement s'appelle « AFFRONTER LE CPU ».
`ILYOS_TEST.playAIvsAI()` ne convient pas ici — elle monte son propre duel IA
contre IA, où le recadrage de début de tour ne se déclenche jamais (il est sous
`if (!p.isAI)` dans `js/game/turns.js`).

Durée : moins d'une minute.

---

# Empreinte de style calculé

`scripts/empreinte-css.js` répond à une question que ni un diff ni une capture
d'écran ne savent trancher : **est-ce que ce changement de CSS a modifié le
rendu de quelque chose, quelque part ?**

Il parcourt tous les éléments de la page, dans quatre états de jeu, et relève
pour chacun son rectangle et 55 propriétés calculées. Deux relevés se comparent
ensuite propriété par propriété.

```
npm run empreinte -- .empreintes/avant.json
   ... modifier le CSS ...
npm run empreinte -- .empreintes/apres.json
npm run empreinte:comparer -- .empreintes/avant.json .empreintes/apres.json
```

Le serveur doit tourner sur le port 8126 (`node scripts/dev-server.js 8126`),
ou passer `--port`. Les sorties vont dans `.empreintes/`, qui n'est pas
versionné.

> **Relever sur une machine au repos.** Une paire de relevés prise pendant qu'un
> `npm test` tournait à côté a donné 93 écarts sur un code identique — hauteurs
> de texte, disposition du menu, joueur actif. Les mêmes deux relevés, machine
> libre : zéro.

## Ce que l'outil garantit, et ce qu'il ne garantit pas

Le déterminisme a coûté quatre itérations, et chacune a appris quelque chose —
c'est consigné dans l'en-tête du script. En résumé :

- **Reproductible** : le menu, une partie neuve à deux joueurs locaux, la
  fenêtre des règles, le menu Son. Deux relevés du même code donnent zéro écart.
- **Pas reproductible, et écarté pour cette raison** : tout état atteint en
  laissant l'IA jouer. Le nombre d'actions qu'elle place dans un tour dépend du
  temps réel, donc deux parties ne consomment pas la même suite de nombres
  aléatoires et divergent — 134 écarts mesurés entre deux exécutions identiques.
- **Neutralisé** : `Math.random` (remplacé par un générateur à graine), les
  animations (ramenées à leur première image), et la classe `v69-fps-low`, qui
  dépend de la vitesse de la machine et non du CSS.

## Ce qu'il a trouvé du premier coup

En cherchant à se rendre déterministe, l'outil a mis au jour un bug bien réel :
les passes V10 et V12 construisent toutes deux le bandeau d'instruction du HUD,
et leurs scripts étaient injectés dynamiquement sans `async = false`. Un script
créé par script est asynchrone par défaut — `defer` n'a aucun effet sur lui — si
bien que l'ordre d'exécution suivait l'ordre d'arrivée du réseau. Le bandeau
changeait donc de typographie d'un chargement à l'autre, Almendra ou Georgia
selon la course. Corrigé dans les deux injecteurs.

---

# Audit des `!important`

`scripts/audit-important.js` répond à la question qui bloque la mise en couches :
sur les 10 186 déclarations prioritaires du dépôt, **lesquelles arbitrent
réellement un conflit ?**

Pour chaque règle et chaque propriété déclarée en `!important`, le script compte
combien de règles déclarent cette même propriété sur les mêmes éléments. Une
seule : le drapeau n'arbitre rien. Plusieurs : il porte peut-être quelque chose.

```
npm run audit:important
npm run audit:important -- --corriger css/base.css
```

## L'état des lieux, mesuré le 25 août 2026

| | |
|---|---|
| Règles | 2 619 |
| Déclarations `!important` | 10 186 |
| Sans aucun concurrent | **4 070 (40 %)** |
| Règles n'atteignant aucun élément | 1 044 |

## Pourquoi `--corriger` n'en retire que 86

Il ne touche qu'aux règles dont **toutes** les déclarations prioritaires sont
sans concurrent, et qui atteignent au moins un élément. Deux conditions, deux
raisons :

- **Tout ou rien**, parce qu'un raccourci comme `margin: 0 !important` s'écrit
  une fois mais produit quatre déclarations longues. Si l'une est contestée et
  pas les autres, retirer le drapeau du raccourci changerait le rendu.
- **Règle vivante**, parce qu'une règle qui n'atteint rien ressort
  mécaniquement « sans concurrent » faute de concurrent observable. C'est une
  absence de preuve, pas une preuve d'absence — et l'empreinte ne pourrait pas
  l'infirmer, puisqu'elle mesure les mêmes états.

Résultat : 86 déclarations sur 10 186, soit 0,8 %. Presque chaque règle mélange
du contesté et du non contesté, donc le tout-ou-rien ne se déclenche presque
jamais.

**Pour aller plus loin, il faut travailler déclaration par déclaration**, ce qui
suppose de savoir en quelles propriétés longues chaque raccourci se développe.
Le moteur sait le faire — `element.style.setProperty(raccourci, valeur)` puis
énumération — mais ce n'est pas encore branché ici. C'est le prochain pas, et
c'est lui qui ouvre les 40 %.
