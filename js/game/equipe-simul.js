      /* ==================================================================
         2 CONTRE 2 · TOUR D'ÉQUIPE SIMULTANÉ (essai, maquette jouable)

         Menu 4 joueurs → Villages → « Diagonale partagée · tour d'équipe
         simultané ». Les deux coéquipiers (J1+J3 ou J2+J4) jouent le MÊME
         tour : chacun pioche sa main, les gardiens et couronnes sont communs
         (confierGardiensEquipe, rules-core.js), et la main passe de l'un à
         l'autre autant de fois qu'on veut, d'un toucher sur la barre
         d'équipe. Le tour passe à l'équipe adverse quand les DEUX ont dit
         « Prêt ».

         - Une seule île par tour d'équipe, posée par l'un ou l'autre.
         - Annuler ne remonte que les gestes de celui qui a la main depuis
           qu'il l'a prise : on ne défait jamais le geste d'un coéquipier.
         - Un coéquipier CPU joue quand l'humain a dit « Prêt ».
         - Partie locale uniquement ; le CPU simule toujours un tour par
           joueur dans ses calculs (approximation assumée pour l'essai).

         Le pointeur de passage reste state.equipe.base : les tours d'équipe
         s'enchaînent J1+J3, J2+J4, J3+J1, J4+J2 — chaque joueur joue à
         chaque tour de son équipe, deux tours d'équipe par manche.
      ================================================================== */
      function tourEquipeActif() {
        return !!state?.tourEquipe && gardiensPartages() && !state.onlineMode && !ilyosSimulationActive;
      }

      function equipePartenaire() {
        const e = state?.equipe;
        if (!e) return null;
        return e.membres.find(id => id !== state.currentPlayer) ?? null;
      }

      function equipeRelaisEnCours() {
        if (!tourEquipeActif() || !state.equipe) return false;
        const partenaire = equipePartenaire();
        return partenaire !== null && !state.equipe.prets[partenaire];
      }

      function equipeViderSelection() {
        state.selectedActionCardId = null;
        state.selectedActionType = null;
        state.selectedActionCount = 1;
        state.selectedCharId = null;
        state.selectedIslandId = null;
        state.selectedIslandShape = null;
        state.placementCells = null;
        state.hoverAnchor = null;
        state.selectedMagicPivot = null;
        clearMagicPreview();
        clearUnifiedPushOptions();
        state.pendingDirectMoveTarget = null;
        state.actionHoverCell = null;
        state.smartHoverType = null;
        state.smartHoverPath = [];
        state.reachable = new Set();
        state.phase = "ACTION_SELECT";
      }

      /* La main passe au coéquipier, sans pioche ni passage de tour. */
      function equipeDonnerLaMain(cible, { annonce = true } = {}) {
        const e = state?.equipe;
        if (!tourEquipeActif() || !e || state.winner !== null || state.turnTransitioning) return false;
        if (!e.membres.includes(cible) || cible === state.currentPlayer || e.prets[cible]) return false;
        if (state.phase !== "ACTION_SELECT" && !prepareActionSwitch()) return false;
        const joueur = state.players[cible];
        state.currentPlayer = cible;
        confierGardiensEquipe(cible);
        confierMinionNeutre(cible);
        equipeViderSelection();
        state.undoHistory = [];
        state.aiThinking = !!joueur.isAI;
        state.inputLocked = !!joueur.isAI;
        els.gameScreen.classList.toggle("ai-turn", !!joueur.isAI);
        resetKayKitPointerFeedback();
        playSfx("select");
        renderAll();
        if (annonce) showToast(`${joueur.name} prend la main.`);
        if (joueur.isAI) {
          const token = ++aiRunToken;
          setTimeout(() => runAITurn(token), 450);
        } else {
          kaykitFollowCurrentPlayer();
        }
        return true;
      }

      /* Ouverture d'un tour d'équipe : l'humain prend la main en premier, son
         coéquipier pioche aussi sa propre main. */
      const beginTurnAvantEquipe = beginTurn;
      beginTurn = function beginTurnEquipe(...args) {
        if (!tourEquipeActif()) {
          if (state) state.equipe = null;
          return beginTurnAvantEquipe(...args);
        }
        const base = state.currentPlayer;
        const autre = (base + 2) % state.players.length;
        const membres = state.players[base].isAI && !state.players[autre].isAI ? [autre, base] : [base, autre];
        state.equipe = { base, membres, prets: {} };
        state.currentPlayer = membres[0];
        const resultat = beginTurnAvantEquipe(...args);
        if (!state || state.winner !== null || !state.equipe) return resultat;
        const second = state.players[membres[1]];
        second.hand = [];
        second.stash ||= { MOVE: 0, PUSH: 0, MAGIC: 0 };
        drawCards(second, cartesPiocheesParTour());
        renderAll();
        return resultat;
      };

      /* Le passage de tour repart du pointeur de l'équipe, pas de celui qui
         a joué en dernier. */
      const passageAvantEquipe = applyPassageTourCore;
      applyPassageTourCore = function applyPassageTourEquipe(...args) {
        if (state?.equipe && !ilyosSimulationActive) {
          state.currentPlayer = state.equipe.base;
          state.equipe = null;
        }
        return passageAvantEquipe(...args);
      };

      /* Tant que le coéquipier n'a pas dit « Prêt », l'île n'est pas encore
         due : il peut la poser. */
      const obligationAvantEquipe = obligationIleRemplie;
      obligationIleRemplie = function obligationIleRemplieEquipe(source = state) {
        if (source === state && equipeRelaisEnCours()) return true;
        return obligationAvantEquipe(source);
      };

      /* « Prêt » : ses cartes non jouées vont en réserve ou à la défausse,
         puis la main passe au coéquipier. Le second « Prêt » finit le tour. */
      const endTurnAvantEquipe = endTurn;
      endTurn = async function endTurnEquipe(force = false) {
        if (!equipeRelaisEnCours() || state.turnTransitioning) return endTurnAvantEquipe(force);
        if (!force && state.phase !== "ACTION_SELECT") {
          const annulable = state.phase === "SMART_CHAR" || (state.phase === "ACTION" && !!state.selectedActionType);
          if (!annulable || !prepareActionSwitch()) return;
        }
        const joueur = currentPlayer();
        const partenaire = equipePartenaire();
        aiRunToken++;
        state.inputLocked = true;
        if ((joueur.hand || []).length) {
          state.deckAnimationMode = "discard";
          renderDeckDisplay();
          await sleep(520);
          if (!state || !state.equipe) return;
        }
        state.deckAnimationMode = null;
        rangerEtDefausserFinDeTour(joueur);
        state.equipe.prets[joueur.id] = true;
        state.inputLocked = false;
        playSfx("turn");
        showToast(`${joueur.name} est prêt · à ${state.players[partenaire].name}.`);
        equipeDonnerLaMain(partenaire, { annonce: false });
      };

      /* ---------- Barre d'équipe ---------------------------------------- */
      function equipeBarreInstaller() {
        if (document.getElementById("equipeRelais")) return;
        const style = document.createElement("style");
        style.textContent = `
          #equipeRelais{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 118px);transform:translateX(-50%);
            z-index:40;display:flex;align-items:center;gap:6px;padding:5px 6px;border-radius:999px;
            background:rgba(10,13,26,.9);border:1px solid rgba(255,216,121,.45);box-shadow:0 6px 18px rgba(0,0,0,.35);
            font:700 12.5px/1 system-ui,sans-serif;color:#fff3d6;letter-spacing:.02em;pointer-events:auto}
          #equipeRelais.hidden{display:none}
          #equipeRelais .er-membre{display:flex;align-items:center;gap:7px;padding:6px 12px 6px 6px;border-radius:999px;
            border:1px solid transparent;background:transparent;color:inherit;font:inherit;cursor:pointer;opacity:.78;transition:opacity .15s,background .15s}
          #equipeRelais .er-membre:hover:not(:disabled){opacity:.95;background:rgba(255,255,255,.06)}
          #equipeRelais .er-membre:disabled{cursor:default;color:inherit;filter:none}
          #equipeRelais .er-membre>span{white-space:nowrap}
          #equipeRelais .er-pastille{width:20px;height:20px;border-radius:50%;background:var(--c);box-shadow:inset 0 0 0 2px rgba(0,0,0,.25);
            display:grid;place-items:center;font-size:11px;color:#14121c}
          #equipeRelais .er-membre.is-main,#equipeRelais .er-membre.is-main:disabled{opacity:1 !important;background:linear-gradient(180deg,rgba(255,216,121,.24),rgba(255,216,121,.1));border-color:#ffd879;color:#fff}
          #equipeRelais .er-membre.is-main .er-pastille{box-shadow:0 0 0 2px #14121c,0 0 0 4px var(--c)}
          #equipeRelais .er-membre.is-pret{opacity:.5}
          #equipeRelais .er-etat{font-weight:500;font-size:11px;color:#ffd879;opacity:.9}
          #equipeRelais .er-lien{color:#ffd879;opacity:.8;font-size:14px}
          @media (max-width:640px){#equipeRelais{font-size:11px}#equipeRelais .er-etat{display:none}
            #equipeRelais .er-membre{padding:5px 9px 5px 5px}}
        `;
        document.head.appendChild(style);
        const barre = document.createElement("div");
        barre.id = "equipeRelais";
        barre.className = "hidden";
        barre.setAttribute("role", "group");
        barre.setAttribute("aria-label", "Tour d'équipe");
        barre.addEventListener("click", ev => {
          const bouton = ev.target.closest("[data-membre]");
          if (bouton && !bouton.disabled) equipeDonnerLaMain(Number(bouton.dataset.membre));
        });
        (els.gameScreen || document.body).appendChild(barre);
      }

      function equipeBarreRendre() {
        equipeBarreInstaller();
        const barre = document.getElementById("equipeRelais");
        const e = state?.equipe;
        if (!barre) return;
        if (!tourEquipeActif() || !e || state.winner !== null) { barre.classList.add("hidden"); return; }
        barre.classList.remove("hidden");
        barre.textContent = "";
        e.membres.forEach((id, i) => {
          const j = state.players[id];
          const aLaMain = state.currentPlayer === id;
          const pret = !!e.prets[id];
          const bouton = document.createElement("button");
          bouton.type = "button";
          bouton.className = `er-membre${aLaMain ? " is-main" : ""}${pret ? " is-pret" : ""}`;
          bouton.dataset.membre = String(id);
          bouton.style.setProperty("--c", j.color);
          // On ne prend la main que d'un coéquipier humain, pas prêt, quand
          // celui qui l'a n'est pas le CPU en train de jouer.
          bouton.disabled = aLaMain || pret || j.isAI || !!currentPlayer()?.isAI;
          bouton.title = aLaMain ? "A la main" : pret ? "Prêt" : j.isAI ? "Joue quand tu es prêt" : "Prendre la main";
          const pastille = document.createElement("span");
          pastille.className = "er-pastille";
          pastille.style.background = j.color;
          pastille.textContent = pret ? "✓" : "";
          const nom = document.createElement("span");
          nom.textContent = j.name;
          const etat = document.createElement("span");
          etat.className = "er-etat";
          etat.textContent = aLaMain ? "joue" : pret ? "prêt"
            : j.isAI ? (currentPlayer()?.isAI ? "attend" : "après ton Prêt") : `${(j.hand || []).length} cartes`;
          bouton.append(pastille, nom, etat);
          barre.appendChild(bouton);
          if (i === 0) {
            const lien = document.createElement("span");
            lien.className = "er-lien";
            lien.setAttribute("aria-hidden", "true");
            lien.textContent = "⇄";
            barre.appendChild(lien);
          }
        });
      }

      const renderControlsAvantEquipe = renderControls;
      renderControls = function renderControlsEquipe(...args) {
        const r = renderControlsAvantEquipe(...args);
        if (equipeRelaisEnCours() && els.endTurnBtn) {
          els.endTurnBtn.textContent = "Prêt";
          els.endTurnBtn.title = `Ranger tes cartes et passer la main à ${state.players[equipePartenaire()].name}.`;
        }
        // Bouton du HUD organique (js/hud-organique-v2.js) : même libellé.
        const libelle = document.querySelector("#ov2End b");
        if (libelle && state?.tourEquipe) {
          const voulu = equipeRelaisEnCours() ? "PRÊT" : "FIN DU TOUR";
          if (libelle.textContent !== voulu) libelle.textContent = voulu;
        }
        equipeBarreRendre();
        return r;
      };

      window.ILYOS_EQUIPE = {
        actif: () => tourEquipeActif(),
        etat: () => state?.equipe ? JSON.parse(JSON.stringify(state.equipe)) : null,
        donnerLaMain: id => equipeDonnerLaMain(id)
      };

