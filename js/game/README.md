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
