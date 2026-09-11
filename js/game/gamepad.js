      /* ILYOS — Manette (Gamepad API native)

         Couche d'entree uniquement : aucune regle de jeu n'est redefinie ici.
         Chaque touche appelle exactement la fonction que la souris appelle.

         Pourquoi ce fragment vit DANS le bundle et non dans un script autonome
         comme js/mobile-input-v1.js : dispatchKayKitClick, handleCancelButton,
         executeUnifiedPushOption et kaykit3D sont prives de la fermeture
         partagee par js/game/*.js. Un script charge separement ne peut que
         fabriquer de faux evenements DOM — c'est precisement ce que la couche
         tactile doit faire, et son en-tete documente le prix paye : le click
         natif arrive parfois avant que le moteur ait remis dragMoved a false,
         et une action se perdait en pleine poussee. Ici, l'action ne passe
         jamais par un faux click sur le canvas : on appelle le moteur.

         Deux chemins distincts, choisis pour leur risque :
         - SURVOL : un vrai pointermove synthetique sur le canvas, aux
           coordonnees ecran de la case visee. Inoffensif (aucune action
           declenchee) et cela reutilise tel quel tout le systeme d'affordance
           existant — reticule, apercus de deplacement, anneaux de poussee.
         - ACTION : appel direct au moteur. On contourne ainsi le verrou
           dragMoved, et surtout dispatchKayKitClick sait deja resoudre les
           couronnes (".carrier-crown" / ".artifact"), ce qu'un simple
           cell.click() ne fait pas — la vue tactique s'y etait deja brulee.
      */
      (function setupIlyosGamepad() {
        if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return;

        const DEADZONE = .35;
        const STEP_FIRST_MS = 260;   // delai avant repetition quand on maintient
        const STEP_REPEAT_MS = 120;  // cadence de repetition ensuite
        const ROTATE_SPEED = .035;   // radians par image a fond de course
        const ZOOM_COOLDOWN_MS = 90;

        const BUTTON = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

        const pad = {
          cursor: null,         // { r, c } de la case visee
          focusEl: null,        // controle HUD selectionne via LB/RB
          previous: [],         // etat des boutons a l'image precedente
          stepAt: 0,
          zoomAt: 0
        };

        /* ---- Curseur de case ------------------------------------------- */

        function boardCanvas() { return kaykit3D?.canvas || document.getElementById("kaykitCanvas"); }

        function clampCell(value) { return Math.max(0, Math.min(GRID - 1, value)); }

        function defaultCursor() {
          // Reprendre le gardien selectionne si possible : c'est la ou le
          // regard du joueur se trouve deja.
          const selected = state?.characters?.find?.(char => char.id === state.selectedCharId);
          if (selected && Number.isFinite(selected.r)) return { r: selected.r, c: selected.c };
          const middle = Math.floor(GRID / 2);
          return { r: middle, c: middle };
        }

        function cellToScreen(r, c) {
          const canvas = boardCanvas();
          if (!kaykit3D?.camera || !canvas || typeof kaykitCellPosition !== "function") return null;
          const position = kaykitCellPosition(r, c, kaykitCellSurfaceY(r, c));
          const projected = new THREE.Vector3(position.x, position.y, position.z).project(kaykit3D.camera);
          const rect = canvas.getBoundingClientRect();
          if (!rect.width || !rect.height) return null;
          return {
            x: rect.left + (projected.x * .5 + .5) * rect.width,
            y: rect.top + (-projected.y * .5 + .5) * rect.height
          };
        }

        /* L'ecran tourne avec la camera : pousser le stick "vers le haut" doit
           deplacer le curseur vers le haut DE L'ECRAN, pas vers la rangee 0 du
           plateau. On projette donc les quatre cases voisines a l'ecran et on
           retient celle qui suit le mieux la direction demandee. */
        function stepCursor(dx, dy) {
          if (!pad.cursor) { pad.cursor = defaultCursor(); return true; }
          const { r, c } = pad.cursor;
          const origin = cellToScreen(r, c);
          let best = null, bestScore = 0;
          if (origin) {
            for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
              if (nr < 0 || nc < 0 || nr >= GRID || nc >= GRID) continue;
              const point = cellToScreen(nr, nc);
              if (!point) continue;
              const vx = point.x - origin.x, vy = point.y - origin.y;
              const length = Math.hypot(vx, vy) || 1;
              const score = (vx / length) * dx + (vy / length) * dy;
              if (score > bestScore) { bestScore = score; best = [nr, nc]; }
            }
          }
          // Repli sans camera exploitable : axes bruts du plateau.
          if (!best) best = [clampCell(r + Math.round(dy)), clampCell(c + Math.round(dx))];
          if (best[0] === r && best[1] === c) return false;
          pad.cursor = { r: best[0], c: best[1] };
          return true;
        }

        /* Survol : on laisse le moteur faire son propre lancer de rayon depuis
           ces coordonnees. pointerType "mouse" est volontaire — mobile-input
           ne traite que les pointeurs non-souris, il ne doit pas s'en saisir. */
        function refreshHover() {
          const canvas = boardCanvas();
          const point = pad.cursor && cellToScreen(pad.cursor.r, pad.cursor.c);
          if (!canvas || !point) return;
          canvas.dispatchEvent(new PointerEvent("pointermove", {
            bubbles: true, cancelable: true, view: window,
            pointerId: 1, pointerType: "mouse", isPrimary: true,
            clientX: point.x, clientY: point.y
          }));
        }

        /* ---- Actions ---------------------------------------------------- */

        function interactionAtCursor() {
          if (!pad.cursor || !kaykit3D?.interactiveMeshes) return null;
          const { r, c } = pad.cursor;
          // Une destination de poussee n'est pas une case : elle porte son
          // propre identifiant d'option, comme dans le handler de clic 3D.
          for (const mesh of kaykit3D.interactiveMeshes) {
            const data = mesh?.userData || {};
            if (data.ilyosInteraction !== "push-destination" && data.ilyosInteraction !== "push-death-destination") continue;
            const option = state?.pushOptions?.find(item => item.id === data.pushOptionId);
            if (option && option.r === r && option.c === c) return { pushOptionId: data.pushOptionId };
          }
          // Couronne portee ou posee sur la case : dispatchKayKitClick vise
          // alors le bon noeud enfant, pas la case elle-meme.
          for (const mesh of kaykit3D.interactiveMeshes) {
            const data = mesh?.userData || {};
            if (data.r !== r || data.c !== c) continue;
            if (data.kaykitAction === "crown-carried" || data.kaykitAction === "crown-loose") {
              return { kaykitAction: data.kaykitAction };
            }
          }
          return {};
        }

        function actOnCursor() {
          if (!pad.cursor || typeof canLocalPlayerAct !== "function" || !canLocalPlayerAct()) return;
          const found = interactionAtCursor();
          if (!found) return;
          if (found.pushOptionId) { executeUnifiedPushOption(found.pushOptionId); return; }
          const point = cellToScreen(pad.cursor.r, pad.cursor.c) || { x: 0, y: 0 };
          dispatchKayKitClick(
            { userData: { r: pad.cursor.r, c: pad.cursor.c, kaykitAction: found.kaykitAction } },
            { clientX: point.x, clientY: point.y, button: 0, buttons: 0 }
          );
        }

        /* B : meme arbitrage que la touche Echap (voir diagnostics.js) —
           refermer une fenetre ouverte d'abord, sinon annuler. */
        function cancel() {
          if (els.rulesModal && !els.rulesModal.classList.contains("hidden")) {
            els.rulesModal.classList.add("hidden");
            return;
          }
          if (els.soundMenu && !els.soundMenu.classList.contains("hidden")) { closeSoundMenu(); return; }
          handleCancelButton();
        }

        /* ---- Controles du HUD (LB / RB) --------------------------------- */

        // Peu de controles vivent a l'ecran en meme temps, et ils sont presque
        // tous contextuels : les panneaux de rotation d'ile ou de gardien
        // n'existent que pendant leur phase. Une simple liste des boutons
        // reellement visibles et actifs suffit donc, sans navigation spatiale.
        const FOCUS_CONTAINERS = ["ov2IslandRotationV12", "hand", "ilyosHudOrganicV2"];

        /* Ne PAS tester offsetParent ici : il vaut null pour tout element en
           position:fixed, ce qu'est justement le HUD organique. La liste des
           controles etait alors systematiquement vide et LB/RB ne faisaient
           rien. On mesure la boite et on lit le style calcule. */
        function visible(element) {
          if (!element) return false;
          const rect = element.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return false;
          const style = getComputedStyle(element);
          return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) !== 0;
        }

        function focusables() {
          const found = [];
          for (const id of FOCUS_CONTAINERS) {
            const container = document.getElementById(id);
            if (!container || !visible(container)) continue;
            container.querySelectorAll("button").forEach(button => {
              if (visible(button) && !button.disabled
                && button.getAttribute("aria-disabled") !== "true"
                && !button.classList.contains("disabled")) found.push(button);
            });
          }
          return found;
        }

        function setFocus(element) {
          if (pad.focusEl && pad.focusEl !== element) pad.focusEl.classList.remove("ilyos-gamepad-focus");
          pad.focusEl = element || null;
          if (pad.focusEl) {
            pad.focusEl.classList.add("ilyos-gamepad-focus");
            pad.focusEl.scrollIntoView?.({ block: "nearest", inline: "nearest" });
          }
        }

        function moveFocus(direction) {
          const list = focusables();
          if (!list.length) { setFocus(null); return; }
          const current = list.indexOf(pad.focusEl);
          const next = current < 0
            ? (direction > 0 ? 0 : list.length - 1)
            : (current + direction + list.length) % list.length;
          setFocus(list[next]);
        }

        /* Un controle focalise peut disparaitre entre deux images (fin de la
           phase de pose, action epuisee) : sans ce menage, A cliquerait un
           bouton devenu invisible. */
        function pruneFocus() {
          if (pad.focusEl && !focusables().includes(pad.focusEl)) setFocus(null);
        }

        /* ---- Camera ----------------------------------------------------- */

        function rotateCamera(amount) {
          if (!kaykit3D || !amount) return;
          kaykit3D.userRotated = true;
          kaykit3D.cameraTween = null;
          kaykit3D.autoFit = false;
          kaykit3D.cameraHint?.classList.add("hidden");
          if (kaykit3D.orbit) {
            const target = kaykit3D.orbit.target;
            const camera = kaykit3D.orbit.object;
            const offset = new THREE.Vector3().subVectors(camera.position, target);
            const spherical = new THREE.Spherical().setFromVector3(offset);
            spherical.theta -= amount;
            offset.setFromSpherical(spherical);
            camera.position.copy(target).add(offset);
            kaykit3D.orbit.update();
          } else {
            kaykit3D.manualOrbit.azimuth -= amount;
            updateKayKitCamera(false);
          }
        }

        /* ---- Boucle ----------------------------------------------------- */

        function pressed(gamepad, index) { return !!gamepad.buttons[index]?.pressed; }
        function justPressed(gamepad, index) { return pressed(gamepad, index) && !pad.previous[index]; }
        function axis(gamepad, index) {
          const value = gamepad.axes[index] || 0;
          return Math.abs(value) < DEADZONE ? 0 : value;
        }

        function poll() {
          requestAnimationFrame(poll);
          const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
          let gamepad = null;
          for (const candidate of gamepads) if (candidate?.connected) { gamepad = candidate; break; }
          if (!gamepad) { pad.previous = []; return; }
          if (typeof kaykit3D === "undefined" || !kaykit3D?.camera) return;

          const now = performance.now();
          let hoverDirty = false;

          // Stick gauche + croix directionnelle : une seule et meme navigation.
          let dx = axis(gamepad, 0), dy = axis(gamepad, 1);
          if (pressed(gamepad, BUTTON.LEFT)) dx = -1;
          if (pressed(gamepad, BUTTON.RIGHT)) dx = 1;
          if (pressed(gamepad, BUTTON.UP)) dy = -1;
          if (pressed(gamepad, BUTTON.DOWN)) dy = 1;
          if (dx || dy) {
            const fresh = !pad.stepAt;
            if (fresh || now >= pad.stepAt) {
              // Un seul axe a la fois : les diagonales n'existent pas sur la grille.
              const only = Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
              if (stepCursor(only[0], only[1])) hoverDirty = true;
              pad.stepAt = now + (fresh ? STEP_FIRST_MS : STEP_REPEAT_MS);
              setFocus(null); // revenir au plateau des qu'on y navigue
            }
          } else pad.stepAt = 0;

          // Stick droit : rotation horizontale, zoom vertical.
          const rx = axis(gamepad, 2), ry = axis(gamepad, 3);
          if (rx) { rotateCamera(rx * ROTATE_SPEED); hoverDirty = true; }
          if (ry && now - pad.zoomAt > ZOOM_COOLDOWN_MS) {
            zoomKayKitCamera(ry > 0 ? 1 : -1);
            pad.zoomAt = now;
            hoverDirty = true;
          }

          if (justPressed(gamepad, BUTTON.LB)) moveFocus(-1);
          if (justPressed(gamepad, BUTTON.RB)) moveFocus(1);
          if (justPressed(gamepad, BUTTON.A)) {
            if (pad.focusEl) pad.focusEl.click();
            else actOnCursor();
          }
          if (justPressed(gamepad, BUTTON.B)) { setFocus(null); cancel(); }
          if (justPressed(gamepad, BUTTON.X)) document.getElementById("ov2End")?.click();
          if (justPressed(gamepad, BUTTON.Y)) els.rulesModal?.classList.toggle("hidden");
          if (justPressed(gamepad, BUTTON.START)) document.getElementById("ov2Gear")?.click();

          pruneFocus();
          if (hoverDirty && !pad.focusEl) refreshHover();
          pad.previous = gamepad.buttons.map(button => !!button.pressed);
        }

        function injectFocusStyle() {
          if (document.getElementById("ilyosGamepadStyle")) return;
          const style = document.createElement("style");
          style.id = "ilyosGamepadStyle";
          // Anneau de focus manette : seul ajout visuel de cette couche.
          style.textContent =
            ".ilyos-gamepad-focus{outline:3px solid #ffd879;outline-offset:3px;"
            + "border-radius:10px;box-shadow:0 0 16px rgba(255,216,121,.55);}";
          document.head.appendChild(style);
        }

        injectFocusStyle();
        window.addEventListener("gamepadconnected", () => {
          if (typeof showToast === "function") showToast("Manette connectee.");
        });
        requestAnimationFrame(poll);
      })();
