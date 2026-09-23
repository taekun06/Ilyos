# TUTORIEL — « L'ÉVEIL »

Document de conception. Écrit avant le code, arbitré avec l'auteur du jeu.
Statut : **PARCOURS COMPLET — les quatre actes livrés et joués en 3D**, seize étapes du noir jusqu'au seuil.

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
| **LE COMPAGNON** | « regarde là » · « d'ici à là » | Une lueur vivante. Elle se pose sur ce qui compte, ou fait la **navette** entre le départ et l'arrivée quand l'étape décrit un trajet — sa traînée dessine alors le chemin. S'impatiente, exulte, revient près du Gardien quand plus rien ne la réclame. |
| **L'APPEL** | « c'est ici » | Balise de lumière sur la case, respiration du verbe au HUD. Deux intensités, jamais plus. |
| **LA PROMESSE** | « voilà ce qui va arriver » | Fil de lumière départ → arrivée, anneau sur la destination. Trajectoire de poussée, silhouette de l'île pivotée. |
| **LA RUNE** | de quoi il s'agit | Un signe gravé dans l'air, **une par étape**, montrée pendant le Souffle. Elle nomme la NOTION là où la lumière ne sait désigner qu'un LIEU : c'est la différence entre « ici » et « ceci ». Jamais deux à l'écran. |
| **LE REFUS** | « pas ça » | Le geste s'amorce et se rétracte, le monde se ternit un quart de seconde, son mat. Rien n'est bloqué. |
| **L'ASSENTIMENT** | « oui » | Éclat chaud, accord qui résout, et **une conséquence visible dans le monde**. |
| **LE SOUFFLE** | « regarde ce qui arrive » | La caméra cadre, letterbox, le joueur n'a pas la main. Court, et toujours rendu. |

### Le huitième signe, réservé

**LE FANTÔME** — une silhouette translucide du Gardien qui exécute le geste
attendu, puis s'efface sans rien changer à l'état. C'est le dernier recours, au
bout d'une longue hésitation. Il montre ; il ne fait pas à la place.

Il existe sous **trois formes**, parce qu'un parcours n'enseigne pas que des
déplacements :

- **la silhouette qui marche** — elle part de la case du Gardien, fait le
  trajet, et pose un anneau à l'arrivée. Elle passe **deux fois** : un seul
  aller est trop facile à manquer, et c'est précisément parce qu'on regardait
  ailleurs qu'on en est arrivé là ;
- **la silhouette sur place** — elle se lève et retombe sur la case qui compte,
  pour les étapes où rien ne se déplace : désigner son Gardien, choisir où le
  suivant s'éveille ;
- **la couronne qui vole** — pour le relais, où ce n'est pas le Gardien qui
  voyage. Elle se pose vraiment une seconde sur la case commune avant de
  repartir, quand la route passe par là.

Elle est **teintée d'un bleu froid**. Une première version, simplement
transparente, se confondait avec le Gardien qu'elle recouvrait.

Neuf étapes sur seize en déclarent une. Les autres — poser une île, tourner une
barre, annuler, finir son tour — sont des gestes de HUD : leur dernier recours
fait respirer le bouton concerné, pas une silhouette.

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

