      /* =====================================================================
         MODE ROTATION — but EFFONDREMENT (règles v1 du 01/11, doc de
         conception du mode Rotation).

         — Pas de pose obligatoire : poser une île coûte 2 cartes (règle des
           îles payantes, rules-core.js) et fait toujours apparaître un
           gardien.
         — L'archipel s'effondre : à la fin de chaque tour, la plus ancienne
           île sans personne dessus coule. Les villages et le sanctuaire ne
           coulent jamais (ce ne sont pas des îles).
         — Gagner : le premier camp qui a fait tomber 3 gardiens adverses.
           En duel, chaque gardien perdu compte pour l'adversaire (même poussé
           par son propre camp). Plus de place pour poser : le plus de chutes
           gagne, égalité = nul (vainqueurAuxCouronnes lit player.score).
         — Pas de couronnes (butSansCouronnes, rotation.js).

         Le compteur de chutes infligées est `player.score` : il voyage avec
         l'état, les clones du planner et le bilan, comme les couronnes.

         L'effondrement a lieu au passage de tour, dans scoreCrownsAtTurnStart,
         que les trois transitions appellent (vraie partie, anticipation du
         planner, self-play) : l'IA voit donc l'île couler.
         ===================================================================== */
      const EFFONDREMENT_CIBLE = 3;

      function butEffondrement(source = state) {
        return source?.rotation?.but === "effondrement";
      }

      /* Appelé par rotationInstaller (rotation.js) une fois state.rotation
         posé : îles payantes, une seule couronne, aucune en jeu. */
      function effondrementInstaller() {
        Object.assign(state.rotation, { cible: EFFONDREMENT_CIBLE, dernierEffondrement: 0 });
        state.rules = { ...(state.rules || {}), disableSecondCrown: true, ilesPayantes: true };
        rotationRangerCouronnes();
      }

      /** L'île qui coulera à la fin du tour en cours : la plus ancienne (plus
       *  petit identifiant) sur laquelle ne se tient personne. Les îles de la
       *  mise en place sont les plus anciennes. */
      function effondrementProchaineIle(source = state) {
        if (!source?.islands?.length) return null;
        const occupees = new Set((source.characters || []).map(g => `${g.r},${g.c}`));
        let choisie = null;
        for (const ile of source.islands) {
          if (ile.cells.some(([r, c]) => occupees.has(`${r},${c}`))) continue;
          if (!choisie || ile.id < choisie.id) choisie = ile;
        }
        return choisie;
      }

      /* Une île coule. Jamais de personnage dessus (choisie vide) ; un œuf
         (couche Créatures) reste sur le vide et attend une nouvelle île. */
      function effondrementCouler() {
        const ile = effondrementProchaineIle();
        if (!ile) return null;
        if (!ilyosSimulationActive) effondrementAnimerChute(ile);
        state.islands = state.islands.filter(is => is.id !== ile.id);
        if (state.selectedIslandId === ile.id) state.selectedIslandId = null;
        return ile;
      }

      /* Passage de tour : l'île tombe avant que le joueur suivant joue. */
      const effondrementScoreDebutBase = scoreCrownsAtTurnStart;
      scoreCrownsAtTurnStart = function scoreCrownsAtTurnStartEffondrement(player, options = {}) {
        if (butEffondrement() && !options.immediat && state && state.winner === null
          && state.turn > 1 && state.rotation.dernierEffondrement !== state.turn) {
          // Copie à l'écriture : un clone du planner peut partager l'objet.
          state.rotation = { ...state.rotation, dernierEffondrement: state.turn };
          effondrementCouler();
          return 0;
        }
        return effondrementScoreDebutBase(player, options);
      };

      /* ---------- Chutes ------------------------------------------------- */
      /** Camp crédité de la chute d'un gardien de `victime` : le joueur actif
       *  s'il est adverse ; sinon, en duel, l'autre camp. */
      function effondrementAuteur(victime) {
        const actif = state.players[state.currentPlayer];
        if (actif && !memeEquipe(actif.id, victime)) return actif;
        const adverses = state.players.filter(p => !memeEquipe(p.id, victime));
        const camps = new Set(adverses.map(p => (gardiensPartages() ? p.id % 2 : p.id)));
        return camps.size === 1 ? adverses[0] : null;
      }

      const effondrementRemoveBase = removeCharacterFromGame;
      removeCharacterFromGame = function removeCharacterFromGameEffondrement(char, ...args) {
        const compte = butEffondrement() && char && !char.creature && !estNeutre(char)
          && state.winner === null && state.players[char.player];
        const resultat = effondrementRemoveBase(char, ...args);
        if (compte) effondrementCompterChute(char);
        return resultat;
      };

      function effondrementCompterChute(char) {
        const auteur = effondrementAuteur(char.player);
        if (!auteur) return;
        state.players.forEach(p => {
          if (memeEquipe(p.id, auteur.id)) p.score = (p.score || 0) + 1;
        });
        if (!ilyosSimulationActive) triggerScoreAnimation(auteur.id);
        if ((auteur.score || 0) < rotationCible()) return;
        state.winner = auteur.id;
        if (ilyosSimulationActive) return;
        stopTurnTimer();
        playVictoryCelebration(auteur.id);
        setTimeout(() => showVictory(auteur,
          `${auteur.name} a fait tomber ${rotationCible()} gardiens adverses et règne sur ce qu’il reste d’ILYOS.`), 1500);
      }

      /* ---------- HUD ----------------------------------------------------- */
      /* Trois emplacements, comme les couronnes : chaque gardien adverse
         tombé en remplit un. Silhouette de gardien qui chute, sans texte. */
      const EFFONDREMENT_ICONE = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="5" r="2.6"/><path d="M6.4 9.2 C7.6 8 12.4 8 13.6 9.2 L12.6 14 L7.4 14 Z"/><path d="M5 17.5 H15" class="vide-ligne"/></svg>';
      function effondrementScoreHud(joueur) {
        if (!butEffondrement() || !joueur) return null;
        const pleins = Math.max(0, Math.min(rotationCible(), joueur.score || 0));
        let html = "";
        for (let i = 0; i < rotationCible(); i++) {
          html += `<span class="hud-v2-chute-icon${i < pleins ? " is-filled" : ""}">${EFFONDREMENT_ICONE}</span>`;
        }
        return `<span class="hud-v2-chutes" title="Gardiens adverses tombés : ${pleins}/${rotationCible()}">${html}</span>`;
      }
      const effondrementScoreHudBase = rotationScoreHud;
      rotationScoreHud = function rotationScoreHudEffondrement(joueur) {
        return butEffondrement() ? effondrementScoreHud(joueur) : effondrementScoreHudBase(joueur);
      };

      /* Annonce du premier tour. */
      const effondrementBeginTurnBase = beginTurn;
      beginTurn = function beginTurnEffondrement() {
        const resultat = effondrementBeginTurnBase();
        if (butEffondrement() && state?.turn === 1 && !state.rotation.annonce && !ilyosSimulationActive) {
          state.rotation.annonce = true;
          setTimeout(() => showToast(`Rotation · Effondrement : à chaque fin de tour, la plus vieille île vide coule. Fais tomber ${rotationCible()} gardiens adverses. Une île coûte 2 cartes.`), 1400);
        }
        return resultat;
      };

      /* ---------- IA ------------------------------------------------------- */
      /* Le planner sait déjà pousser, poser et tourner ; seule l'évaluation
         change : chutes infligées, gardiens en jeu, gardiens exposés au vide
         (plannerGraviteExpulsion, comme le jeu classique). */
      /* Réglés au banc (scripts/selfplay-effondrement.js, 2026-11-16) :
         plus prudent (expose 1200), l'IA se terrait et la partie calait ;
         plus agressif (contact 120), elle se jetait au contact et le second
         joueur gagnait 15 parties sur 16. */
      const EFFONDREMENT_POIDS = {
        chute: 2600,
        // Un gardien de plus en jeu vaut plus que les 2 cartes de son île.
        gardien: 900,
        // Gardien qu'une poussée adverse peut jeter au vide au prochain tour.
        expose: 700,
        // Gardien adverse que JE peux jeter au vide.
        cible: 500,
        // Rapprochement : distance moyenne entre mes gardiens et les siens.
        contact: 40
      };

      function effondrementEvaluer(playerId) {
        const moi = state.players[playerId];
        if (!moi) return 0;
        if (state.winner !== null && state.winner !== undefined) {
          if (state.winner === MATCH_NUL) return 0;
          return memeEquipe(state.winner, playerId) ? 1e7 : -1e7;
        }
        const adverses = state.players.filter(p => !memeEquipe(p.id, playerId));
        const leurScore = Math.max(0, ...adverses.map(p => p.score || 0));
        let valeur = ((moi.score || 0) - leurScore) * EFFONDREMENT_POIDS.chute;
        const gardiens = (state.characters || []).filter(g => !g.creature && !estNeutre(g) && state.players[g.player]);
        const miens = gardiens.filter(g => memeEquipe(g.player, playerId));
        const siens = gardiens.filter(g => !memeEquipe(g.player, playerId));
        valeur += (miens.length - siens.length) * EFFONDREMENT_POIDS.gardien;
        const adverse = adverses[0];
        avecGrilleTerre(() => {
          miens.forEach(g => { valeur -= plannerGraviteExpulsion(playerId, g.r, g.c, true) * EFFONDREMENT_POIDS.expose; });
          if (adverse) siens.forEach(g => { valeur += plannerGraviteExpulsion(adverse.id, g.r, g.c, true) * EFFONDREMENT_POIDS.cible; });
        });
        if (miens.length && siens.length) {
          let total = 0;
          miens.forEach(a => { total += Math.min(...siens.map(b => Math.abs(a.r - b.r) + Math.abs(a.c - b.c))); });
          valeur -= (total / miens.length) * EFFONDREMENT_POIDS.contact;
        }
        if (plannerTraceEval) plannerTraceEval.push({ terme: "effondrement", montant: valeur, note: null });
        return valeur;
      }

      const effondrementEvaluerEtatBase = evaluerEtatStrategique;
      evaluerEtatStrategique = function evaluerEtatStrategiqueEffondrement(playerId) {
        return butEffondrement() ? effondrementEvaluer(playerId) : effondrementEvaluerEtatBase(playerId);
      };

      const effondrementAiConfigBase = aiConfig;
      aiConfig = function aiConfigEffondrement() {
        const cfg = effondrementAiConfigBase();
        return butEffondrement() && !cfg.globalPlanning ? { ...cfg, globalPlanning: true } : cfg;
      };

      /* ---------- Rendu 3D ------------------------------------------------- */
      /* L'île qui coulera à la fin du tour porte un liseré braise le long de
         son pourtour : on voit sans texte ce qui va tomber, et on peut la
         sauver en y posant un gardien. Statique, matériau de base, rien qui
         tourne en continu. */
      const EFFONDREMENT_BRAISE = 0xff4d12;

      function effondrementConstruireLisere(ile) {
        const groupe = new THREE.Group();
        groupe.name = "effondrement-lisere";
        groupe.userData.ileId = ile.id;
        groupe.userData.cle = ile.cells.map(([r, c]) => `${r},${c}`).join(";");
        // Couleur franche, insensible à la lumière du ciel (qui la délavait
        // en saumon) : matériau non éclairé, hors correction de tons.
        const matiere = new THREE.MeshBasicMaterial({ color: EFFONDREMENT_BRAISE, toneMapped: false });
        matiere.userData = { ilyosTransient: true };
        const sombre = new THREE.MeshStandardMaterial({ color: 0x2a0f06, roughness: .9, metalness: 0 });
        sombre.userData = { ilyosTransient: true };
        const L = KAYKIT_BLOCK_SIZE, e = .09, h = .05;
        const barreH = kaykitGeometry("effondrement-barre-h", () => new THREE.BoxGeometry(L, h, e));
        const barreV = kaykitGeometry("effondrement-barre-v", () => new THREE.BoxGeometry(e, h, L));
        const ombreH = kaykitGeometry("effondrement-ombre-h", () => new THREE.BoxGeometry(L + .02, h * .6, e + .04));
        const ombreV = kaykitGeometry("effondrement-ombre-v", () => new THREE.BoxGeometry(e + .04, h * .6, L + .02));
        const dedans = new Set(ile.cells.map(([r, c]) => `${r},${c}`));
        ile.cells.forEach(([r, c]) => {
          const p = kaykitCellPosition(r, c, kaykitCellSurfaceY(r, c));
          [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dr, dc]) => {
            if (dedans.has(`${r + dr},${c + dc}`)) return;
            const horizontale = dr !== 0;
            const x = p.x + dc * (L / 2 - e / 2);
            const z = p.z + dr * (L / 2 - e / 2);
            const ombre = new THREE.Mesh(horizontale ? ombreH : ombreV, sombre);
            ombre.position.set(x, p.y + h * .3, z);
            const barre = new THREE.Mesh(horizontale ? barreH : barreV, matiere);
            barre.position.set(x, p.y + h / 2 + .004, z);
            groupe.add(ombre, barre);
          });
        });
        groupe.traverse(o => { o.raycast = () => {}; });
        return groupe;
      }

      function effondrementSync3D() {
        if (!kaykit3D?.dynamicGroup) return;
        const ile = butEffondrement() && state.winner === null && !state.draft ? effondrementProchaineIle() : null;
        const actuel = kaykit3D.effondrementLisere;
        const cle = ile ? ile.cells.map(([r, c]) => `${r},${c}`).join(";") : null;
        if (actuel && actuel.parent && actuel.userData.cle === cle) return;
        if (actuel) {
          disposeKayKitObjects([actuel]);
          kaykit3D.effondrementLisere = null;
        }
        if (!ile) return;
        const lisere = effondrementConstruireLisere(ile);
        kaykit3D.dynamicGroup.add(lisere);
        kaykit3D.effondrementLisere = lisere;
      }

      const effondrementSyncSceneBase = syncKayKitScene;
      syncKayKitScene = function syncKayKitSceneEffondrement() {
        effondrementSyncSceneBase();
        try {
          effondrementSync3D();
        } catch (erreur) {
          console.warn("[ILYOS] effondrement 3D", erreur);
        }
      };

      /* L'île coule : une copie de ses blocs (géométries et matériaux
         partagés, rien d'alloué) glisse vers les nuages en 0,9 s, puis
         disparaît. La vraie île a déjà quitté l'état. */
      function effondrementAnimerChute(ile) {
        try {
          playSfx("fall", { c: ile.cells[0]?.[1] ?? CENTER.c, delay: .05 });
          if (!kaykit3D?.dynamicGroup || !kaykit3D.scene) return;
          const blocs = kaykit3D.dynamicGroup.children.filter(
            enfant => enfant.userData?.islandBlock && String(enfant.userData.islandId) === String(ile.id));
          const lisere = kaykit3D.effondrementLisere?.userData?.ileId === ile.id ? kaykit3D.effondrementLisere : null;
          const copies = [...blocs, ...(lisere ? [lisere] : [])].map(bloc => {
            const copie = bloc.clone(true);
            bloc.updateWorldMatrix(true, false);
            copie.matrixAutoUpdate = true;
            bloc.matrixWorld.decompose(copie.position, copie.quaternion, copie.scale);
            copie.traverse(o => { o.raycast = () => {}; });
            kaykit3D.scene.add(copie);
            return copie;
          });
          if (!copies.length) return;
          if (kaykitReducedMotion()) { copies.forEach(c => c.parent?.remove(c)); return; }
          copies.forEach((copie, i) => {
            const baseY = copie.position.y;
            const penche = (i % 2 ? 1 : -1) * .18;
            kaykit3D.fxTweens.push({
              object: copie,
              startedAt: performance.now(),
              duration: 900,
              update: (obj, t) => {
                // Tremble un instant, puis tombe en accélérant.
                const chute = t < .18 ? 0 : Math.pow((t - .18) / .82, 3);
                const tremble = t < .18 ? Math.sin(t * 160) * .025 : 0;
                obj.position.y = baseY - chute * 4.2;
                obj.position.x += tremble;
                obj.rotation.z = penche * chute;
              },
              dispose: obj => { obj.parent?.remove(obj); }
            });
          });
          kaykitChoc?.(1);
        } catch (erreur) {
          console.warn("[ILYOS] effondrement chute", erreur);
        }
      }

      window.ILYOS_EFFONDREMENT = {
        prochaineIle: () => effondrementProchaineIle()?.id ?? null,
        evaluer: playerId => (butEffondrement() ? Math.round(effondrementEvaluer(playerId)) : null),
        poids(nouveaux) {
          const avant = { ...EFFONDREMENT_POIDS };
          if (nouveaux) Object.assign(EFFONDREMENT_POIDS, nouveaux);
          return avant;
        },
        /* Banc (scripts/selfplay-effondrement.js) : un départ de self-play
           converti en partie Effondrement. */
        depart(json, { setup = null, cible = null } = {}) {
          return withSimulatedState(JSON.parse(json), () => {
            if (setup) applyStartingBoardMode("symmetric", setup);
            state.rotation = null;
            rotationInstaller({ but: "effondrement", couches: [] });
            if (cible) state.rotation.cible = cible;
            state.islandPlacedThisTurn = false;
            return snapshotState();
          });
        }
      };
