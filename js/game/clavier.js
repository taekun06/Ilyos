      /* ILYOS — Raccourcis clavier d'une partie

         Couche d'entree uniquement, comme la manette (gamepad.js) : chaque
         touche clique le bouton du dock que la souris cliquerait. Un bouton
         masque ou desactive (tutoriel, tour adverse, enigme d'un seul tour)
         ne repond donc pas non plus au clavier, sans condition a recopier ici.

           A Z E R         Ile, Deplacer, Pousser, Magie (ordre du dock,
                           rangee du haut d'un clavier AZERTY)
           Entree          fin du tour
           Retour, Ctrl+Z  annuler le dernier coup (bouton ↶)
           Tab, Maj+Tab    gardien suivant / precedent pendant un deplacement
                           ou une poussee
           M               menu (Echap aussi, voir diagnostics.js)
           D               defausse

         Les autres restent ou ils sont : Q/S/F (core.js, handleRotateKey),
         fleches et Espace (handleCameraKey), Echap (diagnostics.js),
         V (js/plateau-tactique.js), O (puzzle.js).

         INDICES. Chaque bouton porte dans son coin la touche qui l'actionne,
         petite et discrete (choix de Taekun, 2026-10-16), et la touche de
         MANETTE des que la manette sert (gamepad.js pose
         body[data-entree="manette"]) ; une touche du clavier ou un clic
         reviennent au clavier. Rien sur un ecran tactile : les indices ne
         s'affichent que sur un appareil a souris, ou des qu'une touche ou une
         manette sert ; un toucher du doigt les retire (Taekun, 2026-10-20). */
      (function setupIlyosClavier() {
        if (typeof document === "undefined") return;

        const DOCK = { a: "ov2Island", z: "ov2Move", e: "ov2Push", r: "ov2Magic" };

        /* Touche clavier, puis manette (disposition standard, gamepad.js).
           Deplacer n'a pas de bouton direct a la manette : on y va par le dock. */
        const INDICES = [
          { id: "ov2Island", clavier: "A", manette: "LT", dock: true },
          { id: "ov2Move", clavier: "Z", manette: "", dock: true },
          { id: "ov2Push", clavier: "E", manette: "X", dock: true },
          { id: "ov2Magic", clavier: "R", manette: "RT", dock: true },
          { id: "ov2End", clavier: "↵", manette: "⧉", coin: "top:auto;bottom:7px;right:18px" },
          { id: "ov2Gear", clavier: "Échap", manette: "≡" },
          { id: "plateauTactiqueBtn", clavier: "V", manette: "" }
        ];

        function installerStyle() {
          if (document.getElementById("ilyosTouchesStyle")) return;
          const style = document.createElement("style");
          style.id = "ilyosTouchesStyle";
          style.textContent = `
            .ilyos-touche{position:absolute;top:-6px;right:-6px;z-index:5;min-width:17px;height:17px;
              padding:0 3px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;
              font:800 11px/1 'Nunito Sans',Inter,system-ui,sans-serif!important;letter-spacing:0!important;text-transform:none!important;font-style:normal!important;
              color:rgba(255,238,205,.78);background:rgba(18,14,28,.82);
              border:1px solid rgba(255,238,205,.34);border-radius:5px;
              box-shadow:0 1px 3px rgba(0,0,0,.4);pointer-events:none}
            .ilyos-touche.ilyos-touche-dock{top:8px;right:auto;left:calc(50% + 22px)}
            .ilyos-touche:empty{display:none}
            body:not([data-indices]) .ilyos-touche{display:none!important}
            body.puzzle-mode #gameScreen.puzzle-on .ilyos-touche.ilyos-touche-dock{top:-1px;left:auto;right:calc(50% + 16px)}`;
          document.head.appendChild(style);
        }

        /* Idempotent : un bouton reconstruit (l'icone ↶ est posee apres coup
           par hud-organique-v2-final-v8.js) recoit simplement un nouvel indice.
           Un bouton decoupe par un clip-path rognerait un indice pose dedans :
           le sien est pose a cote, dans le parent, au coin du bouton, et suit
           sa visibilite a chaque geste (rafraichirIndices). Fin du tour, assez
           grand, le garde a l'interieur de sa decoupe, en bas a droite (`coin`).
           ↶ n'en porte plus (Taekun, 2026-10-16). */
        function poserIndices() {
          installerStyle();
          const manette = document.body.dataset.entree === "manette";
          INDICES.forEach(indice => {
            const bouton = document.getElementById(indice.id);
            if (!bouton) return;
            const style = getComputedStyle(bouton);
            const parent = bouton.parentElement;
            const dehors = !indice.coin && style.clipPath !== "none" && !!parent && bouton.offsetParent === parent;
            let marque = document.querySelector(`.ilyos-touche[data-pour="${indice.id}"]`);
            if (marque && marque.parentElement !== (dehors ? parent : bouton)) { marque.remove(); marque = null; }
            if (!marque) {
              if (!dehors && style.position === "static") bouton.style.position = "relative";
              marque = document.createElement("span");
              marque.className = "ilyos-touche" + (indice.dock ? " ilyos-touche-dock" : "");
              marque.dataset.pour = indice.id;
              marque.setAttribute("aria-hidden", "true");
              if (indice.coin) marque.style.cssText = indice.coin;
              /* En ligne : la typographie du HUD (Almendra) l'emportait sur la
                 feuille ci-dessus pour les boutons d'action. */
              marque.style.setProperty("font-family", "'Nunito Sans', Inter, system-ui, sans-serif", "important");
              if (dehors) bouton.after(marque); else bouton.appendChild(marque);
            }
            if (dehors) {
              marque.style.left = `${bouton.offsetLeft + bouton.offsetWidth - 11}px`;
              marque.style.top = `${bouton.offsetTop - 6}px`;
              marque.style.right = "auto";
              marque.hidden = style.display === "none" || style.visibility === "hidden";
            }
            const texte = manette ? indice.manette : indice.clavier;
            if (marque.textContent !== texte) marque.textContent = texte;
          });
        }
        window.addEventListener("resize", poserIndices, { passive: true });

        /* Un geste peut masquer ou montrer ↶ (tutoriel, enigme, fin de
           partie) : un seul rafraichissement, une fois l'interface a jour. */
        let rafraichissement = 0;
        function rafraichirIndices() {
          if (rafraichissement) return;
          rafraichissement = setTimeout(() => { rafraichissement = 0; poserIndices(); }, 400);
        }

        /* Indices visibles : souris de bureau au depart, puis le dernier
           moyen utilise decide (doigt = rien, clavier/souris/manette = oui). */
        function indices(visibles) {
          if (visibles) document.body.dataset.indices = "1";
          else delete document.body.dataset.indices;
        }
        try { indices(matchMedia("(pointer:fine) and (hover:hover)").matches); } catch (e) { indices(false); }

        function modeEntree(manette) {
          indices(true);
          if ((document.body.dataset.entree === "manette") === manette) return;
          if (manette) document.body.dataset.entree = "manette";
          else delete document.body.dataset.entree;
          poserIndices();
        }
        ilyosModeManette = () => modeEntree(true);
        document.addEventListener("pointerdown", event => {
          if (event.pointerType === "touch" || event.pointerType === "pen") indices(false);
          else modeEntree(false);
          rafraichirIndices();
        }, { capture: true, passive: true });

        (function attendreHud(essais) {
          const undo = document.getElementById("ov2Undo");
          if ((undo && undo.dataset.v8Undo === "1") || essais > 600) { poserIndices(); return; }
          requestAnimationFrame(() => attendreHud(essais + 1));
        })(0);

        function visible(element) {
          if (!element || !element.getClientRects().length) return false;
          const style = getComputedStyle(element);
          return style.visibility !== "hidden" && style.display !== "none";
        }

        function usable(button) {
          return visible(button) && !button.disabled
            && button.getAttribute("aria-disabled") !== "true"
            && !button.classList.contains("disabled");
        }

        function cliquer(id) {
          const bouton = document.getElementById(id);
          if (!usable(bouton)) return false;
          bouton.click();
          return true;
        }

        function enPartie() {
          return !!state && visible(els.gameScreen) && !fenetreOuverte()
            && !visible(document.getElementById("hudV2GearPopover"));
        }

        /* Gardiens que le moteur propose pour l'action engagee (meme lecture
           que la manette : la marque .selectable posee par renderBoard). */
        function gardiensOfferts() {
          return [...document.querySelectorAll(".cell .character.selectable")]
            .map(marque => marque.closest(".cell"))
            .filter(Boolean)
            .map(cell => ({ r: Number(cell.dataset.r), c: Number(cell.dataset.c) }))
            .filter(cell => Number.isFinite(cell.r) && Number.isFinite(cell.c));
        }

        function choisirGardien(cell) {
          dispatchKayKitClick({ userData: { r: cell.r, c: cell.c } }, { clientX: 0, clientY: 0, button: 0, buttons: 0 });
        }

        /* Les marques .selectable disparaissent des qu'un gardien est pris :
           on garde donc la liste vue au choix du premier, pour l'action en
           cours. Cliquer un autre gardien allie change directement de gardien,
           comme a la souris. */
        let liste = { action: null, cases: [] };

        function gardienSuivant(sens) {
          const action = state.selectedActionType || "";
          if (state.phase !== "ACTION" || !["MOVE", "PUSH"].includes(action)) return false;
          if (state.pushOptions && state.pushOptions.length && state.selectedCharId) return false;
          const encours = state.characters.find(char => char.id === state.selectedCharId);
          if (!encours || liste.action !== action) liste = { action, cases: gardiensOfferts() };
          const offerts = liste.cases.filter(cell =>
            state.characters.some(char => char.player === state.currentPlayer && char.r === cell.r && char.c === cell.c));
          if (!offerts.length) return false;
          const rang = encours ? offerts.findIndex(cell => cell.r === encours.r && cell.c === encours.c) : -1;
          const suivant = rang < 0 && sens < 0 ? offerts[offerts.length - 1]
            : offerts[(rang + sens + offerts.length) % offerts.length];
          if (encours && suivant.r === encours.r && suivant.c === encours.c) return true;
          choisirGardien(suivant);
          return true;
        }

        /* Le bouton ↶ est masque pendant les enigmes, qui annulent au clic
           droit : on suit donc le bouton d'origine (#cancelCardBtn), sauf dans
           les tutoriels, qui bloquent toute annulation. */
        function annuler() {
          const tutoriel = els.gameScreen.classList.contains("tutorial-on")
            || els.gameScreen.classList.contains("tutorial-eveil");
          if (tutoriel || !els.cancelCardBtn || els.cancelCardBtn.disabled || state.inputLocked) return false;
          handleCancelButton();
          return true;
        }

        /* Une fin de tour accidentelle coute un tour entier : refusee tant
           qu'une ile est en pose ou qu'une poussee attend sa direction. */
        function finDuTour() {
          if ((state.phase === "PLACE_ISLAND" && state.placementCells) || (state.pushOptions && state.pushOptions.length)) {
            showToast("Terminez ou annulez le geste en cours avant de finir le tour.");
            return true;
          }
          return cliquer("ov2End");
        }

        document.addEventListener("keydown", event => {
          const cible = event.target;
          const balise = cible && cible.tagName ? cible.tagName.toUpperCase() : "";
          /* Le clavier virtuel d'un telephone ne tape que dans un champ. */
          if (["INPUT", "TEXTAREA", "SELECT"].includes(balise) || (cible && cible.isContentEditable)) return;
          modeEntree(false);
          rafraichirIndices();
          if (event.defaultPrevented || event.altKey || event.repeat) return;
          if (!enPartie()) return;

          const ctrl = event.ctrlKey || event.metaKey;
          const touche = event.key.length === 1 ? event.key.toLowerCase() : event.key;
          let fait = false;

          if (ctrl) {
            if (touche === "z" && !event.shiftKey) fait = annuler();
            if (fait) event.preventDefault();
            return;
          }

          if (DOCK[touche]) fait = cliquer(DOCK[touche]);
          else if (touche === "Enter") {
            /* Entree actionne le bouton qui a le focus : une case du plateau
               jouee au clavier doit le rester. */
            if (balise === "BUTTON" && cible.closest(".cell")) return;
            fait = finDuTour();
          }
          else if (touche === "Backspace") fait = annuler();
          else if (touche === "Tab") fait = gardienSuivant(event.shiftKey ? -1 : 1);
          else if (touche === "m") fait = cliquer("ov2Gear");
          else if (touche === "d") {
            window.dispatchEvent(new CustomEvent("ilyos:toggle-discard-viewer"));
            fait = true;
          }

          if (fait) event.preventDefault();
        });
      })();
