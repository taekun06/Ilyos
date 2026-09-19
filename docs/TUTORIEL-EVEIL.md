# TUTORIEL — « L'ÉVEIL »

Document de conception. Écrit avant le code, arbitré avec l'auteur du jeu.
Statut : **ACTES I et II livrés et joués en 3D.** Actes III et IV à écrire.

---

## 1. Le pitch

On se réveille seul sur un caillou, au-dessus du vide, sans rien savoir. On
ressort en sachant jouer une partie complète contre l'IA. **Pas un mot, pas une
consigne, pas un panneau.** Entre les deux, une suite de découvertes dont
chacune doit être un petit plaisir.

Le tutoriel n'est pas un cours qui précède le jeu : c'est le jeu, avec de la
lumière posée dessus, et la lumière s'éteint à mesure qu'on n'en a plus besoin.

### La loi qui commande tout l'ordre

> **Chaque découverte doit créer le manque qui appelle la suivante.**

On n'enchaîne pas des leçons. On installe une frustration, puis on donne le
verbe qui la résout. Le joueur n'apprend pas « la pose d'île » : il est coincé
sur un caillou trop petit, et il découvre qu'il peut fabriquer le monde.

---

## 2. Les décisions prises

| Question | Décision |
|---|---|
| Entrée | **Souris et manette à parité.** Le tutoriel se juge sur l'ÉTAT du moteur plutôt que sur le geste. |
| Forme | **Parcours scénarisé**, un monde continu qui grandit, pas des tableaux séparés. |
| Ordre | Le Corps → Le Monde → **L'Autre** → **Le Temps** (l'économie des cartes en dernier). |
| Portée | Tout : gestes, île, invocation, couronne, relais, poussée, chute, magie, tour, réserve, annulation. |
| Durée | **Longue, sans limite.** Reprise à l'étape exacte. |
| Erreur | **Rien n'est bloqué.** L'annulation est le filet. |
| Dernier recours | **Un Gardien fantôme fait le geste**, puis s'efface. |
| Guide | **Un compagnon lumineux**, vivant, muet. |
| Symboles | **Des runes du monde**, gravées ou tracées dans l'air. Zéro mot. |
| Fin | Écran de fin, puis choix (vraie partie / menu). |
| Récompense | Le monde s'agrandit et s'allume · un moment de bravoure · un pouvoir de plus dans les mains. Décliné au cas par cas. |

---

## 3. La grammaire muette

Un signe = un sens, partout, pour toujours. Le joueur n'apprend jamais un mot :
il apprend **sept signes**, une seule fois, dans les trois premières minutes.

| Signe | Sens | Rendu |
|---|---|---|
| **LE COMPAGNON** | « regarde là » | Une lueur vivante qui vole jusqu'à ce qui compte et s'y pose. S'impatiente, exulte, se cache quand on n'a plus besoin d'elle. |
| **L'APPEL** | « c'est ici » | Balise de lumière sur la case, respiration du verbe au HUD. Deux intensités, jamais plus. |
| **LA PROMESSE** | « voilà ce qui va arriver » | Fil de lumière départ → arrivée, anneau sur la destination. Trajectoire de poussée, silhouette de l'île pivotée. |
| **LA RUNE** | la notion abstraite | Un signe gravé qui appartient à la fiction : l'œil (regarder), la flèche (pousser), le sablier (le tour), le cercle fermé (la réserve). Jamais plus d'une à l'écran. |
| **LE REFUS** | « pas ça » | Le geste s'amorce et se rétracte, le monde se ternit un quart de seconde, son mat. Rien n'est bloqué. |
| **L'ASSENTIMENT** | « oui » | Éclat chaud, accord qui résout, et **une conséquence visible dans le monde**. |
| **LE SOUFFLE** | « regarde ce qui arrive » | La caméra cadre, letterbox, le joueur n'a pas la main. Court, et toujours rendu. |

### Le huitième signe, réservé

**LE FANTÔME** — une silhouette translucide du Gardien qui exécute le geste
attendu, puis s'efface sans rien changer à l'état. C'est le dernier recours, au
bout d'une longue hésitation. Il montre ; il ne fait pas à la place.

### Le son

`playSfx` expose déjà `move`, `push`, `fall`, `island`, `magic`, `rotate`,
`spawn`, `crown`, `card`, `turn`, `victory`. La grammaire s'appuie dessus :
l'Assentiment a toujours un son, le Refus a un son mat, le Compagnon a une
petite voix sans paroles. Un tutoriel muet sans son n'est pas contemplatif, il
est cassé.

---

## 4. L'aide progressive

Elle monte sur **l'immobilité**, jamais sur l'horloge seule. Faire tourner le
monde, survoler, ouvrir un verbe : tout ça est de l'activité et remet le
compteur à zéro. Quelqu'un qui regarde n'est pas quelqu'un qui bloque.

