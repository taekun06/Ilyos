      /* =====================================================================
         BOUCLES — le mode solo à échos

         Une boucle dure quelques battements. À chaque battement, chaque
         Gardien fait une seule action. Quand la boucle se termine, le temps
         revient au début : le Gardien joué devient un ÉCHO qui rejoue
         exactement ses ordres, et le joueur se réveille sur le socle suivant.

         Ce mode a ses propres règles, volontairement plus simples que celles du
         duel (une action par battement, poussée de force 1, couronne posée et
         non portée). Elles vivent dans `bouclesMoteur`, un noyau pur sans
         rendu : c'est lui qui a servi à concevoir et vérifier les sanctuaires
         (borne sur le nombre de boucles, solution de référence rejouée par
         `ILYOS_BOUCLES.verifier()`).

         Le rendu, lui, est celui du jeu : on construit un `state` normal
         (îles, gardiens, couronne) que kaykit3d.js dessine, et on le recopie
         depuis le noyau après chaque action. Les échos sont les mêmes modèles
         KayKit, rendus translucides.

         Point d'entrée : l'événement `ilyos-boucles-requested` (bouton BOUCLES
         du menu) ou `ILYOS_BOUCLES.ouvrir()`.
         ===================================================================== */

      /* ---------- Noyau de règles (pur) ---------------------------------
         Coordonnées de conception (x, y), y vers le bas. N, E, S, O. */
      const bouclesMoteur = (() => {
        const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
        const reconstruire = st => {
          const g = new Int8Array(st.w * st.h).fill(-1);
          st.islands.forEach((il, i) => il.cells.forEach(([x, y]) => { g[y * st.w + x] = i; }));
          st.grid = g;
        };
        const initial = (niveau, n) => {
          const st = {
            w: niveau.w, h: niveau.h, won: false,
            islands: niveau.islands.map(il => ({ pivot: il.pivot ? il.pivot.slice() : null, cells: il.cells.map(c => c.slice()), turns: 0 })),
            guardians: Array.from({ length: n }, (_, i) => ({ id: i, x: niveau.socles[i][0], y: niveau.socles[i][1], alive: true })),
            crown: { x: niveau.crown[0], y: niveau.crown[1] }
          };
          reconstruire(st);
          return st;
        };
        const dedans = (st, x, y) => x >= 0 && y >= 0 && x < st.w && y < st.h;
        const ileEn = (st, x, y) => (dedans(st, x, y) ? st.grid[y * st.w + x] : -1);
        const gardienEn = (st, x, y) => st.guardians.find(g => g.alive && g.x === x && g.y === y) || null;
        const occupe = (st, x, y) => !!gardienEn(st, x, y) || (st.crown.x === x && st.crown.y === y);
        const victoire = (st, niveau) => { if (st.crown.x === niveau.village[0] && st.crown.y === niveau.village[1]) st.won = true; };

        function appliquer(st, gi, ordre, niveau) {
          const g = st.guardians[gi];
          if (!g || !g.alive || !ordre || ordre.t === "att") return { t: "att", gi, ok: true };
          if (ordre.t === "pas") {
            const [dx, dy] = DIRS[ordre.d];
            const nx = g.x + dx, ny = g.y + dy;
            if (ileEn(st, nx, ny) >= 0 && !occupe(st, nx, ny)) {
              const from = [g.x, g.y]; g.x = nx; g.y = ny;
              return { t: "pas", gi, ok: true, d: ordre.d, from, to: [nx, ny] };
            }
            return { t: "pas", gi, ok: false, d: ordre.d };
          }
          if (ordre.t === "pousse") {
            /* Toute la ligne contiguë avance d'une case. Un Gardien qui sort
               des îles tombe. La couronne, elle, survole le vide jusqu'à la
               première île ; si cette case est prise, rien ne bouge. */
            const [dx, dy] = DIRS[ordre.d];
            const ligne = [];
            let x = g.x + dx, y = g.y + dy;
            while (dedans(st, x, y) && occupe(st, x, y)) { ligne.push(gardienEn(st, x, y) || "crown"); x += dx; y += dy; }
            if (!ligne.length) return { t: "pousse", gi, ok: false, d: ordre.d, vide: true };
            const moves = [];
            for (let i = ligne.length - 1; i >= 0; i--) {
              const p = ligne[i];
              const px = p === "crown" ? st.crown.x : p.x, py = p === "crown" ? st.crown.y : p.y;
              let nx = px + dx, ny = py + dy;
              if (p === "crown") {
                if (ileEn(st, nx, ny) < 0) {
                  while (dedans(st, nx, ny) && ileEn(st, nx, ny) < 0) { nx += dx; ny += dy; }
                  if (!dedans(st, nx, ny) || occupe(st, nx, ny)) return { t: "pousse", gi, ok: false, d: ordre.d, bloque: true };
                  moves.push({ who: "crown", from: [px, py], to: [nx, ny], glide: true });
                } else moves.push({ who: "crown", from: [px, py], to: [nx, ny] });
              } else moves.push({ who: p.id, from: [px, py], to: [nx, ny], fall: ileEn(st, nx, ny) < 0 });
            }
            moves.forEach(m => {
              if (m.who === "crown") { st.crown.x = m.to[0]; st.crown.y = m.to[1]; }
              else { const q = st.guardians[m.who]; q.x = m.to[0]; q.y = m.to[1]; if (m.fall) q.alive = false; }
            });
            victoire(st, niveau);
            return { t: "pousse", gi, ok: true, d: ordre.d, moves };
          }
          if (ordre.t === "magie") {
            /* Quart de tour horaire de l'île sous le Gardien, autour de son
               pivot, avec tout ce qu'elle porte. Même sens qu'un cran positif
               de calculateIslandRotationAroundPivot. */
            const ii = ileEn(st, g.x, g.y);
            const il = st.islands[ii];
            if (!il || !il.pivot) return { t: "magie", gi, ok: false };
            const [px, py] = il.pivot;
            const tourner = ([x, y]) => [px - (y - py), py + (x - px)];
            const nc = il.cells.map(tourner);
            for (const [x, y] of nc) {
              if (!dedans(st, x, y)) return { t: "magie", gi, ok: false, island: ii };
              const o = ileEn(st, x, y);
              if (o >= 0 && o !== ii) return { t: "magie", gi, ok: false, island: ii };
            }
            const surIle = (x, y) => il.cells.some(c => c[0] === x && c[1] === y);
            const carried = [];
            st.guardians.forEach(q => { if (q.alive && surIle(q.x, q.y)) carried.push({ who: q.id, from: [q.x, q.y], to: tourner([q.x, q.y]) }); });
            if (surIle(st.crown.x, st.crown.y)) carried.push({ who: "crown", from: [st.crown.x, st.crown.y], to: tourner([st.crown.x, st.crown.y]) });
            il.cells = nc; il.turns = (il.turns + 1) % 4;
            carried.forEach(m => {
              if (m.who === "crown") { st.crown.x = m.to[0]; st.crown.y = m.to[1]; }
              else { st.guardians[m.who].x = m.to[0]; st.guardians[m.who].y = m.to[1]; }
            });
            reconstruire(st);
            victoire(st, niveau);
            return { t: "magie", gi, ok: true, island: ii, pivot: [px, py], carried };
          }
          return { t: "att", gi, ok: true };
        }

        /* Chronologie complète : programmes[i][b] = ordre du Gardien i au
           battement b. Les plus anciens agissent d'abord. */
        function rejouer(niveau, programmes) {
          const st = initial(niveau, programmes.length);
          for (let b = 0; b < niveau.beats; b++) {
            for (let i = 0; i < programmes.length; i++) {
              appliquer(st, i, programmes[i][b], niveau);
              if (st.won) return { st, battement: b };
            }
          }
          return { st, battement: -1 };
        }

        return { DIRS, initial, appliquer, rejouer };
      })();

      /* ---------- Sanctuaires ---------------------------------------------
         Faits à la main, dans l'ordre de la série. Le nombre de boucles est
         le minimum PROUVÉ : chaque Gardien n'a qu'une poussée, et la couronne
         ne peut atteindre la porte qu'avec exactement ce nombre de poussées
         (relaxation sans Gardiens, voir la note de conception dans
         docs/BOUCLES.md). `solution` est rejouée par ILYOS_BOUCLES.verifier(). */
      const BOUCLES_NIVEAUX = [
        {
          id: "b1-relais", nom: "Le Relais",
          w: 6, h: 3, beats: 3, loops: 2, hand: { pas: 2, pousse: 1, magie: 0 },
          islands: [
            { cells: [[2, 0]], pivot: null },
            { cells: [[0, 1], [1, 1], [2, 1], [3, 1]], pivot: null },
            { cells: [[5, 1]], pivot: null }
          ],
          socles: [[0, 1], [2, 0]], crown: [2, 1], village: [5, 1],
          solution: ["E PE ·", "· S PE"]
        },
        {
          id: "b2-pivot", nom: "Le Pivot",
          w: 6, h: 6, beats: 3, loops: 3, hand: { pas: 2, pousse: 1, magie: 1 },
          islands: [
            { cells: [[1, 0], [1, 1]], pivot: [1, 0] },
            { cells: [[0, 2], [1, 2], [2, 2]], pivot: null },
            { cells: [[0, 3]], pivot: null },
            { cells: [[0, 4], [1, 4], [2, 4]], pivot: [1, 4] },
            { cells: [[5, 2]], pivot: null }
          ],
          socles: [[0, 3], [0, 4], [1, 0]], crown: [1, 1], village: [5, 2],
          solution: ["N PE ·", "M N PE", "PS · ·"]
        },
        {
          id: "b3-cascade", nom: "La Cascade",
          w: 7, h: 8, beats: 5, loops: 5, hand: { pas: 3, pousse: 1, magie: 1 },
          islands: [
            { cells: [[1, 1], [1, 2]], pivot: [1, 1] },
            { cells: [[4, 3], [5, 3], [6, 3]], pivot: [5, 3] },
            { cells: [[0, 4], [1, 4], [2, 4], [3, 4]], pivot: null },
            { cells: [[0, 5], [0, 6], [0, 7]], pivot: null },
            { cells: [[1, 6], [2, 6], [1, 7]], pivot: [2, 6] },
            { cells: [[5, 6]], pivot: null }
          ],
          socles: [[6, 3], [0, 5], [1, 7], [1, 6], [1, 1]], crown: [1, 2], village: [5, 6],
          solution: ["M N · · PS", "N PE · · ·", "M N PE · ·", "· · N PE ·", "PS · · · ·"]
        }
      ];

      const BOUCLES_COULEURS = ["#3d7dd8", "#e0603c", "#d9a21e", "#2e9e7a", "#9a5bc9"];
      const BOUCLES_STOCKAGE = "ilyos.boucles.progress";

      const BOUCLES = {
        active: false, index: 0, def: null,
        echos: [], vif: [], st: null, occupe: false, phase: "jeu", mode: "pas",
        serie: 0, ox: 0, oy: 0, ileIds: [], dom: null, groupe: null,
        anneaux: [], intentions: [], fleches: [], porte: null, socles: [],
        survol: -1, appui: null, raf: 0, aJoue: false
      };

      function bouclesLireProgres() {
        try { return JSON.parse(localStorage.getItem(BOUCLES_STOCKAGE) || "{}") || {}; } catch (_) { return {}; }
      }
      function bouclesNoterReussite(id, boucles) {
        const p = bouclesLireProgres();
        p[id] = Math.min(p[id] || 99, boucles);
        try { localStorage.setItem(BOUCLES_STOCKAGE, JSON.stringify(p)); } catch (_) { }
      }

      /* Le sanctuaire central n'a aucun sens sur ces plateaux taillés main :
         même enveloppe que les puzzles, jamais une seconde version. */
      const bouclesIsSanctuaryBase = isSanctuary;
      isSanctuary = function isSanctuaryBouclesAware(r, c) {
        if (BOUCLES.active) return false;
        return bouclesIsSanctuaryBase(r, c);
      };

      const bouclesRC = (x, y) => [y + BOUCLES.oy, x + BOUCLES.ox];
      const bouclesIdGardien = i => `bc${BOUCLES.serie}-${i}`;
      const bouclesMoi = () => BOUCLES.echos.length;

      function bouclesParseOrdre(t) {
        if (t === "·") return { t: "att" };
        if (t === "M") return { t: "magie" };
        if (t[0] === "P") return { t: "pousse", d: "NESO".indexOf(t[1]) };
        return { t: "pas", d: "NESO".indexOf(t) };
      }

      /* ---------- Miroir vers `state` ------------------------------------ */
      function bouclesConstruireState(def) {
        setBoardSize(11);
        BOUCLES.ox = Math.floor((GRID - def.w) / 2);
        BOUCLES.oy = Math.floor((GRID - def.h) / 2);
        const joueurs = ["TOI", "—"].map((name, i) => ({
          id: i, name, color: PLAYER_COLORS[i], icon: PLAYER_ICONS[i], isAI: false, aiDifficulty: null,
          village: null, villages: [], score: 0, deck: [], discard: [], hand: [], stash: { MOVE: 0, PUSH: 0, MAGIC: 0 }
        }));
        state = {
          players: joueurs, soloMode: false, onlineMode: false, visualMode: "alternative",
          startingBoardMode: "classic", startingBoardPreset: null, turnDurationSeconds: 0,
          setupSelectionPending: false, draft: null, aiDifficulty: null, currentPlayer: 0, round: 1, turn: 1,
          islands: [], characters: [],
          artifact: { id: "crown-1", r: CENTER.r, c: CENTER.c, carrierId: null, active: true },
          secondArtifact: { id: "crown-2", r: CENTER.r, c: CENTER.c, carrierId: null, active: false },
          phase: "ACTION_SELECT",
          rules: { allowDissolve: false, islandLimitPerPlayer: 0, shapeLimitPerOwner: 0, disableSecondCrown: true },
          islandPlacedThisTurn: true, centerCrownTakenThisTurn: false, couronnesEnAttente: [],
          treasureDropFromId: null, crownPickupCell: null, selectedIslandShape: null, placementCells: null,
          placementOriginIndex: 0, placementRotationSteps: 0, hoverAnchor: null, pendingSpawnIslandId: null,
          fxCells: [], inputLocked: true, aiThinking: false, timerExpiring: false, turnTimeLeft: null, turnDeadline: null,
          selectedActionCardId: null, selectedActionType: null, selectedActionCount: 1, pushForceChoice: 1,
          crownStealTargetId: null, aiCrownMemory: {}, crownPickupArtifactId: null, treasureDropArtifactId: null,
          crownTransferTargetIds: [], selectedCharId: null, selectedIslandId: null, selectedMagicPivot: null,
          magicPreviewDirection: 0, magicPreviewSteps: 0, magicPreviewCells: null, magicPreviewValid: false,
          magicHoverIslandId: null, magicHoverPivot: null, actionHoverCell: null, smartHoverType: null,
          smartHoverPath: [], smartPushForce: null, smartPushTargets: new Set(), pushOptions: [],
          pushHoverOptionId: null, pushTargetId: null, pendingDirectMoveTarget: null, reachable: new Set(),
          nextIslandId: 1, nextCharId: 100, undoHistory: [], winner: null,
          boucles: true
        };
        BOUCLES.ileIds = def.islands.map(il => tutoAddIsland(il.cells.map(([x, y]) => bouclesRC(x, y)), 0));
      }

      /* Recopie le noyau dans `state`. Les animations sont lancées AVANT par
         l'appelant ; ici on ne fait que dire où les choses se trouvent. */
      function bouclesMiroir(st) {
        st.islands.forEach((il, i) => {
          const ile = state.islands.find(is => is.id === BOUCLES.ileIds[i]);
          if (!ile) return;
          const cells = il.cells.map(([x, y]) => bouclesRC(x, y));
          ile.cells = cells;
          ile.anchor = { r: cells[0][0], c: cells[0][1] };
          ile.relCells = cells.map(([r, c]) => [r - cells[0][0], c - cells[0][1]]);
        });
        state.characters = st.guardians.filter(g => g.alive).map(g => {
          const [r, c] = bouclesRC(g.x, g.y);
          return { id: bouclesIdGardien(g.id), player: 0, r, c };
        });
        const [cr, cc] = bouclesRC(st.crown.x, st.crown.y);
        Object.assign(state.artifact, { r: cr, c: cc, carrierId: null, active: true });
        tutoRender();
      }

      /* Calcule l'instant présent : échos et ordres déjà joués de la boucle
         en cours, puis les gestes des échos au battement suivant (ils
         agissent avant toi). */
      function bouclesMaintenant() {
        const def = BOUCLES.def;
        const st = bouclesMoteur.initial(def, BOUCLES.echos.length + 1);
        for (let b = 0; b < BOUCLES.vif.length; b++) {
          for (let i = 0; i < BOUCLES.echos.length; i++) { bouclesMoteur.appliquer(st, i, BOUCLES.echos[i][b], def); if (st.won) return st; }
          bouclesMoteur.appliquer(st, bouclesMoi(), BOUCLES.vif[b], def); if (st.won) return st;
        }
        if (BOUCLES.vif.length < def.beats) {
          for (let i = 0; i < BOUCLES.echos.length; i++) { bouclesMoteur.appliquer(st, i, BOUCLES.echos[i][BOUCLES.vif.length], def); if (st.won) break; }
        }
        return st;
      }

      /* ---------- Animation d'un événement du noyau ---------------------- */
      const bouclesAttendre = ms => new Promise(res => setTimeout(res, kaykitReducedMotion() ? Math.min(ms, 60) : ms));

      function bouclesGlisserCouronne(from, to, glide) {
        const entree = kaykit3D?.looseCrownRegistry?.get("crown-1");
        if (!entree?.crown || kaykitReducedMotion()) return Promise.resolve();
        const [fr, fc] = bouclesRC(...from), [tr, tc] = bouclesRC(...to);
        const a = kaykitCellPosition(fr, fc, kaykitCellSurfaceY(fr, fc) + .012);
        const b = kaykitCellPosition(tr, tc, kaykitCellSurfaceY(tr, tc) + .012);
        const longueur = Math.abs(tr - fr) + Math.abs(tc - fc);
        const duree = glide ? 360 + longueur * 110 : 260;
        const hauteur = glide ? .5 + longueur * .14 : 0;
        const objets = entree.objects;
        const depart = objets.map(o => o.position.clone());
        const t0 = performance.now();
        return new Promise(res => {
          const pas = () => {
            const t = Math.min(1, (performance.now() - t0) / duree);
            const e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            objets.forEach((o, k) => {
              o.position.x = depart[k].x + (b.x - a.x) * e;
              o.position.z = depart[k].z + (b.z - a.z) * e;
              o.position.y = depart[k].y + (b.y - a.y) * e + Math.sin(Math.PI * t) * hauteur;
            });
            if (t < 1) requestAnimationFrame(pas); else res();
          };
          requestAnimationFrame(pas);
        });
      }

      async function bouclesAnimer(ev, st) {
        const id = bouclesIdGardien(ev.gi);
        if (ev.t === "att") { bouclesMiroir(st); return bouclesAttendre(140); }
        if (ev.t === "pas") {
          if (ev.ok) {
            bouclesMiroir(st);
            const [r, c] = bouclesRC(...ev.to), [r0, c0] = bouclesRC(...ev.from);
            queueKayKitActionAnimation(id, "move", 420, { r, c }, [[r, c]], null, [r0, c0]);
            return bouclesAttendre(440);
          }
          const g = st.guardians[ev.gi], [dx, dy] = bouclesMoteur.DIRS[ev.d];
          const [r, c] = bouclesRC(g.x + dx, g.y + dy);
          queueKayKitActionAnimation(id, "hurt", 360, { r, c });
          return bouclesAttendre(300);
        }
        if (ev.t === "pousse") {
          const g = st.guardians[ev.gi], [dx, dy] = bouclesMoteur.DIRS[ev.d];
          const [r, c] = bouclesRC(g.x + dx, g.y + dy);
          queueKayKitActionAnimation(id, "push", 640, { r, c });
          try { playSfx("push"); } catch (_) { }
          await bouclesAttendre(260);
          if (!ev.ok) return bouclesAttendre(200);
          const couronne = ev.moves.find(m => m.who === "crown");
          ev.moves.filter(m => m.who !== "crown").forEach(m => {
            const qid = bouclesIdGardien(m.who);
            if (m.fall) queueKayKitCharacterFall(qid, ev.d);
            else queueKayKitActionAnimation(qid, "hurt", 420, bouclesRC(...m.from).reduce((o, v, k) => (k ? { ...o, c: v } : { r: v }), {}));
          });
          if (couronne) await bouclesGlisserCouronne(couronne.from, couronne.to, couronne.glide);
          bouclesMiroir(st);
          return bouclesAttendre(couronne ? 120 : 300);
        }
        if (ev.t === "magie") {
          if (!ev.ok) { queueKayKitActionAnimation(id, "hurt", 360, null); return bouclesAttendre(320); }
          const [pr, pc] = bouclesRC(...ev.pivot);
          queueKayKitActionAnimation(id, "magic", 1000, { r: pr, c: pc });
          try { linkCasterToIsland(id, pr, pc); } catch (_) { }
          try { playSfx("magic"); } catch (_) { }
          playIslandMagicRotation(BOUCLES.ileIds[ev.island], 90, pr, pc, 500);
          kaykitGelerCalqueIles(true);
          await bouclesAttendre(520);
          kaykitGelerCalqueIles(false);
          bouclesMiroir(st);
          return bouclesAttendre(160);
        }
      }

      /* ---------- Déroulement --------------------------------------------- */
      function bouclesMainRestante() {
        const n = { pas: 0, pousse: 0, magie: 0 };
        BOUCLES.vif.forEach(o => { if (n[o.t] !== undefined) n[o.t]++; });
        const h = BOUCLES.def.hand;
        return { pas: h.pas - n.pas, pousse: h.pousse - n.pousse, magie: h.magie - n.magie };
      }

      async function bouclesAgir(ordre) {
        if (!BOUCLES.active || BOUCLES.occupe || BOUCLES.phase !== "jeu") return;
        if (BOUCLES.vif.length >= BOUCLES.def.beats) return;
        if (ordre.t !== "att" && bouclesMainRestante()[ordre.t] <= 0) { bouclesSecouer(ordre.t); return; }
        BOUCLES.occupe = true; bouclesSync();
        BOUCLES.vif.push(ordre);
        const ev = bouclesMoteur.appliquer(BOUCLES.st, bouclesMoi(), ordre, BOUCLES.def);
        await bouclesAnimer(ev, BOUCLES.st);
        if (ordre.t === "pousse") bouclesMode("pas");
        if (BOUCLES.st.won) { BOUCLES.occupe = false; return bouclesVictoire(); }
        await bouclesAvancer();
        BOUCLES.occupe = false; bouclesSync();
      }

      async function bouclesAvancer() {
        const def = BOUCLES.def;
        for (;;) {
          const b = BOUCLES.vif.length;
          if (b >= def.beats) { await bouclesFinDeBoucle(); return; }
          for (let i = 0; i < BOUCLES.echos.length; i++) {
            const ev = bouclesMoteur.appliquer(BOUCLES.st, i, BOUCLES.echos[i][b], def);
            if (ev.t !== "att") await bouclesAnimer(ev, BOUCLES.st);
            if (BOUCLES.st.won) { bouclesMiroir(BOUCLES.st); return bouclesVictoire(); }
          }
          bouclesMiroir(BOUCLES.st); bouclesSync();
          if (BOUCLES.st.guardians[bouclesMoi()].alive) return;
          await bouclesAttendre(260);
          BOUCLES.vif.push({ t: "att" });
        }
      }

      async function bouclesFinDeBoucle() {
        if (BOUCLES.echos.length + 1 >= BOUCLES.def.loops) {
          BOUCLES.phase = "perdu"; bouclesSync(); bouclesFeuille("perdu"); return;
        }
        await bouclesAttendre(260);
        await bouclesRembobiner();
        BOUCLES.echos.push(BOUCLES.vif.slice());
        BOUCLES.vif = [];
        BOUCLES.st = bouclesMoteur.initial(BOUCLES.def, BOUCLES.echos.length + 1);
        bouclesMiroir(BOUCLES.st); bouclesSync();
        await bouclesAttendre(520);
        await bouclesAvancer();
      }

      /* Le temps revient en arrière : un voile froid, le plateau qui reprend
         sa place, puis un nouveau Gardien sur le socle suivant. */
      async function bouclesRembobiner() {
        const voile = BOUCLES.dom?.voile;
        voile && voile.classList.add("on");
        try { playSfx("magic"); } catch (_) { }
        await bouclesAttendre(380);
        const st0 = bouclesMoteur.initial(BOUCLES.def, BOUCLES.echos.length + 1);
        st0.guardians[st0.guardians.length - 1].alive = false; // le nouveau se lève après
        bouclesMiroir(st0);
        await bouclesAttendre(520);
        voile && voile.classList.remove("on");
      }

      function bouclesVictoire() {
        BOUCLES.phase = "gagne";
        const n = BOUCLES.echos.length + 1;
        bouclesNoterReussite(BOUCLES.def.id, n);
        state.characters.forEach(ch => queueKayKitActionAnimation(ch.id, "victory", 1400, null));
        try { playSfx("victory"); } catch (_) { }
        bouclesSync();
        setTimeout(() => bouclesFeuille("gagne"), 1100);
      }

      function bouclesAnnuler() {
        if (BOUCLES.occupe || BOUCLES.phase !== "jeu" || !BOUCLES.vif.length) return;
        BOUCLES.vif.pop();
        // Les attentes ajoutées d'office après une chute partent avec le geste.
        while (BOUCLES.vif.length && BOUCLES.vif[BOUCLES.vif.length - 1].t === "att" && !bouclesMaintenant().guardians[bouclesMoi()].alive) BOUCLES.vif.pop();
        BOUCLES.st = bouclesMaintenant(); bouclesMiroir(BOUCLES.st); bouclesSync();
      }
      function bouclesRejouerBoucle() {
        if (BOUCLES.occupe) return;
        bouclesFeuille(null); BOUCLES.phase = "jeu"; BOUCLES.vif = [];
        BOUCLES.st = bouclesMaintenant(); bouclesMiroir(BOUCLES.st); bouclesSync();
      }
      function bouclesEffacerBoucle() {
        if (BOUCLES.occupe || !BOUCLES.echos.length) return;
        bouclesFeuille(null); BOUCLES.phase = "jeu";
        BOUCLES.echos.pop(); BOUCLES.vif = [];
        BOUCLES.st = bouclesMaintenant(); bouclesMiroir(BOUCLES.st); bouclesSync();
      }
      function bouclesToutRecommencer() {
        if (BOUCLES.occupe) return;
        bouclesFeuille(null); BOUCLES.phase = "jeu"; BOUCLES.echos = []; BOUCLES.vif = [];
        BOUCLES.st = bouclesMaintenant(); bouclesMiroir(BOUCLES.st); bouclesSync();
      }

      /* ---------- Repères 3D : anneaux, intentions, flèches, porte, socles - */
      function bouclesMateriau(couleur, opacite) {
        return new THREE.MeshBasicMaterial({ color: couleur, transparent: true, opacity: opacite, depthWrite: false, side: THREE.DoubleSide });
      }

      function bouclesForme(type) {
        const s = new THREE.Shape();
        if (type === "pas") { s.moveTo(-.13, 0); s.lineTo(0, .14); s.lineTo(.13, 0); s.lineTo(.08, 0); s.lineTo(0, .08); s.lineTo(-.08, 0); }
        else { s.moveTo(-.16, 0); s.lineTo(0, .15); s.lineTo(.16, 0); s.lineTo(.1, 0); s.lineTo(0, .08); s.lineTo(-.1, 0); }
        return new THREE.ShapeGeometry(s);
      }

      function bouclesInstallerGroupe() {
        if (!kaykit3D?.root) return false;
        if (BOUCLES.groupe) return true;
        const g = new THREE.Group(); g.name = "ilyos-boucles";
        kaykit3D.root.add(g);
        BOUCLES.groupe = g;
        // Flèches de choix autour du Gardien vivant.
        BOUCLES.fleches = [0, 1, 2, 3].map(d => {
          const h = new THREE.Group();
          const cible = new THREE.Mesh(new THREE.PlaneGeometry(.86, .86), new THREE.MeshBasicMaterial({ visible: false }));
          cible.rotation.x = -Math.PI / 2; cible.userData.bouclesDir = d; h.add(cible);
          const disque = new THREE.Mesh(new THREE.CircleGeometry(.3, 28), bouclesMateriau(0xffffff, .38));
          disque.rotation.x = -Math.PI / 2; h.add(disque);
          const chevron = new THREE.Mesh(bouclesForme("pas"), bouclesMateriau(0x2f3442, .8));
          chevron.rotation.x = -Math.PI / 2; chevron.position.set(0, .004, .05); h.add(chevron);
          h.userData = { cible, disque, chevron };
          g.add(h); return h;
        });
        // Porte du village : un anneau doré qui respire.
        const porte = new THREE.Group();
        const anneau = new THREE.Mesh(new THREE.TorusGeometry(.34, .03, 6, 40), new THREE.MeshBasicMaterial({ color: 0xffcf52 }));
        anneau.rotation.x = Math.PI / 2; porte.add(anneau);
        const fond = new THREE.Mesh(new THREE.CircleGeometry(.32, 32), bouclesMateriau(0xffe2a0, .45));
        fond.rotation.x = -Math.PI / 2; porte.add(fond);
        porte.userData = { anneau, fond };
        g.add(porte); BOUCLES.porte = porte;
        return true;
      }

      function bouclesRetirerGroupe() {
        if (!BOUCLES.groupe) return;
        BOUCLES.groupe.traverse(o => { if (o.isMesh) { o.geometry?.dispose(); o.material?.dispose?.(); } });
        BOUCLES.groupe.parent?.remove(BOUCLES.groupe);
        BOUCLES.groupe = null; BOUCLES.fleches = []; BOUCLES.porte = null;
        BOUCLES.anneaux = []; BOUCLES.intentions = []; BOUCLES.socles = [];
      }

      /* Reconstruit les repères qui dépendent de l'état (anneaux par boucle,
         intentions des échos, socles). Peu d'objets, reconstruits rarement. */
      function bouclesRepères() {
        if (!bouclesInstallerGroupe()) return;
        const g = BOUCLES.groupe;
        [...BOUCLES.anneaux, ...BOUCLES.intentions, ...BOUCLES.socles].forEach(o => {
          o.traverse(m => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } });
          g.remove(o);
        });
        BOUCLES.anneaux = []; BOUCLES.intentions = []; BOUCLES.socles = [];
        const def = BOUCLES.def, st = BOUCLES.st;
        if (!def || !st) return;
        st.guardians.forEach((q, i) => {
          if (!q.alive) return;
          const vif = i === bouclesMoi();
          const a = new THREE.Mesh(new THREE.RingGeometry(.3, vif ? .37 : .34, 36), bouclesMateriau(BOUCLES_COULEURS[i], vif ? .95 : .5));
          a.rotation.x = -Math.PI / 2; a.userData = { gi: i, vif };
          g.add(a); BOUCLES.anneaux.push(a);
          // Prochain ordre de l'écho : une marque fine au sol, dans sa couleur.
          if (vif || BOUCLES.phase !== "jeu") return;
          const ordre = BOUCLES.echos[i]?.[BOUCLES.vif.length + 1];
          if (!ordre || ordre.t === "att") return;
          const it = new THREE.Group(); it.userData = { gi: i };
          const m = bouclesMateriau(BOUCLES_COULEURS[i], .9);
          if (ordre.t === "magie") {
            const arc = new THREE.Mesh(new THREE.RingGeometry(.42, .47, 32, 1, .3, Math.PI * 1.5), m);
            arc.rotation.x = -Math.PI / 2; it.add(arc);
          } else {
            [0, ordre.t === "pousse" ? .12 : null].filter(v => v !== null).forEach(o => {
              const f = new THREE.Mesh(bouclesForme(ordre.t), m.clone());
              f.rotation.x = -Math.PI / 2; f.position.set(0, 0, -.44 - o); it.add(f);
            });
            it.rotation.y = -ordre.d * Math.PI / 2;
          }
          g.add(it); BOUCLES.intentions.push(it);
        });
        // Socles : un disque pâle, et autant de points que le numéro de la boucle.
        def.socles.forEach(([x, y], i) => {
          const [r, c] = bouclesRC(x, y);
          if (i < BOUCLES.echos.length + 1 && BOUCLES.vif.length) return;
          const s = new THREE.Group();
          const p = kaykitCellPosition(r, c, kaykitCellSurfaceY(r, c) + .015);
          s.position.set(p.x, p.y, p.z);
          const base = new THREE.Mesh(new THREE.CircleGeometry(.3, 28), bouclesMateriau(0xf4ecdc, .55));
          base.rotation.x = -Math.PI / 2; s.add(base);
          for (let k = 0; k <= i; k++) {
            const ang = (k / (i + 1)) * Math.PI * 2 - Math.PI / 2, rr = i === 0 ? 0 : .14;
            const d = new THREE.Mesh(new THREE.CircleGeometry(.045, 14), bouclesMateriau(BOUCLES_COULEURS[i], i === bouclesMoi() ? .95 : .55));
            d.rotation.x = -Math.PI / 2; d.position.set(Math.cos(ang) * rr, .003, Math.sin(ang) * rr); s.add(d);
          }
          g.add(s); BOUCLES.socles.push(s);
        });
      }

      /* Chaque image : les repères suivent les modèles animés, les échos sont
         rendus translucides, la porte respire. */
      function bouclesImage(t) {
        if (!BOUCLES.active) return;
        BOUCLES.raf = requestAnimationFrame(bouclesImage);
        if (!kaykit3D || !BOUCLES.groupe) { bouclesRepères(); return; }
        const position = gi => {
          const v = kaykit3D.characterVisuals.get(bouclesIdGardien(gi));
          return v?.wrapper ? v.wrapper.position : null;
        };
        BOUCLES.anneaux.forEach(a => {
          const p = position(a.userData.gi);
          a.visible = !!p; if (p) a.position.set(p.x, p.y + .02, p.z);
          if (a.userData.vif) a.scale.setScalar(1 + Math.sin(t / 330) * .05);
        });
        BOUCLES.intentions.forEach(it => {
          const p = position(it.userData.gi);
          it.visible = !!p; if (p) it.position.set(p.x, p.y + .03, p.z);
        });
        // Échos translucides : matériaux clonés une fois par visuel.
        kaykit3D.characterVisuals.forEach((v, id) => {
          const m = /^bc\d+-(\d+)$/.exec(id);
          if (!m) return;
          const echo = Number(m[1]) < BOUCLES.echos.length;
          if (!!v.bouclesEcho === echo) return;
          v.bouclesEcho = echo;
          v.wrapper.traverse(o => {
            if (!o.isMesh || !o.material) return;
            if (!o.userData.bouclesMat) { o.material = Array.isArray(o.material) ? o.material.map(x => x.clone()) : o.material.clone(); o.userData.bouclesMat = true; }
            (Array.isArray(o.material) ? o.material : [o.material]).forEach(mat => {
              mat.transparent = echo; mat.opacity = echo ? .5 : 1; mat.depthWrite = !echo; mat.needsUpdate = true;
            });
          });
        });
        // Flèches de choix autour du Gardien vivant.
        const vivant = BOUCLES.st?.guardians[bouclesMoi()];
        const montrer = !!(vivant && vivant.alive && BOUCLES.phase === "jeu" && !BOUCLES.occupe && BOUCLES.vif.length < BOUCLES.def.beats);
        const pousse = BOUCLES.mode === "pousse";
        BOUCLES.fleches.forEach((h, d) => {
          h.visible = montrer;
          if (!montrer) return;
          const [dx, dy] = bouclesMoteur.DIRS[d];
          const [r, c] = bouclesRC(vivant.x + dx, vivant.y + dy);
          const [r0, c0] = bouclesRC(vivant.x, vivant.y);
          const p = kaykitCellPosition(r, c, kaykitCellSurfaceY(r0, c0) + .03);
          h.position.set(p.x, p.y, p.z); h.rotation.y = -d * Math.PI / 2;
          const sur = BOUCLES.survol === d;
          h.userData.disque.material.color.set(pousse ? 0xffe2a0 : 0xffffff);
          h.userData.disque.material.opacity = (pousse ? .62 : .38) + (sur ? .3 : 0);
          h.userData.chevron.material.color.set(pousse ? 0xb57d10 : 0x2f3442);
          h.scale.setScalar(sur ? 1.1 : 1);
        });
        if (BOUCLES.porte) {
          const [vr, vc] = bouclesRC(...BOUCLES.def.village);
          const p = kaykitCellPosition(vr, vc, kaykitCellSurfaceY(vr, vc) + .02);
          BOUCLES.porte.position.set(p.x, p.y, p.z);
          BOUCLES.porte.userData.fond.material.opacity = .32 + Math.sin(t / 520) * .14;
        }
      }

      /* ---------- Entrées : flèches cliquées, clavier --------------------- */
      function bouclesViser(event) {
        if (!kaykit3D?.camera || !BOUCLES.fleches.length || !BOUCLES.fleches[0].visible) return -1;
        const rect = kaykit3D.canvas.getBoundingClientRect();
        const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, kaykit3D.camera);
        const hit = ray.intersectObjects(BOUCLES.fleches.map(h => h.userData.cible))[0];
        return hit ? hit.object.userData.bouclesDir : -1;
      }
      function bouclesPointeurBas(e) { if (BOUCLES.active) BOUCLES.appui = [e.clientX, e.clientY]; }
      function bouclesPointeurHaut(e) {
        if (!BOUCLES.active || !BOUCLES.appui) return;
        const bouge = Math.hypot(e.clientX - BOUCLES.appui[0], e.clientY - BOUCLES.appui[1]);
        BOUCLES.appui = null;
        if (bouge > 7) return;
        const d = bouclesViser(e);
        if (d >= 0) bouclesAgir({ t: BOUCLES.mode, d });
      }
      function bouclesSurvol(e) { if (BOUCLES.active) BOUCLES.survol = bouclesViser(e); }
      // Le plateau normal ne reçoit rien pendant les Boucles.
      function bouclesBloquerPlateau(e) {
        if (!BOUCLES.active) return;
        e.stopImmediatePropagation(); e.stopPropagation(); e.preventDefault();
      }

      function bouclesDirectionCamera(touche) {
        const cam = kaykit3D?.camera; if (!cam) return 0;
        const f = new THREE.Vector3(); cam.getWorldDirection(f); f.y = 0; f.normalize();
        const droite = new THREE.Vector3(-f.z, 0, f.x);
        const voulu = { ArrowUp: f, ArrowDown: f.clone().negate(), ArrowRight: droite, ArrowLeft: droite.clone().negate() }[touche];
        let meilleur = 0, score = -9;
        bouclesMoteur.DIRS.forEach(([dx, dy], d) => { const v = dx * voulu.x + dy * voulu.z; if (v > score) { score = v; meilleur = d; } });
        return meilleur;
      }
      function bouclesClavier(e) {
        if (!BOUCLES.active) return;
        if (BOUCLES.dom && !BOUCLES.dom.feuille.hidden) {
          if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); }
          return;
        }
        let pris = true;
        if (e.key.startsWith("Arrow")) bouclesAgir({ t: e.shiftKey || BOUCLES.mode === "pousse" ? "pousse" : "pas", d: bouclesDirectionCamera(e.key) });
        else if (e.key === " ") bouclesAgir({ t: "att" });
        else if (e.key === "m" || e.key === "M") bouclesAgir({ t: "magie" });
        else if (e.key === "p" || e.key === "P") bouclesMode(BOUCLES.mode === "pousse" ? "pas" : "pousse");
        else if (e.key === "z" || e.key === "Z" || e.key === "Backspace") bouclesAnnuler();
        else pris = false;
        if (pris) { e.preventDefault(); e.stopImmediatePropagation(); }
      }

      /* ---------- Interface : partition, main, feuilles ------------------- */
      const BOUCLES_ICONES = {
        pas: c => `<svg viewBox="0 0 32 32"><path d="M11 6c2.6 0 4 3 4 6.5S13.6 18 11.5 18 8 15.6 8 12.5 8.6 6 11 6z" fill="${c}"/><ellipse cx="11.6" cy="21.5" rx="2.6" ry="2" fill="${c}"/><path d="M21 12c2.4 0 3.6 2.6 3.6 5.6S23.4 22.5 21.5 22.5 18.4 20.4 18.4 17.6 18.8 12 21 12z" fill="${c}" opacity=".7"/><ellipse cx="21.4" cy="25.6" rx="2.3" ry="1.8" fill="${c}" opacity=".7"/></svg>`,
        pousse: c => `<svg viewBox="0 0 32 32"><path d="M6 9 L14 16 L6 23M14 9 L22 16 L14 23" fill="none" stroke="${c}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><rect x="24" y="8" width="3.5" height="16" rx="1.6" fill="${c}"/></svg>`,
        magie: c => `<svg viewBox="0 0 32 32"><path d="M16 6a10 10 0 1 1-9.4 6.6" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"/><path d="M3.8 8.6 L6.8 13 L11.2 10.4" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16" cy="16" r="2.6" fill="${c}"/></svg>`,
        att: c => `<svg viewBox="0 0 32 32"><path d="M9 5h14M9 27h14M10 5c0 7 12 7 12 11S10 20 10 27M22 5c0 7-12 7-12 11s12 4 12 11" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round"/></svg>`,
        annuler: c => `<svg viewBox="0 0 24 24"><path d="M9 7 L4 11.5 L9 16" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 11.5h9.5a5.5 5.5 0 0 1 0 11H11" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/></svg>`,
        boucle: c => `<svg viewBox="0 0 24 24"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/><path d="M18.5 3.5v4h-4" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
        effacer: c => `<svg viewBox="0 0 24 24"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="3 3"/><path d="M18.5 3.5v4h-4" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.5 12h7" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/></svg>`,
        aide: c => `<svg viewBox="0 0 24 24"><path d="M9 9.2a3 3 0 1 1 4.2 2.8c-.8.4-1.2 1-1.2 1.9v.6" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="18" r="1.3" fill="${c}"/></svg>`,
        quitter: c => `<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/></svg>`
      };
      function bouclesIconeOrdre(o, c) {
        if (!o) return "";
        if (o.t === "att") return `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="2.4" fill="${c}" opacity=".55"/></svg>`;
        if (o.t === "magie") return BOUCLES_ICONES.magie(c);
        const rot = o.d * 90;
        if (o.t === "pas") return `<svg viewBox="0 0 32 32"><g transform="rotate(${rot} 16 16)"><path d="M16 25V8M9 14l7-7 7 7" fill="none" stroke="${c}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;
        return `<svg viewBox="0 0 32 32"><g transform="rotate(${rot} 16 16)"><path d="M8 18l8-8 8 8M8 26l8-8 8 8" fill="none" stroke="${c}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><rect x="8" y="4.5" width="16" height="3.4" rx="1.6" fill="${c}"/></g></svg>`;
      }

      function bouclesStyle() {
        if (document.getElementById("ilyos-boucles-style")) return;
        const s = document.createElement("style");
        s.id = "ilyos-boucles-style";
        s.textContent = `
          body.boucles-mode #gameScreen > :not(main),
          body.boucles-mode #ilyosHudOrganicV2,
          body.boucles-mode .banner-panel,
          body.boucles-mode .kaykit-ui,
          body.boucles-mode .kaykit-camera-hint,
          body.boucles-mode .kaykit-camera-controls,
          body.boucles-mode .kaykit-controls,
          body.boucles-mode #deckDiscardHud,
          body.boucles-mode .toast,
          body.boucles-mode #plateauTactiqueBtn,
          body.boucles-mode #plateauTactique { display: none !important; }
          #bouclesCalque { --bc-encre: #2f3442; --bc-doux: #5d6577; --bc-verre: rgba(255,250,240,.82); --bc-trait: rgba(47,52,66,.14); --bc-or: #e3a82b;
            position: fixed; inset: 0; z-index: 60; pointer-events: none; font-family: 'Nunito Sans','Inter',system-ui,sans-serif; color: var(--bc-encre); }
          #bouclesCalque > * { pointer-events: auto; }
          #bouclesCalque .bc-titre { position: absolute; top: calc(env(safe-area-inset-top,0px) + 14px); left: 16px; display: flex; align-items: center; gap: 10px; }
          #bouclesCalque .bc-titre b { font-family: 'Cinzel Decorative','Almendra',serif; font-size: 1.15rem; text-shadow: 0 1px 0 rgba(255,255,255,.7); }
          #bouclesCalque .bc-titre small { display: block; font-size: .72rem; letter-spacing: .08em; text-transform: uppercase; color: var(--bc-doux); }
          #bouclesCalque .bc-partition { position: absolute; top: calc(env(safe-area-inset-top,0px) + 12px); right: 16px; background: var(--bc-verre); border: 1px solid var(--bc-trait); border-radius: 14px; padding: 8px 10px; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: grid; gap: 4px; align-items: center; box-shadow: 0 6px 22px rgba(47,52,66,.14); }
          #bouclesCalque .bc-lab { width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; font-size: .7rem; font-weight: 800; color: #fff; }
          #bouclesCalque .bc-case { width: 30px; height: 26px; border-radius: 7px; display: grid; place-items: center; background: rgba(47,52,66,.05); }
          #bouclesCalque .bc-case svg { width: 18px; height: 18px; }
          #bouclesCalque .bc-case.joue { background: rgba(255,255,255,.8); }
          #bouclesCalque .bc-case.maintenant { box-shadow: inset 0 0 0 2px var(--bc-encre); background: #fff; }
          #bouclesCalque .bc-futur { opacity: .38; }
          #bouclesCalque .bc-temps { font-size: .7rem; text-align: center; color: var(--bc-doux); font-variant-numeric: tabular-nums; }
          #bouclesCalque .bc-temps.maintenant { color: var(--bc-encre); font-weight: 800; }
          #bouclesCalque .bc-bas { position: absolute; left: 0; right: 0; bottom: calc(env(safe-area-inset-bottom,0px) + 14px); display: flex; justify-content: center; align-items: flex-end; gap: 12px; padding-inline: 16px; flex-wrap: wrap; pointer-events: none; }
          #bouclesCalque .bc-bas > * { pointer-events: auto; }
          #bouclesCalque .bc-main { display: flex; gap: 8px; background: var(--bc-verre); border: 1px solid var(--bc-trait); border-radius: 18px; padding: 8px; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); box-shadow: 0 8px 26px rgba(47,52,66,.16); }
          #bouclesCalque .bc-carte { position: relative; width: 58px; height: 70px; border-radius: 12px; border: 1px solid var(--bc-trait); background: #fffaf2; display: grid; place-items: center; cursor: pointer; padding: 0; color: var(--bc-encre); transition: transform .15s ease, box-shadow .15s ease; }
          #bouclesCalque .bc-carte svg { width: 30px; height: 30px; }
          #bouclesCalque .bc-carte:hover:not(:disabled) { transform: translateY(-3px); box-shadow: 0 6px 14px rgba(47,52,66,.16); }
          #bouclesCalque .bc-carte.arme { background: #fff1d6; box-shadow: 0 0 0 2px var(--bc-or); transform: translateY(-4px); }
          #bouclesCalque .bc-carte:disabled { opacity: .35; cursor: default; }
          #bouclesCalque .bc-carte .n { position: absolute; top: 4px; right: 6px; font-weight: 800; font-size: .8rem; color: var(--bc-doux); font-variant-numeric: tabular-nums; }
          #bouclesCalque .bc-outils { display: flex; gap: 6px; }
          #bouclesCalque .bc-outil { width: 42px; height: 42px; border-radius: 50%; border: 1px solid var(--bc-trait); background: var(--bc-verre); display: grid; place-items: center; cursor: pointer; padding: 0; }
          #bouclesCalque .bc-outil svg { width: 20px; height: 20px; }
          #bouclesCalque .bc-outil:disabled { opacity: .35; cursor: default; }
          #bouclesCalque button:focus-visible { outline: 3px solid #3d7dd8; outline-offset: 2px; }
          #bouclesCalque .bc-voile { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity .35s ease; background: radial-gradient(circle at 50% 55%, rgba(255,255,255,0) 30%, rgba(120,170,240,.35) 75%, rgba(80,120,200,.55) 100%); }
          #bouclesCalque .bc-voile.on { opacity: 1; }
          #bouclesCalque .bc-fond { position: absolute; inset: 0; display: grid; place-items: center; padding: 16px; background: rgba(47,52,66,.3); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); }
          #bouclesCalque .bc-fond[hidden] { display: none; }
          #bouclesCalque .bc-feuille { width: min(470px, 100%); max-height: calc(100% - 32px); overflow: auto; background: #fffaf2; border-radius: 20px; padding: 22px 22px 18px; box-shadow: 0 24px 60px rgba(47,52,66,.3); display: flex; flex-direction: column; gap: 12px; }
          #bouclesCalque .bc-feuille h2 { margin: 0; font-family: 'Cinzel Decorative','Almendra',serif; font-size: 1.35rem; text-wrap: balance; }
          #bouclesCalque .bc-feuille p { margin: 0; line-height: 1.5; color: var(--bc-doux); }
          #bouclesCalque .bc-regles { display: grid; grid-template-columns: 30px 1fr; gap: 10px 12px; align-items: start; }
          #bouclesCalque .bc-regles svg { width: 28px; height: 28px; }
          #bouclesCalque .bc-regles div { line-height: 1.45; font-size: .93rem; min-width: 0; }
          #bouclesCalque .bc-niveaux { display: grid; gap: 8px; }
          #bouclesCalque .bc-niveau { display: flex; align-items: center; justify-content: space-between; gap: 10px; border: 1px solid var(--bc-trait); background: #fff; border-radius: 14px; padding: 10px 14px; cursor: pointer; font: inherit; color: inherit; text-align: left; }
          #bouclesCalque .bc-niveau b { font-family: 'Cinzel Decorative','Almendra',serif; font-size: 1rem; }
          #bouclesCalque .bc-niveau span { font-size: .85rem; color: var(--bc-doux); font-variant-numeric: tabular-nums; }
          #bouclesCalque .bc-niveau.fait span { color: #b57d10; font-weight: 800; }
          #bouclesCalque .bc-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
          #bouclesCalque .bc-btn { font: inherit; font-weight: 700; border-radius: 999px; padding: 10px 18px; border: 1px solid var(--bc-trait); background: #fff; color: var(--bc-encre); cursor: pointer; }
          #bouclesCalque .bc-btn.principal { background: var(--bc-encre); color: #fffaf2; border-color: var(--bc-encre); }
          #bouclesCalque .bc-touches { font-size: .8rem; color: var(--bc-doux); }
          @media (max-width: 600px) {
            #bouclesCalque .bc-partition { top: auto; bottom: calc(env(safe-area-inset-bottom,0px) + 150px); right: 50%; transform: translateX(50%); padding: 6px 8px; }
            #bouclesCalque .bc-case { width: 26px; height: 22px; }
            #bouclesCalque .bc-carte { width: 52px; height: 62px; }
          }
          @media (prefers-reduced-motion: reduce) { #bouclesCalque .bc-carte, #bouclesCalque .bc-voile { transition: none; } }
        `;
        document.head.appendChild(s);
      }

      function bouclesCalque() {
        if (BOUCLES.dom) return BOUCLES.dom;
        bouclesStyle();
        const racine = document.createElement("div");
        racine.id = "bouclesCalque";
        const I = BOUCLES_ICONES, encre = "#2f3442";
        racine.innerHTML = `
          <div class="bc-voile"></div>
          <div class="bc-titre"><button class="bc-outil" data-bc="quitter" title="Quitter les Boucles" aria-label="Quitter">${I.quitter(encre)}</button><div><b data-bc="nom"></b><small>Boucles d'Ilyos</small></div></div>
          <div class="bc-partition" data-bc="partition" aria-label="Partition des boucles"></div>
          <div class="bc-bas">
            <div class="bc-main">
              <button class="bc-carte" data-bc="pas" title="Pas (flèches)" aria-label="Pas"><span class="n"></span>${I.pas(encre)}</button>
              <button class="bc-carte" data-bc="pousse" title="Poussée (Maj + flèche)" aria-label="Poussée"><span class="n"></span>${I.pousse(encre)}</button>
              <button class="bc-carte" data-bc="magie" title="Magie : tourner l'île sous soi (M)" aria-label="Magie"><span class="n"></span>${I.magie(encre)}</button>
              <button class="bc-carte" data-bc="att" title="Attendre (Espace)" aria-label="Attendre">${I.att(encre)}</button>
            </div>
            <div class="bc-outils">
              <button class="bc-outil" data-bc="annuler" title="Annuler le dernier geste (Z)" aria-label="Annuler">${I.annuler(encre)}</button>
              <button class="bc-outil" data-bc="boucle" title="Rejouer cette boucle depuis le début" aria-label="Rejouer la boucle">${I.boucle(encre)}</button>
              <button class="bc-outil" data-bc="effacer" title="Effacer la boucle précédente" aria-label="Effacer la boucle précédente">${I.effacer(encre)}</button>
              <button class="bc-outil" data-bc="aide" title="Règles" aria-label="Règles">${I.aide(encre)}</button>
            </div>
          </div>
          <div class="bc-fond" data-bc="fond" hidden><div class="bc-feuille" role="dialog" data-bc="feuille"></div></div>`;
        document.body.appendChild(racine);
        const q = k => racine.querySelector(`[data-bc="${k}"]`);
        BOUCLES.dom = { racine, voile: racine.querySelector(".bc-voile"), partition: q("partition"), nom: q("nom"), fond: q("fond"), feuille: q("fond"), contenu: q("feuille") };
        q("pas").onclick = () => bouclesMode("pas");
        q("pousse").onclick = () => bouclesMode(BOUCLES.mode === "pousse" ? "pas" : "pousse");
        q("magie").onclick = () => bouclesAgir({ t: "magie" });
        q("att").onclick = () => bouclesAgir({ t: "att" });
        q("annuler").onclick = bouclesAnnuler;
        q("boucle").onclick = bouclesRejouerBoucle;
        q("effacer").onclick = bouclesEffacerBoucle;
        q("aide").onclick = () => bouclesFeuille("regles");
        q("quitter").onclick = bouclesQuitter;
        return BOUCLES.dom;
      }

      function bouclesMode(m) {
        BOUCLES.mode = m;
        BOUCLES.dom?.racine.querySelector('[data-bc="pousse"]')?.classList.toggle("arme", m === "pousse");
      }
      function bouclesSecouer(t) {
        BOUCLES.dom?.racine.querySelector(`[data-bc="${t}"]`)?.animate(
          [{ transform: "translateX(0)" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(0)" }], { duration: 220 });
      }

      function bouclesSync() {
        const dom = BOUCLES.dom, def = BOUCLES.def;
        if (!dom || !def) return;
        dom.nom.textContent = def.nom;
        const reste = bouclesMainRestante(), jeu = BOUCLES.phase === "jeu" && !BOUCLES.occupe;
        const q = k => dom.racine.querySelector(`[data-bc="${k}"]`);
        ["pas", "pousse", "magie"].forEach(k => {
          const b = q(k);
          b.hidden = def.hand[k] === 0;
          b.querySelector(".n").textContent = reste[k];
          b.disabled = !jeu || reste[k] <= 0;
        });
        q("att").disabled = !jeu;
        q("annuler").disabled = !jeu || !BOUCLES.vif.length;
        q("boucle").disabled = BOUCLES.occupe || (!BOUCLES.vif.length && BOUCLES.phase === "jeu");
        q("effacer").disabled = BOUCLES.occupe || !BOUCLES.echos.length;
        // Partition : une ligne par boucle, une colonne par battement.
        dom.partition.style.gridTemplateColumns = `22px repeat(${def.beats}, auto)`;
        let h = "<span></span>";
        for (let b = 0; b < def.beats; b++) h += `<span class="bc-temps${b === BOUCLES.vif.length && BOUCLES.phase === "jeu" ? " maintenant" : ""}">${b + 1}</span>`;
        for (let r = 0; r < def.loops; r++) {
          const futur = r > BOUCLES.echos.length;
          const prog = r < BOUCLES.echos.length ? BOUCLES.echos[r] : r === BOUCLES.echos.length ? BOUCLES.vif : [];
          h += `<span class="bc-lab${futur ? " bc-futur" : ""}" style="background:${BOUCLES_COULEURS[r]}">${r + 1}</span>`;
          for (let b = 0; b < def.beats; b++) {
            const now = r === BOUCLES.echos.length && b === BOUCLES.vif.length && BOUCLES.phase === "jeu";
            const joue = r === BOUCLES.echos.length && b < BOUCLES.vif.length;
            h += `<span class="bc-case${now ? " maintenant" : ""}${joue ? " joue" : ""}${futur ? " bc-futur" : ""}">${bouclesIconeOrdre(prog[b], BOUCLES_COULEURS[r])}</span>`;
          }
        }
        dom.partition.innerHTML = h;
        bouclesRepères();
      }

      /* Feuilles : règles et choix du sanctuaire, victoire, échec. */
      function bouclesFeuille(type) {
        const dom = bouclesCalque();
        if (!type) { dom.fond.hidden = true; return; }
        const I = BOUCLES_ICONES, C = BOUCLES_COULEURS;
        let h = "";
        if (type === "regles") {
          const progres = bouclesLireProgres();
          h = `<h2>Les Boucles</h2>
            <p>Ramène la couronne sur la porte dorée. Chaque sanctuaire te donne un nombre précis de boucles.</p>
            <div class="bc-regles">
              ${I.boucle(C[0])}<div><b>Une boucle dure quelques battements.</b> À chaque battement, chaque Gardien fait une seule action.</div>
              ${I.annuler(C[1])}<div><b>Puis le temps revient au début.</b> Ton Gardien devient un écho qui rejoue exactement tes ordres, et tu te réveilles sur le socle suivant.</div>
              ${I.pas(C[2])}<div><b>Un écho est aveugle.</b> Il retient « un pas vers l'est », jamais une destination. S'il est bloqué, il reste sur place.</div>
              ${I.pousse(C[3])}<div><b>Les plus anciens agissent d'abord</b>, toi en dernier. Une couronne poussée au-dessus du vide glisse jusqu'à la première île.</div>
              ${I.magie(C[4])}<div><b>La magie</b> fait tourner d'un quart de tour l'île sous tes pieds, avec tout ce qu'elle porte.</div>
            </div>
            <p class="bc-touches">Flèches : pas · Maj + flèche : poussée · M : magie · Espace : attendre · Z : annuler</p>
            <div class="bc-niveaux">${BOUCLES_NIVEAUX.map((n, i) => `<button class="bc-niveau${progres[n.id] ? " fait" : ""}" data-niveau="${i}"><b>${n.nom}</b><span>${progres[n.id] ? "Résolu · " : ""}${n.loops} boucles</span></button>`).join("")}</div>`;
        } else if (type === "gagne") {
          const suivant = BOUCLES.index + 1 < BOUCLES_NIVEAUX.length;
          h = `<h2>La couronne est rentrée</h2>
            <p>${BOUCLES.echos.length + 1} passés ont joué ensemble.</p>
            <div class="bc-actions"><button class="bc-btn" data-act="rejouer">Rejouer</button>${suivant ? `<button class="bc-btn principal" data-act="suivant">Sanctuaire suivant</button>` : `<button class="bc-btn principal" data-act="liste">Les sanctuaires</button>`}</div>`;
        } else if (type === "perdu") {
          h = `<h2>La dernière boucle s'achève</h2>
            <p>La couronne n'a pas atteint la porte. Rejoue cette boucle, efface une boucle plus ancienne, ou repars de zéro.</p>
            <div class="bc-actions"><button class="bc-btn" data-act="zero">Tout recommencer</button><button class="bc-btn" data-act="effacer">Effacer la boucle précédente</button><button class="bc-btn principal" data-act="boucle">Rejouer cette boucle</button></div>`;
        }
        dom.contenu.innerHTML = h;
        dom.fond.hidden = false;
        dom.contenu.querySelectorAll("[data-niveau]").forEach(b => b.onclick = () => bouclesLancer(Number(b.dataset.niveau)));
        const act = { rejouer: () => bouclesLancer(BOUCLES.index), suivant: () => bouclesLancer(BOUCLES.index + 1), liste: () => bouclesFeuille("regles"),
          zero: bouclesToutRecommencer, effacer: bouclesEffacerBoucle, boucle: bouclesRejouerBoucle };
        dom.contenu.querySelectorAll("[data-act]").forEach(b => b.onclick = () => act[b.dataset.act]());
        (dom.contenu.querySelector(".principal") || dom.contenu.querySelector("button"))?.focus?.();
      }

      /* ---------- Ouverture, lancement, sortie --------------------------- */
      function bouclesOuvrir() {
        if (!BOUCLES.active) {
          BOUCLES.active = true;
          try { if (typeof PUZZLE !== "undefined" && PUZZLE.active) puzzleTeardown(); } catch (_) { }
          try { if (typeof stopTurnTimer === "function") stopTurnTimer(); } catch (_) { }
          try { if (typeof aiRunToken !== "undefined") aiRunToken++; } catch (_) { }
          document.body.classList.add("boucles-mode");
          window.addEventListener("keydown", bouclesClavier, true);
          els.board && ["click", "mousedown", "contextmenu"].forEach(t => els.board.addEventListener(t, bouclesBloquerPlateau, true));
        }
        bouclesCalque();
        bouclesLancer(BOUCLES.def ? BOUCLES.index : 0, { muet: true });
        bouclesFeuille("regles");
      }

      function bouclesLancer(index, { muet = false } = {}) {
        const def = BOUCLES_NIVEAUX[index];
        if (!def) return;
        bouclesFeuille(null);
        BOUCLES.index = index; BOUCLES.def = def; BOUCLES.aJoue = BOUCLES.aJoue || !muet;
        BOUCLES.echos = []; BOUCLES.vif = []; BOUCLES.phase = "jeu"; BOUCLES.occupe = false; BOUCLES.serie++;
        bouclesMode("pas");
        try { boardRenderMode = "3d"; } catch (_) { }
        try { clearKayKitVillages(); } catch (_) { }
        try { clearKayKitCrownCross(); } catch (_) { }
        bouclesConstruireState(def);
        try { applyVisualMode("alternative"); } catch (_) { }
        try { applyBoardRenderMode("3d", { persist: false }); } catch (_) { }
        try { els.setupScreen.classList.add("hidden"); } catch (_) { }
        try { els.gameScreen.classList.remove("hidden"); } catch (_) { }
        try { if (typeof startAmbient === "function") startAmbient(); } catch (_) { }
        BOUCLES.st = bouclesMaintenant();
        bouclesMiroir(BOUCLES.st);
        bouclesSync();
        bouclesCadrer();
        if (kaykit3D?.canvas && !kaykit3D.canvas.dataset.boucles) {
          kaykit3D.canvas.dataset.boucles = "1";
          kaykit3D.canvas.addEventListener("pointerdown", bouclesPointeurBas);
          kaykit3D.canvas.addEventListener("pointerup", bouclesPointeurHaut);
          kaykit3D.canvas.addEventListener("pointermove", bouclesSurvol);
        }
        cancelAnimationFrame(BOUCLES.raf);
        BOUCLES.raf = requestAnimationFrame(bouclesImage);
      }

      function bouclesCadrer() {
        const def = BOUCLES.def;
        const cells = def.islands.flatMap(il => il.cells);
        const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]);
        const [r, c] = bouclesRC((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2);
        /* Distance tirée de l'étendue du sanctuaire : le plateau occupe la
           moitié d'un écran large. En portrait, le jeu élargit déjà le champ
           de la caméra, la même distance remplit la largeur du téléphone. */
        const etendue = Math.max(Math.max(...xs) - Math.min(...xs) + 1, (Math.max(...ys) - Math.min(...ys) + 1) * .9);
        const essai = n => {
          try {
            if (kaykit3D && typeof kaykitFollowCell === "function") {
              kaykit3D.autoFit = false;
              kaykit3D.zoomDistance = THREE.MathUtils.clamp(etendue * 1.55 + 1.5, kaykit3D.minZoom, kaykit3D.maxZoom);
              kaykitFollowCell(r, c, { duration: 720, force: true, cinematique: true, zoomBoost: 0 });
              tutoLockCamera();
              return;
            }
          } catch (_) { }
          if (n > 0) setTimeout(() => essai(n - 1), 350);
        };
        essai(8);
        [600, 1400].forEach(t => setTimeout(() => { if (BOUCLES.active) essai(0); }, t));
      }

      function bouclesQuitter() {
        BOUCLES.active = false;
        cancelAnimationFrame(BOUCLES.raf);
        window.removeEventListener("keydown", bouclesClavier, true);
        els.board && ["click", "mousedown", "contextmenu"].forEach(t => els.board.removeEventListener(t, bouclesBloquerPlateau, true));
        bouclesRetirerGroupe();
        BOUCLES.dom?.racine.remove(); BOUCLES.dom = null;
        document.body.classList.remove("boucles-mode");
        try { tutoUnlockCamera(); } catch (_) { }
        // Comme après une énigme : `state` porte un plateau taillé main, seul
        // un rechargement garantit une partie normale ensuite.
        try { els.gameScreen.classList.add("hidden"); els.setupScreen.classList.remove("hidden"); } catch (_) { }
        try { location.reload(); } catch (_) { }
      }

      window.addEventListener("ilyos-boucles-requested", () => bouclesOuvrir());

      /* Banc de vérification : rejoue chaque solution de référence sur le
         noyau, et contrôle qu'avec une boucle de moins la couronne n'a pas
         assez de poussées pour arriver (chaque Gardien n'en a qu'une). */
      window.ILYOS_BOUCLES = {
        ouvrir: bouclesOuvrir,
        lancer: i => { if (!BOUCLES.active) bouclesOuvrir(); bouclesLancer(i); },
        agir: ordre => bouclesAgir(typeof ordre === "string" ? bouclesParseOrdre(ordre) : ordre),
        etat: () => ({ distance: kaykit3D ? +kaykit3D.zoomDistance.toFixed(2) : null, bornes: kaykit3D ? [kaykit3D.minZoom, kaykit3D.maxZoom] : null, actif: BOUCLES.active, niveau: BOUCLES.def?.id || null, echos: BOUCLES.echos.length, battement: BOUCLES.vif.length, phase: BOUCLES.phase, occupe: BOUCLES.occupe }),
        niveaux: () => BOUCLES_NIVEAUX.map(n => ({ id: n.id, nom: n.nom, boucles: n.loops, battements: n.beats })),
        verifier() {
          return BOUCLES_NIVEAUX.map(n => {
            const progs = n.solution.map(l => l.split(" ").map(bouclesParseOrdre));
            const r = bouclesMoteur.rejouer(n, progs);
            const mains = progs.every(p => {
              const k = { pas: 0, pousse: 0, magie: 0 };
              p.forEach(o => { if (k[o.t] !== undefined) k[o.t]++; });
              return p.length === n.beats && k.pas <= n.hand.pas && k.pousse <= n.hand.pousse && k.magie <= n.hand.magie;
            });
            return { id: n.id, gagne: r.battement >= 0, boucles: progs.length, attendu: n.loops, mains };
          });
        }
      };
