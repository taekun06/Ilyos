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
         — Au début de ton tour, chaque balise allumée où se tient encore un
           de tes gardiens te rapporte 1 point : il faut la garder pendant le
           tour adverse. Dès qu'un joueur atteint 10 points, on finit la
           manche ; le meilleur score gagne (égalité : match nul).
         — En draft et en setup, le premier joueur ne pose pas d'île à son
           premier tour (en classique, il pose normalement).
         — Mise en place (draft) : aucun gardien ne se place sur une balise.
         — Pas de couronnes : les deux restent hors du terrain.
         — Deux balises sur quatre, tirées au hasard et marquées, sont
           MOBILES : elles tournent avec l'île sur laquelle elles se trouvent
           (magie). Les deux autres restent sur leur case.
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
          mobiles: shuffle([0, 1, 2, 3]).slice(0, 2).sort(),
          dernierDecompte: 0
        });
        state.rules = { ...(state.rules || {}), disableSecondCrown: true };
        rotationRangerCouronnes();
        rotationIntituleBilan();
      }

      function baliseMobile(i) {
        return !!state?.rotation?.mobiles?.includes(i);
      }

      /* Balises mobiles : elles suivent la case de leur île pendant une
         rotation (rotation.absCells garde l'ordre de ile.cells). Aussi en
         simulation, pour que l'IA sache où la balise ira : la liste est alors
         recopiée (copie à l'écriture), jamais modifiée en place, au cas où
         un clone partagerait state.rotation avec la vraie partie. */
      function rotationEcrire() {
        if (ilyosSimulationActive) state.rotation = { ...state.rotation, balises: state.rotation.balises.map(b => [b[0], b[1]]) };
        return state.rotation;
      }

      const rotationMagieBase = applyMagicRotationCore;
      applyMagicRotationCore = function applyMagicRotationCoreBalises(islandId, rotation) {
        const actif = butBalises() && rotation?.valid && state.rotation.mobiles?.length;
        const ile = actif ? state.islands.find(is => is.id === islandId) : null;
        const suivantes = ile ? state.rotation.balises.map(([r, c], i) => {
          if (!baliseMobile(i)) return null;
          const k = ile.cells.findIndex(([cr, cc]) => cr === r && cc === c);
          return k >= 0 && rotation.absCells[k] ? { i, vers: rotation.absCells[k] } : null;
        }).filter(Boolean) : [];
        const resultat = rotationMagieBase(islandId, rotation);
        if (resultat && suivantes.length) {
          const ecrit = rotationEcrire();
          suivantes.forEach(({ i, vers }) => { ecrit.balises[i] = [vers[0], vers[1]]; });
        }
        return resultat;
      };

      /* Le bilan de fin compte des points, plus des couronnes. */
      function rotationIntituleBilan() {
        const colonne = BILAN_COLONNES.find(col => col.titre === "Couronnes" || col.titre === "Points");
        if (colonne) colonne.titre = butBalises() ? "Points" : "Couronnes";
      }

      /* Décompte AU DÉBUT DU TOUR (Taekun, 2026-11-08) : le joueur qui prend
         la main marque chaque balise allumée qu'il tient ENCORE, donc après
         le tour de l'adversaire, qui a pu l'en chasser. FIN DE MANCHE : dès
         qu'un joueur atteint la cible, on laisse finir la manche pour que
         tout le monde ait joué autant de tours ; le meilleur score gagne,
         une égalité est un match nul. Rend true si la partie est finie. */
      function rotationDecompterBalises() {
        if (!butBalises() || state.winner !== null || state.turn <= 1) return false;
        if (state.rotation.dernierDecompte === state.turn) return false;
        rotationEcrire().dernierDecompte = state.turn;
        const joueur = state.players[state.currentPlayer];
        if (!joueur) return false;
        const gagnes = balisesTenuesPar(joueur.id);
        if (gagnes) {
          state.players.forEach(p => {
            if (memeEquipe(p.id, joueur.id)) p.score = (p.score || 0) + gagnes;
          });
          if (!ilyosSimulationActive) {
            state.fxCells ||= [];
            state.rotation.balises.forEach(([r, c]) => {
              const g = gardienSurBalise(r, c);
              if (g && memeEquipe(g.player, joueur.id) && baliseAllumee(r, c)) {
                state.fxCells.push({ type: "score", r, c });
                animateCellPulse(r, c, "crown-burst");
              }
            });
            triggerScoreAnimation(joueur.id);
            playSfx("crownTake");
            showToast(`${joueur.name} tient ${gagnes > 1 ? `${gagnes} balises` : "une balise"} : +${gagnes} (${joueur.score}/${rotationCible()})`);
          }
        }
        const meilleur = Math.max(...state.players.map(p => p.score || 0));
        if (meilleur < rotationCible()) return false;
        // Le tour n vient de s'ouvrir : la manche est complète quand chaque
        // joueur a eu autant de tours (n multiple du nombre de joueurs).
        const n = state.players.length;
        if (state.turn % n !== 0) {
          if (!ilyosSimulationActive && !state.rotation.derniereManche) {
            state.rotation.derniereManche = true;
            setTimeout(() => showToast(`${rotationCible()} points atteints : dernière manche, chacun rejoue jusqu’au bout du tour de table.`), 1600);
          }
          return false;
        }
        const tete = state.players.filter(p => (p.score || 0) === meilleur);
        const nul = tete.some(p => !memeEquipe(p.id, tete[0].id));
        state.winner = nul ? MATCH_NUL : tete[0].id;
        if (!ilyosSimulationActive) {
          const scores = state.players.map(p => `${p.name} ${p.score || 0}`).join(" · ");
          stopTurnTimer();
          if (nul) {
            setTimeout(() => showEgalite(scores), 900);
          } else {
            playVictoryCelebration(tete[0].id);
            setTimeout(() => showVictory(tete[0],
              `${tete[0].name} a tenu les balises jusqu’à ${meilleur} points et prend le contrôle d’ILYOS.`), 900);
          }
        }
        return true;
      }

      const rotationScoreDebutBase = scoreCrownsAtTurnStart;
      scoreCrownsAtTurnStart = function scoreCrownsAtTurnStartBalises(player, options = {}) {
        if (butBalises() && !options.immediat && rotationDecompterBalises()) return 1;
        return rotationScoreDebutBase(player, options);
      };

      /* Draft et setup : le premier joueur ne pose pas d'île à son premier
         tour (Taekun, 2026-11-09 ; en classique, trop pénalisant : plateau
         vide). Rend true si le verrou vient d'être posé. */
      function rotationOuvertureBalises() {
        if (!butBalises() || state.turn !== 1 || state.winner !== null) return false;
        if (!state.startingBoardMode || state.startingBoardMode === "classic") return false;
        state.islandPlacedThisTurn = true;
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
        /* Compensation du premier joueur (Taekun, 2026-11-08) : pas d'île à
           son premier tour. L'IA est lancée plus tard (setTimeout), elle
           voit donc déjà le verrou. */
        if (rotationOuvertureBalises()) renderAll();
        if (premierTour && !ilyosSimulationActive) {
          state.rotation.annonce = true;
          setTimeout(() => showToast(`Rotation · Balises : tiens une balise allumée jusqu’à ton tour suivant pour marquer. ${rotationCible()} points pour gagner.`), 1400);
        }
      };

      /* HUD : des points à la place des trois couronnes. */
      function rotationScoreHud(joueur) {
        if (!butBalises() || !joueur) return null;
        // Coin de l'icône : balises tenues en ce moment (Taekun, 2026-11-04).
        const tenues = balisesTenuesPar(joueur.id);
        return `<span class="hud-v2-balises-score" title="Points de balises · ${tenues} balise${tenues > 1 ? "s" : ""} tenue${tenues > 1 ? "s" : ""}">`
          + `<span class="hud-v2-balise-icone" aria-hidden="true"><i${tenues ? "" : ' class="vide"'}>${tenues}</i></span>`
          + `<b>${joueur.score || 0}</b><small>/${rotationCible()}</small></span>`;
      }

      /* L'IA. Le planner sait déjà jouer îles, déplacements, poussées et
         magie ; seule son évaluation parle de couronnes. En mode Balises,
         elle est remplacée par une évaluation qui compte ce qui rapporte :
         le score, les balises tenues, et la distance qui sépare chaque camp
         des balises.

         Le décompte a lieu au début du tour : une balise tenue par le camp
         qui ne joue PAS (currentPlayer) est un point quasi acquis, puisqu'il
         marque dès l'ouverture de son tour ; une balise tenue par le camp qui
         joue doit encore survivre au tour adverse. Vu de l'IA en fin de son
         tour, chasser l'adversaire d'une balise vaut donc presque un point,
         et la riposte simulée (décompte compris) dit si la sienne tiendra. Tous les niveaux de CPU passent par
         le planner : les niveaux sans planner ne savent viser qu'une couronne. */
      const ROTATION_POIDS = {
        point: 1000,
        // Balise qui marquera à l'ouverture du prochain tour (camp qui attend).
        baliseSure: 950,
        // Balise du camp qui joue : elle doit tenir pendant le tour adverse.
        // 450 → 700 (2026-11-09) : 60 % contre 450 en draft 4/3, 57 % contre
        // 950 ; neutre en classique (46 % ± 6,4 sur 60 parties).
        baliseExposee: 700,
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
            const poidsTenue = memeEquipe(g.player, state.currentPlayer)
              ? ROTATION_POIDS.baliseExposee : ROTATION_POIDS.baliseSure;
            valeur += memeEquipe(g.player, playerId) ? poidsTenue : -poidsTenue;
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

      /* Mise en place (draft du Personnalisé) : l'IA vise les balises, pas
         le sanctuaire vide — ses îles s'en approchent et ses gardiens s'y
         placent au plus près (plannerDraftIle / plannerDraftGardien). */
      const rotationDraftCiblesBase = plannerDraftCouronnes;
      plannerDraftCouronnes = function plannerDraftCiblesBalises() {
        if (!butBalises()) return rotationDraftCiblesBase();
        return state.rotation.balises.map(([r, c]) => [r, c]);
      };

      /* MISE EN PLACE (draft) pour les Balises (Taekun, 2026-11-08 : « il doit
         apprendre à se placer au mieux en début de partie »).

         Le draft historique mesure tout sur la TERRE : au début du draft, les
         balises sont presque toutes sur le vide, si bien que chaque île et
         chaque gardien valaient zéro côté balises et que l'IA se plaçait au
         hasard de la vulnérabilité. Ici les distances traversent le vide
         avec un surcoût (draftCoutVide), comme la route de la couronne : une
         île qui avance vers une balise rapporte déjà.

         Une île vaut : ses meilleurs postes de gardien près des balises, la
         COURSE à chaque balise (qui y arrive le premier : mes îles et
         gardiens contre les siens) et le fait d'allumer une balise que mes
         pièces atteindront avant les siennes plutôt que l'inverse. PLAN_POIDS.draftBalises = 0 rend le draft
         historique (banc). */
      PLAN_POIDS.draftBalises = 1;
      const ROTATION_DRAFT = { course: 260, courseMax: 4, allumerMienne: 320, allumerSienne: 260 };

      /* Distance de chaque case aux sources, le vide coûtant draftCoutVide en
         plus (une pose devra le combler). */
      function rotationChampAvecVide(sources) {
        const vide = PLAN_POIDS.draftCoutVide;
        const cout = new Map();
        const files = [[]];
        for (const [r, c] of sources) {
          if (!inside(r, c)) continue;
          const d = isLand(r, c) ? 0 : vide;
          const k = key(r, c);
          if ((cout.get(k) ?? Infinity) <= d) continue;
          cout.set(k, d);
          (files[d] ||= []).push([r, c, d]);
        }
        for (let niveau = 0; niveau < files.length; niveau++) {
          const file = files[niveau];
          if (!file) continue;
          for (let i = 0; i < file.length; i++) {
            const [r, c, d] = file[i];
            if (d !== cout.get(key(r, c))) continue;
            for (const arete of movementEdges(r, c)) {
              const nd = d + arete.cost + (isLand(arete.r, arete.c) ? 0 : vide);
              const k = key(arete.r, arete.c);
              if (nd >= (cout.get(k) ?? Infinity)) continue;
              cout.set(k, nd);
              (files[nd] ||= []).push([arete.r, arete.c, nd]);
            }
          }
        }
        return cout;
      }

      /* D'où partira un camp : ses gardiens et ses îles. Les villages ne
         servent à rien dans ce mode, ils ne comptent pas. */
      function rotationSourcesCamp(joueur) {
        const sources = [];
        for (const g of state.characters || []) if (memeEquipe(g.player, joueur.id)) sources.push([g.r, g.c]);
        for (const ile of state.islands || []) if (memeEquipe(ile.owner, joueur.id)) sources.push(...ile.cells);
        return sources;
      }

      function rotationDraftCourse(playerId) {
        const moi = state.players[playerId];
        const lui = plannerAdversaire(playerId);
        if (!moi || !lui) return 0;
        const balises = state.rotation.balises;
        const champsBalises = balises.map(b => rotationChampAvecVide([b]));
        const plusPres = (champ, sources) => Math.min(60, ...sources.map(([r, c]) => champ.get(key(r, c)) ?? 60));
        const miennes = rotationSourcesCamp(moi);
        const siennes = rotationSourcesCamp(lui);
        let total = 0;
        balises.forEach(([r, c], i) => {
          const dMoi = plusPres(champsBalises[i], miennes);
          const dLui = plusPres(champsBalises[i], siennes);
          const ecart = Math.max(-ROTATION_DRAFT.courseMax, Math.min(ROTATION_DRAFT.courseMax, dLui - dMoi));
          total += ROTATION_DRAFT.course * ecart;
          // Une balise allumée sert celui qui en est le plus près.
          if (isLand(r, c)) total += dMoi <= dLui ? ROTATION_DRAFT.allumerMienne : -ROTATION_DRAFT.allumerSienne;
        });
        return total;
      }

      /* Règle de mise en place : aucun gardien ne se place SUR une balise.
         Sinon chaque camp démarre en tenant deux balises, et comme le
         décompte a lieu au début du tour, le second joueur marquait le
         premier sans avoir rien fait (85 % de victoires mesurées en draft). */
      const rotationCaseGardienBase = draftCaseGardienLibre;
      draftCaseGardienLibre = function draftCaseGardienLibreBalises(playerId, r, c) {
        if (butBalises()
          && state.rotation.balises.some(([br, bc]) => br === r && bc === c)) return false;
        return rotationCaseGardienBase(playerId, r, c);
      };

      const rotationDraftIleBase = plannerDraftIle;
      plannerDraftIle = function plannerDraftIleBalises(playerId) {
        if (!butBalises() || !PLAN_POIDS.draftBalises) return rotationDraftIleBase(playerId);
        const toutes = findAutomaticIslandPlacement(playerId, PLAN_POSE_ENUM_MAX);
        if (!Array.isArray(toutes) || !toutes.length) return null;
        const draft = state.draft;
        const gardiensAPoser = Math.max(1, draft ? draft.guardiansPerPlayer - draft.placedGuardians[playerId] : 1);
        const balises = state.rotation.balises;
        const pres = cells => Math.min(...cells.flatMap(([r, c]) => balises.map(([br, bc]) => Math.abs(r - br) + Math.abs(c - bc))));
        const choisies = new Set();
        toutes.slice(0, 30).forEach(p => choisies.add(p));
        [...toutes].sort((a, b) => pres(a.cells) - pres(b.cells)).slice(0, 40).forEach(p => choisies.add(p));

        let meilleure = null;
        let meilleureNote = -Infinity;
        for (const pose of choisies) {
          const note = withSimulatedState(cloneStateForSimulation(), () => {
            state.islands.push({ id: -1, owner: playerId, shapeKey: pose.shapeKey,
              cells: pose.cells.map(([r, c]) => [r, c]), fromSetup: true });
            return avecGrilleTerre(() => {
              const champB = rotationChampAvecVide(balises);
              const champAdverse = plannerDraftChampAdverse(playerId);
              const notes = [];
              for (const ile of state.islands) {
                if (ile.owner !== playerId) continue;
                for (const [r, c] of ile.cells) {
                  if (characterAt(r, c)) continue;
                  notes.push(PLAN_POIDS.draftAccesGardien * plannerProximite(champB.get(key(r, c)) ?? Infinity)
                    - PLAN_POIDS.draftVulnerabilite * plannerDraftVulnerabilite(playerId, r, c, champAdverse));
                }
              }
              notes.sort((a, b) => b - a);
              return notes.slice(0, gardiensAPoser).reduce((t, n) => t + n, 0) + rotationDraftCourse(playerId);
            });
          });
          if (note > meilleureNote) { meilleureNote = note; meilleure = pose; }
        }
        return meilleure;
      };

      const rotationDraftGardienBase = plannerDraftGardien;
      plannerDraftGardien = function plannerDraftGardienBalises(playerId, candidates) {
        if (!butBalises() || !PLAN_POIDS.draftBalises) return rotationDraftGardienBase(playerId, candidates);
        const champB = avecGrilleTerre(() => rotationChampAvecVide(state.rotation.balises));
        let meilleure = candidates[0];
        let meilleureNote = -Infinity;
        for (const [r, c] of candidates) {
          const note = withSimulatedState(cloneStateForSimulation(), () => {
            state.characters.push({ id: "draft-essai", player: playerId, r, c });
            state.currentPlayer = playerId;
            return avecGrilleTerre(() => evaluateStrategicState(playerId)
              + PLAN_POIDS.draftAccesGardien * plannerProximite(champB.get(key(r, c)) ?? Infinity)
              + rotationDraftCourse(playerId)
              - PLAN_POIDS.draftVulnerabilite * plannerDraftVulnerabilite(playerId, r, c, plannerDraftChampAdverse(playerId)));
          });
          if (note > meilleureNote) { meilleureNote = note; meilleure = [r, c]; }
        }
        return meilleure;
      };

      const rotationEvaluerEtatBase = evaluerEtatStrategique;
      evaluerEtatStrategique = function evaluerEtatStrategiqueRotation(playerId) {
        return butBalises() ? rotationEvaluerBalises(playerId) : rotationEvaluerEtatBase(playerId);
      };

      const rotationAiConfigBase = aiConfig;
      aiConfig = function aiConfigRotation() {
        const cfg = rotationAiConfigBase();
        return butBalises() && !cfg.globalPlanning ? { ...cfg, globalPlanning: true } : cfg;
      };

      /* RENDU 3D des balises : matériaux de base, sans lumière ajoutée ni
         animation (rien ne tourne en continu). */
      const ROTATION_BALISE_CLAIRE = 0x35c6f2;
      const ROTATION_BALISE_CONTOUR = 0x0d1b26;

      /* Balise CARRÉE et opaque (Taekun, 2026-11-03) : un cadre qui longe
         les bords de sa case et quatre bornes aux coins. Plus de colonne de
         lumière transparente. Une balise FIXE porte une croix sur ses
         diagonales ; une balise MOBILE (qui tourne avec son île) reste un
         carré vide. */
      function rotationConstruireBalise(mobile) {
        const groupe = new THREE.Group();
        const matiere = couleur => new THREE.MeshStandardMaterial({ color: couleur, roughness: .55, metalness: .15, emissive: couleur, emissiveIntensity: .35 });
        const cadreMat = matiere(ROTATION_BALISE_CLAIRE);
        const contourMat = new THREE.MeshStandardMaterial({ color: ROTATION_BALISE_CONTOUR, roughness: .8 });
        const cadre = new THREE.Group();
        const L = .9, e = .08, h = .06;
        // Géométries partagées (cache kaykitGeometry) : les fantômes de magie
        // reconstruisent des balises à chaque survol sans rien allouer.
        const boite = (w, hh, d) => kaykitGeometry(`rotation-balise-${w.toFixed(3)}-${hh.toFixed(3)}-${d.toFixed(3)}`, () => new THREE.BoxGeometry(w, hh, d));
        [[0, -L / 2 + e / 2, L, e], [0, L / 2 - e / 2, L, e], [-L / 2 + e / 2, 0, e, L - 2 * e], [L / 2 - e / 2, 0, e, L - 2 * e]].forEach(([x, z, w, d]) => {
          const barre = new THREE.Mesh(boite(w, h, d), cadreMat);
          barre.position.set(x, h / 2, z);
          const ombre = new THREE.Mesh(boite(w + .03, h * .6, d + .03), contourMat);
          ombre.position.set(x, h * .3, z);
          cadre.add(ombre, barre);
        });
        const bornes = new THREE.Group();
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
          const borne = new THREE.Mesh(boite(.13, .26, .13), cadreMat);
          borne.position.set(sx * (L / 2 - .065), .13, sz * (L / 2 - .065));
          const chapeau = new THREE.Mesh(kaykitGeometry("rotation-balise-chapeau", () => new THREE.ConeGeometry(.1, .1, 4)), cadreMat);
          chapeau.rotation.y = Math.PI / 4;
          chapeau.position.set(borne.position.x, .31, borne.position.z);
          bornes.add(borne, chapeau);
        });
        groupe.add(cadre, bornes);
        /* Balise FIXE : une croix trace les deux diagonales du carré. Balise
           qui tourne avec son île : carré vide (Taekun, 2026-11-03). */
        let croix = null;
        if (!mobile) {
          croix = new THREE.Group();
          const diag = Math.SQRT2 * (L - 2 * e);
          [Math.PI / 4, -Math.PI / 4].forEach(angle => {
            const ombre = new THREE.Mesh(boite(diag + .02, h * .6, e + .03), contourMat);
            ombre.rotation.y = angle;
            ombre.position.y = h * .3;
            const barre = new THREE.Mesh(boite(diag, h, e), cadreMat);
            barre.rotation.y = angle;
            barre.position.y = h / 2;
            croix.add(ombre, barre);
          });
          groupe.add(croix);
        }
        groupe.userData.rotationParties = { cadreMat, bornes, croix };
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
          state.rotation.balises.forEach((_, i) => groupe.add(rotationConstruireBalise(baliseMobile(i))));
          kaykit3D.dynamicGroup.add(groupe);
          kaykit3D.rotationBalises = groupe;
        }
        state.rotation.balises.forEach(([r, c], i) => {
          const balise = kaykit3D.rotationBalises.children[i];
          if (!balise) return;
          const allumee = baliseAllumee(r, c);
          const g = allumee ? gardienSurBalise(r, c) : null;
          /* Éteinte (au-dessus du vide) : cadre gris-bleu, sans bornes, posé
             sur la grille. Allumée libre : cyan. Tenue : couleur du camp. */
          const couleur = g ? new THREE.Color(state.players[g.player]?.color || ROTATION_BALISE_CLAIRE).getHex()
            : allumee ? ROTATION_BALISE_CLAIRE : 0x5d7a8c;
          const p = kaykitCellPosition(r, c, kaykitCellSurfaceY(r, c));
          balise.position.set(p.x, allumee ? p.y + .005 : KAYKIT_LEVELS.islandTop + .01, p.z);
          const { cadreMat, bornes } = balise.userData.rotationParties;
          cadreMat.color.setHex(couleur);
          cadreMat.emissive.setHex(couleur);
          cadreMat.emissiveIntensity = g ? .5 : allumee ? .35 : .1;
          bornes.visible = allumee;
          bornes.scale.y = g ? 1.35 : 1;
        });
      }

      /* Magie : une balise mobile de l'île tournée (hors pivot) part avec
         elle ; son double se pose à l'arrivée (kaykit3d.js). */
      const rotationMagieDuModeBase = kaykitMagieDuMode;
      kaykitMagieDuMode = function kaykitMagieDuModeBalises(island, rotation, sol) {
        const res = rotationMagieDuModeBase(island, rotation, sol);
        if (!butBalises() || !island) return res;
        const pivot = Array.isArray(state.selectedMagicPivot) ? state.selectedMagicPivot : null;
        state.rotation.balises.forEach(([r, c], idx) => {
          if (!baliseMobile(idx)) return;
          const i = island.cells.findIndex(([ir, ic]) => ir === r && ic === c);
          if (i < 0 || (pivot && pivot[0] === r && pivot[1] === c)) return;
          if (!rotation) {
            const reelle = kaykit3D?.rotationBalises?.children[idx];
            if (reelle) res.masquer.push(reelle);
            return;
          }
          const vers = rotation.absCells?.[i];
          if (!vers || (vers[0] === r && vers[1] === c)) return;
          const fantome = rotationConstruireBalise(true);
          fantome.traverse(o => { if (o.material) o.material.userData = { ...(o.material.userData || {}), ilyosTransient: true }; });
          const p = kaykitCellPosition(vers[0], vers[1], sol ?? kaykitCellSurfaceY(vers[0], vers[1]));
          fantome.position.set(p.x, p.y, p.z);
          res.fantomes.push(fantome);
        });
        return res;
      };

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
        balisesTenues: playerId => balisesTenuesPar(playerId),
        /* Banc : poids de l'évaluation prêtés à un camp ; rend les anciens. */
        poids(nouveaux) {
          const avant = { ...ROTATION_POIDS };
          if (nouveaux) Object.assign(ROTATION_POIDS, nouveaux);
          return avant;
        },
        /* Banc (scripts/selfplay-balises.js) : un départ de self-play
           converti en partie Balises. */
        departBalises(json, { setup = null } = {}) {
          return withSimulatedState(JSON.parse(json), () => {
            // Terrain d'un duel symétrique (11×11) à la place du classique.
            if (setup) applyStartingBoardMode("symmetric", setup);
            state.rotation = null;
            rotationInstaller({ but: "balises", couches: [] });
            rotationOuvertureBalises();
            return snapshotState();
          });
        }
      };
