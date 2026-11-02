      /* =====================================================================
         MODE ROTATION — le recueil des modes de jeu.

         L'écran Rotation du menu (menu/rotation.js) compose une partie en
         briques : un BUT, des COUCHES, un plateau. Il dépose sa demande par
         window.ILYOS_ROTATION.demander() juste avant de lancer une partie
         locale ; la demande est lue au premier tour et rangée dans
         `state.rotation`, qui voyage avec l'état (sauvegarde, annulation).

         Étape 1 : le but BALISES.
         — Quatre balises sur la croix centrale, à 3 cases du sanctuaire
           (4 en 13×13), donc à la même distance des deux camps.
         — Une balise n'est allumée que sur une île : sur le vide, elle attend
           qu'on construise dessous.
         — À la fin de ton tour, chaque balise allumée où se tient un de tes
           gardiens te rapporte 1 point. Premier à 10 points.
         — Pas de couronnes : les deux restent hors du terrain.
         Le décompte se fait à l'ouverture du tour suivant, sur la position
         exacte où le joueur a fini — comme la validation des couronnes.
         ===================================================================== */
      const ROTATION_CIBLE_BALISES = 10;
      let rotationDemande = null;
      let rotationEnPreparation = null;

      function butBalises(source = state) {
        return source?.rotation?.but === "balises";
      }

      function rotationCible(source = state) {
        return butBalises(source) ? (source.rotation.cible || ROTATION_CIBLE_BALISES) : 3;
      }

      /* Les balises sont des CASES du plateau, fixées à la mise en place. */
      function rotationCasesBalises() {
        const d = GRID >= 13 ? 4 : 3;
        return [
          [CENTER.r - d, CENTER.c], [CENTER.r, CENTER.c + d],
          [CENTER.r + d, CENTER.c], [CENTER.r, CENTER.c - d]
        ];
      }

      function baliseAllumee(r, c) {
        return !!islandAt(r, c);
      }

      /** Gardien posé sur la balise, ou null. */
      function gardienSurBalise(r, c) {
        return (state.characters || []).find(g => g.r === r && g.c === c) || null;
      }

      /** Balises allumées que tient ce joueur (ou son équipe). */
      function balisesTenuesPar(playerId) {
        if (!butBalises()) return 0;
        return (state.rotation.balises || []).filter(([r, c]) => {
          if (!baliseAllumee(r, c)) return false;
          const g = gardienSurBalise(r, c);
          return !!g && memeEquipe(g.player, playerId);
        }).length;
      }

      /* Les couronnes restent hors du terrain pendant toute la partie. */
      function rotationRangerCouronnes() {
        if (!butBalises() || !state) return;
        [state.artifact, state.secondArtifact].forEach(artifact => {
          if (!artifact) return;
          artifact.active = false;
          artifact.carrierId = null;
        });
        state.couronnesEnAttente = [];
      }

      const rotationEnsureArtifactStateBase = ensureArtifactState;
      ensureArtifactState = function ensureArtifactStateRotation() {
        rotationEnsureArtifactStateBase();
        rotationRangerCouronnes();
      };

      const rotationResetArtifactObjectBase = resetArtifactObject;
      resetArtifactObject = function resetArtifactObjectRotation(artifact) {
        if (butBalises() && artifact) {
          artifact.active = false;
          artifact.carrierId = null;
          return;
        }
        rotationResetArtifactObjectBase(artifact);
      };

      /* Lancement : la demande du menu vaut pour la seule partie qui suit. */
      const rotationStartLocalGameBase = startLocalGame;
      startLocalGame = function startLocalGameRotation() {
        rotationEnPreparation = rotationDemande;
        rotationDemande = null;
        try {
          rotationStartLocalGameBase();
        } finally {
          rotationEnPreparation = null;
        }
      };

      const ROTATION_COUCHES = ["deckbuilding", "creatures"];
      /* Une demande valide : un but connu, des couches connues. Couronnes
         sans couche, c'est la partie classique : pas de Rotation. */
      function rotationNormaliser(demande) {
        const but = demande?.but === "balises" ? "balises" : "couronnes";
        const couches = (Array.isArray(demande?.couches) ? demande.couches : []).filter(c => ROTATION_COUCHES.includes(c));
        if (but === "couronnes" && !couches.length) return null;
        return { but, couches };
      }

      function rotationInstaller(demande) {
        const voulue = rotationNormaliser(demande);
        if (!state || state.rotation || !voulue) return;
        state.rotation = {
          but: voulue.but,
          couches: Object.fromEntries(voulue.couches.map(c => [c, true]))
        };
        if (voulue.but !== "balises") { rotationIntituleBilan(); return; }
        Object.assign(state.rotation, {
          cible: ROTATION_CIBLE_BALISES,
          balises: rotationCasesBalises(),
          dernierDecompte: 0
        });
        state.rules = { ...(state.rules || {}), disableSecondCrown: true };
        rotationRangerCouronnes();
        rotationIntituleBilan();
      }

      /* Le bilan de fin compte des points, plus des couronnes. */
      function rotationIntituleBilan() {
        const colonne = BILAN_COLONNES.find(col => col.titre === "Couronnes" || col.titre === "Points");
        if (colonne) colonne.titre = butBalises() ? "Points" : "Couronnes";
      }

      /* Décompte des balises du joueur qui vient de finir son tour. Rend
         true si la partie est gagnée. */
      function rotationDecompterBalises() {
        if (!butBalises() || state.winner !== null || state.turn <= 1) return false;
        if (state.rotation.dernierDecompte === state.turn) return false;
        state.rotation.dernierDecompte = state.turn;
        const n = state.players.length;
        const precedent = state.players[(state.currentPlayer - 1 + n) % n];
        if (!precedent) return false;
        const gagnes = balisesTenuesPar(precedent.id);
        if (!gagnes) return false;
        state.players.forEach(p => {
          if (memeEquipe(p.id, precedent.id)) p.score = (p.score || 0) + gagnes;
        });
        if (!ilyosSimulationActive) {
          state.fxCells ||= [];
          state.rotation.balises.forEach(([r, c]) => {
            const g = gardienSurBalise(r, c);
            if (g && memeEquipe(g.player, precedent.id) && baliseAllumee(r, c)) {
              state.fxCells.push({ type: "score", r, c });
              animateCellPulse(r, c, "crown-burst");
            }
          });
          triggerScoreAnimation(precedent.id);
          playSfx("crownTake");
          showToast(`${precedent.name} tient ${gagnes > 1 ? `${gagnes} balises` : "une balise"} : +${gagnes} (${precedent.score}/${rotationCible()})`);
        }
        if (precedent.score < rotationCible()) return false;
        state.winner = precedent.id;
        if (!ilyosSimulationActive) {
          playVictoryCelebration(precedent.id);
          setTimeout(() => showVictory(precedent,
            `${precedent.name} a tenu les balises jusqu’à ${precedent.score} points et prend le contrôle d’ILYOS.`), 900);
        }
        return true;
      }

      const rotationBeginTurnBase = beginTurn;
      beginTurn = function beginTurnRotation() {
        if (rotationEnPreparation && state && !state.rotation) rotationInstaller(rotationEnPreparation);
        rotationEnPreparation = null;
        if (state?.turn === 1) rotationIntituleBilan();
        if (butBalises() && rotationDecompterBalises()) {
          renderAll();
          return;
        }
        const premierTour = butBalises() && state.turn === 1 && !state.rotation.annonce;
        rotationBeginTurnBase();
        if (premierTour && !ilyosSimulationActive) {
          state.rotation.annonce = true;
          setTimeout(() => showToast(`Rotation · Balises : tiens les balises allumées. ${rotationCible()} points pour gagner.`), 1400);
        }
      };

      /* HUD : des points à la place des trois couronnes. */
      function rotationScoreHud(joueur) {
        if (!butBalises() || !joueur) return null;
        return `<span class="hud-v2-balises-score" title="Points de balises">`
          + `<span class="hud-v2-balise-icone" aria-hidden="true"></span>`
          + `<b>${joueur.score || 0}</b><small>/${rotationCible()}</small></span>`;
      }

      /* L'IA. Le planner sait déjà jouer îles, déplacements, poussées et
         magie ; seule son évaluation parle de couronnes. En mode Balises,
         elle est remplacée par une évaluation qui compte ce qui rapporte :
         le score, les balises tenues à la fin du tour, et la distance qui
         sépare chaque camp des balises. Tous les niveaux de CPU passent par
         le planner : les niveaux sans planner ne savent viser qu'une couronne. */
      const ROTATION_POIDS = {
        point: 1000,
        baliseTenue: 620,
        baliseAdverse: 520,
        distanceBalise: 45,
        distanceBaliseEteinte: 12,
        gardien: 150
      };

      function rotationDistanceAuCamp(playerId, r, c) {
        let meilleur = 99;
        for (const g of state.characters || []) {
          if (!memeEquipe(g.player, playerId)) continue;
          const d = Math.abs(g.r - r) + Math.abs(g.c - c);
          if (d < meilleur) meilleur = d;
        }
        return meilleur;
      }

      function rotationEvaluerBalises(playerId) {
        const moi = state.players[playerId];
        if (!moi) return 0;
        if (state.winner !== null && state.winner !== undefined) {
          if (state.winner === MATCH_NUL) return 0;
          return memeEquipe(state.winner, playerId) ? 1e7 : -1e7;
        }
        const adverses = state.players.filter(p => !memeEquipe(p.id, playerId));
        const scoreAdverse = Math.max(0, ...adverses.map(p => p.score || 0));
        let valeur = ((moi.score || 0) - scoreAdverse) * ROTATION_POIDS.point;
        for (const [r, c] of state.rotation.balises) {
          const allumee = baliseAllumee(r, c);
          const g = gardienSurBalise(r, c);
          if (allumee && g) {
            valeur += memeEquipe(g.player, playerId) ? ROTATION_POIDS.baliseTenue : -ROTATION_POIDS.baliseAdverse;
          }
          const poids = allumee ? ROTATION_POIDS.distanceBalise : ROTATION_POIDS.distanceBaliseEteinte;
          const dMoi = Math.min(8, rotationDistanceAuCamp(playerId, r, c));
          const dLui = Math.min(8, Math.min(...adverses.map(p => rotationDistanceAuCamp(p.id, r, c))));
          valeur += (dLui - dMoi) * poids;
        }
        const mesGardiens = (state.characters || []).filter(g => memeEquipe(g.player, playerId)).length;
        const sesGardiens = (state.characters || []).filter(g => !memeEquipe(g.player, playerId)).length;
        valeur += (mesGardiens - sesGardiens) * ROTATION_POIDS.gardien;
        if (plannerTraceEval) plannerTraceEval.push({ terme: "balises", montant: valeur, note: null });
        return valeur;
      }

      const rotationEvaluerEtatBase = evaluerEtatStrategique;
      evaluerEtatStrategique = function evaluerEtatStrategiqueRotation(playerId) {
        return butBalises() ? rotationEvaluerBalises(playerId) : rotationEvaluerEtatBase(playerId);
      };

      const rotationAiConfigBase = aiConfig;
      aiConfig = function aiConfigRotation() {
        const cfg = rotationAiConfigBase();
        return butBalises() && !cfg.globalPlanning ? { ...cfg, globalPlanning: true } : cfg;
      };

      /* RENDU 3D. Une balise est un cercle de runes au sol et une colonne de
         lumière. Allumée : lumière claire, ou couleur du camp qui la tient.
         Éteinte (au-dessus du vide) : un simple anneau pâle qui flotte, pour
         qu'on voie où construire. Matériaux de base, sans lumière ajoutée ni
         animation : rien ne tourne en continu. */
      const ROTATION_BALISE_CLAIRE = 0x35c6f2;
      const ROTATION_BALISE_CONTOUR = 0x0d1b26;

      /* Mélange normal partout : en additif, la lumière virait au blanc sur
         l'herbe claire et le ciel, et cachait le gardien qui tient la balise. */
      function rotationMateriau(couleur, opacite, { additif = false, alphaMap = null } = {}) {
        return new THREE.MeshBasicMaterial({
          color: couleur, transparent: true, opacity: opacite, alphaMap,
          depthWrite: false, blending: additif ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide
        });
      }

      /* Dégradés partagés : la colonne s'efface vers le haut, le halo vers
         son bord. Deux petites toiles, créées une fois. */
      let rotationDegrades = null;
      function rotationTexturesDegrade() {
        if (rotationDegrades) return rotationDegrades;
        const vertical = document.createElement("canvas");
        vertical.width = 4; vertical.height = 64;
        let ctx = vertical.getContext("2d");
        let g = ctx.createLinearGradient(0, 64, 0, 0);
        g.addColorStop(0, "#fff"); g.addColorStop(.35, "#888"); g.addColorStop(.85, "#000");
        ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 64);
        const radial = document.createElement("canvas");
        radial.width = radial.height = 64;
        ctx = radial.getContext("2d");
        g = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
        g.addColorStop(0, "#fff"); g.addColorStop(.7, "#aaa"); g.addColorStop(1, "#000");
        ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
        rotationDegrades = { vertical: new THREE.CanvasTexture(vertical), radial: new THREE.CanvasTexture(radial) };
        return rotationDegrades;
      }

      function rotationConstruireBalise() {
        const { vertical, radial } = rotationTexturesDegrade();
        const groupe = new THREE.Group();
        const aplat = mesh => { mesh.rotation.x = -Math.PI / 2; return mesh; };
        // Contour sombre puis anneau franc : lisible sur tout fond.
        const runes = aplat(new THREE.Mesh(new THREE.RingGeometry(.4, .47, 48), rotationMateriau(ROTATION_BALISE_CONTOUR, .55)));
        const sol = aplat(new THREE.Mesh(new THREE.RingGeometry(.31, .42, 48), rotationMateriau(ROTATION_BALISE_CLAIRE, .95)));
        sol.position.y = .003;
        const halo = aplat(new THREE.Mesh(new THREE.CircleGeometry(.31, 40), rotationMateriau(ROTATION_BALISE_CLAIRE, .4, { alphaMap: radial })));
        halo.position.y = .002;
        // Lumière plus basse et plus fine : elle signale sans aveugler le gardien.
        const colonne = new THREE.Mesh(new THREE.CylinderGeometry(.3, .36, 1.5, 32, 1, true), rotationMateriau(ROTATION_BALISE_CLAIRE, .3, { alphaMap: vertical }));
        colonne.position.y = .75;
        const coeur = new THREE.Mesh(new THREE.CylinderGeometry(.035, .05, 2.2, 10, 1, true), rotationMateriau(ROTATION_BALISE_CLAIRE, .55, { alphaMap: vertical }));
        coeur.position.y = 1.1;
        groupe.add(runes, sol, halo, colonne, coeur);
        groupe.userData.rotationParties = { sol, runes, halo, colonne, coeur };
        groupe.renderOrder = 4;
        return groupe;
      }

      function rotationSyncBalises3D() {
        if (!kaykit3D?.dynamicGroup) return;
        if (!butBalises()) {
          if (kaykit3D.rotationBalises) {
            disposeKayKitObjects([kaykit3D.rotationBalises]);
            kaykit3D.rotationBalises = null;
          }
          return;
        }
        if (!kaykit3D.rotationBalises || !kaykit3D.rotationBalises.parent) {
          const groupe = new THREE.Group();
          groupe.name = "rotation-balises";
          state.rotation.balises.forEach(() => groupe.add(rotationConstruireBalise()));
          kaykit3D.dynamicGroup.add(groupe);
          kaykit3D.rotationBalises = groupe;
        }
        state.rotation.balises.forEach(([r, c], i) => {
          const balise = kaykit3D.rotationBalises.children[i];
          if (!balise) return;
          const allumee = baliseAllumee(r, c);
          const g = allumee ? gardienSurBalise(r, c) : null;
          const couleur = g ? new THREE.Color(state.players[g.player]?.color || ROTATION_BALISE_CLAIRE).getHex() : ROTATION_BALISE_CLAIRE;
          const p = kaykitCellPosition(r, c, kaykitCellSurfaceY(r, c));
          // Case vide : la balise repose sur la grille, à hauteur du dessus des îles.
          balise.position.set(p.x, allumee ? p.y + .05 : KAYKIT_LEVELS.islandTop + .02, p.z);
          const { sol, runes, halo, colonne, coeur } = balise.userData.rotationParties;
          [sol, halo, colonne, coeur].forEach(m => m.material.color.setHex(couleur));
          /* Éteinte : anneau pâle, pour voir où construire. Allumée libre :
             anneau cyan franc et lumière. Tenue : tout à la couleur du camp,
             halo au sol plein, lumière plus haute. */
          sol.material.opacity = allumee ? .95 : .45;
          runes.material.opacity = allumee ? .55 : .25;
          halo.visible = allumee;
          halo.material.opacity = g ? .45 : .25;
          colonne.visible = allumee;
          coeur.visible = allumee;
          colonne.material.opacity = g ? .6 : .45;
          colonne.scale.y = g ? 1.25 : 1;
          colonne.position.y = .75 * colonne.scale.y;
          coeur.material.opacity = g ? .85 : .65;
        });
      }

      const rotationSyncKayKitSceneBase = syncKayKitScene;
      syncKayKitScene = function syncKayKitSceneRotation() {
        rotationSyncKayKitSceneBase();
        try {
          rotationSyncBalises3D();
        } catch (erreur) {
          console.warn("[ILYOS] balises 3D", erreur);
        }
      };

      window.ILYOS_ROTATION = {
        /* Demande du menu pour la prochaine partie locale ; null l'annule. */
        demander(demande) {
          rotationDemande = rotationNormaliser(demande);
          return rotationDemande;
        },
        etat: () => (state?.rotation ? JSON.parse(JSON.stringify(state.rotation)) : null),
        /* Banc : la note que l'IA donne à la position courante pour ce camp. */
        evaluer: playerId => (butBalises() ? Math.round(rotationEvaluerBalises(playerId)) : null),
        balisesTenues: playerId => balisesTenuesPar(playerId)
      };
