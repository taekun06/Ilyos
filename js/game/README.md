# Game source fragments

`../game.js` remains the browser entry point. It is assembled byte-for-byte from the files in this directory so the existing single private closure and its execution timing stay unchanged.

The fragment order is intentional:

1. `bootstrap.js` — constants, DOM references and shared state
2. `kaykit3d.js` — Three.js/KayKit loading, rendering and interaction bridge
3. `core.js` — rules, persistence, online play and game setup
4. `ai.js` — AI evaluation and actions
5. `turns.js` — turn lifecycle and undo handling
6. `audio.js` — embedded music, settings and sound effects
7. `ui.js` — board rendering and player interactions
8. `card-rules-physical-reserve.js`, `rules-core.js`, `planner.js`, `regles.js` (porte d'entrée unique des règles), `autopsie.js`, `defaites.js` — rules cores, Expert planner, AI autopsy, automatic record of games lost by the Expert (library, one-click export; see `docs/DEFAITES-EXPERT.md`)
9. `tutorial.js` — scripted tutorial « La Première Ascension » (self-contained: builds a normal state, gates input via a capture listener on `els.board`, watches `window.ILYOS_VISUAL_EVENTS`)
9b. `menu-duels.js` — start menus of the symmetric duel (photo preview, strip and grid) and of Personnalisé (formation, deck, rules, starting terrain), driving the hidden selects read by `core.js`
10. `diagnostics.js` — diagnostics, public API, event wiring and closure end

Do not load fragments directly from `index.html`: none is a standalone script. After editing one or more fragments, rebuild and verify the browser entry point:

```text
node scripts/build-game.js --write
node scripts/build-game.js
```

## Règles ↔ IA

Le planner (`planner.js`) doit connaître chaque action qu'un joueur peut faire
dans l'interface (`ui.js`) : déplacement (et ramassage en marchant), poussée de
gardien et de couronne, rotation et dissolution (option), pose avec apparition,
et les actions GRATUITES — ramassage, dépôt, transmission, vol d'un porteur
adverse adjacent. `scripts/verif-couverture-regles.js` le vérifie ; une action
nouvelle s'y ajoute en même temps qu'au planner. Le vol a manqué à l'IA jusqu'au
29/09 sans qu'aucun banc ne le signale.

`npm run verif:ia` lance tous les bancs de l'IA et en donne le bilan.

## Moteur de règles : porte d'entrée unique

`regles.js` répond à une seule question : « ce coup est-il permis ici, et
qu'en résulte-t-il ? ». Une action est une donnée (la même que celle du
planner : `MOVE`, `PUSH`, `MAGIC`, `POSE`, `DEPOT`, `RAMASSAGE`, `VOL`,
`TRANSMISSION`, `DISSOLUTION`, `SEQUENCE`, `FIN_TOUR`).

- Dans la fermeture : `reglesVerifier(action)` (sans rien toucher),
  `reglesAppliquer(action)` (joue dans `state`, rend `{ ok, raison,
  evenements }`), `applyTurnStartCore()` et `applyEndTurnCore()`.
- Depuis la page ou Node, sur un état FOURNI (objet ou JSON de
  `snapshotState`) : `ILYOS_REGLES.verifier(etat, action)`,
  `ILYOS_REGLES.appliquer(etat, action)`, `ILYOS_REGLES.finDeTour(etat)`.
  La partie en cours n'est jamais modifiée.

La légalité ne recopie aucune règle : elle interroge les fonctions de
l'interface (`movementRange`, `availableActionCount`,
`calculateIslandRotationAroundPivot`, `occupantPoussable`…) puis essaie le
noyau sur une copie. Les événements (`gardien-deplace`, `chute`,
`couronne-change-de-mains`, `point`, `nouveau-tour`, `fin-de-partie`…) sont
déduits de l'état avant/après. Le self-play termine ses tours par
`applyEndTurnCore`.