| Immobile depuis | Ce qui arrive |
|---|---|
| ~8 s | Le compagnon se pose sur ce qui compte. |
| ~16 s | L'Appel s'allume, la caméra recadre la zone utile. |
| ~26 s | La Promesse s'offre : le fil, la trajectoire. |
| ~38 s | **Le Fantôme** joue le geste, une fois, puis s'efface. |
| 2 échecs de suite | La caméra s'éloigne, l'étape suivante s'ouvre. Sortie honorable, sans un mot. |

---

## 5. Le parcours

### ACTE I — LE CORPS · « qu'est-ce que je suis ? »

Un Gardien. Un caillou de quelques cases. Le vide tout autour. Rien d'autre au
monde, et le HUD est éteint.

1. **L'éveil** — Noir, puis le Gardien seul. La caméra tourne lentement autour
   de lui et s'arrête. *On apprend à regarder.* Le compagnon naît ici, sort du
   Gardien, et fait un tour d'orbite : c'est lui qui montre le geste.
2. **Le nom** — Le compagnon se pose sur le Gardien. *On apprend à le choisir.*
3. **Le premier pas** — Les cases atteignables s'allument. *On marche.*
   Récompense : le monde réagit, le son du pas, la caméra suit.
4. **La limite** — On finit par viser le vide. **Refus.** Le caillou est une
   prison. *Manque installé : le monde est trop petit.*

**Ce qu'on sait faire en sortant :** regarder, choisir, marcher.

> **Livré.** `js/game/tutorial-eveil.js`, étapes `eveil` / `nom` / `premier-pas` /
> `limite`. Le caillou est en (8,2)-(9,3) : à l'écart du sanctuaire central, qui
> brille en or et volait le regard. Le HUD est **nu** (`body.eveil-nu`) — ni
> score, ni tour, ni adversaire, ni pioche, ni compte de cartes : tout ça
> raconte un jeu qu'on n'a pas encore rencontré. Seul DÉPLACER apparaît, avec
> cérémonie, à l'étape « le nom ». Harnais : `tests/eveil.spec.js`.

---

### ACTE II — LE MONDE · « je peux le changer »

5. **Bâtir** — Le verbe ÎLE apparaît au HUD, avec cérémonie : **un pouvoir de
   plus dans les mains.** L'île fantôme suit le curseur. On pose. Le vide
   devient terre. → **Première joie : on fabrique le monde.**
6. **Le second** — Un Gardien s'éveille sur la terre neuve. On n'est plus seul.
7. **La lueur** — Une Couronne apparaît au loin, sur son îlot. Le compagnon y
   vole et revient. *Manque : l'atteindre.* On y va, on la prend.
8. **Le relais** — Le chemin se coupe (ou la distance est trop grande pour une
   seule main). On découvre que la Couronne **passe d'un Gardien à l'autre**.
   → Joie : ils sont une équipe, pas deux pions.

**Ce qu'on sait faire :** bâtir, invoquer, porter, transmettre.

> **Livré.** Étapes `batir` / `second` / `lueur` / `relais`.
>
> **Deux écarts assumés avec le plan initial**, tous deux dictés par les règles
> réelles du jeu :
>
> 1. **La Couronne ne vient pas « de loin »** : elle descend sur la terre que le
>    joueur vient de bâtir, sur la case la plus proche d'un Gardien. La
>    récompense est ainsi liée à son geste, et le trajet reste court. La version
>    « au loin » transformait l'étape en randonnée, puisque l'île se pose où l'on
>    veut.
> 2. **Le relais a deux routes, et le tutoriel les accepte toutes les deux.**
>    `handleCrownClick` (ui.js) propose à la fois les alliés orthogonalement
>    adjacents *et* les cases libres voisines : deux Gardiens en diagonale se
>    passent donc la Couronne **par leur case commune** — on la pose, l'autre
>    vient la reprendre. C'est le fil de lumière, passant par cette case, qui le
>    dit sans un mot ; et la couronne fantôme du dernier recours s'y pose
>    vraiment, une seconde, avant de repartir.
>
> **Le piège de la diagonale.** Les formes d'île comprennent des diagonales : les
> deux Gardiens peuvent finir sur les deux pointes d'une île de deux cases, sans
> aucune case commune en terre. Le relais est alors **réellement impossible** —
> `choiceCells` est vide et le geste reste sans effet. L'étape vérifie donc
> qu'une route existe ; sinon elle rapproche l'allié, et en dernier ressort
> **fait surgir la case manquante**, à la vue de tous et avec le son de la pose.
> Le monde donne le pont : c'est le sujet même de l'acte II, pas un rafistolage.

---

### ACTE III — L'AUTRE · « je ne suis plus seul à vouloir »

9. **Le rival** — Une silhouette apparaît, et elle avance vers la Couronne.
   Premier danger réel. Le verbe POUSSER apparaît.
