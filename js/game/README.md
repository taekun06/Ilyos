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
  ("↶ Annuler dernière action"), which only appears when `state.undoSnapshot`
  is actually set.
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
  leave final pixel-level validation to the user.
