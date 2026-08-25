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
8. `diagnostics.js` — diagnostics, public API, event wiring and closure end

Do not load fragments directly from `index.html`: none is a standalone script. After editing one or more fragments, rebuild and verify the browser entry point:

```text
node scripts/build-game.js --write
node scripts/build-game.js
```

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