`npm run verif:regles` (sans serveur, ~1 min) : coups illégaux refusés, et
sur une partie CPU contre CPU, chaque coup de l'IA accepté par le moteur et
donnant le même état que par le planner.

Étape 2 : il n'y a plus qu'UNE ouverture de tour (`applyTurnStartCore`),
utilisée par `beginTurn` (turns.js), par l'anticipation du planner
(`applyTurnTransitionCore`, avec la main plausible à la place de la pioche) et
par le self-play ; et un seul passage de la main (`applyPassageTourCore`),
utilisé aussi par `endTurn` (ui.js). Le rangement des cartes de `endTurn`
reste mêlé à son animation ; `verif-reserve.js` vérifie qu'il donne le même
résultat que `rangerEtDefausserFinDeTour`.

Étape 3 : en partie, les gestes du joueur (déplacer, pousser, magie, poser
la couronne : `reglesRefuserAuJoueur`, ui.js) et chaque coup du CPU Expert
(ai.js) demandent `reglesVerifier(action, { essai: false })` juste avant
d'agir. Sans essai : en partie réelle, n'exécuter AUCUN noyau, même sur une
copie, car plusieurs modes enveloppent les noyaux avec des effets hors de
`state` (cartes dépensées d'une énigme, carte armée du marché, relevé du tour
adverse). `verif:regles` vérifie que la garde et l'essai complet acceptent
les mêmes coups du CPU.

La pose d'île du joueur passe aussi par la garde (hors mise en place).
Pas encore fait : ramassage, vol et passe du joueur ne passent pas
encore par la garde ; le réseau échange des états entiers.

## Moteur sans écran (Node)

`scripts/moteur-sans-ecran.js` charge `js/game.js` sous Node avec un écran
factice : règles et IA tournent sans navigateur, par les tours simulés de
`ILYOS_SELFPLAY`. Rien n'y est dessiné ; seuls les chemins de simulation
(`ilyosSimulationActive`) sont garantis.

- `npm run verif:moteur` (serveur `npm start` sur 8123) : joue les mêmes tours
  sous Node et dans Chromium et compare l'état complet après chaque tour. À
  relancer après tout changement de règle ou de fragment chargé tôt.
- `npm run selfplay:node -- [parties] [graine] [parallèle]` : Expert contre
  Expert sans Chromium ; `ILYOS_BUNDLE_A` / `ILYOS_BUNDLE_B` opposent deux
  builds (deux fichiers `game.js`).

### Self-play sur les machines de GitHub

Dire qu'un réglage du CPU est « plus fort » demande des dizaines de parties,
soit des heures de calcul. Le workflow `Self-play`
(`.github/workflows/selfplay.yml`, lancement à la main) les joue sur quatre
machines en parallèle : candidat (branche choisie, `budget_a`, `poids_a`)
contre référence (`ref_b`, `budget_b`, `poids_b`), filets de temps écartés.
Le bilan de chaque lot est dans le résumé du job. Ne pas lancer ces séries
sur un poste ou dans une session d'assistant : elles n'y survivent pas.

### Réflexion en arrière-plan (Worker)

En partie, le CPU Expert réfléchit dans un Worker : `js/moteur/worker.js`
charge le même `js/game.js` derrière le même écran factice
(`js/moteur/ecran-factice.js`, partagé avec Node), reçoit une copie de l'état
et rend le plan ; la page reste seule à l'exécuter. Côté page, tout est dans
`planner.js` (`moteurReflechir`). Le repli est automatique : si le Worker
manque, tarde (30 s), tombe ou part d'un état différent (empreinte), le tour
est réfléchi dans la page comme avant. L'autopsie et le mode Rotation restent
dans la page ; `?moteur=page` y force tout.

`ILYOS_MOTEUR.etat()` dit ce qui s'est passé (réponses, replis) ;
`ILYOS_MOTEUR.comparer({ etatJson, poids })` calcule une même position dans la
page puis dans le Worker. Pour que les deux soient comparables, passer une
`graine` dans `poids` : la recherche tire au hasard par endroits.