10. **La chute** — Le rival est écarté ; s'il finit au-dessus du vide, il tombe.
    → **Moment de bravoure n°1 : le vide travaille aussi pour moi.**
11. **Le repentir** — Le premier geste vraiment coûteux (un Gardien près du
    bord, une Couronne mal placée) fait **respirer ANNULER**. On revient au
    début de son tour. → Joie : *on peut oser.* Le filet est posé pour de bon.
12. **Le ciel se plie** — Le gouffre est infranchissable : ni pas, ni île.
    Le verbe MAGIE apparaît. On fait pivoter l'île **sur laquelle on se tient**,
    et elle nous emporte de l'autre côté.
    → **Moment de bravoure n°2, le plus beau du jeu.** Gardé pour ici, jamais
    avant. La validation du pivot est faite **par le joueur**, jamais
    automatiquement.

**Ce qu'on sait faire :** pousser, faire tomber, annuler, plier le monde.

---

### ACTE IV — LE TEMPS · « mes gestes sont comptés »

Tout ce qui précède a été joué avec une main confortable. Ici, la vérité.

13. **Le village** — On ramène la Couronne. On la pose sur la zone de
    validation… et **rien ne se passe.** Incompréhension voulue.
14. **Le sablier** — La rune du sablier. Le tour passe. Le rival joue. Puis, au
    début de *notre* tour, la Couronne s'ancre dans un éclat.
    → La règle la plus abstraite du jeu, jouée et non énoncée.
15. **La main qui s'épuise** — Les cartes deviennent réelles : pioche, main,
    défausse. On voit une carte partir à la défausse quand on la joue.
16. **La réserve** — On termine un tour avec une carte non jouée, et on la voit
    **mise de côté, pas perdue.** Rune du cercle fermé.
    → **Troisième joie : rien n'est gâché.** C'est le cœur tactique du jeu et il
    est aujourd'hui totalement invisible.
17. **Le seuil** — Les lumières du tutoriel s'éteignent une à une, le HUD
    complet apparaît, l'IA prend la main. Écran de fin : *entrer dans une vraie
    partie* / *retour au menu*.

---

## 6. Architecture

### Observer l'état plutôt que les clics

Contrairement à ce que supposait la première version de ce document, la manette
n'est **pas** invisible pour le tutoriel : `gamepad.js` passe par
`dispatchKayKitClick`, qui émet un vrai clic DOM sur la case, et active les
verbes du HUD par `button.click()`. La parité est donc presque acquise.

On observe quand même l'ÉTAT plutôt que les clics, parce que c'est plus robuste
(un clic dit qu'on a cliqué, pas que le geste a abouti) et parce que certaines
étapes se jugent sur une situation, pas sur un geste. Le parcours lit :

- `window.ILYOS_VISUAL_EVENTS` (`islandPlaced`, `characterSpawned`,
  `crownPicked`, `characterMoveEnded`, `characterPushed`, `characterFell`,
  `islandRotated`, `crownScored`) — déjà agnostique de l'entrée ;
- l'**état** : `state.selectedCharId`, `state.selectedActionType`,
  `state.phase`, `state.reachable`, la main, la réserve, le score.

La désignation d'une case (« j'ai visé le vide ») reste lue sur le clic DOM,
puisque les deux entrées y passent.

### Où ça vit

Un fragment neuf, `js/game/tutorial-eveil.js`, dans le même IIFE. Il réutilise
l'overlay, la caméra et les helpers d'état existants. **Aucune règle du jeu
n'est redéfinie.**

**Rien n'est touché hors du tutoriel** : ni la campagne, ni les 22 Sanctuaires,
ni les affordances du jeu normal (lues, jamais modifiées).

### Le sort de l'existant

- `tutorial-discovery.js` (la Découverte muette actuelle) : **retirée du
  bouton**, conservée le temps du chantier, supprimée à la fin.
- `tutorial.js` (« La Première Ascension ») : conservée, accessible par
  `ILYOS_TUTORIAL.startAscension()`, comme archive.

### La reprise

La progression est retenue par **étape exacte** (`localStorage`), pas par acte.
Revenir plus tard reprend là où on s'était arrêté, avec le monde tel qu'on
l'avait laissé.

---

## 7. Vérification

- `npm run build` puis `npm run check` à chaque étape.
- `npm run test:smoke` — le parcours doit se jouer **de bout en bout**, à la
  souris **et** au pad simulé.
- Passe visuelle Playwright (jamais le pane : il ne démarre pas `initKayKit3D`).
- **Instrumentation obligatoire** : temps par étape, gestes refusés, palier
  d'aide atteint. Critère de réussite d'une étape : *franchie sans dépasser le
  palier 2*. Si le palier 3 ou le Fantôme sont atteints souvent, c'est la mise
  en scène qui a échoué, pas le joueur.