> **Livré.** Étapes `rival` / `chute` / `repentir` / `pivot`.
>
> **Le repentir a changé de déclencheur.** Le plan prévoyait que l'annulation se
> révèle « au premier geste vraiment coûteux ». Fabriquer ce désastre aurait
> demandé de piéger le joueur, ce qui est exactement le contraire de l'esprit du
> parcours. L'étape enseigne donc le geste nu : **fais un pas, puis reprends-le**,
> et regarde le monde revenir. La pile `state.undoHistory` monte quand il agit,
> redescend quand il annule — c'est cette redescente, et elle seule, qui compte.
>
> **La scène est construite, jamais espérée.** Trois fois de suite, le même piège
> s'est refermé : après un acte II joué librement, le coin de ciel du joueur ne
> permet pas la leçon. Un rival adossé au bord du plateau est impossible à
> pousser (la case derrière lui n'existe pas). Un rival sans vide derrière lui ne
> tombera jamais. Une corniche posée à l'aveugle se superposait aux îles
> existantes — deux îles sur les mêmes cases, de la terre fantôme après la
> rotation, et un harnais qui ne voyait rien puisque le Gardien franchissait
> quand même.
>
> Chaque étape **vérifie donc que sa leçon est jouable** et, si elle ne l'est
> pas, fait surgir la terre qui manque — à la vue de tous, avec le son de la
> pose. Le monde fournit le plateau : c'est le sujet de la pièce depuis l'acte II.
>
> **Sur `tutorial-on`.** Le fragment ne porte plus cette classe. La feuille de
> `tutorial.js` masque `#ov2Undo` et `#ov2End` en dur dès qu'elle est présente —
> utile pour l'Ascension, intenable ici où l'annulation est un pouvoir qui
> s'acquiert. L'Éveil reprend à son compte la partie utile de cette liste, sans
> End ni Undo, et redéclare l'animation `.tuto-pulse` dont l'Appel a besoin.

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

> **Livré.** Étapes `village` / `sablier` / `main` / `reserve`, puis le seuil.
>
> **La rune existe enfin.** L'acte IV parle de choses qu'aucune lumière posée
> sur une case ne peut dire. Deux signes seulement, jamais plus d'un à l'écran :
> le **sablier** (le temps doit passer avant que ça compte) et le **cercle
> fermé** (ce qui n'est pas dépensé n'est pas perdu).
>
> **L'incomprehension volontaire a été bornée.** Poser la Couronne au village
> sans que rien ne se passe reste le bon geste pédagogique, mais c'est le seul
> endroit du parcours où le muet peut se lire comme une panne. L'étape sort donc
> **sans assentiment** — ni éclat, ni son, puisque justement rien n'a eu lieu —
> et l'étape suivante s'enchaîne en 0,9 s au lieu de 1,1 s : le sablier répond
> avant que le doute s'installe.
>
> **Le chrome revient par morceaux.** La nudité n'est plus un interrupteur mais
> deux classes : le tour et le score reviennent au `sablier`, quand le temps
> devient un sujet ; les piles de cartes à `main`, quand les cartes deviennent
> réelles. Montrer un score avant de savoir ce qu'on marque, c'est du bruit.
>
> **Deux pièges de plus, trouvés en jouant.** Le pivot de l'acte III déposait
> parfois le Gardien **directement dans la zone du village** : l'étape 13 se
> trouvait accomplie d'avance et sa leçon disparaissait sans avoir été jouée —
> la corniche évite désormais d'y atterrir. Et un joueur possède **plusieurs
> villages** : matérialiser toutes ses cases de validation faisait pousser de la
> terre au coin opposé du ciel, sans raison. On ne garde que le village le plus
> proche du porteur.

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

### La reprise, et comment s'en défaire

La progression est retenue par **étape exacte** (`localStorage`), pas par acte.
Revenir plus tard reprend là où on s'était arrêté, avec le monde tel qu'on
l'avait laissé.

C'est ce qu'on veut en quittant en cours de route, et exactement ce qu'on ne
veut pas quand on souhaite revoir le parcours en entier. D'où un bouton
**Recommencer**, posé à droite — là où vivait le bouton de voix dont le muet
n'a pas l'usage — aussi discret que « Quitter » : il oublie la progression et
rejoue tout depuis le noir. Il figure aussi sur la carte de fin. Pas de demande
de confirmation : le geste est explicite et rien n'est perdu qu'on ne puisse
refaire.

---

## 5 bis. Rendre le parcours lisible

Retour de l'auteur après essai : **trop d'éléments restaient incompréhensibles.**
Trois causes, trois réponses.

**Le compagnon n'avait pas de vocabulaire.** Il se posait sur une case — ce qui
dit « ici » — alors que la plupart des étapes demandent « d'ici *à là* ». Il fait
désormais la **navette** entre les deux bouts, lentement, en marquant un temps à
chaque extrémité ; sa traînée dessine le trajet derrière lui, mieux qu'un trait
fixe. Et il montre **dès l'entrée de l'étape**, pendant deux allers-retours :
attendre huit secondes d'immobilité supposait que le joueur sache déjà quoi
chercher, ce qui est précisément ce qu'il ignore.

La règle est unique pour les seize étapes : *s'il existe un trajet, il le fait ;
sinon il se pose.* Impossible d'en oublier une.

**Les runes n'apparaissaient que deux fois, tout à la fin.** Le vocabulaire
compte maintenant **seize signes, un par étape** — l'œil, la main, le pas, le
vide barré, bâtir, éveiller, la couronne, le relais, le rival, la chute, le
repentir, le pivot, le village, le sablier, la main vide, le cercle fermé.
Chacune est montrée pendant le Souffle, posée haut et assez grande pour être
reconnue d'un coup d'œil : une première version, fine et pâle au milieu de
l'image, passait inaperçue.

**Le monde était plein de choses hors sujet.** Sanctuaire doré, villages,
drapeaux, ruines : rien n'appartient à la leçon en cours, et tout a l'air de
vouloir dire quelque chose. On ne peut pas les retirer — ils *sont* le monde. On
les fait donc **reculer** : un second voile s'assombrit vers les bords et
s'ouvre là où l'action se passe. Son point clair **suit la case qui compte**, il
ne reste pas collé au centre de l'écran. La périphérie devient un décor, le
centre reste un lieu — et le foyer se desserre acte après acte, jusqu'à rendre
la partie entière visible au IV.

## 6. La pénombre, et son réglage

Le plateau d'ILYOS est baigné de soleil — magnifique en partie, mais il noie les
seules choses que le parcours a le droit de dire. Balise, fil, rune, compagnon :
ce sont tous des lumières. **Baisser le monde, c'est les faire exister.**

Deux leviers seulement, parce qu'ils sont les seuls sans trace :
l'**intensité** de chaque lumière de la scène, et l'**exposition** du rendu. On
ne touche ni aux matériaux, ni au ciel, ni à la brume — ils sont partagés avec le
jeu normal.

Le ciel, lui, n'est pas éclairé mais peint : il restait en plein jour pendant que
le plateau sombrait. Un **voile** le rattrape, posé *sous* les signes du parcours
(z-index 3 contre 6) — le monde s'éteint, ce qui parle continue de briller.

**Et la nuit se lève.** Chaque acte rend un peu de lumière : I à 22 %, II à 40 %,
III à 60 %, IV à 85 %. C'est la récompense choisie à la conception — « le monde
s'agrandit et s'allume » — rendue littérale : on se réveille dans le noir, on
finit en plein jour.

### Le réglage, en direct depuis la console

```js
ILYOS_TUTORIAL.lumiere()      // lit la valeur courante
ILYOS_TUTORIAL.lumiere(0.5)   // deux fois plus sombre
ILYOS_TUTORIAL.lumiere(1)     // la pénombre telle qu'elle est conçue
ILYOS_TUTORIAL.lumiere(0)     // le noir à peu près complet
ILYOS_TUTORIAL.lumiere(1.6)   // presque le plein jour du jeu normal
```

Le changement se voit **immédiatement**, sans relancer, et il est retenu d'une
session à l'autre. C'est un multiplicateur : la courbe par acte joue par-dessus.

Deux pièges consignés : `Number(null)` vaut `0` et passe tous les contrôles de
plage — le réglage par défaut était donc le noir absolu au lieu de la pénombre.
Et **tout doit être rendu à la sortie**, sinon une partie normale hérite de
l'obscurité du tutoriel ; c'est ce que vérifie `tests/eveil-lumiere.spec.js`.

## 6 bis. La main ne s'épuise pas — jusqu'à ce qu'on l'enseigne

**Signalé en jeu, et c'était un blocage complet.** Dépenser tous ses
déplacements au milieu d'une étape laissait la main vide ; comme FIN DU TOUR
n'est acquis qu'à l'acte IV, il ne restait plus aucune sortie. Le parcours se
figeait. Le pivot était pire encore : il ne distribuait que des cartes MAGIE,
donc marcher y était impossible d'emblée.

La recharge est désormais **continue**, vérifiée à chaque battement du moteur,
et porte sur les types que l'étape déclare (`cartes: ["MAGIC", "MOVE"]`). Trois
étapes portent `economie: true` — `sablier`, `main`, `reserve` — et sont
épargnées : ce sont elles qui enseignent la pénurie, la leçon ne pourrait pas
avoir lieu autrement.

Deux gardes valent d'être retenues :

- **Jamais pendant qu'une action est engagée.** `tutoSetHand` reconstruit la
  main de zéro ; appelé au milieu d'un geste, il retire la carte que le joueur
  est en train de jouer et le coup ne se résout plus jamais.
- **Une étape ne doit plus mourir en silence.** Le calcul des plans de caméra
  n'était pas protégé : une erreur y sautait par-dessus l'armement de l'étape,
  qui n'était donc jamais surveillée — parcours figé, sans le moindre signe.
  Un plan de caméra raté doit coûter un plan de caméra, pas le tutoriel.

**Et la balise ne doit pas effacer ce qu'elle désigne.** La colonne de lumière
héritée de l'Ascension est dense à sa base : posée sur la case d'un Gardien,
elle le recouvrait entièrement — vérifié à l'écran, le personnage était bien
dans la scène, visible, opacité 1, et pourtant introuvable à l'image. Elle est
désormais plus étroite et transparente au pied ; c'est l'anneau au sol qui porte
la désignation.

## 6 ter. Le compagnon, en détail

Un point blanc se lisait comme un curseur collé sur la vitre. Il est fait de
trois choses : un **cœur** dense et blanc, un **halo** large et chaud — c'est lui
qui porte la couleur, le cœur étant lavé par le mélange additif — et une
**traînée** de sept perles qui retiennent ses positions passées. La traînée fait
tout le travail : elle donne une direction, donc une intention, donc une présence.

Trois humeurs, qui sont trois températures et non trois formes : `calme` (bas,
chaud, discret), `impatient` (plus vif, plus blanc, il tourne sur place),
`joyeux` (éclatant, il monte et descend). Le passage d'une humeur à l'autre est
interpolé — il ne bascule jamais d'un coup.

**Au repos, il flotte à côté du Gardien, jamais sur lui.** Centré sur sa tête, il
l'avalait purement et simplement : un compagnon ne doit pas cacher ce qu'il
accompagne. Il dérive lentement autour, ce qui suffit à le rendre vivant sans le
rendre agité.

---

## 7. Vérification

- `npm run build` puis `npm run check` à chaque étape.
- `npm run test:smoke` — le parcours doit se jouer **de bout en bout**, à la
  souris **et** au pad simulé.
- Passe visuelle Playwright (jamais le pane : il ne démarre pas `initKayKit3D`).
- `tests/eveil-aide.spec.js` : **l'échelle d'aide est exercée pour de vrai.**
  Les autres harnais jouent vite et n'avaient jamais laissé l'aide monter — le
  palier 4 n'avait donc jamais été vu s'exécuter. Celui-ci ne fait *rien* et
  regarde monter les quatre paliers, jusqu'au Fantôme. Il vérifie au passage
  que le Gardien reste entier pendant que son clone joue.
- `tests/eveil-recommencer.spec.js` : le bouton **Recommencer** repasse bien par
  le sas et rend un monde vierge.
- `tests/eveil-manette.spec.js` : la **parité manette est vérifiée, pas
  supposée**. Une manette synthétique est présentée à `navigator.getGamepads()`,
  et le harnais prouve que le tutoriel voit ses gestes — le stick droit fait
  tourner le monde, le stick gauche et A choisissent le Gardien. Les actions
  passent ensuite par `dispatchKayKitClick` et `button.click()`, chemin déjà
  couvert par le harnais principal.
- **Instrumentation obligatoire** : temps par étape, gestes refusés, palier
  d'aide atteint. Critère de réussite d'une étape : *franchie sans dépasser le
  palier 2*. Si le palier 3 ou le Fantôme sont atteints souvent, c'est la mise
  en scène qui a échoué, pas le joueur.