Une présentation ajoutée dans un chemin de règle doit rester sous la garde
`ilyosSimulationActive` : c'est ce qui permet au moteur de tourner sans écran
et dans le Worker. La recherche de l'IA est bornée en nombre d'états ;
ses plafonds de temps (`PLAN_SECURITE`) ne sont que des filets, mais un filet
atteint change la décision. Les bancs qui comparent des états les écartent
(`securiteFacteur`, ou `ILYOS_SANS_COUPURE=1` pour le self-play Node).

## Recent UX passes (guardian interaction, turn flow, island/spawn)

Several UX-only passes landed on top of each other without being committed yet
(check `git status`/`git diff --stat` before assuming a clean baseline). They
established a few reusable patterns — look for these before writing a new one:

- **Direct guardian click (`SMART_CHAR` phase)**: clicking your own guardian
  during `ACTION_SELECT` calls `beginSmartCharacterAction()` (core.js), which
  populates `state.reachable` (with `.costs`, a `Map` of cell → move cost) and
  `state.smartPushTargets` immediately, no card selection needed.
  `getPushHoverPreview()` (ui.js) is the single source of truth for push
  simulation, reused by both this flow and the classic PUSH card. Re-clicking
  the selected guardian, or the dedicated "Désélectionner" button, cancels via
  `cancelSmartCharacterAction()` — distinct from `restoreUndoSnapshot()`
  ("↶ Annuler dernière action"), which only appears when `state.undoHistory`
  is non-empty. Undo is a real stack (`saveUndoSnapshot()` pushes,
  `restoreUndoSnapshot()` pops one level per call) capped at
  `UNDO_HISTORY_LIMIT` (turns.js), so pressing it repeatedly — or Escape, or a
  no-drag right-click on the 3D canvas (see `bindKayKitInteractions`) — walks
  back multiple actions in the current turn. Any code that saves a snapshot
  before an action that might still fail must call `discardLastUndoSnapshot()`
  on that failure path, not restore/clear the whole history.
