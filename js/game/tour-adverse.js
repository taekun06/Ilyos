      /* =====================================================================
         TOUR ADVERSE : REVOIR SON TOUR EN TOUCHANT SON PORTRAIT

         Quand l'adversaire a joué pendant qu'on regardait ailleurs, toucher
         son portrait rejoue son tour sur le vrai plateau, avec les vraies
         animations des gardiens (marche, poussée, chute, magie), puis ramène
         le plateau au présent. Sans texte : le liseré du tour prend sa
         couleur, un voile discret borde l'écran et un petit chiffre « 1/3 »
         sous le portrait dit où l'on en est. Toucher n'importe où arrête.

         Remplace les traces au repos et la frise (PR #141), jugées peu
         lisibles. Rien n'est dessiné tant qu'on ne demande pas le rejeu.

         Chaque action réelle passe par un noyau de règle : on les enveloppe
         (comme defaites-vue.js) pour prendre un instantané avant et après, et
         on écarte les explorations du planner (état simulé). Tous les tours
         d'une partie locale sont relevés, humains compris, pour le
         multijoueur sur le même écran.
         ===================================================================== */

      const tourAdverse = {
        etat: null,          // objet `state` de la partie relevée
        courant: null,       // tour en cours de relevé : { joueur, etapes }
        tours: [],           // tours terminés, du plus ancien au plus récent
        aRevoir: [],         // étapes rejouables au début du tour humain
        rejeu: null,         // jeton du rejeu en cours
        dansDeplacement: false
      };

      function tourAdverseReleve() {
        return !!state && !ilyosSimulationActive && !tourAdverse.rejeu
          && tourAdverse.etat === state && !!tourAdverse.courant;
      }

      function tourAdverseAjouter(etape, avant) {
        etape.avant = avant;
        etape.apres = snapshotState();
        etape.joueur = state.currentPlayer;
        // Hauteur de la pile d'annulation : une annulation retire les étapes
        // jouées au-dessus (multijoueur local, où l'humain peut se reprendre).
        etape.pile = state.undoHistory?.length || 0;
        tourAdverse.courant.etapes.push(etape);
        return etape;
      }

      (function tourAdverseEnvelopper() {
        const origine = {
          move: applyMoveCore, push: applyPushCore, magie: applyMagicRotationCore,
          pose: applyIslandPlacementCore, depot: applyFreeDropCore,
          couronne: giveArtifactToCharacter, debut: beginTurn, victoire: showVictory,
          annuler: restoreUndoSnapshot, sauver: scheduleLocalSave, pause: jeuEnPause
        };
        applyMoveCore = function (charId, r, c, cost) {
          const releve = tourAdverseReleve();
          let chemin = null, avant = null;
          if (releve) {
            const gardien = characterById(charId);
            if (gardien) {
              avant = snapshotState();
              try {
                chemin = [[gardien.r, gardien.c], ...(shortestMovementPath(gardien, r, c, Number.isFinite(cost) ? cost : 99) || [[r, c]])];
              } catch (erreur) { chemin = [[gardien.r, gardien.c], [r, c]]; }
            }
          }
          tourAdverse.dansDeplacement = true;
          let resultat;
          try { resultat = origine.move.apply(this, arguments); } finally { tourAdverse.dansDeplacement = false; }
          if (resultat && releve && chemin) tourAdverseAjouter({ type: "move", charId, chemin }, avant);
          return resultat;
        };
        applyPushCore = function (pusherId, r, c, force) {
          const releve = tourAdverseReleve();
          let plan = null, avant = null;
          if (releve) {
            const p = characterById(pusherId);
            avant = snapshotState();
            try { plan = p ? resoudrePousseeBloc(r, c, r - p.r, c - p.c, force) : null; } catch (erreur) { plan = null; }
            if (plan) plan = { de: p ? [p.r, p.c] : null, mouvements: plan.mouvements };
          }
          const resultat = origine.push.apply(this, arguments);
          if (resultat && releve && plan) {
            const chutes = plan.mouvements
              .filter(mv => mv.chute && mv.kind !== "crown" && mv.id != null)
              .map(mv => ({ id: mv.id, direction: [mv.to[0] - mv.from[0], mv.to[1] - mv.from[1]] }));
            const touches = plan.mouvements.filter(mv => mv.kind !== "crown" && mv.id != null && !mv.chute).map(mv => mv.id);
            tourAdverseAjouter({ type: "push", pusherId, cible: [r, c], de: plan.de, chutes, touches }, avant);
          }
          return resultat;
        };
        applyMagicRotationCore = function (islandId) {
          const releve = tourAdverseReleve();
          let magie = null, avant = null;
          if (releve) {
            avant = snapshotState();
            const pas = ((state.magicPreviewSteps % 4) + 4) % 4;
            const pivot = state.selectedMagicPivot;
            const lanceur = state.selectedCharId ?? state.characters.find(g => g.player === state.currentPlayer)?.id;
            magie = { islandId, pivot: Array.isArray(pivot) ? [pivot[0], pivot[1]] : null, degres: pas === 3 ? -90 : pas * 90, lanceur };
          }
          const resultat = origine.magie.apply(this, arguments);
          if (resultat && releve && magie) tourAdverseAjouter({ type: "magie", ...magie }, avant);
          return resultat;
        };
        applyIslandPlacementCore = function () {
          const releve = tourAdverseReleve();
          const avant = releve ? snapshotState() : null;
          const resultat = origine.pose.apply(this, arguments);
          if (resultat && releve) tourAdverseAjouter({ type: "pose" }, avant);
          return resultat;
        };
        applyFreeDropCore = function () {
          const releve = tourAdverseReleve();
          const avant = releve ? snapshotState() : null;
          const resultat = origine.depot.apply(this, arguments);
          if (resultat && releve) tourAdverseAjouter({ type: "couronne" }, avant);
          return resultat;
        };
        giveArtifactToCharacter = function () {
          // Le ramassage pendant une marche fait déjà partie de l'étape « move ».
          const releve = tourAdverseReleve() && !tourAdverse.dansDeplacement;
          const avant = releve ? snapshotState() : null;
          const resultat = origine.couronne.apply(this, arguments);
          if (resultat && releve) tourAdverseAjouter({ type: "couronne" }, avant);
          return resultat;
        };
        beginTurn = function () {
          const resultat = origine.debut.apply(this, arguments);
          try { tourAdverseDebutTour(); } catch (erreur) { console.warn("[ILYOS] tour adverse", erreur); }
          return resultat;
        };
        showVictory = function () {
          tourAdverseArreter();
          tourAdverseEffacer();
          return origine.victoire.apply(this, arguments);
        };
        restoreUndoSnapshot = function () {
          const resultat = origine.annuler.apply(this, arguments);
          const courant = tourAdverse.courant;
          if (resultat && courant && tourAdverse.etat === state) {
            const pile = state.undoHistory?.length || 0;
            courant.etapes = courant.etapes.filter(e => e.pile <= pile);
          }
          return resultat;
        };
        // Pendant le rejeu, l'état affiché est le passé : rien ne s'enregistre
        // et le chrono du tour est gelé, comme menu ouvert.
        scheduleLocalSave = function () {
          if (tourAdverse.rejeu) return;
          return origine.sauver.apply(this, arguments);
        };
        jeuEnPause = function () {
          return (!!tourAdverse.rejeu && !!state && state.winner === null) || origine.pause.apply(this, arguments);
        };
      })();

      function tourAdverseDebutTour() {
        if (!state || state.winner !== null || state.tutorial || state.puzzle || state.onlineMode) {
          tourAdverseEffacer();
          return;
        }
        if (tourAdverse.etat !== state) tourAdverseEffacer();
        tourAdverse.etat = state;
        if (tourAdverse.courant?.etapes.length) tourAdverse.tours.push(tourAdverse.courant);
        tourAdverse.courant = { joueur: state.currentPlayer, etapes: [] };
        if (currentPlayer()?.isAI) {
          tourAdverseBadge();
          return;
        }
        /* Début d'un tour humain : on peut revoir tout ce qui s'est joué
           depuis son tour précédent (un ou plusieurs adversaires). */
        const moi = state.currentPlayer;
        let depuis = tourAdverse.tours.length;
        while (depuis > 0 && tourAdverse.tours[depuis - 1].joueur !== moi) depuis--;
        const tours = tourAdverse.tours.slice(depuis);
        tourAdverse.tours = tours;
        tourAdverse.aRevoir = tours.flatMap(t => t.etapes);
        tourAdverseBadge();
        // Le HUD peut se reconstruire juste après le début du tour.
        requestAnimationFrame(tourAdverseBadge);
      }

      function tourAdverseEffacer() {
        tourAdverse.etat = null;
        tourAdverse.courant = null;
        tourAdverse.tours = [];
        tourAdverse.aRevoir = [];
        tourAdverseBadge();
      }

      /* --- Portrait ------------------------------------------------------------ */

      function tourAdverseStyle() {
        if (document.getElementById("tourAdverseStyle")) return;
        const style = document.createElement("style");
        style.id = "tourAdverseStyle";
        style.textContent = `
          #ilyosHudOrganicV2 .ov2-avatar.ta-revoir{cursor:pointer}
          #tourAdversePastille{position:fixed;z-index:61;width:22px;height:22px;border-radius:50%;background:rgba(24,16,44,.9);border:1.5px solid var(--ta-c,#ffc94a);box-shadow:0 2px 6px rgba(0,0,0,.4);display:grid;place-items:center;pointer-events:none;transition:opacity .2s ease}
          #tourAdversePastille svg{width:13px;height:13px}
          body.tour-adverse-rejeu #tourAdversePastille{opacity:0}
          #tourAdverseVoile{position:fixed;inset:0;z-index:58;cursor:pointer;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 58%,rgba(16,10,34,.42) 100%)}
          #tourAdverseCompteur{position:fixed;z-index:61;padding:2px 9px;border-radius:999px;background:rgba(24,16,44,.82);border:1px solid var(--ta-c,#ffc94a);color:#fff;font:600 13px/18px Georgia,serif;letter-spacing:.04em;pointer-events:none;transform:translateX(-50%)}
          body.tour-adverse-rejeu :is(#hudV2Dock,#ov2Instruction,#ov2Toast,.ov2-dock,#ov2End,#ov2Undo,#ov2Guardian,#ov2DeckHud,#ov2DiscardHud){visibility:hidden!important}
          #tourAdverseCompteur b{color:var(--ta-c,#ffc94a);font-weight:700}
        `;
        document.head.appendChild(style);
      }

      const TOUR_ADVERSE_ICONE = '<svg viewBox="0 0 24 24"><path d="M5 12a7 7 0 1 0 2.1-5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><path d="M4 3.5v5h5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

      /* Portrait à toucher : celui de l'autre camp que le joueur au trait
         (à droite pour l'adversaire en solo, à gauche en local quand c'est
         au joueur de droite). */
      function tourAdversePortrait() {
        if (!state) return null;
        const cote = state.currentPlayer === 0 ? ".ov2-right" : ".ov2-left";
        return document.querySelector(`#ilyosHudOrganicV2 ${cote} .ov2-avatar`);
      }

      function tourAdverseDisponible() {
        return !!state && tourAdverse.etat === state && tourAdverse.aRevoir.length > 0
          && state.winner === null && !currentPlayer()?.isAI && !state.inputLocked;
      }

      /* Pastille « revoir » posée au coin du portrait, côté plateau. Elle vit
         hors du portrait, qui rogne tout ce qui dépasse de son contour. */
      function tourAdverseBadge() {
        if (typeof document === "undefined") return;
        document.querySelectorAll("#ilyosHudOrganicV2 .ov2-avatar.ta-revoir").forEach(el => el.classList.remove("ta-revoir"));
        let pastille = document.getElementById("tourAdversePastille");
        const portrait = tourAdverse.aRevoir.length && state && !currentPlayer()?.isAI ? tourAdversePortrait() : null;
        const zone = portrait?.getBoundingClientRect();
        if (!portrait || !zone?.width) { pastille?.remove(); return; }
        tourAdverseStyle();
        if (!pastille) {
          pastille = document.createElement("span");
          pastille.id = "tourAdversePastille";
          pastille.setAttribute("aria-hidden", "true");
          pastille.innerHTML = TOUR_ADVERSE_ICONE;
          (els.gameScreen || document.body).appendChild(pastille);
        }
        const joueur = tourAdverse.aRevoir[tourAdverse.aRevoir.length - 1].joueur;
        pastille.style.setProperty("--ta-c", state.players?.[joueur]?.color || "#ffc94a");
        const droite = portrait.closest(".ov2-right");
        pastille.style.left = `${Math.round(droite ? zone.left - 6 : zone.right - 18)}px`;
        pastille.style.top = `${Math.round(zone.bottom - 18)}px`;
        portrait.classList.add("ta-revoir");
      }
      window.addEventListener("resize", () => tourAdverseBadge());

      /* --- Rejeu ------------------------------------------------------------- */

      function tourAdverseAttendre(ms, jeton) {
        // Même facteur que sleep() : le banc de capture peut ralentir le rejeu.
        const duree = benchSpeedFactor === 1 ? ms : Math.round(ms * benchSpeedFactor);
        return new Promise(resolve => setTimeout(() => resolve(tourAdverse.rejeu === jeton), duree));
      }

      // Pose un instantané pour l'écran seulement : sélections et aperçus
      // effacés, sauf le gardien qui agit.
      function tourAdversePoser(json, acteur = null) {
        const snap = JSON.parse(json);
        Object.assign(snap, {
          phase: "ACTION_SELECT", reachable: [], pushOptions: [], placementCells: null,
          selectedMagicPivot: null, magicPreviewCells: null, selectedActionType: null,
          selectedIslandId: null, selectedIslandShape: null, hoverAnchor: null,
          crownTransferTargetIds: [], selectedCharId: acteur
        });
        applyStateSnapshot(snap);
        state.inputLocked = true;
      }

      function tourAdverseJouer(e) {
        const anime = isKayKitBoardActive() && !kaykitReducedMotion();
        if (e.type === "move") {
          const vers = e.chemin[e.chemin.length - 1];
          const duree = Math.min(1600, 140 + (e.chemin.length - 1) * 340);
          tourAdversePoser(e.apres, e.charId);
          if (anime) queueKayKitActionAnimation(e.charId, "move", duree, { r: vers[0], c: vers[1] }, e.chemin.slice(1), null, e.chemin[0]);
          renderAll();
          return duree + 250;
        }
        if (e.type === "push") {
          if (anime) {
            queueKayKitActionAnimation(e.pusherId, "attack", 900, { r: e.cible[0], c: e.cible[1] });
            e.touches.forEach(id => queueKayKitActionAnimation(id, "hurt", 850, e.de ? { r: e.de[0], c: e.de[1] } : null));
            e.chutes.forEach(ch => queueKayKitCharacterFall(ch.id, ch.direction));
          }
          tourAdversePoser(e.apres, e.pusherId);
          renderAll();
          return e.chutes.length ? 1300 : 1000;
        }
        if (e.type === "magie") {
          if (anime && e.pivot) {
            queueKayKitActionAnimation(e.lanceur, "magic", 1150, { r: e.pivot[0], c: e.pivot[1] });
            playIslandMagicRotation(e.islandId, e.degres, e.pivot[0], e.pivot[1], 500);
            kaykitGelerCalqueIles(true);
            setTimeout(() => kaykitGelerCalqueIles(false), 560);
          }
          tourAdversePoser(e.apres, e.lanceur);
          renderAll();
          return 1200;
        }
        tourAdversePoser(e.apres);
        renderAll();
        return 1000;
      }

      function tourAdverseCompteur(n, total, couleur, portrait) {
        let el = document.getElementById("tourAdverseCompteur");
        if (!el) {
          el = document.createElement("div");
          el.id = "tourAdverseCompteur";
          el.setAttribute("aria-hidden", "true");
          document.body.appendChild(el);
        }
        el.style.setProperty("--ta-c", couleur);
        el.innerHTML = `<b>${n}</b>/${total}`;
        const zone = portrait?.getBoundingClientRect();
        el.style.left = `${zone ? Math.round(zone.left + zone.width / 2) : window.innerWidth - 48}px`;
        el.style.top = `${zone && zone.height ? Math.round(zone.bottom + 6) : 84}px`;
      }

      async function tourAdverseRevoir() {
        if (tourAdverse.rejeu || !tourAdverseDisponible()) return false;
        const etapes = tourAdverse.aRevoir.slice();
        const jeton = {};
        const present = snapshotState();
        const partie = state;
        // Pendant le rejeu le trait est à l'adversaire : on garde le portrait touché.
        const portrait = tourAdversePortrait();
        const lisere = { cle: renderLisereTour.cle, acte: renderLisereTour.acte };
        tourAdverse.rejeu = jeton;
        tourAdverseStyle();
        const voile = document.createElement("div");
        voile.id = "tourAdverseVoile";
        voile.addEventListener("pointerdown", evenement => { evenement.preventDefault(); evenement.stopPropagation(); tourAdverseArreter(); });
        document.body.appendChild(voile);
        document.body.classList.add("tour-adverse-rejeu");
        state.selectedCharId = null;
        try {
          let continuer = true;
          for (let i = 0; i < etapes.length && continuer; i++) {
            const e = etapes[i];
            // Le plateau revient à l'instant d'avant l'action ; les gardiens
            // glissent d'eux-mêmes vers leur ancienne case.
            tourAdversePoser(e.avant, e.type === "move" ? e.charId : e.type === "push" ? e.pusherId : e.type === "magie" ? e.lanceur : null);
            renderAll();
            tourAdverseCompteur(i + 1, etapes.length, state.players?.[e.joueur]?.color || "#ffc94a", portrait);
            continuer = await tourAdverseAttendre(i === 0 ? 700 : 350, jeton);
            if (!continuer) break;
            continuer = await tourAdverseAttendre(tourAdverseJouer(e), jeton);
          }
          if (continuer) await tourAdverseAttendre(500, jeton);
        } finally {
          if (state === partie) {
            applyStateSnapshot(JSON.parse(present));
            state.inputLocked = false;
            Object.assign(renderLisereTour, lisere);
          }
          tourAdverse.rejeu = null;
          voile.remove();
          document.getElementById("tourAdverseCompteur")?.remove();
          document.body.classList.remove("tour-adverse-rejeu");
          if (state === partie) {
            renderAll();
            tourAdverseBadge();
          }
        }
        return true;
      }

      function tourAdverseArreter() {
        if (tourAdverse.rejeu) tourAdverse.rejeu = { arrete: true };
      }

      /* Le portrait est construit hors du bundle et l'en-tête du HUD passe
         par-dessus (transparent) : on teste la position du toucher plutôt
         que la cible. */
      document.addEventListener("click", evenement => {
        if (tourAdverse.rejeu || !tourAdverseDisponible()) return;
        const zone = tourAdversePortrait()?.getBoundingClientRect();
        if (!zone || !zone.width) return;
        const x = evenement.clientX, y = evenement.clientY;
        if (x < zone.left - 4 || x > zone.right + 4 || y < zone.top - 4 || y > zone.bottom + 4) return;
        evenement.preventDefault();
        evenement.stopPropagation();
        tourAdverseRevoir();
      }, true);
      // Une touche pendant le rejeu l'arrête, sans rien déclencher d'autre.
      window.addEventListener("keydown", evenement => {
        if (!tourAdverse.rejeu) return;
        evenement.preventDefault();
        evenement.stopImmediatePropagation();
        tourAdverseArreter();
      }, true);
