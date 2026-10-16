      /* ILYOS — Raccourcis clavier d'une partie

         Couche d'entree uniquement, comme la manette (gamepad.js) : chaque
         touche clique le bouton du dock que la souris cliquerait. Un bouton
         masque ou desactive (tutoriel, tour adverse, enigme d'un seul tour)
         ne repond donc pas non plus au clavier, sans condition a recopier ici.

           1 2 3 4         Ile, Deplacer, Pousser, Magie (ordre du dock)
           Entree          fin du tour
           Retour, Ctrl+Z  annuler le dernier coup (bouton ↶)
           Tab, Maj+Tab    gardien suivant / precedent pendant un deplacement
                           ou une poussee
           M               menu
           D               defausse

         Les raccourcis existants restent ou ils sont : Q/E/F (core.js,
         handleRotateKey), fleches et Espace (handleCameraKey), Echap
         (diagnostics.js), T (js/plateau-tactique.js), O (puzzle.js). */
      (function setupIlyosClavier() {
        if (typeof document === "undefined") return;

        const DOCK = { "1": "ov2Island", "2": "ov2Move", "3": "ov2Push", "4": "ov2Magic" };

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
          if (event.defaultPrevented || event.altKey || event.repeat) return;
          const cible = event.target;
          const balise = cible && cible.tagName ? cible.tagName.toUpperCase() : "";
          if (["INPUT", "TEXTAREA", "SELECT"].includes(balise) || (cible && cible.isContentEditable)) return;
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