- **Atmosphère céleste = un seul système** (kaykit3d.js) : `KAYKIT_SKY`,
  `KAYKIT_SKY_COLORS` et `buildKayKitSkyEnvironment()` portent *toutes* les
  couches (dôme dégradé, `scene.fog`, îlots lointains, mer de nuages). Corriger
  l'existant plutôt qu'empiler une deuxième passe. Deux invariants à ne pas
  casser : `kaykitSkyPlacementAllowed()` (volume de sécurité — rien de décoratif
  au-dessus du plateau dans un cylindre de rayon ≈ 9.3, rien entre `safeFloor`
  et les îles), et le fait que tout élément lointain vit à un rayon supérieur à
  `orbit.maxDistance`, donc la caméra reste toujours *à l'intérieur* de l'anneau
  décoratif. La dérive des couches passe par `kaykit3D.skyLayers` (liste
  séparée d'`animatedObjects`, qui est filtrée à chaque resync de scène).
- **3D "affordance ring" idiom** (kaykit3d.js): small `TorusGeometry` rings
  drawn into `kaykit3D.actionPreviewGroup`, rebuilt by
  `refreshKayKitHoverPreviews()` behind a memoized `previewKey` (cheap to call
  on every pointer move). See `addKayKitMoveAffordance`,
  `addKayKitPushAffordance`, `addKayKitSpawnAffordance`,
  `addKayKitSpawnGuardianGhost` for the pattern: persistent light rings on all
  valid options, a richer highlight/ghost only on the hovered one.
- **Don't stack a flat highlight under a real 3D ghost**: `addCellHighlight()`
  and `applyKayKitHoverIntent()` both suppress their generic
  fill/ring/glyph markers whenever a more informative 3D model already
  occupies that cell (`magicGhostActive`, `placementGhostActive`,
  `glyphSuppressed`/`hoverRingsSuppressed` for `"character"`/`"select"`/
  `"invocation"`). Extend those booleans rather than adding a new marker when
  a future ghost/halo needs the same treatment.
- **Panel/context hierarchy**: `turnContextInfo()` (ui.js) owns the *general
  step* banner text only; `renderHand()` owns resources and the precise
  action context (hover cost/force, "GARDIEN SÉLECTIONNÉ" badge); toasts are
  reserved for errors, impossibilities and real events (crown, score, fall) —
  not instructions already shown on the board or in the panel.
- **Browser-pane limitation in this dev environment**: the preview pane
  frequently reports `document.hidden === true`, which throttles
  `requestAnimationFrame` and prevents `initKayKit3D()` from ever running —
  no canvas, no screenshots possible. Verify 3D-adjacent changes via DOM/JS
  assertions (`window.ILYOS_TEST.report()`, dispatched synthetic events) and
  leave final pixel-level validation to the user. "Claude in Chrome" (a
  separate real-browser surface, if connected) sometimes works around this —
  worth trying, but its tab is also usually unfocused, so it still throttles
  eventually; don't assume it will paint the 3D canvas.
- **CSS specificity in `index.html`/`css/*.css` is a real trap, not a minor
  detail** — this cost more back-and-forth than anything else across several
  passes. `index.html` has ~10 separate `<style>` blocks (`v54`, `v58`,
  `v64`, `v69`, `v70`, `v72`, `v74`...) plus `css/base.css` (8700+ lines,
  much of it dead — e.g. `.action-banner`, `.left-panel.choice-focus`'s dark
  navy variant — check a class is actually referenced in `js/game/*.js`
  before trusting a rule you find there), each layering `!important` on top
  of the last. A new rule with equal-or-lower specificity than an existing
  `!important` one silently loses even when it loads later in the document —
  this bit `#endTurnBtn`, `.v64-deck-summary`/`.v66-deck-summary` (two
  classes coexist on the same element from different passes), camera
  control buttons, and a panel corner ornament hidden by a leftover
  `.banner-panel::after { display: none !important }`. Two defaults that
  would have prevented most of it:
  1. **Always prefix new component rules with
     `body[data-visual-mode="alternative"] #gameScreen <selector>`** — the
     `#gameScreen` id alone beats any selector built only from classes/
     attributes, regardless of how many are stacked, so this wins by
     construction instead of by trial and error.
  2. **Before trusting `getComputedStyle`, verify empirically** if a change
     doesn't show up: iterate `document.styleSheets`, filter rules where
     `element.matches(rule.selectorText)`, and check
     `rule.style.getPropertyPriority(prop)` — this finds the actual
     competing rule in seconds instead of guessing.
  A single new stylesheet linked **last** in `<head>`/`<body>` (see
  `css/sanctuary-celeste.css`, `css/fluidity.css`) is still the right
  pattern for a whole pass — just apply the two defaults above within it
  from the start.
  3. **Before and after any cascade change, take a computed-style
     fingerprint**: `npm run empreinte -- .empreintes/avant.json`, make the
     change, take another, then
     `npm run empreinte:comparer -- .empreintes/avant.json .empreintes/apres.json`.
     It walks every element in four game states and diffs 55 computed
     properties plus the bounding rect, so a rule that silently stops
     applying shows up as an explicit before/after line instead of being
     noticed three passes later. See `scripts/empreinte-css.js` — its header
     explains what is and is not reproducible, and why.

  Measured 25/08/2026, and worth knowing before trusting any of this: the
  cascade is **39 sources deep at runtime** (26 stylesheets, 13 inline
  `<style>` blocks), 2 619 rules, **10 186 resolved `!important`
  declarations** — far more than the 3 860 the source-level grep suggests,
  because a shorthand like `margin: 0 !important` resolves into four
  important longhands. This is why `@layer` cannot simply be dropped on top:
  among `!important` declarations the layer order **inverts** (earliest layer
  wins, and unlayered `!important` loses to any layered one), so layering
  `base.css` alone would push its 3 224 important declarations ahead of every
  later pass. The `!important` count has to come down first.
