      /* =====================================================================
         QUICK — apprendre une partie entière en la jouant, vite

         L'Éveil (tutorial-eveil.js) est un parcours muet et long. Quick est son
         contraire assumé : UNE vraie partie, guidée, de cinq tours. Le plateau
         est celui d'une partie (11×11, villages aux coins, sanctuaire au
         centre) et rien n'y est effacé d'un tour à l'autre : l'île posée au
         tour 1 porte encore le gardien au tour 4, la carte Magie gardée en
         réserve au tour 1 sert au tour 4. Le rival joue ses tours devant le
         joueur, avec des coups écrits d'avance.

         Chaque étape donne UNE consigne courte, la règle qui va avec en petit,
         et une case dorée. On apprend à la SOURIS : les raccourcis ne sont
         donnés qu'à la fin, comme une façon d'aller plus vite.

         Ce fragment ne modifie aucune règle. Il construit un `state` normal,
         laisse le joueur agir avec les vrais handlers d'ui.js, le vrai HUD et
         la vraie fin de tour (pioche, réserve, couronne validée au début du
         tour suivant), et observe l'état pour savoir si le geste a abouti.
         Les mains piochées sont fixées. Un geste qui ne peut plus aboutir fait
         reprendre le tour en cours à son début, et lui seul.

         Point d'entrée : l'événement `ilyos-quick-requested` (bouton QUICK du
         menu, js/version-bootstrap.js) ou `window.ILYOS_QUICK.start()`.
         ===================================================================== */

      const QUICK = {
        active: false,
        tour: 0,
        etape: 0,
        ctx: null,
        serie: 0,
        pollTimer: null,
        enchainement: null,
        relais: false,
        fini: false,
        dom: null,
        cles: {},
        debutTour: null,
        finBranchee: false,
        rappelA: 0
      };

      /* ---------- La partie écrite d'avance -------------------------------
         Plateau 11×11. Tes villages : (0,0) et (10,10) ; ceux du rival : les
         deux autres coins. Sanctuaire en croix autour de (5,5). */
      const QK_I1 = [[6, 6], [6, 7], [7, 6], [7, 7]];
      const QK_I2 = [[7, 8], [8, 8], [9, 8]];
      const QK_I3 = [[2, 8], [2, 9], [3, 8], [3, 9]];
      const QK_RA = [[5, 2], [5, 3], [6, 2], [6, 3]];
      const QK_RB = [[4, 2], [4, 3], [4, 4]];
      const QK_RC = [[1, 1], [1, 2], [2, 1]];
      const QK_RD = [[6, 9], [6, 10], [7, 9], [7, 10]];

      // Les cinq cartes piochées au début de chacun de tes tours.
      const QK_MAINS = [
        ["MOVE", "MOVE", "MOVE", "PUSH", "MAGIC"],
        ["MOVE", "MOVE", "MOVE", "MOVE", "MOVE"],
        ["MOVE", "MOVE", "MOVE", "MOVE", "PUSH"],
        ["MOVE", "MOVE", "MOVE", "PUSH", "PUSH"],
        ["MOVE", "MOVE", "MOVE", "MOVE", "PUSH"]
      ];

      /* Position au début de chaque tour, telle que la partie guidée la
         produit. Ne sert qu'à l'accès direct (tests, captures) : la vraie
         partie, elle, continue simplement d'un tour à l'autre. */
      const QK_DEBUTS = [
        { iles: [], g: [], couronnes: [[5, 5]], reserve: {} },
        {
          iles: [[QK_I1, 0, "square"], [QK_RA, 1, "square"]],
          g: [{ key: "g1", p: 0, r: 6, c: 6 }, { key: "r1", p: 1, r: 6, c: 3 }],
          couronnes: [[5, 5]], reserve: { MOVE: 1, PUSH: 1, MAGIC: 1 }
        },
        {
          iles: [[QK_I1, 0, "square"], [QK_RA, 1, "square"], [QK_I2, 0, "line3"], [QK_RB, 1, "line3"]],
          g: [{ key: "g1", p: 0, r: 5, c: 5 }, { key: "g2", p: 0, r: 7, c: 8 },
            { key: "r1", p: 1, r: 5, c: 4, crown: true }, { key: "r2", p: 1, r: 5, c: 3 }],
          couronnes: [null, [4, 5]], reserve: { MOVE: 4, PUSH: 1, MAGIC: 1 }
        },
        {
          iles: [[QK_I1, 0, "square"], [QK_RA, 1, "square"], [QK_I2, 0, "line3"], [QK_RB, 1, "line3"],
            [QK_I3, 0, "square"], [QK_RC, 1, "l3"]],
          g: [{ key: "g1", p: 0, r: 7, c: 7 }, { key: "g2", p: 0, r: 7, c: 8, crown: true },
            { p: 0, r: 2, c: 8 }, { key: "r1", p: 1, r: 5, c: 3 }, { p: 1, r: 1, c: 2 }],
          couronnes: [null, [4, 5]], reserve: { MOVE: 4, MAGIC: 1 }
        }
      ];

      /* Étapes de tes tours. `pose` contraint la pose d'île (forme, cases
         exactes ou zone), `naissance` la case du gardien, `gardien` le seul
         gardien qu'on peut prendre, `bloque` ferme le plateau. `but` dit si le
         geste a abouti ; `impossible` s'il ne peut plus aboutir. */
      const QK_ZONE_T3 = { r0: 0, r1: 3, c0: 7, c1: 9, contient: [2, 8] };
      const QK_ZONE_T4 = { r0: 7, r1: 10, c0: 2, c1: 5, contient: [8, 4] };

      const QUICK_TOURS = [
        {
          etapes: [
            {
              consigne: "Tes villages sont dorés, ceux du rival violets. La couronne attend au centre.",
              regle: "Rapporte 3 couronnes dans un de tes villages",
              suite: "COMPRIS", bloque: true, vue: [5, 5], zoom: -.25
            },
            {
              consigne: "Tu as pioché 5 cartes. Clique ÎLE, choisis le Carré et pose-le sur les cases dorées",
              regle: "Chaque tour, poser une île est obligatoire",
              pose: { forme: "square", cases: QK_I1 }, zone: QK_I1, vue: [7, 7],
              but: () => quickIlePosee(QK_I1)
            },
            {
              consigne: "Clique la case dorée pour y faire naître ton premier gardien",
              regle: "Un gardien naît sur chaque île que tu poses, jusqu’à 6",
              naissance: [7, 7], cible: [[7, 7]],
              but: () => quickNaissanceFaite(7, 7, "g1")
            },
            {
              consigne: "Clique ton gardien, puis la case dorée en diagonale",
              regle: "Une case droite = 1 carte Déplacer · une diagonale = 2",
              cible: [[6, 6]], gardien: "g1",
              but: () => quickCleSur("g1", 6, 6),
              impossible: () => !quickAtteignable("g1", 6, 6)
            },
            {
              consigne: "Clique Fin du tour",
              regle: "Tes 3 cartes non jouées vont en réserve : tu pourras les jouer plus tard",
              finDeTour: true, bloque: true
            }
          ],
          rival: quickRival1
        },
        {
          etapes: [
            {
              consigne: "Nouveau tour, 5 nouvelles cartes. Choisis la Passerelle, tourne-la, puis pose-la sur les cases dorées",
              regle: "ROTATION, en bas à gauche, tourne l’île avant de la poser",
              pose: { forme: "line3", cases: QK_I2 }, zone: QK_I2, vue: [8, 8],
              but: () => quickIlePosee(QK_I2)
            },
            {
              consigne: "Fais naître ton 2e gardien sur la case dorée",
              regle: "Un gardien naît sur chaque île que tu poses, jusqu’à 6",
              naissance: [7, 8], cible: [[7, 8]],
              but: () => quickNaissanceFaite(7, 8, "g2")
            },
            {
              consigne: "Avec ton premier gardien, marche sur la couronne",
              regle: "Ramasser une couronne est gratuit · une 2e couronne apparaîtra au sanctuaire",
              cible: [[5, 5]], gardien: "g1", vue: [6, 6],
              but: () => quickCleSur("g1", 5, 5) && !!artifactCarriedBy(QUICK.cles.g1),
              impossible: () => !quickCleSur("g1", 5, 5) && !quickAtteignable("g1", 5, 5)
            },
            {
              consigne: "Clique Fin du tour",
              regle: "Le rival joue ensuite : surveille ta couronne",
              finDeTour: true, bloque: true
            }
          ],
          rival: quickRival2
        },
        {
          etapes: [
            {
              consigne: "Le rival t’a volé la couronne. Clique-la pour la reprendre",
              regle: "Voler est gratuit dès qu’un de tes gardiens touche le porteur",
              cible: () => [quickPositionCle("r1")], vue: [5, 4], vol: "r1",
              but: () => !!artifactCarriedBy(QUICK.cles.g1)
            },
            {
              consigne: "Clique ton gardien, le rival, puis la case dorée",
              regle: "Chaque carte Pousser avance toute la file d’une case · la 2e vient de ta réserve",
              cible: [[5, 2]], gardien: "g1", vue: [5, 3],
              but: () => quickCleSur("r1", 5, 2) && !quickCle("r2"),
              impossible: () => quickDisponible("PUSH") < 2
            },
            {
              consigne: "Pose une île de ton choix près de la case dorée, puis fais-y naître un gardien",
              regle: "Une île par tour, même quand tu n’en as pas besoin",
              pose: { zone: QK_ZONE_T3 }, cible: [[2, 8]], vue: [2, 8],
              but: ctx => state.islands.length > ctx.iles && state.phase !== "PLACE_SPAWN"
                && state.phase !== "PLACE_ISLAND"
            },
            {
              consigne: "Ramène la couronne : marche jusqu’à la case dorée",
              regle: "Un porteur ne peut pas s’arrêter sur une couronne posée au sol",
              cible: [[7, 7]], gardien: "g1", vue: [6, 6],
              but: () => quickCleSur("g1", 7, 7) && !!artifactCarriedBy(QUICK.cles.g1),
              impossible: () => !quickAtteignable("g1", 7, 7)
            },
            {
              consigne: "Clique la couronne, puis ton gardien sur la Passerelle",
              regle: "Passer la couronne à un gardien voisin est gratuit",
              vue: [7, 8],
              but: () => !!artifactCarriedBy(QUICK.cles.g2)
            },
            {
              consigne: "Clique Fin du tour",
              regle: "Les cartes Déplacer qui restent partent en réserve",
              finDeTour: true, bloque: true
            }
          ],
          rival: quickRival3
        },
        {
          etapes: [
            {
              consigne: "Pose une île près de la case dorée, puis fais-y naître un gardien",
              regle: "Une île par tour, obligatoire",
              pose: { zone: QK_ZONE_T4 }, cible: [[8, 4]], vue: [8, 4],
              but: ctx => state.islands.length > ctx.iles && state.phase !== "PLACE_SPAWN"
                && state.phase !== "PLACE_ISLAND"
            },
            {
              consigne: "Clique MAGIE, puis la case dorée : ce sera le pivot",
              regle: "Ta carte Magie attendait en réserve depuis le tour 1",
              cible: [[9, 8]], vue: [8, 9], bloqueGardiens: true,
              but: () => Array.isArray(state.selectedMagicPivot)
                && state.selectedMagicPivot[0] === 9 && state.selectedMagicPivot[1] === 8
            },
            {
              consigne: "Clique la position qui pose ton porteur sur la case dorée",
              regle: "L’île tourne autour du pivot, avec ton gardien et sa couronne",
              cible: [[9, 10]], vue: [8, 9], bloqueGardiens: true,
              but: () => quickCleSur("g2", 9, 10)
            },
            {
              consigne: "Clique la flèche ↶ en bas à gauche pour annuler la magie",
              regle: "Annuler revient en arrière dans ton tour, autant de fois que tu veux",
              vue: [8, 9], bloque: true,
              but: () => quickCleSur("g2", 7, 8)
            },
            {
              consigne: "Le pivot est gardé : clique de nouveau la position qui rentre au village",
              regle: "Le pivot ne bouge pas : l’île tourne autour, comme une aiguille",
              cible: [[9, 10]], vue: [8, 9], bloqueGardiens: true,
              but: () => quickCleSur("g2", 9, 10),
              impossible: () => quickDisponible("MAGIC") < 1 && !quickCleSur("g2", 9, 10)
            },
            {
              consigne: "Clique Fin du tour",
              regle: "La couronne comptera au début de ton prochain tour, si elle est encore au village",
              finDeTour: true, bloque: true
            }
          ],
          rival: quickRival4
        },
        {
          etapes: [
            {
              consigne: "La couronne a tenu jusqu’à ton tour : tu marques 1 point !",
              regle: "Ton gardien reste au village · la couronne repart au centre",
              bloque: true, vue: [9, 9], final: true
            }
          ]
        }
      ];

      /* ---------- Lecture de l'état ------------------------------------ */
      function quickCle(cle) {
        const id = QUICK.cles[cle];
        return id ? (state?.characters || []).find(ch => ch.id === id) || null : null;
      }

      function quickCleSur(cle, r, c) {
        const ch = quickCle(cle);
        return !!ch && ch.r === r && ch.c === c;
      }

      function quickPositionCle(cle) {
        const ch = quickCle(cle);
        return ch ? [ch.r, ch.c] : null;
      }

      function quickDisponible(type) {
        try { return availableActionCount(type, state.players[0]); } catch (_) { return 0; }
      }

      function quickAtteignable(cle, r, c) {
        const ch = quickCle(cle);
        if (!ch) return false;
        if (ch.r === r && ch.c === c) return true;
        try { return movementRange(ch, quickDisponible("MOVE")).has(key(r, c)); } catch (_) { return true; }
      }

      function quickMemesCases(a, b) {
        if (!a || !b || a.length !== b.length) return false;
        const ens = new Set(a.map(([r, c]) => key(r, c)));
        return b.every(([r, c]) => ens.has(key(r, c)));
      }

      function quickIlePosee(cases) {
        return state.islands.some(ile => ile.owner === 0 && quickMemesCases(ile.cells, cases));
      }

      function quickNaissanceFaite(r, c, cle) {
        const ch = characterAt(r, c);
        if (!ch || ch.player !== 0 || state.phase === "PLACE_SPAWN") return false;
        QUICK.cles[cle] = ch.id;
        return true;
      }

      function quickEtape() {
        return QUICK_TOURS[QUICK.tour]?.etapes[QUICK.etape] || null;
      }

      /* Pose permise par l'étape : appelée par isValidPlacement (ui.js), si
         bien que l'aperçu fantôme ne s'allume qu'aux bons endroits. */
      function quickPoseAutorisee(cells) {
        if (!QUICK.active || !state?.quick) return true;
        const pose = quickEtape()?.pose;
        if (!pose) return false;
        if (pose.cases) return quickMemesCases(cells, pose.cases);
        const z = pose.zone;
        return cells.every(([r, c]) => r >= z.r0 && r <= z.r1 && c >= z.c0 && c <= z.c1)
          && cells.some(([r, c]) => r === z.contient[0] && c === z.contient[1]);
      }

      /* ---------- Construction d'une position ----------------------------
         Calquée sur puzzleBuildState : un `state` complet de début de tour.
         Seconde couronne active, comme dans une vraie partie. */
      function quickCartes(actions, prefixe) {
        return actions.map((action, i) => ({ id: `QK${QUICK.serie}-${prefixe}${i}`, action, used: false }));
      }

      function quickConstruire(tour) {
        const debut = QK_DEBUTS[tour];
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
          aiDifficulty: null, currentPlayer: 0, round: tour + 1, turn: tour * 2 + 1,
          islands: [], characters: [],
          artifact: { id: "crown-1", r: CENTER.r, c: CENTER.c, carrierId: null, active: false },
          secondArtifact: { id: "crown-2", r: CENTER.r, c: CENTER.c, carrierId: null, active: false },
          phase: "ACTION_SELECT",
          rules: { allowDissolve: false, islandLimitPerPlayer: 0, shapeLimitPerOwner: 0 },
          islandPlacedThisTurn: false,
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

        debut.iles.forEach(([cells, owner, forme]) => quickAjouterIle(cells, owner, forme));

        /* Identifiants propres à chaque montage : sans eux, une position
           montée par-dessus une autre réutiliserait ses visuels et
           téléporterait ses gardiens (voir puzzleBuildState). */
        QUICK.serie++;
        QUICK.cles = {};
        debut.g.forEach(g => {
          const char = { id: `qk${QUICK.serie}-${state.nextCharId++}`, player: g.p, r: g.r, c: g.c };
          state.characters.push(char);
          if (g.key) QUICK.cles[g.key] = char.id;
          if (g.crown) Object.assign(state.artifact, { active: true, carrierId: char.id, r: g.r, c: g.c });
        });
        const [c1, c2] = debut.couronnes;
        if (c1) Object.assign(state.artifact, { active: true, carrierId: null, r: c1[0], c: c1[1] });
        if (c2) Object.assign(state.secondArtifact, { active: true, carrierId: null, r: c2[0], c: c2[1] });

        const joueur = state.players[0];
        joueur.hand = quickCartes(QK_MAINS[tour], "H");
        Object.entries(debut.reserve).forEach(([action, n]) => {
          for (let i = 0; i < n; i++) {
            joueur.reserveCards.push({ id: `QK${QUICK.serie}-R${action}${i}`, action, used: false, fromReserve: true });
          }
          joueur.stash[action] = n;
        });
        quickPreparerPioche([]);
        state.deckAnimationMode = "deal";
        setTimeout(() => { if (state?.quick) state.deckAnimationMode = null; }, 900);
      }

      /* La pioche : la prochaine main sur le dessus (drawCards prend la
         dernière carte), le reste du paquet de 13 dessous, pour que le
         compteur PIOCHE dise vrai. */
      function quickPreparerPioche(prochaine) {
        const joueur = state.players[0];
        const ailleurs = joueur.hand.length + joueur.reserveCards.length + joueur.discard.length;
        const reste = Math.max(0, 13 - ailleurs - prochaine.length);
        const fond = Array.from({ length: reste }, (_, i) => ["MOVE", "PUSH", "MOVE"][i % 3]);
        joueur.deck = quickCartes([...fond, ...prochaine], `P${QUICK.tour}-`);
      }

      function quickAjouterIle(cells, owner, forme) {
        const id = state.nextIslandId++;
        const anchor = { r: cells[0][0], c: cells[0][1] };
        state.islands.push({
          id, owner, shapeKey: forme,
          anchor, relCells: cells.map(([r, c]) => [r - anchor.r, c - anchor.c]),
          cells: cells.map(([r, c]) => [r, c]),
          visualVariant: typeof chooseIslandVisualVariant === "function"
            ? chooseIslandVisualVariant(cells, id, state.islands) : id % 6
        });
        return id;
      }

      /* ---------- Les tours du rival --------------------------------------
         Joués devant le joueur, un geste à la fois, sans cartes : seul le
         résultat compte, et il suit les vraies règles. */
      const quickPause = ms => new Promise(res => setTimeout(res, ms));

      async function quickRivalIle(cells, forme) {
        quickAjouterIle(cells, 1, forme);
        try { playSfx("island"); } catch (_) { }
        tutoRender();
        await quickPause(900);
      }

      async function quickRivalNaissance(cle, r, c) {
        const char = { id: `qk${QUICK.serie}-r${state.nextCharId++}`, player: 1, r, c };
        state.characters.push(char);
        if (cle) QUICK.cles[cle] = char.id;
        try { animateCellPulse(r, c, "spawn-arrival"); playSfx("spawn"); } catch (_) { }
        tutoRender();
        await quickPause(900);
      }

      async function quickRivalPas(cle, chemin) {
        const ch = quickCle(cle);
        if (!ch) return;
        for (const [r, c] of chemin) {
          ch.r = r;
          ch.c = c;
          const porte = artifactCarriedBy(ch.id);
          if (porte) { porte.r = r; porte.c = c; }
          try { playSfx("move"); } catch (_) { }
          tutoRender();
          await quickPause(520);
        }
        await quickPause(300);
      }

      async function quickRivalVol(cle, victime) {
        const ch = quickCle(cle);
        const couronne = artifactCarriedBy(QUICK.cles[victime]);
        if (!ch || !couronne) return;
        giveArtifactToCharacter(couronne, ch);
        couronne.r = ch.r;
        couronne.c = ch.c;
        tutoRender();
        await quickPause(1200);
      }

      function quickSuivre(r, c, zoom = .2) {
        try {
          kaykit3D.autoFit = false;
          kaykitFollowCell(r, c, { duration: 700, force: true, zoomBoost: zoom });
        } catch (_) { }
      }

      async function quickRival1() {
        quickAfficherRival("Le rival pose une île et fait naître son premier gardien.", "Pendant son tour, tu regardes");
        quickSuivre(5, 4);
        await quickPause(700);
        await quickRivalIle(QK_RA, "square");
        await quickRivalNaissance("r1", 6, 3);
      }

      async function quickRival2() {
        quickAfficherRival("Le rival s’approche, colle son gardien au tien… et te vole la couronne !",
          "Voler la couronne d’un gardien voisin est gratuit");
        quickSuivre(5, 4);
        await quickPause(700);
        await quickRivalIle(QK_RB, "line3");
        await quickRivalNaissance("r2", 4, 3);
        await quickRivalPas("r1", [[5, 3], [5, 4]]);
        await quickRivalVol("r1", "g1");
        await quickRivalPas("r2", [[5, 3]]);
      }

      async function quickRival3() {
        quickAfficherRival("Le rival pose une île et se replace.", "Il lui faut du temps pour revenir");
        quickSuivre(3, 2);
        await quickPause(700);
        await quickRivalIle(QK_RC, "l3");
        await quickRivalNaissance(null, 1, 2);
        if (quickCle("r1")) await quickRivalPas("r1", [[5, 3]]);
      }

      async function quickRival4() {
        quickAfficherRival("Le rival accourt vers ton village… trop tard.",
          "Un rival posté sur une des 3 cases de ton village y bloquerait le point");
        quickSuivre(7, 9);
        await quickPause(700);
        await quickRivalIle(QK_RD, "square");
        await quickRivalNaissance(null, 7, 9);
      }

      async function quickTourRival() {
        if (QUICK.relais) return;
        QUICK.relais = true;
        const serie = QUICK.serie;
        const vivant = () => QUICK.active && QUICK.serie === serie && state?.quick;
        try {
          state.inputLocked = true;
          quickPoserRepere(null);
          const script = QUICK_TOURS[QUICK.tour]?.rival;
          if (script) await script();
          if (!vivant()) return;
          await quickPause(600);
          if (!vivant()) return;
          // Ta prochaine main, piochée par la vraie fin de tour.
          quickPreparerPioche(QK_MAINS[QUICK.tour + 1] || QK_MAINS[0]);
          state.islandPlacedThisTurn = true;
          QUICK.tour++;
          QUICK.etape = 0;
          await endTurn(true);
          if (!vivant()) return;
          quickNouveauTour();
        } catch (_) {
        } finally {
          QUICK.relais = false;
        }
      }

      /* Ouverture de chacun de tes tours : la position est retenue, c'est
         elle que « Reprendre ce tour » remet en place. */
      function quickNouveauTour() {
        QUICK.debutTour = { snap: snapshotState(), cles: { ...QUICK.cles } };
        quickEntrer();
      }

      function quickReprendre() {
        if (!QUICK.active || !QUICK.debutTour || state?.currentPlayer !== 0 || QUICK.relais) return;
        clearTimeout(QUICK.enchainement);
        QUICK.enchainement = null;
        applyStateSnapshot(JSON.parse(QUICK.debutTour.snap));
        QUICK.cles = { ...QUICK.debutTour.cles };
        state.undoHistory = [];
        state.turnTransitioning = false;
        state.inputLocked = false;
        QUICK.etape = 0;
        try { resetKayKitPointerFeedback(); } catch (_) { }
        tutoRender();
        quickEntrer();
      }

      /* ---------- Repère de destination ---------------------------------
         Un anneau doré au sol des cases visées, et un voile doré léger sur
         les cases où poser une île. Rien d'autre. */
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

      function quickPoserRepere(cibles, zone = []) {
        const groupe = quickGroupeRepere();
        if (!groupe) return;
        if (typeof clearKayKitGroup === "function") clearKayKitGroup(groupe);
        const transitoire = objet => { objet.userData = { ...(objet.userData || {}), ilyosTransient: true }; return objet; };
        const couche = (p, geo, opacite, ordre, couleur = 0xffd36a) => {
          const mat = transitoire(new THREE.MeshBasicMaterial({
            color: couleur, transparent: true, opacity: opacite, depthTest: false, depthWrite: false
          }));
          const maille = new THREE.Mesh(transitoire(geo), mat);
          maille.rotation.x = -Math.PI / 2;
          maille.position.set(p.x, p.y, p.z);
          maille.renderOrder = ordre;
          groupe.add(maille);
        };
        // Case de pose : un voile et un liseré carrés (anneau à 4 côtés).
        (zone || []).forEach(([r, c]) => {
          const p = kaykitCellPosition(r, c, KAYKIT_LEVELS.islandTop + .015);
          const carre = (geo, opacite, ordre, couleur) => {
            couche(p, geo, opacite, ordre, couleur);
            groupe.children[groupe.children.length - 1].rotation.z = Math.PI / 4;
          };
          carre(new THREE.CircleGeometry(.58, 4), .3, 90);
          carre(new THREE.RingGeometry(.55, .63, 4), .5, 91, 0x2a1d04);
          carre(new THREE.RingGeometry(.57, .61, 4), .95, 92);
        });
        (cibles || []).filter(Boolean).forEach(([r, c]) => {
          const p = kaykitCellPosition(r, c, KAYKIT_LEVELS.islandTop + .02);
          // Liseré sombre : l'anneau reste lisible sur un aperçu clair (magie).
          couche(p, new THREE.RingGeometry(.235, .355, 48), .45, 92, 0x2a1d04);
          couche(p, new THREE.RingGeometry(.25, .33, 48), .95, 93);
          couche(p, new THREE.CircleGeometry(.25, 48), .16, 91);
        });
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
          html body.quick-mode #toast { top: calc(var(--plaque-cy, 46px) + 132px) !important; }
          body.quick-mode[data-qk-forme] .island-choice:not(.qk-forme) { opacity: .28; filter: grayscale(.7); }
          #qk-layer { position: fixed; inset: 0; pointer-events: none; z-index: 9000;
            --font-ilyos-display: 'Cinzel Decorative', Georgia, serif;
            --font-ilyos-info: 'Nunito Sans', Inter, system-ui, sans-serif;
            font-family: var(--font-ilyos-info); }
          #qk-layer.qk-fin-active { z-index: 2147483000; }
          #qk-layer .qk-top { position: absolute; top: 128px; left: 50%; transform: translateX(-50%);
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
          #qk-layer .qk-btn[hidden] { display: none; }
          #qk-layer .qk-bar { display: flex; gap: 4px; }
          #qk-layer .qk-bar i { width: 30px; height: 3px; border-radius: 2px; background: rgba(255,255,255,.22); transition: background .3s; }
          #qk-layer .qk-bar i.ok { background: linear-gradient(90deg, #e8b84a, #ffe39a); }
          #qk-layer .qk-bar i.cur { background: #fff3c4; box-shadow: 0 0 8px rgba(255,214,110,.9); }
          #qk-layer .qk-bot { position: absolute; bottom: 146px; left: 50%; transform: translateX(-50%);
            display: flex; flex-direction: column; align-items: center; gap: 5px; width: max-content; max-width: calc(100vw - 32px); }
          #qk-layer .qk-line { display: flex; align-items: center; gap: 10px; padding: 8px 18px;
            border-radius: 999px; background: rgba(14,18,34,.62); border: 1px solid rgba(255,214,120,.35);
            backdrop-filter: blur(6px); color: #fff7e2; font-size: 16px; font-weight: 600;
            box-shadow: 0 6px 22px rgba(0,0,0,.28); transition: border-color .25s, background .25s; text-align: center; }
          #qk-layer .qk-line.reussi { border-color: #ffd36a; background: rgba(60,44,10,.72); }
          #qk-layer .qk-line.rival { border-color: rgba(190,150,255,.5); background: rgba(30,18,52,.7); }
          #qk-layer .qk-line.rappel { border-color: #ffd36a; box-shadow: 0 0 0 2px rgba(255,211,106,.35), 0 6px 22px rgba(0,0,0,.28); }
          #qk-layer .qk-souris { width: 14px; height: 20px; flex: none; }
          #qk-layer .qk-ok { color: #ffd36a; font-size: 18px; line-height: 1; }
          #qk-layer .qk-oeil { color: #cdb4ff; font-size: 15px; line-height: 1; }
          #qk-layer .qk-suite { pointer-events: auto; cursor: pointer; border: 0; border-radius: 999px; padding: 6px 12px;
            font: 700 11px/1 var(--font-ilyos-info); letter-spacing: .14em; color: #2a1a04; background: linear-gradient(#ffe7a6, #e2b24c); }
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
          #qk-layer .qk-tour { display: grid; gap: 8px; margin: 14px 0 2px; text-align: left; }
          #qk-layer .qk-tour div { display: flex; align-items: flex-start; gap: 10px; font-size: 13.5px; line-height: 1.4; color: rgba(255,244,220,.9); }
          #qk-layer .qk-tour div > b { flex: none; display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%;
            font: 700 11px/1 Inter, sans-serif; color: #1d1405; background: linear-gradient(#ffe7a6, #e2b24c); }
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
            <button class="qk-btn qk-reprendre" type="button" title="Remettre ce tour à son début">↺ REPRENDRE LE TOUR</button>
            <button class="qk-btn qk-quitter" type="button" aria-label="Quitter Quick">✕</button></div>
          <div class="qk-bar"></div></div>
          <div class="qk-bot"><div class="qk-line"></div><div class="qk-rule"></div></div>`;
        calque.querySelector(".qk-reprendre").addEventListener("click", () => quickReprendre());
        calque.querySelector(".qk-quitter").addEventListener("click", () => quickQuitter());
        document.body.appendChild(calque);
        QUICK.dom = calque;
        return calque;
      }

      function quickEntete(rival) {
        const calque = quickCalque();
        calque.querySelector(".qk-titre").innerHTML =
          `QUICK · <b>${rival ? "LE RIVAL JOUE" : "À TOI"}</b>`;
        calque.querySelector(".qk-bar").innerHTML = QUICK_TOURS.map((_, i) =>
          `<i class="${i < QUICK.tour ? "ok" : i === QUICK.tour ? "cur" : ""}"></i>`).join("");
        const etape = quickEtape();
        calque.querySelector(".qk-reprendre").hidden = !!rival || !etape || !!etape.suite || !!etape.final
          || (QUICK.tour === 0 && QUICK.etape <= 1);
        return calque;
      }

      function quickAfficher(reussi = false) {
        const etape = quickEtape();
        if (!etape) return;
        const calque = quickEntete(false);
        const ligne = calque.querySelector(".qk-line");
        ligne.classList.remove("rival", "rappel");
        ligne.classList.toggle("reussi", reussi || !!etape.final);
        const icone = reussi || etape.final ? '<span class="qk-ok">✓</span>' : etape.suite ? "" : QUICK_SOURIS;
        ligne.innerHTML = icone + `<span>${etape.consigne}</span>`
          + (etape.suite && !reussi ? `<button class="qk-suite" type="button">${etape.suite}</button>` : "");
        ligne.querySelector(".qk-suite")?.addEventListener("click", () => quickSuivant());
        calque.querySelector(".qk-rule").textContent = etape.regle || "";
        document.body.classList.toggle("quick-sans-fin", !etape.finDeTour);
      }

      function quickAfficherRival(texte, regle) {
        const calque = quickEntete(true);
        const ligne = calque.querySelector(".qk-line");
        ligne.classList.remove("reussi", "rappel");
        ligne.classList.add("rival");
        ligne.innerHTML = `<span class="qk-oeil" aria-hidden="true">◉</span><span>${texte}</span>`;
        calque.querySelector(".qk-rule").textContent = regle || "";
        document.body.classList.add("quick-sans-fin");
      }

      // Un geste refusé : la consigne s'allume brièvement, sans texte de plus.
      function quickRappel() {
        const ligne = QUICK.dom?.querySelector(".qk-line");
        if (!ligne) return;
        ligne.classList.add("rappel");
        clearTimeout(QUICK.rappelA);
        QUICK.rappelA = setTimeout(() => ligne.classList.remove("rappel"), 700);
      }

      /* ---------- Garde-fous sur le plateau et le tiroir d'îles ---------- */
      function quickClicRefuse(r, c) {
        if (!state?.quick) return false;
        if (state.currentPlayer !== 0 || QUICK.relais || QUICK.enchainement || QUICK.fini) return true;
        const etape = quickEtape();
        if (!etape || etape.bloque) return true;
        if (etape.pose) return !["PLACE_ISLAND", "PLACE_SPAWN"].includes(state.phase);
        if (state.phase === "PLACE_SPAWN" && etape.naissance) {
          return r !== etape.naissance[0] || c !== etape.naissance[1];
        }
        const ch = characterAt(r, c);
        if (etape.bloqueGardiens && ch && state.phase === "ACTION_SELECT") return true;
        if (etape.gardien && ch && ch.player === 0 && ch.id !== QUICK.cles[etape.gardien]
          && ["ACTION_SELECT", "SMART_CHAR"].includes(state.phase)) return true;
        return false;
      }

      function quickGardeClic(event) {
        if (!QUICK.active) return;
        const cell = event.target?.closest?.(".cell");
        if (!cell) return;
        /* Étape « voler » : un clic sur le porteur, ou sur sa case, vaut un
           clic sur sa couronne. Sans cela, viser le gardien plutôt que la
           couronne au-dessus de lui ouvrait une poussée. */
        const vol = quickCle(quickEtape()?.vol);
        if (vol && state.phase === "ACTION_SELECT" && Number(cell.dataset.r) === vol.r && Number(cell.dataset.c) === vol.c
          && !event.target.closest(".carrier-crown")) {
          event.stopImmediatePropagation();
          event.stopPropagation();
          event.preventDefault();
          if (event.type === "click") cell.querySelector(".carrier-crown")?.click();
          return;
        }
        if (!quickClicRefuse(Number(cell.dataset.r), Number(cell.dataset.c))) return;
        event.stopImmediatePropagation();
        event.stopPropagation();
        event.preventDefault();
        if (event.type === "click") quickRappel();
      }

      function quickGardeForme(event) {
        if (!QUICK.active) return;
        const bouton = event.target?.closest?.(".island-choice");
        if (!bouton) return;
        const forme = quickEtape()?.pose?.forme;
        if (!forme) return;
        const index = [...els.islandSelector.querySelectorAll(".island-choice")].indexOf(bouton);
        if (Object.keys(SHAPES)[index] === forme) return;
        event.stopImmediatePropagation();
        event.preventDefault();
        quickRappel();
      }

      /* Marque la forme demandée dans le tiroir : les autres s'estompent. */
      function quickMarquerForme() {
        const forme = quickEtape()?.pose?.forme;
        if (forme) document.body.dataset.qkForme = forme;
        else delete document.body.dataset.qkForme;
        const index = Object.keys(SHAPES).indexOf(forme);
        els.islandSelector?.querySelectorAll(".island-choice").forEach((b, i) => b.classList.toggle("qk-forme", i === index));
      }

      function quickBrancher() {
        els.board?.addEventListener("click", quickGardeClic, true);
        els.board?.addEventListener("mousedown", quickGardeClic, true);
        els.board?.addEventListener("pointerdown", quickGardeClic, true);
        els.islandSelector?.addEventListener("click", quickGardeForme, true);
        if (QUICK.finBranchee) return;
        QUICK.finBranchee = true;
        /* La fin du tour n'est offerte qu'à l'étape qui la demande (le bouton
           est masqué ailleurs, mais ↵ et la manette y mènent aussi). */
        const finAvantQuick = endTurn;
        endTurn = async function endTurnQuick(force = false) {
          if (QUICK.active && state?.quick && !force && state.currentPlayer === 0 && !quickEtape()?.finDeTour) return;
          return finAvantQuick(force);
        };
      }

      function quickDebrancher() {
        els.board?.removeEventListener("click", quickGardeClic, true);
        els.board?.removeEventListener("mousedown", quickGardeClic, true);
        els.board?.removeEventListener("pointerdown", quickGardeClic, true);
        els.islandSelector?.removeEventListener("click", quickGardeForme, true);
        delete document.body.dataset.qkForme;
      }

      /* ---------- Déroulé ----------------------------------------------- */
      function quickContexte() {
        return { iles: state.islands.length, echecDepuis: 0 };
      }

      function quickEntrer() {
        const etape = quickEtape();
        if (!etape) return;
        QUICK.ctx = quickContexte();
        const cibles = typeof etape.cible === "function" ? etape.cible() : etape.cible;
        quickPoserRepere(cibles || null, etape.zone || []);
        quickMarquerForme();
        if (etape.vue) quickSuivre(etape.vue[0], etape.vue[1], etape.zoom ?? .3);
        quickAfficher();
        if (etape.final) {
          QUICK.fini = true;
          try { localStorage.setItem("ilyos.quick.fait", "1"); } catch (_) { }
          QUICK.enchainement = setTimeout(() => { QUICK.enchainement = null; quickFin(); }, 5000);
        }
      }

      function quickSuivant() {
        clearTimeout(QUICK.enchainement);
        QUICK.enchainement = null;
        const tour = QUICK_TOURS[QUICK.tour];
        if (!tour || QUICK.etape + 1 >= tour.etapes.length) return;
        QUICK.etape++;
        quickEntrer();
      }

      function quickTick() {
        if (!QUICK.active || !state?.quick || QUICK.enchainement || QUICK.fini) return;
        quickGroupeRepere();

        if (state.currentPlayer === 1) {
          if (!state.turnTransitioning && !QUICK.relais) quickTourRival();
          return;
        }
        if (state.turnTransitioning || QUICK.relais) return;
        const etape = quickEtape();
        if (!etape || !etape.but) return;
        const ctx = QUICK.ctx;

        let atteint = false;
        try { atteint = !!etape.but(ctx); } catch (_) { atteint = false; }
        if (atteint) {
          quickAfficher(true);
          try { playSfx("crownDrop"); } catch (_) { }
          QUICK.enchainement = setTimeout(() => { QUICK.enchainement = null; quickSuivant(); }, 1100);
          return;
        }

        /* Le geste ne peut plus aboutir (plus assez de cartes) : on reprend
           ce tour, sans sanction, après avoir laissé voir ce qui s'est passé. */
        let impossible = false;
        try { impossible = !!etape.impossible?.(ctx) && state.phase === "ACTION_SELECT"; } catch (_) { }
        if (impossible) {
          ctx.echecDepuis = ctx.echecDepuis || Date.now();
          if (Date.now() - ctx.echecDepuis > 1600) quickReprendre();
        } else {
          ctx.echecDepuis = 0;
        }
      }

      /* Avant la partie : le but et le rythme d'un tour, sans quoi les
         gestes appris n'ont pas de sens. */
      function quickIntro() {
        const calque = quickCalque();
        calque.querySelector(".qk-top").style.display = "none";
        calque.querySelector(".qk-bot").style.display = "none";
        const intro = document.createElement("div");
        intro.className = "qk-fin";
        intro.innerHTML = `<div class="qk-carte">
          <div class="qk-couronnes" aria-hidden="true">♛♛♛</div>
          <div class="qk-grand">Le but</div>
          <p>Rapporte <b>3 couronnes</b> dans ton village avant le rival.</p>
          <div class="qk-tour">
            <div><b>1</b><span>Au début de ton tour, tu pioches <b>5 cartes</b> : Déplacer, Pousser ou Magie.</span></div>
            <div><b>2</b><span>Tu poses <b>une île</b>, puis tu joues tes cartes dans l’ordre que tu veux.</span></div>
            <div><b>3</b><span>Fin du tour : les cartes non jouées restent en réserve pour plus tard.</span></div>
          </div>
          <p style="font-size:12.5px;opacity:.75">Tu vas jouer le début d’une vraie partie, guidé pas à pas.</p>
          <div class="qk-actions"><button class="qk-jouer" type="button">COMMENCER</button></div></div>`;
        intro.querySelector(".qk-jouer").addEventListener("click", () => {
          intro.remove();
          calque.classList.remove("qk-fin-active");
          calque.querySelector(".qk-top").style.display = "";
          calque.querySelector(".qk-bot").style.display = "";
        });
        calque.appendChild(intro);
        calque.classList.add("qk-fin-active");
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
          <p>Si plus personne ne peut poser d’île, le plus de couronnes l’emporte ; à égalité, celui qui a une couronne, portée ou au sol, au plus près de son village.</p>
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
        try { playSfx("victory"); } catch (_) { }
      }

      /* ---------- Entrée / sortie ---------------------------------------- */
      function quickStart({ intro = true, tour = 0 } = {}) {
        quickStyle();
        if (QUICK.dom) { QUICK.dom.remove(); QUICK.dom = null; }
        clearTimeout(QUICK.enchainement);
        QUICK.enchainement = null;
        QUICK.active = true;
        QUICK.fini = false;
        QUICK.tour = Math.max(0, Math.min(QK_DEBUTS.length - 1, tour));
        QUICK.etape = 0;

        try { if (typeof aiRunToken !== "undefined") aiRunToken++; } catch (_) { }
        try { if (typeof stopTurnTimer === "function") stopTurnTimer(); } catch (_) { }
        try { boardRenderMode = "3d"; } catch (_) { }
        try { clearKayKitVillages(); } catch (_) { }
        try { window.ILYOS_PLATEAU_2D?.activer(false); } catch (_) { }

        quickConstruire(QUICK.tour);
        try { applyVisualMode("alternative"); } catch (_) { }
        try { if (typeof applyBoardRenderMode === "function") applyBoardRenderMode("3d", { persist: false }); } catch (_) { }
        try { els.setupScreen.classList.add("hidden"); } catch (_) { }
        try { els.gameScreen.classList.remove("hidden"); } catch (_) { }
        try { if (typeof startAmbient === "function") startAmbient(); } catch (_) { }
        document.body.classList.add("quick-mode");
        quickBrancher();

        tutoRender();
        quickNouveauTour();
        if (intro) quickIntro();
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
        quickDebrancher();
        document.body.classList.remove("quick-mode", "quick-sans-fin");
        if (QUICK.dom) { QUICK.dom.remove(); QUICK.dom = null; }
      }

      /* Comme à la sortie des énigmes, un rechargement garantit une partie
         normale ensuite. `state` est vidé d'abord : la partie guidée n'est ni
         une partie à reprendre ni une partie à sauvegarder. */
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
        start: () => quickStart(),
        quitter: quickQuitter,
        reprendre: quickReprendre,
        // Accès direct au début d'un tour (tests, captures), sans l'écran du
        // but ; `etape` saute les étapes d'explication sans geste.
        aller: (tour, etape = 0) => {
          quickStart({ intro: false, tour });
          QUICK.etape = Math.max(0, Math.min(etape, QUICK_TOURS[QUICK.tour].etapes.length - 1));
          quickEntrer();
        },
        etat: () => ({
          actif: QUICK.active, tour: QUICK.tour, etape: QUICK.etape, fini: QUICK.fini,
          rival: !!QUICK.relais, total: QUICK_TOURS.length, cles: { ...QUICK.cles }
        })
      };
