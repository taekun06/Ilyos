      /* =====================================================================
         QUICK — tout apprendre, vite, avant une partie solo

         L'Éveil (tutorial-eveil.js) est un parcours muet et long. Quick est son
         contraire assumé : une suite de petites scènes préparées, UN geste
         chacune, une consigne d'une ligne et la règle qui va avec, en petit.
         On apprend à la SOURIS : les raccourcis ne sont donnés qu'à la fin,
         comme une façon d'aller plus vite.

         Ce fragment ne modifie aucune règle. Comme les énigmes (puzzle.js), il
         construit un `state` normal, laisse le joueur agir avec les vrais
         handlers d'ui.js et le vrai HUD, et observe l'état pour savoir si le
         geste a abouti. Une scène ratée (plus de cartes, but non atteint) est
         simplement reposée.

         Point d'entrée : l'événement `ilyos-quick-requested` (bouton QUICK du
         menu, js/version-bootstrap.js) ou `window.ILYOS_QUICK.start()`.
         ===================================================================== */

      const QUICK = {
        active: false,
        etape: 0,
        sous: 0,
        ctx: null,
        serie: 0,
        pollTimer: null,
        enchainement: null,
        relais: false,
        dom: null,
        cles: {}
      };

      /* ---------- Scènes ----------------------------------------------------
         Plateau 11×11, villages réels aux coins (J1 : (0,0) et (10,10)) et
         sanctuaire au centre : c'est le plateau d'une vraie partie, vidé.
         `g` : gardiens { key, p, r, c, crown }. `main` : cartes en main. */
      const QUICK_ETAPES = [
        {
          titre: "Île",
          scenes: [
            {
              scene: {
                iles: [[[8, 2], [8, 3], [9, 2], [9, 3]]],
                g: [{ p: 0, r: 8, c: 2 }],
                main: [], pose: true, focus: [8, 4]
              },
              consigne: "Clique ÎLE, choisis une forme, puis pose-la sur le vide",
              regle: "Une île par tour, obligatoire · la molette la fait tourner",
              but: ctx => state.islands.length > ctx.iles
            },
            {
              consigne: "Clique une case de la nouvelle île pour y faire naître un gardien",
              regle: "Un gardien naît à chaque île posée, jusqu’à 6",
              libre: true,
              // Lu sur la nouvelle île plutôt qu'au compte : un double clic
              // pose l'île et fait naître le gardien avant ce sous-but.
              but: () => {
                const ile = state.islands[state.islands.length - 1];
                return state.phase !== "PLACE_SPAWN" && !!ile
                  && ile.cells.some(([r, c]) => quickGardienSur(0, r, c));
              }
            }
          ]
        },
        {
          titre: "Déplacer",
          scenes: [{
            scene: {
              iles: [[[8, 2], [8, 3], [8, 4], [7, 4], [9, 2], [9, 3]]],
              g: [{ p: 0, r: 8, c: 2 }],
              main: ["MOVE", "MOVE", "MOVE"], cible: [7, 4], focus: [8, 3]
            },
            consigne: "Clique ton gardien, puis la case lumineuse",
            regle: "Une carte Déplacer = une case · une diagonale en coûte deux",
            but: () => quickGardienSur(0, 7, 4)
          }]
        },
        {
          titre: "Couronne",
          scenes: [
            {
              scene: {
                iles: [[[5, 2], [5, 3], [6, 2], [6, 3]]],
                g: [{ p: 0, r: 5, c: 3 }, { key: "allie", p: 0, r: 6, c: 5 }],
                couronne: [5, 5], main: ["MOVE", "MOVE"], focus: [5, 4]
              },
              consigne: "Marche jusqu’à la couronne pour la ramasser",
              regle: "La couronne apparaît au sanctuaire, au centre du plateau",
              but: () => quickGardiens(0).some(ch => !!artifactCarriedBy(ch.id))
            },
            {
              consigne: "Clique la couronne, puis ton allié pour la lui passer",
              regle: "Ramasser, passer ou poser la couronne ne coûte aucune carte",
              libre: true,
              but: () => !!artifactCarriedBy(QUICK.cles.allie)
            }
          ]
        },
        {
          titre: "Pousser",
          scenes: [
            {
              scene: {
                iles: [[[8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [9, 1], [9, 2], [9, 3], [9, 4], [9, 5]]],
                g: [{ p: 0, r: 8, c: 1 }, { p: 1, r: 8, c: 2 }],
                main: ["PUSH", "PUSH", "PUSH"], cible: [8, 5], focus: [8, 3]
              },
              consigne: "Clique ton gardien, puis la case où le rival doit atterrir",
              regle: "Une carte Pousser = une case · trois cartes = trois cases",
              but: () => quickGardienSur(1, 8, 5)
            },
            {
              scene: {
                iles: [[[8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [9, 1], [9, 2], [9, 3], [9, 4], [9, 5]]],
                g: [{ p: 0, r: 8, c: 1 }, { p: 1, r: 8, c: 2 }, { p: 1, r: 8, c: 3 }],
                main: ["PUSH", "PUSH"], cible: [8, 5], focus: [8, 3]
              },
              consigne: "Pousse les deux rivaux d’un seul coup jusqu’au bord",
              regle: "Toute la file avance ensemble · chaque carte ajoute une case",
              but: () => quickGardienSur(1, 8, 4) && quickGardienSur(1, 8, 5)
            },
            {
              scene: {
                iles: [[[8, 1], [8, 2], [8, 3], [9, 1], [9, 2], [9, 3]]],
                g: [{ p: 0, r: 8, c: 2 }, { p: 1, r: 8, c: 3 }],
                main: ["PUSH"], focus: [8, 3]
              },
              consigne: "Fais tomber le rival dans le vide",
              regle: "Un gardien poussé hors des îles tombe et quitte la partie",
              but: ctx => quickGardiens(1).length < ctx.rivaux
            },
            {
              scene: {
                iles: [[[8, 1], [8, 2], [9, 1], [9, 2]], [[8, 5], [8, 6], [9, 5], [9, 6]]],
                g: [{ p: 0, r: 8, c: 1 }],
                couronne: [8, 2], main: ["PUSH", "PUSH", "PUSH"], cible: [8, 5], focus: [8, 4]
              },
              consigne: "Lance la couronne par-dessus le vide",
              regle: "Elle peut survoler le vide, mais doit atterrir sur une case d’île libre",
              but: () => quickCouronneSur(8, 5)
            }
          ]
        },
        {
          titre: "Voler",
          scenes: [{
            scene: {
              iles: [[[8, 2], [8, 3], [8, 4], [9, 2], [9, 3], [9, 4]]],
              g: [{ p: 0, r: 8, c: 2 }, { p: 1, r: 8, c: 3, crown: true }],
              main: ["MOVE"], focus: [8, 3]
            },
            consigne: "Clique la couronne du rival pour la lui prendre",
            regle: "Gratuit, dès qu’un de tes gardiens touche le porteur",
            libre: true,
            but: () => quickGardiens(0).some(ch => !!artifactCarriedBy(ch.id))
          }]
        },
        {
          titre: "Magie",
          scenes: [{
            scene: {
              iles: [[[5, 0], [6, 0], [7, 0]], [[2, 0], [2, 1], [3, 1]]],
              g: [{ p: 0, r: 7, c: 0 }],
              main: ["MAGIC"], cible: [3, 0], focus: [5, 1]
            },
            consigne: "Clique le bout de ton île, puis fais-la pivoter jusqu’à la case lumineuse",
            regle: "La magie fait tourner une île autour de la case cliquée, avec ses gardiens",
            but: () => quickGardienSur(0, 3, 0)
          }]
        },
        {
          titre: "Annuler",
          scenes: [{
            scene: {
              iles: [[[8, 2], [8, 3], [8, 4], [9, 2], [9, 3]]],
              g: [{ p: 0, r: 8, c: 2 }],
              main: ["MOVE", "MOVE"], focus: [8, 3]
            },
            consigne: "Fais un pas, puis clique la flèche ↶ en bas à gauche",
            regle: "Annuler revient en arrière dans ton tour, autant de fois que tu veux",
            libre: true,
            but: ctx => ctx.annulMax > 0 && (state.undoHistory || []).length < ctx.annulMax
          }]
        },
        {
          titre: "Marquer",
          scenes: [
            {
              scene: {
                iles: [[[8, 9], [8, 10], [9, 9], [9, 10]]],
                g: [{ key: "porteur", p: 0, r: 8, c: 9, crown: true }],
                main: ["MOVE", "MOVE", "PUSH"], cible: [9, 10], focus: [9, 9]
              },
              consigne: "Ramène la couronne dans ton village",
              regle: "Ton village : les maisons à tes couleurs, dans deux coins · ses trois cases du coin comptent",
              but: () => quickGardiens(0).some(ch => !!artifactCarriedBy(ch.id)
                && isCrownValidationCell(state.players[0], ch.r, ch.c))
            },
            {
              consigne: "Clique Fin du tour",
              regle: "Le point compte au début de ton prochain tour · une carte non jouée va en réserve",
              libre: true,
              finDeTour: true,
              but: () => (state.players[0].score || 0) >= 1
            }
          ]
        }
      ];

      /* ---------- Lecture de l'état ------------------------------------ */
      function quickGardiens(joueur) {
        return (state?.characters || []).filter(ch => ch.player === joueur);
      }

      function quickGardienSur(joueur, r, c) {
        const ch = characterAt(r, c);
        return !!ch && ch.player === joueur;
      }

      function quickCouronneSur(r, c) {
        return activeArtifacts().some(cr => !cr.carrierId && cr.r === r && cr.c === c);
      }

      function quickCartesRestantes() {
        return (state?.players?.[0]?.hand || []).filter(carte => !carte.used).length;
      }

      function quickSousEtape() {
        return QUICK_ETAPES[QUICK.etape]?.scenes[QUICK.sous] || null;
      }

      /* ---------- Construction d'une scène -------------------------------
         Calquée sur puzzleBuildState : un `state` complet de début de tour,
         sans IA, sans seconde couronne. */
      function quickConstruire(scene) {
        setBoardSize(11);
        const villages = getVillageAssignments(2);
        const players = ["VOUS", "RIVAL"].map((name, i) => ({
          id: i, name, color: PLAYER_COLORS[i], icon: PLAYER_ICONS[i],
          isAI: false, aiDifficulty: null,
          village: { ...villages[i][0] }, villages: villages[i].map(v => ({ ...v })),
          score: 0, deck: [], discard: [], hand: [], reserveCards: [],
          stash: { MOVE: 0, PUSH: 0, MAGIC: 0 }
        }));

        state = {
          players, soloMode: false, onlineMode: false, visualMode: "alternative",
          startingBoardMode: "classic", startingBoardPreset: null,
          turnDurationSeconds: 0, setupSelectionPending: false, draft: null,
          aiDifficulty: null, currentPlayer: 0, round: 1, turn: 1,
          islands: [], characters: [],
          artifact: { id: "crown-1", r: CENTER.r, c: CENTER.c, carrierId: null, active: false },
          secondArtifact: { id: "crown-2", r: CENTER.r, c: CENTER.c, carrierId: null, active: false },
          phase: "ACTION_SELECT",
          rules: { allowDissolve: false, islandLimitPerPlayer: 0, shapeLimitPerOwner: 0, disableSecondCrown: true },
          islandPlacedThisTurn: !scene.pose,
          centerCrownTakenThisTurn: false,
          couronnesEnAttente: [], treasureDropFromId: null, crownPickupCell: null,
          selectedIslandShape: null, placementCells: null, placementOriginIndex: 0,
          placementRotationSteps: 0, hoverAnchor: null, pendingSpawnIslandId: null,
          fxCells: [], inputLocked: false, aiThinking: false, timerExpiring: false,
          turnTimeLeft: null, turnDeadline: null,
          selectedActionCardId: null, selectedActionType: null, selectedActionCount: 1,
          pushForceChoice: 1, crownStealTargetId: null, aiCrownMemory: {},
          crownPickupArtifactId: null, treasureDropArtifactId: null, crownTransferTargetIds: [],
          selectedCharId: null, selectedIslandId: null, selectedMagicPivot: null,
          magicPreviewDirection: 0, magicPreviewSteps: 0, magicPreviewCells: null,
          magicPreviewValid: false, magicHoverIslandId: null, magicHoverPivot: null,
          actionHoverCell: null, smartHoverType: null, smartHoverPath: [],
          smartPushForce: null, smartPushTargets: new Set(), pushOptions: [],
          pushHoverOptionId: null, pushTargetId: null, pendingDirectMoveTarget: null,
          reachable: new Set(), nextIslandId: 1, nextCharId: 100,
          undoHistory: [], winner: null,
          quick: true
        };

        (scene.iles || []).forEach(cells => tutoAddIsland(cells.map(([r, c]) => [r, c]), 0));

        /* Identifiants propres à chaque montage : sans eux, la scène suivante
           réutiliserait les visuels de la précédente et téléporterait ses
           gardiens au lieu de les faire apparaître (voir puzzleBuildState). */
        QUICK.serie++;
        QUICK.cles = {};
        (scene.g || []).forEach(g => {
          const char = { id: `qk${QUICK.serie}-${state.nextCharId++}`, player: g.p, r: g.r, c: g.c };
          state.characters.push(char);
          if (g.key) QUICK.cles[g.key] = char.id;
          if (g.crown) Object.assign(state.artifact, { active: true, carrierId: char.id, r: g.r, c: g.c });
        });
        if (scene.couronne) {
          Object.assign(state.artifact, { active: true, carrierId: null, r: scene.couronne[0], c: scene.couronne[1] });
        }

        state.players[0].hand = (scene.main || []).map((action, i) => ({ id: `QK${QUICK.serie}-H${i}`, action, used: false }));
        // De quoi piocher au tour suivant (étape « Marquer ») sans remélanger.
        state.players[0].deck = ["MOVE", "MOVE", "MOVE", "PUSH", "PUSH"]
          .map((action, i) => ({ id: `QK${QUICK.serie}-D${i}`, action, used: false }));
      }

      /* ---------- Repère de destination ---------------------------------
         Un anneau doré posé au sol de la case visée, rien de plus. */
      function quickGroupeRepere() {
        if (typeof kaykit3D === "undefined" || !kaykit3D || !kaykit3D.fxGroup || typeof THREE === "undefined") return null;
        let groupe = kaykit3D.quickRepere;
        if (!groupe) {
          groupe = new THREE.Group();
          groupe.name = "ilyos-quick-repere";
          kaykit3D.quickRepere = groupe;
        }
        if (!groupe.parent) kaykit3D.fxGroup.add(groupe);
        return groupe;
      }

      function quickPoserRepere(cible) {
        const groupe = quickGroupeRepere();
        if (!groupe) return;
        if (typeof clearKayKitGroup === "function") clearKayKitGroup(groupe);
        if (!cible) return;
        const p = kaykitCellPosition(cible[0], cible[1], KAYKIT_LEVELS.islandTop + .02);
        const transitoire = objet => { objet.userData = { ...(objet.userData || {}), ilyosTransient: true }; return objet; };
        const couche = (geo, opacite, ordre) => {
          const mat = transitoire(new THREE.MeshBasicMaterial({
            color: 0xffd36a, transparent: true, opacity: opacite, depthTest: false, depthWrite: false
          }));
          const maille = new THREE.Mesh(transitoire(geo), mat);
          maille.rotation.x = -Math.PI / 2;
          maille.position.set(p.x, p.y, p.z);
          maille.renderOrder = ordre;
          groupe.add(maille);
        };
        couche(new THREE.RingGeometry(.25, .33, 48), .9, 62);
        couche(new THREE.CircleGeometry(.25, 48), .16, 61);
      }

      /* ---------- Surcouche -------------------------------------------- */
      function quickStyle() {
        if (document.getElementById("ilyos-quick-style")) return;
        const st = document.createElement("style");
        st.id = "ilyos-quick-style";
        st.textContent = `
          body.quick-mode #hudV2Instruction, body.quick-mode .ov2-v12-instruction,
          body.quick-mode .ov2-v12-instruction-text { display: none !important; }
          body.quick-mode.quick-sans-fin #endTurnBtn, body.quick-mode.quick-sans-fin #ov2End { visibility: hidden !important; }
          #qk-layer { position: fixed; inset: 0; pointer-events: none; z-index: 9000;
            --font-ilyos-display: 'Cinzel Decorative', Georgia, serif;
            --font-ilyos-info: 'Nunito Sans', Inter, system-ui, sans-serif;
            font-family: var(--font-ilyos-info); }
          #qk-layer.qk-fin-active { z-index: 2147483000; }
          #qk-layer .qk-top { position: absolute; top: 84px; left: 50%; transform: translateX(-50%);
            display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 7px 16px 8px;
            border-radius: 14px; background: radial-gradient(ellipse at center, rgba(14,18,34,.55), rgba(14,18,34,0) 75%); }
          #qk-layer .qk-lbl { display: flex; align-items: center; gap: 10px;
            font: 700 11px/1 var(--font-ilyos-info); letter-spacing: .3em;
            color: #f6dc92; text-shadow: 0 1px 6px rgba(0,0,0,.6); white-space: nowrap; }
          #qk-layer .qk-lbl b { color: #fff6d8; font-weight: 700; }
          #qk-layer .qk-btn { pointer-events: auto; cursor: pointer; border: 1px solid rgba(255,214,120,.35);
            background: rgba(14,18,34,.55); color: #f6dc92; border-radius: 999px; padding: 4px 10px;
            font: 700 10px/1 var(--font-ilyos-info); letter-spacing: .18em; }
          #qk-layer .qk-btn:hover { background: rgba(40,32,12,.75); color: #fff3c4; }
          #qk-layer .qk-bar { display: flex; gap: 4px; }
          #qk-layer .qk-bar i { width: 22px; height: 3px; border-radius: 2px; background: rgba(255,255,255,.22); transition: background .3s; }
          #qk-layer .qk-bar i.ok { background: linear-gradient(90deg, #e8b84a, #ffe39a); }
          #qk-layer .qk-bar i.cur { background: #fff3c4; box-shadow: 0 0 8px rgba(255,214,110,.9); }
          #qk-layer .qk-bot { position: absolute; bottom: 146px; left: 50%; transform: translateX(-50%);
            display: flex; flex-direction: column; align-items: center; gap: 5px; width: max-content; max-width: calc(100vw - 32px); }
          #qk-layer .qk-line { display: flex; align-items: center; gap: 10px; padding: 8px 18px;
            border-radius: 999px; background: rgba(14,18,34,.62); border: 1px solid rgba(255,214,120,.35);
            backdrop-filter: blur(6px); color: #fff7e2; font-size: 16px; font-weight: 600;
            box-shadow: 0 6px 22px rgba(0,0,0,.28); transition: border-color .25s, background .25s; text-align: center; }
          #qk-layer .qk-line.reussi { border-color: #ffd36a; background: rgba(60,44,10,.72); }
          #qk-layer .qk-souris { width: 14px; height: 20px; flex: none; }
          #qk-layer .qk-ok { color: #ffd36a; font-size: 18px; line-height: 1; }
          #qk-layer .qk-rule { font-size: 12.5px; color: rgba(255,244,214,.85); text-shadow: 0 1px 4px rgba(0,0,0,.8); text-align: center; }
          #qk-layer .qk-rule::before { content: "◆ "; color: #f2c766; font-size: 9px; }
          #qk-layer .qk-fin { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: auto;
            background: radial-gradient(ellipse at center, rgba(8,10,20,.55), rgba(8,10,20,.78)); }
          #qk-layer .qk-carte { width: min(460px, calc(100vw - 32px)); padding: 26px 28px 22px; border-radius: 18px;
            background: linear-gradient(180deg, rgba(24,28,48,.96), rgba(12,14,26,.96));
            border: 1px solid rgba(255,214,120,.45); box-shadow: 0 20px 60px rgba(0,0,0,.5); color: #fff4dc; text-align: center; }
          #qk-layer .qk-couronnes { font-size: 22px; letter-spacing: 6px; color: #ffd36a; text-shadow: 0 0 12px rgba(255,200,90,.55); }
          #qk-layer .qk-grand { margin: 4px 0 8px; font: 700 28px/1.1 var(--font-ilyos-display); color: #ffe39a; letter-spacing: .04em; text-shadow: 0 2px 10px rgba(0,0,0,.5); }
          #qk-layer .qk-carte p { margin: 6px 0; font-size: 14px; line-height: 1.45; color: rgba(255,244,220,.9); }
          #qk-layer .qk-touches { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 12px; margin: 14px 0 4px; font-size: 12.5px; color: rgba(255,244,220,.8); }
          #qk-layer .qk-touches kbd { display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 5px;
            margin-right: 4px; border-radius: 5px; font: 700 11px/1 Inter, sans-serif; color: #1d1405;
            background: linear-gradient(#ffe7a6, #e2b24c); box-shadow: 0 1px 0 #8a6516; }
          #qk-layer .qk-actions { display: flex; gap: 10px; justify-content: center; margin-top: 18px; }
          #qk-layer .qk-actions button { pointer-events: auto; cursor: pointer; border-radius: 999px; padding: 10px 18px;
            font: 700 13px/1 var(--font-ilyos-display), Georgia, serif; letter-spacing: .08em; }
          #qk-layer .qk-jouer { border: 0; color: #2a1a04; background: linear-gradient(#ffe7a6, #e2b24c); }
          #qk-layer .qk-menu { border: 1px solid rgba(255,214,120,.45); color: #f6dc92; background: transparent; }
          @media (max-width: 720px) {
            #qk-layer .qk-top { top: 64px; }
            #qk-layer .qk-bot { bottom: 128px; }
            #qk-layer .qk-line { font-size: 14px; padding: 7px 14px; }
            #qk-layer .qk-rule { font-size: 11.5px; }
          }
        `;
        document.head.appendChild(st);
      }

      const QUICK_SOURIS = '<svg class="qk-souris" viewBox="0 0 14 20" aria-hidden="true"><rect x="1" y="1" width="12" height="18" rx="6" fill="none" stroke="#f2c766" stroke-width="1.4"/><path d="M7 1v7M1 8h12" stroke="#f2c766" stroke-width="1.2"/><rect x="1.7" y="1.7" width="5.3" height="6.3" rx="3" fill="#f2c766" opacity=".85"/></svg>';

      function quickCalque() {
        if (QUICK.dom && QUICK.dom.isConnected) return QUICK.dom;
        const calque = document.createElement("div");
        calque.id = "qk-layer";
        calque.innerHTML = `<div class="qk-top"><div class="qk-lbl"><span class="qk-titre"></span>
            <button class="qk-btn qk-passer" type="button">PASSER ›</button>
            <button class="qk-btn qk-quitter" type="button" aria-label="Quitter Quick">✕</button></div>
          <div class="qk-bar"></div></div>
          <div class="qk-bot"><div class="qk-line"></div><div class="qk-rule"></div></div>`;
        calque.querySelector(".qk-passer").addEventListener("click", () => quickSuivant());
        calque.querySelector(".qk-quitter").addEventListener("click", () => quickQuitter());
        document.body.appendChild(calque);
        QUICK.dom = calque;
        return calque;
      }

      function quickAfficher(reussi = false) {
        const calque = quickCalque();
        const etape = QUICK_ETAPES[QUICK.etape];
        const sous = quickSousEtape();
        if (!etape || !sous) return;
        const n = etape.scenes.length;
        calque.querySelector(".qk-titre").innerHTML =
          `QUICK · <b>${etape.titre.toUpperCase()}</b>${n > 1 ? ` ${QUICK.sous + 1}/${n}` : ""} · ${QUICK.etape + 1}/${QUICK_ETAPES.length}`;
        calque.querySelector(".qk-bar").innerHTML = QUICK_ETAPES.map((_, i) =>
          `<i class="${i < QUICK.etape ? "ok" : i === QUICK.etape ? "cur" : ""}"></i>`).join("");
        const ligne = calque.querySelector(".qk-line");
        ligne.classList.toggle("reussi", reussi);
        ligne.innerHTML = (reussi ? '<span class="qk-ok">✓</span>' : QUICK_SOURIS) + `<span>${sous.consigne}</span>`;
        calque.querySelector(".qk-rule").textContent = sous.regle || "";
        document.body.classList.toggle("quick-sans-fin", !sous.finDeTour);
      }

      /* ---------- Déroulé ----------------------------------------------- */
      function quickContexte() {
        return {
          iles: state.islands.length,
          gardiens: quickGardiens(0).length,
          rivaux: quickGardiens(1).length,
          annulMax: 0,
          echecDepuis: 0
        };
      }

      /* Pose la scène de la sous-étape courante, ou de la dernière sous-étape
         qui en déclare une quand on rejoue un geste raté. */
      function quickMonterScene() {
        const etape = QUICK_ETAPES[QUICK.etape];
        let i = QUICK.sous;
        while (i > 0 && !etape.scenes[i].scene) i--;
        QUICK.sous = i;
        const scene = etape.scenes[i].scene;
        try { if (typeof aiRunToken !== "undefined") aiRunToken++; } catch (_) { }
        quickConstruire(scene);
        tutoRender();
        quickPoserRepere(scene.cible || null);
        const [fr, fc] = scene.focus || [5, 5];
        try {
          kaykit3D.autoFit = false;
          kaykitFollowCell(fr, fc, { duration: 720, force: true, zoomBoost: .35 });
        } catch (_) { }
        QUICK.ctx = quickContexte();
        quickAfficher();
      }

      function quickSuivant() {
        clearTimeout(QUICK.enchainement);
        QUICK.enchainement = null;
        const etape = QUICK_ETAPES[QUICK.etape];
        if (etape && QUICK.sous + 1 < etape.scenes.length) {
          QUICK.sous++;
          if (etape.scenes[QUICK.sous].scene) quickMonterScene();
          else {
            QUICK.ctx = quickContexte();
            quickPoserRepere(null);
            quickAfficher();
          }
          return;
        }
        QUICK.etape++;
        QUICK.sous = 0;
        if (QUICK.etape >= QUICK_ETAPES.length) { quickFin(); return; }
        quickMonterScene();
      }

      async function quickTourRival() {
        if (QUICK.relais) return;
        QUICK.relais = true;
        try {
          state.islandPlacedThisTurn = true;
          await tutoWait(500);
          if (QUICK.active && state.currentPlayer === 1) await endTurn(true);
        } catch (_) { }
        QUICK.relais = false;
      }

      function quickTick() {
        if (!QUICK.active || !state || QUICK.enchainement) return;
        const sous = quickSousEtape();
        if (!sous) return;
        const scene = QUICK_ETAPES[QUICK.etape].scenes.find(s => s.scene)?.scene || {};
        if (!scene.pose || QUICK.sous > 0) state.islandPlacedThisTurn = true;
        quickGroupeRepere();

        if (state.currentPlayer === 1) {
          if (!state.turnTransitioning) quickTourRival();
          return;
        }
        if (state.turnTransitioning) return;

        const ctx = QUICK.ctx;
        ctx.annulMax = Math.max(ctx.annulMax, (state.undoHistory || []).length);

        let atteint = false;
        try { atteint = !!sous.but(ctx); } catch (_) { atteint = false; }
        if (atteint) {
          quickAfficher(true);
          try { playSfx("crownDrop"); } catch (_) { }
          QUICK.enchainement = setTimeout(() => { QUICK.enchainement = null; quickSuivant(); }, 1100);
          return;
        }

        /* Plus aucune carte et le but n'est pas là : on repose la scène, sans
           sanction. Laisse au joueur le temps de voir ce qui s'est passé. */
        if (!sous.libre && quickCartesRestantes() === 0 && state.phase === "ACTION_SELECT") {
          ctx.echecDepuis = ctx.echecDepuis || Date.now();
          if (Date.now() - ctx.echecDepuis > 1600) quickMonterScene();
        } else {
          ctx.echecDepuis = 0;
        }
      }

      function quickFin() {
        clearInterval(QUICK.pollTimer);
        QUICK.pollTimer = null;
        quickPoserRepere(null);
        const calque = quickCalque();
        calque.querySelector(".qk-top").style.display = "none";
        calque.querySelector(".qk-bot").style.display = "none";
        const fin = document.createElement("div");
        fin.className = "qk-fin";
        fin.innerHTML = `<div class="qk-carte">
          <div class="qk-couronnes" aria-hidden="true">♛♛♛</div>
          <div class="qk-grand">Tu sais jouer</div>
          <p>Le premier à valider <b>3 couronnes</b> gagne.</p>
          <p>Si plus personne ne peut poser d’île, le plus de couronnes l’emporte ; à égalité, celui qui a une couronne au plus près de son village.</p>
          <div class="qk-touches">
            <span><kbd>A</kbd>Île</span><span><kbd>Z</kbd>Déplacer</span><span><kbd>E</kbd>Pousser</span>
            <span><kbd>R</kbd>Magie</span><span><kbd>Q</kbd><kbd>S</kbd>Tourner l’île</span>
            <span><kbd>↵</kbd>Fin du tour</span><span><kbd>⌫</kbd>Annuler</span>
          </div>
          <p style="font-size:12px;opacity:.7">Les touches servent à aller plus vite. Tout se fait aussi à la souris.</p>
          <div class="qk-actions">
            <button class="qk-jouer" type="button">JOUER CONTRE LE CPU</button>
            <button class="qk-menu" type="button">MENU</button>
          </div></div>`;
        fin.querySelector(".qk-jouer").addEventListener("click", () => quickJouer());
        fin.querySelector(".qk-menu").addEventListener("click", () => quickQuitter());
        calque.appendChild(fin);
        calque.classList.add("qk-fin-active");
        try { localStorage.setItem("ilyos.quick.fait", "1"); } catch (_) { }
        try { playSfx("victory"); } catch (_) { }
      }

      /* ---------- Entrée / sortie ---------------------------------------- */
      function quickStart() {
        quickStyle();
        if (QUICK.dom) { QUICK.dom.remove(); QUICK.dom = null; }
        QUICK.active = true;
        QUICK.etape = 0;
        QUICK.sous = 0;

        try { if (typeof stopTurnTimer === "function") stopTurnTimer(); } catch (_) { }
        try { boardRenderMode = "3d"; } catch (_) { }
        try { clearKayKitVillages(); } catch (_) { }
        try { window.ILYOS_PLATEAU_2D?.activer(false); } catch (_) { }

        quickConstruire(QUICK_ETAPES[0].scenes[0].scene);
        try { applyVisualMode("alternative"); } catch (_) { }
        try { if (typeof applyBoardRenderMode === "function") applyBoardRenderMode("3d", { persist: false }); } catch (_) { }
        try { els.setupScreen.classList.add("hidden"); } catch (_) { }
        try { els.gameScreen.classList.remove("hidden"); } catch (_) { }
        try { if (typeof startAmbient === "function") startAmbient(); } catch (_) { }
        document.body.classList.add("quick-mode");

        quickMonterScene();
        clearInterval(QUICK.pollTimer);
        QUICK.pollTimer = setInterval(quickTick, 300);
      }

      function quickDemonter() {
        QUICK.active = false;
        clearInterval(QUICK.pollTimer);
        QUICK.pollTimer = null;
        clearTimeout(QUICK.enchainement);
        QUICK.enchainement = null;
        quickPoserRepere(null);
        document.body.classList.remove("quick-mode", "quick-sans-fin");
        if (QUICK.dom) { QUICK.dom.remove(); QUICK.dom = null; }
      }

      /* Comme à la sortie des énigmes, un rechargement garantit une partie
         normale ensuite. `state` est vidé d'abord : la scène n'est ni une
         partie à reprendre ni une partie à sauvegarder. */
      function quickQuitter() {
        quickDemonter();
        state = null;
        try { location.reload(); } catch (_) { }
      }

      function quickJouer() {
        quickDemonter();
        state = null;
        try { sessionStorage.setItem("ilyos.quick.jouer", "1"); } catch (_) { }
        try { location.reload(); } catch (_) { }
      }

      /* Au retour du rechargement demandé par « Jouer contre le CPU » : une
         partie solo classique, ordinateur en Facile. */
      function quickLancerPartieDemandee() {
        let demande = false;
        try {
          demande = sessionStorage.getItem("ilyos.quick.jouer") === "1";
          sessionStorage.removeItem("ilyos.quick.jouer");
        } catch (_) { }
        if (!demande) return;
        setTimeout(() => {
          try { window.ILYOS_API?.launchConfiguredGame({ opponent: "1", board: "classic", difficulty: "easy" }); } catch (_) { }
        }, 400);
      }

      window.addEventListener("ilyos-quick-requested", () => quickStart());
      window.addEventListener("load", quickLancerPartieDemandee);

      window.ILYOS_QUICK = {
        start: quickStart,
        quitter: quickQuitter,
        passer: quickSuivant,
        aller: (etape, sous = 0) => {
          if (!QUICK.active) quickStart();
          QUICK.etape = Math.max(0, Math.min(QUICK_ETAPES.length - 1, etape));
          QUICK.sous = sous;
          quickMonterScene();
        },
        etat: () => ({
          actif: QUICK.active, etape: QUICK.etape, sous: QUICK.sous,
          titre: QUICK_ETAPES[QUICK.etape]?.titre || null,
          total: QUICK_ETAPES.length, cles: { ...QUICK.cles }
        })
      };
