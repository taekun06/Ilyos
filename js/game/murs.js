      /* ==================================================================
         MURS ÉTOILÉS (Taekun, novembre 2026)

         Un mur se pose ENTRE deux cases, sur les lignes de la grille, et
         mesure de 1 à 3 cases. Il est neutre. Option de partie
         `rules.murs` (Personnalisé) ou `?murs=1` dans l'adresse.

         - Il bloque le déplacement (une diagonale passe seulement si l'un
           des deux chemins en L est libre), la poussée et donc la couronne
           lancée. On ne s'arrête jamais « dessus » : il n'occupe aucune case.
         - Au bord du vide il sert de garde-fou : la file poussée s'arrête
           contre lui au lieu de tomber.
         - POUSSER (action « POUSSER_MUR », une carte Pousser par cran) :
           · de face, depuis une case qu'il borde : il glisse d'une ligne par
             cran et balaie la file de chaque case qu'il traverse ;
           · dans le sens de la longueur, depuis une case qui touche son
             extrémité : il glisse le long de sa ligne.
           Un autre mur l'arrête ; il ne traverse jamais un autre mur.
         - MAGIE : sur une île qui porte un mur (un mur qui borde une de ses
           cases), le joueur choisit de tourner l'île, le mur, ou les deux.
           Le mur seul tourne autour de son extrémité la plus proche du pivot
           choisi (un coin de case) ; « les deux » tournent ensemble autour
           du pivot de l'île.
         - Un mur peut dépasser au-dessus du vide ; il tombe seulement quand
           il ne borde plus aucune case d'île.

         Coordonnées : un mur part du COIN (i, j) — ligne de coin i (0..GRID),
         colonne de coin j (0..GRID). o = "h" : il suit la ligne i, de j à
         j + n, entre les cases (i-1, j+k) et (i, j+k). o = "v" : il suit la
         colonne j, de i à i + n, entre les cases (i+k, j-1) et (i+k, j).
      ================================================================== */

      function mursDe(source = state) { return source?.murs || []; }
      function mursActifs(source = state) { return !!(source?.murs && source.murs.length); }
      function murParId(id, source = state) { return mursDe(source).find(m => String(m.id) === String(id)) || null; }

      function murExtremites(m) {
        return m.o === "h" ? [[m.i, m.j], [m.i, m.j + m.n]] : [[m.i, m.j], [m.i + m.n, m.j]];
      }
      function murDepuisExtremites(a, b, id) {
        if (a[0] === b[0]) return { id, o: "h", i: a[0], j: Math.min(a[1], b[1]), n: Math.abs(b[1] - a[1]) };
        return { id, o: "v", i: Math.min(a[0], b[0]), j: a[1], n: Math.abs(b[0] - a[0]) };
      }
      /** Segments unitaires { o, i, j } : « h » de (i, j) à (i, j+1), « v » de (i, j) à (i+1, j). */
      function murSegments(m) {
        const segments = [];
        for (let k = 0; k < m.n; k++) {
          segments.push(m.o === "h" ? { o: "h", i: m.i, j: m.j + k } : { o: "v", i: m.i + k, j: m.j });
        }
        return segments;
      }
      function segmentCle(s) { return `${s.o}${s.i},${s.j}`; }
      function segmentsDesMurs(sauf = null) {
        const cles = new Set();
        mursDe().forEach(m => {
          if (sauf !== null && String(m.id) === String(sauf)) return;
          murSegments(m).forEach(s => cles.add(segmentCle(s)));
        });
        return cles;
      }
      /** Le segment qui sépare deux cases orthogonalement voisines. */
      function segmentEntre(r1, c1, r2, c2) {
        if (r1 === r2 && Math.abs(c1 - c2) === 1) return { o: "v", i: r1, j: Math.max(c1, c2) };
        if (c1 === c2 && Math.abs(r1 - r2) === 1) return { o: "h", i: Math.max(r1, r2), j: c1 };
        return null;
      }
      function murSurArete(r1, c1, r2, c2) {
        if (!mursActifs()) return null;
        const s = segmentEntre(r1, c1, r2, c2);
        if (!s) return null;
        const cle = segmentCle(s);
        return mursDe().find(m => murSegments(m).some(x => segmentCle(x) === cle)) || null;
      }
      /** Passage d'une case à sa voisine (orthogonale ou diagonale). Une
       *  diagonale passe si l'un des deux chemins en L est libre : on contourne
       *  le bout d'un mur, on ne traverse pas un mur qui passe par le coin. */
      function passageBloque(r1, c1, r2, c2) {
        if (!mursActifs()) return false;
        const dr = r2 - r1, dc = c2 - c1;
        if (Math.abs(dr) + Math.abs(dc) === 1) return !!murSurArete(r1, c1, r2, c2);
        if (Math.abs(dr) !== 1 || Math.abs(dc) !== 1) return false;
        const parColonne = !murSurArete(r1, c1, r1, c2) && !murSurArete(r1, c2, r2, c2);
        const parLigne = !murSurArete(r1, c1, r2, c1) && !murSurArete(r2, c1, r2, c2);
        return !parColonne && !parLigne;
      }

      /** Cases bordées par le mur, des deux côtés, sur le plateau. */
      function murCasesBordees(m) {
        const cases = [];
        murSegments(m).forEach(s => {
          const deux = s.o === "h" ? [[s.i - 1, s.j], [s.i, s.j]] : [[s.i, s.j - 1], [s.i, s.j]];
          deux.forEach(([r, c]) => { if (inside(r, c)) cases.push([r, c]); });
        });
        return cases;
      }
      function murToucheIle(m) { return murCasesBordees(m).some(([r, c]) => isLand(r, c)); }
      function murPorteParIle(m, ile) {
        if (!ile) return false;
        const cles = new Set(ile.cells.map(([r, c]) => key(r, c)));
        return murCasesBordees(m).some(([r, c]) => cles.has(key(r, c)));
      }
      function mursPortesParIle(ile) { return ile ? mursDe().filter(m => murPorteParIle(m, ile)) : []; }

      /** Le mur tient-il ici : sur le plateau et sans chevaucher un autre mur
       *  ni être traversé par lui (un autre mur ne touche ses coins
       *  intérieurs que s'il le croise). */
      function murPlacementLibre(m) {
        const [a, b] = murExtremites(m);
        const dans = ([i, j]) => i >= 0 && j >= 0 && i <= GRID && j <= GRID;
        if (m.n < 1 || !dans(a) || !dans(b)) return false;
        const autres = segmentsDesMurs(m.id);
        if (murSegments(m).some(s => autres.has(segmentCle(s)))) return false;
        for (let k = 1; k < m.n; k++) {
          const [ci, cj] = m.o === "h" ? [m.i, m.j + k] : [m.i + k, m.j];
          const croise = m.o === "h"
            ? autres.has(segmentCle({ o: "v", i: ci - 1, j: cj })) || autres.has(segmentCle({ o: "v", i: ci, j: cj }))
            : autres.has(segmentCle({ o: "h", i: ci, j: cj - 1 })) || autres.has(segmentCle({ o: "h", i: ci, j: cj }));
          if (croise) return false;
        }
        return true;
      }

      /** Les murs qui ne bordent plus aucune île tombent. */
      function faireTomberMurs() {
        if (!mursActifs()) return [];
        const tombes = state.murs.filter(m => !murToucheIle(m));
        if (tombes.length) state.murs = state.murs.filter(m => !tombes.includes(m));
        return tombes.map(m => m.id);
      }

      /* ---------- Rotation ---------- */
      /** Rotation d'un coin (i, j). Pivot de CASE (r, c) : autour de son
       *  centre, dans le sens de calculateIslandRotationAroundPivot ; pivot de
       *  COIN : autour de ce coin. direction 1 = ↻, -1 = ↺. */
      function tournerCoin([i, j], pivot, direction, pivotCoin) {
        if (pivotCoin) {
          const [pi, pj] = pivot;
          return direction === 1 ? [pi + (j - pj), pj - (i - pi)] : [pi - (j - pj), pj + (i - pi)];
        }
        const [pr, pc] = pivot;
        return direction === 1 ? [pr + j - pc, pc + pr + 1 - i] : [pr + pc + 1 - j, pc + i - pr];
      }
      function murTourne(m, pivot, direction, turns, pivotCoin) {
        let [a, b] = murExtremites(m);
        for (let t = 0; t < turns; t++) {
          a = tournerCoin(a, pivot, direction, pivotCoin);
          b = tournerCoin(b, pivot, direction, pivotCoin);
        }
        return murDepuisExtremites(a, b, m.id);
      }
      /** Crans (1 = ↻ 90°, 2 = 180°, 3 = ↺ 90°) → direction et nombre de quarts. */
      function murCrans(steps) { return steps === 3 ? { direction: -1, turns: 1 } : { direction: 1, turns: steps }; }

      /** Le mur que la Magie fait tourner seul : celui que porte l'île, le
       *  plus proche du pivot choisi, autour de son extrémité la plus proche. */
      function murPourMagie(ile, pivot) {
        const portes = mursPortesParIle(ile);
        if (!portes.length || !pivot) return null;
        const [pr, pc] = pivot;
        const distance = ([i, j]) => Math.abs(i - (pr + .5)) + Math.abs(j - (pc + .5));
        let meilleur = null;
        portes.forEach(m => murExtremites(m).forEach(coin => {
          const d = distance(coin);
          if (!meilleur || d < meilleur.d) meilleur = { mur: m, coin, d };
        }));
        return meilleur ? { mur: meilleur.mur, coin: meilleur.coin } : null;
      }

      /** Plan de Magie pour un mode : "ile" (comportement historique), "mur"
       *  (le mur seul autour de son extrémité) ou "deux" (l'île et les murs
       *  qu'elle porte, autour du pivot de l'île). Ne modifie rien. */
      function planMagieMurs(ile, pivot, steps, mode) {
        if (!ile || !pivot || !steps) return null;
        const { direction, turns } = murCrans(steps);
        if (mode === "mur") {
          const choix = murPourMagie(ile, pivot);
          if (!choix) return null;
          const tourne = murTourne(choix.mur, choix.coin, direction, turns, true);
          const valide = murPlacementLibre(tourne) && murToucheIle(tourne);
          return { mode, valid: valide, murs: [{ id: choix.mur.id, avant: { ...choix.mur }, apres: tourne }], coin: choix.coin, rotation: null };
        }
        const rotation = calculateIslandRotationAroundPivot(ile, pivot[0], pivot[1], direction, turns);
        if (mode !== "deux") return { mode: "ile", valid: !!rotation?.valid, murs: [], rotation };
        const portes = mursPortesParIle(ile);
        const tournes = portes.map(m => ({ id: m.id, avant: { ...m }, apres: murTourne(m, pivot, direction, turns, false) }));
        // Les murs tournés ne se chevauchent pas entre eux, ni avec les autres.
        const ids = new Set(portes.map(m => String(m.id)));
        const autres = new Set();
        mursDe().forEach(m => { if (!ids.has(String(m.id))) murSegments(m).forEach(s => autres.add(segmentCle(s))); });
        let valide = !!rotation?.valid;
        const vus = new Set();
        tournes.forEach(({ apres }) => {
          const [a, b] = murExtremites(apres);
          const dans = ([i, j]) => i >= 0 && j >= 0 && i <= GRID && j <= GRID;
          if (!dans(a) || !dans(b)) valide = false;
          murSegments(apres).forEach(s => {
            const cle = segmentCle(s);
            if (autres.has(cle) || vus.has(cle)) valide = false;
            vus.add(cle);
          });
        });
        return { mode, valid: valide, murs: tournes, rotation };
      }

      /** Applique les murs d'un plan de Magie (après la rotation d'île
       *  éventuelle), puis fait tomber ce qui ne borde plus aucune île. */
      function appliquerMursDuPlan(plan) {
        (plan?.murs || []).forEach(({ id, apres }) => {
          const m = murParId(id);
          if (m) Object.assign(m, { o: apres.o, i: apres.i, j: apres.j, n: apres.n });
        });
        return faireTomberMurs();
      }

      /* ---------- Poussée d'un mur ---------- */
      /** Comment ce gardien peut pousser ce mur : "face" (il borde le mur et
       *  pousse à travers) ou "long" (il touche une extrémité et pousse dans
       *  l'axe). Renvoie la direction, ou null. */
      function sensPousseeMur(m, pr, pc) {
        if (m.o === "h") {
          for (let k = 0; k < m.n; k++) {
            if (pr === m.i - 1 && pc === m.j + k) return { sens: "face", dr: 1, dc: 0 };
            if (pr === m.i && pc === m.j + k) return { sens: "face", dr: -1, dc: 0 };
          }
          if ((pr === m.i - 1 || pr === m.i) && pc === m.j - 1) return { sens: "long", dr: 0, dc: 1 };
          if ((pr === m.i - 1 || pr === m.i) && pc === m.j + m.n) return { sens: "long", dr: 0, dc: -1 };
          return null;
        }
        for (let k = 0; k < m.n; k++) {
          if (pc === m.j - 1 && pr === m.i + k) return { sens: "face", dr: 0, dc: 1 };
          if (pc === m.j && pr === m.i + k) return { sens: "face", dr: 0, dc: -1 };
        }
        if ((pc === m.j - 1 || pc === m.j) && pr === m.i - 1) return { sens: "long", dr: 1, dc: 0 };
        if ((pc === m.j - 1 || pc === m.j) && pr === m.i + m.n) return { sens: "long", dr: -1, dc: 0 };
        return null;
      }

      /** Un cran de poussée. Modifie l'état ; renvoie false si le mur ne
       *  peut pas avancer (rien n'est alors modifié). */
      function pousserMurUnCran(m, sens, dr, dc) {
        const suivant = { ...m, i: m.i + dr, j: m.j + dc };
        if (sens === "long") {
          if (!murPlacementLibre(suivant)) return false;
          Object.assign(m, suivant);
          return true;
        }
        // De face : il sort du plateau en franchissant le bord → il tombe.
        const ligne = m.o === "h" ? suivant.i : suivant.j;
        const sort = ligne < 0 || ligne > GRID;
        if (!sort && !murPlacementLibre(suivant)) return false;
        // Cases balayées : la rangée entre l'ancienne et la nouvelle ligne.
        const balayees = [];
        for (let k = 0; k < m.n; k++) {
          const cellule = m.o === "h"
            ? [dr > 0 ? m.i : m.i - 1, m.j + k]
            : [m.i + k, dc > 0 ? m.j : m.j - 1];
          if (inside(cellule[0], cellule[1])) balayees.push(cellule);
        }
        // Un autre mur en travers de la bande balayée l'arrête.
        const autres = segmentsDesMurs(m.id);
        for (let k = 0; k + 1 < balayees.length; k++) {
          const [r1, c1] = balayees[k], [r2, c2] = balayees[k + 1];
          const s = segmentEntre(r1, c1, r2, c2);
          if (s && autres.has(segmentCle(s))) return false;
        }
        // Chaque case balayée pousse sa file d'un cran ; toutes ou rien.
        const plans = [];
        for (const [r, c] of balayees) {
          if (!occupantPoussable(r, c)) continue;
          const plan = resoudrePousseeBloc(r, c, dr, dc, 1, { depuisMur: m.id });
          const file = collectPushBlock(r, c, dr, dc);
          if (!plan || plan.mouvements.length !== file.length
            || plan.mouvements.some(mv => !mv.chute && (mv.to[0] - mv.from[0] !== dr || mv.to[1] - mv.from[1] !== dc))) return false;
          plans.push(plan);
        }
        plans.forEach(plan => appliquerPousseeBloc(plan, dr, dc));
        if (sort) {
          state.murs = state.murs.filter(x => x !== m);
          return true;
        }
        Object.assign(m, suivant);
        return true;
      }

      /** Poussée d'un mur par un gardien, force = crans (une carte chacun).
       *  Modifie l'état et dépense les cartes ; null si rien ne bouge. */
      function appliquerPousseeMurCore(murId, pusherId, force, { payer = true } = {}) {
        const m = murParId(murId);
        const pousseur = characterById(pusherId);
        if (!m || !pousseur) return null;
        const sens = sensPousseeMur(m, pousseur.r, pousseur.c);
        if (!sens) return null;
        const avant = { ...m };
        const demande = Math.max(1, Math.floor(force || 1));
        let crans = 0;
        for (; crans < demande; crans++) {
          if (!state.murs.includes(m)) break;
          if (!pousserMurUnCran(m, sens.sens, sens.dr, sens.dc)) break;
        }
        if (!crans) return null;
        const tombes = faireTomberMurs();
        const depense = payer ? consumeSelectedActionCore("PUSH", crans) : crans;
        return { type: "POUSSER_MUR", murId, pusherId, sens: sens.sens, dr: sens.dr, dc: sens.dc,
          avant, apres: murParId(murId) ? { ...murParId(murId) } : null, tombe: tombes.includes(m.id), force: depense };
      }

      /** Ce que donnerait la poussée, sans rien modifier (aperçu, IA). */
      function apercuPousseeMur(murId, pusherId, force) {
        if (!state) return null;
        return withSimulatedState(cloneStateForSimulation(), () => {
          const resultat = appliquerPousseeMurCore(murId, pusherId, force, { payer: false });
          if (!resultat) return null;
          return {
            ...resultat,
            gardiens: state.characters.map(ch => ({ id: ch.id, r: ch.r, c: ch.c })),
            couronnes: activeArtifacts().filter(a => !a.carrierId).map(a => ({ id: a.id, r: a.r, c: a.c }))
          };
        });
      }

      /** Toutes les poussées de mur possibles pour un gardien : une par force
       *  qui fait réellement avancer le mur d'autant de crans. */
      function optionsPousseeMur(gardien, forceMax) {
        if (!gardien || !mursActifs() || forceMax < 1) return [];
        const options = [];
        mursDe().forEach(m => {
          const sens = sensPousseeMur(m, gardien.r, gardien.c);
          if (!sens) return;
          let precedent = 0;
          for (let force = 1; force <= forceMax; force++) {
            const apercu = apercuPousseeMur(m.id, gardien.id, force);
            if (!apercu || apercu.force <= precedent) break;
            precedent = apercu.force;
            options.push({ murId: m.id, pusherId: gardien.id, force: apercu.force, apercu });
            if (apercu.tombe) break;
          }
        });
        return options;
      }

      /* ---------- Mise en place ---------- */
      function mursDemandes(rules = state?.rules) {
        if (rules?.murs) return true;
        try { return new URLSearchParams(location.search).get("murs") === "1"; } catch (erreur) { return false; }
      }

      /** Deux murs neutres de 2 cases, symétriques par le centre, au plus près
       *  du milieu du plateau, chacun bordant une île sans toucher un village. */
      function installerMursDeDepart() {
        if (!mursDemandes()) { state.murs = []; return; }
        // Attendre les îles de départ (duel symétrique, formation choisie).
        if (state.setupSelectionPending || !(state.islands || []).length) return;
        state.murs = [];
        const miroir = m => {
          const [a, b] = murExtremites(m);
          return murDepuisExtremites([GRID - a[0], GRID - a[1]], [GRID - b[0], GRID - b[1]], m.id);
        };
        const pres = (r, c) => (state.players || []).some(p => villageCellsContaining(p, r, c)?.length);
        const candidats = [];
        for (const o of ["h", "v"]) {
          for (let i = 0; i <= GRID; i++) {
            for (let j = 0; j <= GRID; j++) {
              const m = { id: "mur-a", o, i, j, n: 2 };
              const [a, b] = murExtremites(m);
              if (b[0] > GRID || b[1] > GRID) continue;
              const bordees = murCasesBordees(m);
              if (bordees.length < 4 || bordees.filter(([r, c]) => isLand(r, c)).length < 2) continue;
              if (bordees.some(([r, c]) => pres(r, c))) continue;
              const centre = [(a[0] + b[0]) / 2 - GRID / 2, (a[1] + b[1]) / 2 - GRID / 2];
              const d = Math.hypot(centre[0], centre[1]);
              if (d < 1) continue; // pas sur le centre même : son miroir le chevaucherait
              candidats.push({ m, d });
            }
          }
        }
        candidats.sort((x, y) => x.d - y.d || x.m.o.localeCompare(y.m.o) || x.m.i - y.m.i || x.m.j - y.m.j);
        for (const { m } of candidats) {
          const reflet = { ...miroir(m), id: "mur-b" };
          state.murs = [m];
          if (!murToucheIle(reflet) || !murPlacementLibre(reflet)) continue;
          state.murs = [m, reflet];
          return;
        }
        state.murs = [];
      }

      /* ---------- Interface : poussée d'un mur ---------- */
      /** Case repère d'une poussée de mur : l'anneau d'arrivée cliquable,
       *  juste devant la place finale du mur (comme la case d'arrivée d'une
       *  file poussée). Hors du plateau → repère de chute. */
      function repereOptionMur(apercu, pousseur, force) {
        const { sens, dr, dc, avant } = apercu;
        const fin = apercu.apres || { ...avant, i: avant.i + dr * force, j: avant.j + dc * force };
        const k = Math.floor((fin.n - 1) / 2);
        let cellule;
        if (sens === "face") {
          cellule = fin.o === "h"
            ? [dr > 0 ? fin.i : fin.i - 1, fin.j + k]
            : [fin.i + k, dc > 0 ? fin.j : fin.j - 1];
        } else {
          cellule = fin.o === "h"
            ? [pousseur.r, dc > 0 ? fin.j + fin.n : fin.j - 1]
            : [dr > 0 ? fin.i + fin.n : fin.i - 1, pousseur.c];
        }
        if (inside(cellule[0], cellule[1]) && apercu.apres) return { r: cellule[0], c: cellule[1], fell: false };
        return { r: null, c: null, fell: true, lr: cellule[0] - dr, lc: cellule[1] - dc };
      }

      function optionsPousseeMurInterface({ pusherId = null, targetId = null } = {}) {
        if (!state || !mursActifs() || state.quick || availableActionCount("PUSH") < 1) return [];
        if (targetId != null && !murParId(targetId)) return [];
        const forceMax = availableActionCount("PUSH");
        const options = [];
        (state.characters || []).forEach(g => {
          if (g.player !== state.currentPlayer) return;
          if (pusherId != null && String(g.id) !== String(pusherId)) return;
          optionsPousseeMur(g, forceMax).forEach(o => {
            if (targetId != null && String(o.murId) !== String(targetId)) return;
            const repere = repereOptionMur(o.apercu, g, o.force);
            options.push({
              id: `${g.id}:mur:${o.murId}:${o.apercu.dr},${o.apercu.dc}:${o.force}`,
              pusherId: g.id, targetType: "mur", targetId: o.murId,
              dr: o.apercu.dr, dc: o.apercu.dc, force: o.force,
              r: repere.r, c: repere.c, fell: repere.fell,
              lastLandR: repere.fell ? repere.lr : null, lastLandC: repere.fell ? repere.lc : null,
              apercuMur: o.apercu
            });
          });
        });
        return options;
      }

      function executerPousseeMur(option) {
        if (!option || option.targetType !== "mur") return false;
        const pousseur = characterById(option.pusherId);
        if (!pousseur) return false;
        saveUndoSnapshot();
        state.phase = "ACTION";
        state.selectedActionType = "PUSH";
        state.selectedActionCount = option.force;
        const applique = appliquerPousseeMurCore(option.targetId, option.pusherId, option.force);
        clearUnifiedPushOptions();
        if (!applique) {
          discardLastUndoSnapshot();
          showToast("Ce mur ne peut plus être poussé ainsi.");
          renderAll();
          scheduleKayKitSync();
          return false;
        }
        queueKayKitActionAnimation(pousseur.id, "attack", 900, { r: pousseur.r + option.dr, c: pousseur.c + option.dc });
        playSfx("push");
        if (typeof kaykitChoc === "function") kaykitChoc(applique.force >= 2 ? 2 : 1);
        renderAll();
        scheduleKayKitSync();
        showActionConsumption("PUSH", applique.force, availableActionCount("PUSH"));
        return true;
      }

      /* ---------- Interface : Magie sur une île qui porte un mur ---------- */
      function modeMagie() {
        const mode = state?.magicMode;
        if (mode !== "mur" && mode !== "deux") return "ile";
        const ile = state.islands?.find(is => is.id === state.selectedIslandId);
        return mursPortesParIle(ile).length ? mode : "ile";
      }
      function choisirModeMagie(mode) {
        if (!(state?.phase === "ACTION" && state.selectedActionType === "MAGIC")) return;
        state.magicMode = mode === "mur" || mode === "deux" ? mode : "ile";
        state.magicPreviewSteps = 0;
        updateMagicPreview();
        renderAll();
        if (kaykit3D) {
          kaykit3D.lastStateSignature = "";
          scheduleKayKitSync();
        }
      }

      /* ---------- Banc d'essai (window.ILYOS_BENCH.murs) ---------- */
      function benchMurs() {
        const rafraichir = () => { renderAll(); if (kaykit3D) { kaykit3D.lastStateSignature = ""; scheduleKayKitSync(); } };
        return {
          etat: () => (state?.murs || []).map(m => ({ ...m })),
          gardiens: () => (state?.characters || []).map(g => ({ id: g.id, player: g.player, r: g.r, c: g.c })),
          iles: () => (state?.islands || []).map(i => ({ id: i.id, cells: i.cells })),
          joueur: () => state?.currentPlayer,
          optionsInterface: () => (state?.pushOptions || []).map(o => o.id),
          phase: () => [state?.phase, state?.selectedActionType, state?.magicMode],
          cartes: (type, n) => {
            const j = state.players[state.currentPlayer];
            j.hand = (j.hand || []).filter(c => c.action !== type || c.used);
            for (let k = 0; k < n; k++) j.hand.push({ id: `banc-${type}-${k}-${Date.now()}`, action: type, used: false });
            state.islandPlacedThisTurn = true;
            state.phase = "ACTION_SELECT";
            renderAll();
            return availableActionCount(type);
          },
          poser: murs => { if (!state) return null; state.murs = (murs || []).map((m, k) => ({ id: m.id || `mur-${k}`, o: m.o, i: m.i, j: m.j, n: m.n })); rafraichir(); return state.murs.length; },
          installer: () => { if (!state) return null; const avant = state.rules?.murs; state.rules = { ...(state.rules || {}), murs: true }; installerMursDeDepart(); if (!avant) delete state.rules.murs; rafraichir(); return state.murs.map(m => ({ ...m })); },
          passage: (r1, c1, r2, c2) => !passageBloque(r1, c1, r2, c2),
          pousser: (murId, pusherId, force) => { const r = appliquerPousseeMurCore(murId, pusherId, force, { payer: false }); rafraichir(); return r; },
          optionsPoussee: pusherId => optionsPousseeMur(characterById(pusherId), 3).map(o => ({ murId: o.murId, force: o.force, apres: o.apercu.apres, tombe: o.apercu.tombe })),
          planMagie: (ileId, pivot, steps, mode) => { const p = planMagieMurs(state.islands.find(i => i.id === ileId), pivot, steps, mode); return p ? { mode: p.mode, valid: p.valid, murs: p.murs.map(x => x.apres) } : null; }
        };
      }
