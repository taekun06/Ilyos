      /* =====================================================================
         VISIONNEUSE DES DÉFAITES DE L'IA EXPERT (docs/DEFAITES-EXPERT.md)

         « Voir » une défaite archivée : parcourir toute la partie telle
         qu'elle a été jouée, tour par tour et action par action, avec ce que
         l'IA pensait à chaque tour ; annoter ; demander ce que l'IA
         d'aujourd'hui jouerait ; PROPOSER un meilleur coup, joué à la souris
         sur le vrai plateau, noté comme l'IA note les siens (après sa
         meilleure riposte) et gardé dans le dossier pour l'analyse.

         Deux parties :
           1. pendant une partie suivie, chaque action (des deux camps) est
              consignée avec le plateau qui en résulte ;
           2. la visionneuse, qui recharge un dossier de la bibliothèque.

         S'appuie sur defaites.js (journal, bibliothèque, reprise), autopsie.js
         (plan lisible, différences de positions, capture des actions jouées à
         la souris) et planner.js (évaluation détaillée, riposte).
         ===================================================================== */

      /* ---------------------------------------------------------------------
         1. Actions de la partie, une par une.

         Le journal ne gardait que la position au DÉBUT de chaque tour : un
         tour de quatre actions ne se lisait qu'en « avant / après ». Chaque
         action passe par un noyau de règle (ou, pour la pose à la souris, par
         placeIsland) : on les enveloppe une fois pour toutes, et une action
         réelle d'une partie suivie se consigne avec le plateau d'après —
         pièces, îles et couronnes seulement (≈ 2 Ko), pas l'état complet.
         Les explorations du planner passent par les mêmes noyaux en état
         simulé : elles sont écartées, comme dans la revue IA. L'apparition
         d'un gardien et le dépôt d'une couronne n'ont pas de noyau : ils
         apparaissent dans le plateau de l'action suivante, ou au tour d'après.
         ------------------------------------------------------------------- */

      function defaitesPlateauReduit() {
        return JSON.parse(JSON.stringify({
          characters: state.characters || [],
          islands: state.islands || [],
          artifact: state.artifact || null,
          secondArtifact: state.secondArtifact || null,
          couronnesEnAttente: state.couronnesEnAttente || []
        }));
      }

      function defaitesConsignerAction(texte, type) {
        try {
          if (ilyosSimulationActive || defaitesVue) return;
          const journal = defaitesJournalCourant();
          if (!journal) return;
          const entree = defaitesEntreeTour(journal, state.currentPlayer);
          (entree.actions || (entree.actions = [])).push({ type, texte, plateau: defaitesPlateauReduit() });
        } catch (erreur) { /* le journal ne doit jamais gêner la partie */ }
      }

      (function defaitesEnvelopperActions() {
        const origine = {
          move: applyMoveCore, push: applyPushCore, magie: applyMagicRotationCore,
          pose: applyIslandPlacementCore, poseHumaine: placeIsland, couronne: giveArtifactToCharacter
        };
        const ou = id => { const g = characterById(id); return g ? `(${g.r},${g.c})` : "?"; };
        applyMoveCore = function (charId, r, c) {
          const de = ou(charId);
          const resultat = origine.move.apply(this, arguments);
          if (resultat) defaitesConsignerAction(`déplace ${de} → (${r},${c})`, "MOVE");
          return resultat;
        };
        applyPushCore = function (pusherId, r, c, force) {
          const de = ou(pusherId);
          const resultat = origine.push.apply(this, arguments);
          if (resultat) defaitesConsignerAction(`pousse (${r},${c}) depuis ${de}, force ${force}`, "PUSH");
          return resultat;
        };
        applyMagicRotationCore = function (islandId) {
          const resultat = origine.magie.apply(this, arguments);
          if (resultat) defaitesConsignerAction(`fait pivoter l'île ${islandId}`, "MAGIC");
          return resultat;
        };
        applyIslandPlacementCore = function (shapeKey, cells) {
          const resultat = origine.pose.apply(this, arguments);
          if (resultat) {
            defaitesConsignerAction(`pose une île de ${(cells || []).length} cases en (${(cells || [])[0]})`
              + (resultat.gardienCase ? `, un gardien apparaît en (${resultat.gardienCase})` : ""), "POSE");
          }
          return resultat;
        };
        placeIsland = function () {
          const avant = (state && state.islands || []).length;
          const resultat = origine.poseHumaine.apply(this, arguments);
          const ile = state && (state.islands || [])[avant];
          if (ile) defaitesConsignerAction(`pose une île de ${ile.cells.length} cases en (${ile.cells[0]})`, "POSE");
          return resultat;
        };
        giveArtifactToCharacter = function (artifact, char) {
          const porteurAvant = artifact ? artifact.carrierId : null;
          const ancien = porteurAvant ? characterById(porteurAvant) : null;
          const vol = !!(ancien && char && ancien.player !== char.player);
          const resultat = origine.couronne.apply(this, arguments);
          if (resultat && char) {
            defaitesConsignerAction(vol
              ? `vole la couronne du porteur (${ancien.r},${ancien.c}) avec le gardien (${char.r},${char.c})`
              : porteurAvant
              ? `passe la couronne au gardien (${char.r},${char.c})`
              : `ramasse la couronne avec le gardien (${char.r},${char.c})`,
              vol ? "VOL" : porteurAvant ? "TRANSMISSION" : "RAMASSAGE");
          }
          return resultat;
        };
      })();

      /* Le bouton « Annuler » rend l'état d'avant l'action, mais le journal
         gardait l'action défaite : la visionneuse rejouait des coups qui
         n'avaient jamais eu lieu (défaite du 09/10, tour 11 : vingt actions
         consignées pour une dizaine jouées). Chaque instantané d'annulation
         retient donc la longueur du journal du tour, et l'annulation la
         rétablit. La pile suit undoHistory, plafond et remises à zéro compris. */
      (function defaitesSuivreAnnulations() {
        const origine = { save: saveUndoSnapshot, discard: discardLastUndoSnapshot, restore: restoreUndoSnapshot };
        let pile = [];
        const aligner = () => {
          const n = (state && state.undoHistory || []).length;
          if (pile.length > n) pile = pile.slice(pile.length - n);
        };
        const entreeCourante = () => {
          const journal = defaitesJournalCourant();
          const derniere = journal && journal.tours[journal.tours.length - 1];
          return derniere && derniere.tour === state.turn && derniere.joueur === state.currentPlayer ? derniere : null;
        };
        saveUndoSnapshot = function () {
          const resultat = origine.save.apply(this, arguments);
          try {
            if (!ilyosSimulationActive) {
              const entree = entreeCourante();
              pile.push(entree ? { tour: entree.tour, joueur: entree.joueur, n: (entree.actions || []).length } : null);
            }
            aligner();
          } catch (erreur) { /* le journal ne doit jamais gêner la partie */ }
          return resultat;
        };
        discardLastUndoSnapshot = function () {
          const resultat = origine.discard.apply(this, arguments);
          pile.pop();
          return resultat;
        };
        restoreUndoSnapshot = function () {
          const repere = pile[pile.length - 1];
          const resultat = origine.restore.apply(this, arguments);
          if (resultat) {
            pile.pop();
            try {
              const entree = repere && entreeCourante();
              if (entree && entree.tour === repere.tour && entree.joueur === repere.joueur && entree.actions) {
                entree.actions.length = Math.min(entree.actions.length, repere.n);
              }
            } catch (erreur) { /* idem */ }
          }
          aligner();
          return resultat;
        };
      })();


      /* ---------------------------------------------------------------------
         2. La visionneuse — un seul outil pour deux sources :
            • une défaite archivée (bibliothèque) ;
            • la partie IA contre IA en cours, mise en pause (l'ancienne
              « revue IA ») : le dossier est alors bâti depuis le journal de
              l'autopsie, et « reprendre » relance la partie automatique.
         ------------------------------------------------------------------- */

      let defaitesVue = null;

      const DEFAITES_ETIQUETTES = [
        ["erreur-ia", "Erreur de l'IA"],
        ["bon-coup", "Bon coup"],
        ["moment-cle", "Moment clé"],
        ["a-revoir", "À revoir"]
      ];

      /* Une couleur par origine de tracé, partout la même (légende du panneau). */
      const DEFAITES_TRACES = {
        joue: { couleur: 0xff9a3c, nom: "coup joué" },
        ia: { couleur: 0x3aa0ff, nom: "IA d’aujourd’hui" },
        envisage: { couleur: 0xb86bff, nom: "plan envisagé" },
        propose: { couleur: 0x2fd07a, nom: "coup proposé" }
      };
      const defaitesHex = n => "#" + n.toString(16).padStart(6, "0");

      /** Étapes d'un tour : actions consignées, ou à défaut (anciens dossiers,
       *  revue IA contre IA) le plan de l'IA, rejouable action par action. */
      function defaitesVueEtapes(tour) {
        if (!tour) return [];
        if (tour.actions && tour.actions.length) {
          return tour.actions.map(a => ({ texte: a.texte, plateau: a.plateau }));
        }
        const plan = tour.decision && tour.decision.plan;
        if (plan && plan.length && tour.etat) {
          return plan.map(a => ({ texte: autopsieDecrirePlan([a], tour.etat), action: a }));
        }
        return [];
      }

      function defaitesVueTours() {
        return defaitesVue ? defaitesVue.dossier.tours : [];
      }

      /* Défaite : l'IA est un camp. IA contre IA : chaque camp est une IA, et
         une position se lit du point de vue de celui qui a le trait. */
      function defaitesVuePerspective(tour) {
        const d = defaitesVue.dossier;
        return d.ia !== null && d.ia !== undefined ? d.ia : tour.joueur;
      }

      function defaitesVueNom(joueur) {
        const d = defaitesVue.dossier;
        const j = (d.joueurs || [])[joueur];
        if (d.humain === null || d.humain === undefined) return j && j.nom ? j.nom : `J${joueur}`;
        if (joueur === d.ia) return "l’IA";
        return j && j.nom ? j.nom : "vous";
      }

      /* Remet l'état en lecture : personne n'est « IA » (aucun tour d'IA ne
         doit partir), rien n'est cliquable hors bac à sable. */
      function defaitesVueNeutraliser(jouable) {
        state.players.forEach(j => { j.isAI = false; });
        state.winner = null;
        state.undoHistory = [];
        state.aiThinking = false;
        state.turnTransitioning = false;
        state.inputLocked = !jouable;
        els.gameScreen.classList.remove("ai-turn");
        els.gameScreen.classList.toggle("defaites-vue-lecture", !jouable);
      }

      /* --- Tracés ---------------------------------------------------------- */

      /* Un plan au format du planner, dessiné action par action depuis sa
         position de départ : chemin des déplacements, flèches de poussée et
         chutes, îles posées ou tournées, numéro d'ordre. Chaque élément garde
         le numéro de son action (`etape`) pour n'en montrer qu'une. */
      function defaitesTracePlan(etatJson, plan, couleur) {
        const elements = [];
        if (!etatJson || !plan || !plan.length) return elements;
        const clone = JSON.parse(etatJson);
        withSimulatedState(clone, () => {
          plan.forEach((a, k) => {
            const etape = k + 1;
            const ajouter = e => elements.push({ ...e, etape });
            let marque = null;
            try {
              if (a.type === "MOVE") {
                const g = characterById(a.charId);
                if (g) {
                  const chemin = shortestMovementPath(g, a.r, a.c, Number.isFinite(a.cost) ? a.cost : 99) || [[a.r, a.c]];
                  ajouter({ type: "chemin", points: [[g.r, g.c], ...chemin], couleur });
                  marque = [a.r, a.c];
                }
              } else if (a.type === "PUSH") {
                const p = characterById(a.pusherId);
                if (p) {
                  const bloc = resoudrePousseeBloc(a.r, a.c, a.r - p.r, a.c - p.c, a.force);
                  (bloc ? bloc.mouvements : []).forEach(mv => {
                    const arrivee = mv.chute && mv.vide ? mv.vide : mv.to;
                    if (mv.from[0] !== arrivee[0] || mv.from[1] !== arrivee[1]) {
                      ajouter({ type: "fleche", de: mv.from, vers: arrivee, couleur });
                    }
                    if (mv.chute && mv.vide) ajouter({ type: "chute", r: mv.vide[0], c: mv.vide[1] });
                  });
                  ajouter({ type: "case", r: p.r, c: p.c, couleur, opacite: .3 });
                  marque = [a.r, a.c];
                }
              } else if (a.type === "MAGIC" && a.pivot) {
                ajouter({ type: "anneau", r: a.pivot[0], c: a.pivot[1], couleur });
                marque = a.pivot;
              } else if (a.type === "POSE" && a.cells) {
                a.cells.forEach(([r, c]) => ajouter({ type: "case", r, c, couleur }));
                const spawn = Array.isArray(a.spawn) ? a.spawn : null;
                if (spawn) ajouter({ type: "anneau", r: spawn[0], c: spawn[1], couleur });
                marque = spawn || a.cells[0];
              } else if (a.type === "RAMASSAGE") {
                const g = characterById(a.charId);
                if (g) { ajouter({ type: "anneau", r: g.r, c: g.c, couleur: 0xf2c94c }); marque = [g.r, g.c]; }
              } else if (a.type === "DEPOT") {
                ajouter({ type: "anneau", r: a.r, c: a.c, couleur: 0xf2c94c });
                marque = [a.r, a.c];
              } else if (a.type === "DISSOLUTION") {
                const ile = (state.islands || []).find(i => i.id === a.islandId);
                if (ile) { ile.cells.forEach(([r, c]) => ajouter({ type: "case", r, c, couleur })); marque = ile.cells[0]; }
              } else if (a.type === "VOL") {
                const de = characterById(a.deId), vers = characterById(a.charId);
                if (de && vers) { ajouter({ type: "fleche", de: [de.r, de.c], vers: [vers.r, vers.c], couleur: 0xf2c94c }); marque = [vers.r, vers.c]; }
              } else if (a.type === "TRANSMISSION") {
                const de = characterById(a.deId), vers = characterById(a.versId);
                if (de && vers) { ajouter({ type: "fleche", de: [de.r, de.c], vers: [vers.r, vers.c], couleur: 0xf2c94c }); marque = [vers.r, vers.c]; }
              }
            } catch (erreur) { /* une action illisible n'empêche pas les autres */ }
            let ok = false;
            try { ok = !!plannerAppliquerAction(a); } catch (erreur) { ok = false; }
            if (ok && a.type === "MAGIC") {
              const ile = (state.islands || []).find(i => i.id === a.islandId);
              if (ile) ile.cells.forEach(([r, c]) => ajouter({ type: "case", r, c, couleur }));
            }
            if (marque) ajouter({ type: "numero", r: marque[0], c: marque[1], n: etape, couleur });
          });
        });
        return elements;
      }

      /* Ce qui a changé entre deux positions (instantanés ou plateaux
         réduits) : déplacements, chutes, apparitions, îles posées ou tournées,
         couronnes. Sert aux tours humains et aux coups proposés, dont on n'a
         pas le plan au format du planner. */
      function defaitesTraceDiff(avant, apres, couleur) {
        const A = typeof avant === "string" ? JSON.parse(avant) : avant;
        const B = typeof apres === "string" ? JSON.parse(apres) : apres;
        const elements = [];
        if (!A || !B) return elements;
        const posB = new Map((B.characters || []).map(g => [g.id, g]));
        const porteurs = new Set([A.artifact, A.secondArtifact].filter(x => x && x.carrierId).map(x => x.carrierId));
        const marque = joueur => ((B.players || [])[joueur] || {}).score > ((A.players || [])[joueur] || {}).score;
        for (const g of A.characters || []) {
          const h = posB.get(g.id);
          if (!h) {
            // Un porteur qui disparaît quand son camp marque a validé : ce n'est pas une chute.
            if (porteurs.has(g.id) && marque(g.player)) elements.push({ type: "anneau", r: g.r, c: g.c, couleur: 0xf2c94c });
            else elements.push({ type: "chute", r: g.r, c: g.c });
          } else if (g.r !== h.r || g.c !== h.c) {
            elements.push({ type: "fleche", de: [g.r, g.c], vers: [h.r, h.c], couleur });
          }
        }
        const idsA = new Set((A.characters || []).map(g => g.id));
        (B.characters || []).filter(g => !idsA.has(g.id)).forEach(g => elements.push({ type: "anneau", r: g.r, c: g.c, couleur }));
        const ilesA = new Map((A.islands || []).map(i => [i.id, JSON.stringify(i.cells)]));
        (B.islands || []).forEach(i => {
          if (ilesA.get(i.id) === JSON.stringify(i.cells)) return;
          i.cells.forEach(([r, c]) => elements.push({ type: "case", r, c, couleur }));
        });
        ["artifact", "secondArtifact"].forEach(cle => {
          const x = A[cle], y = B[cle];
          if (!y || !y.active || y.carrierId) return;
          if (!x || x.carrierId || x.r !== y.r || x.c !== y.c) elements.push({ type: "anneau", r: y.r, c: y.c, couleur: 0xf2c94c });
        });
        return elements;
      }

      function defaitesVueIndexSuivant(index) {
        return defaitesVueTours().findIndex((t, i) => i > index && t.etat);
      }

      /* Le tracé à montrer pour ce qui est affiché. */
      function defaitesVueTraceCourante() {
        const v = defaitesVue;
        if (!v || !v.tracer || v.sandbox) return [];
        if (v.trace) return v.trace.elements;
        const tours = defaitesVueTours();
        const tour = tours[v.index];
        const couleur = DEFAITES_TRACES.joue.couleur;
        const plan = tour.decision && tour.decision.plan;
        const etapes = defaitesVueEtapes(tour);
        if (v.etape === 0) {
          if (plan && plan.length) return defaitesTracePlan(tour.etat, plan, couleur);
          const suivant = defaitesVueIndexSuivant(v.index);
          return suivant >= 0 ? defaitesTraceDiff(tour.etat, tours[suivant].etat, couleur) : [];
        }
        // Une action : ce qu'elle seule a changé.
        const cible = etapes[v.etape - 1];
        if (!cible) return [];
        if (cible.plateau) {
          const avant = v.etape > 1 && etapes[v.etape - 2].plateau ? etapes[v.etape - 2].plateau : JSON.parse(tour.etat);
          return defaitesTraceDiff(avant, cible.plateau, couleur);
        }
        return defaitesTracePlan(tour.etat, plan, couleur).filter(e => e.etape === v.etape);
      }

      /* --- Affichage d'une position ----------------------------------------- */

      function defaitesVueAppliquer(tour, etape) {
        const v = defaitesVue;
        applyStateSnapshot(JSON.parse(tour.etat));
        const etapes = defaitesVueEtapes(tour);
        if (etape > 0 && etapes.length) {
          const cible = etapes[Math.min(etape, etapes.length) - 1];
          if (cible.plateau) {
            Object.assign(state, JSON.parse(JSON.stringify(cible.plateau)));
          } else {
            for (const e of etapes.slice(0, etape)) {
              try { if (!plannerAppliquerAction(e.action)) break; } catch (erreur) { break; }
            }
          }
        }
        // Aperçu : la position APRÈS le coup tracé, sur demande.
        if (v.trace && v.traceApres) {
          if (v.trace.etatApres) applyStateSnapshot(JSON.parse(v.trace.etatApres));
          else for (const action of v.trace.plan || []) {
            try { if (!plannerAppliquerAction(action)) break; } catch (erreur) { break; }
          }
        }
      }

      function defaitesVueAfficher(index, etape = 0, { garderTrace = false } = {}) {
        const v = defaitesVue;
        const tour = defaitesVueTours()[index];
        if (!v || !tour || !tour.etat) return false;
        if (!garderTrace || v.index !== index) { v.trace = null; v.traceApres = false; }
        v.index = index;
        v.etape = etape;
        try {
          defaitesVueAppliquer(tour, etape);
        } catch (erreur) {
          console.warn("[ILYOS] visionneuse : position illisible", erreur);
        }
        defaitesVueNeutraliser(!!v.sandbox);
        if (typeof syncKayKitScene === "function") syncKayKitScene();
        renderAll();
        try { v.tracesAffiches = kaykitTracerAnalyse(defaitesVueTraceCourante()); }
        catch (erreur) { v.tracesAffiches = 0; /* le tracé est un plus */ }
        defaitesVueRendre();
        defaitesVueCadrer();
        return true;
      }

      /* Le panneau couvre la droite de l'écran : l'image du plateau glisse
         vers la gauche d'une demi-largeur de panneau, pour que l'action ne se
         joue pas dessous. Sur petit écran, le panneau est en bas : rien. */
      function defaitesVueCadrer() {
        try {
          const panneau = document.querySelector(".defaites-vue");
          const large = panneau && window.innerWidth > 760;
          kaykitDecalerCadrage(large ? Math.round(panneau.getBoundingClientRect().width / 2) : 0);
        } catch (erreur) { /* sans scène 3D, rien à recadrer */ }
      }

      /* Montre un coup tracé sur la position de départ du tour affiché. */
      function defaitesVueMontrer(trace) {
        const v = defaitesVue;
        if (!v) return;
        v.trace = trace;
        v.traceApres = false;
        v.tracer = true;
        defaitesVueAfficher(v.index, 0, { garderTrace: true });
      }

      /* --- Évaluations ------------------------------------------------------ */

      /* Note d'une position du point de vue de `joueur`, et après la meilleure
         riposte adverse — exactement comme l'IA juge ses propres plans. */
      function defaitesVueNoter(etatJson, joueur) {
        const clone = JSON.parse(etatJson);
        clone.aiDifficulty = clone.aiDifficulty || "expert";
        clone.currentPlayer = joueur;
        return withSimulatedState(clone, () => avecGrilleTerre(() => {
          const detail = evaluerAvecDetail(joueur);
          let robuste = null;
          try {
            robuste = plannerEvaluerRobustesse({ etat: cloneStateForSimulation(), note: detail.note }, joueur);
          } catch (erreur) { robuste = null; }
          return {
            fin: Math.round(detail.note),
            termes: detail.termes.map(t => ({ terme: t.terme, montant: Math.round(t.montant) })),
            robuste: robuste ? Math.round(robuste.note) : null,
            riposte: robuste ? robuste.riposte || [] : [],
            menace: robuste ? Math.round(robuste.menace || 0) : null
          };
        }));
      }

      /* Position à la FIN du tour joué. Tour de l'IA : son plan rejoué depuis
         l'instantané de décision (exact). Tour humain : la position du tour
         suivant, remise au trait du joueur (approximation : la pioche du
         suivant et l'entrée des couronnes y sont déjà faites). */
      function defaitesVueFinJouee(index) {
        const tours = defaitesVueTours();
        const tour = tours[index];
        const plan = tour && tour.decision && tour.decision.plan;
        if (plan && plan.length) {
          const clone = JSON.parse(tour.etat);
          return withSimulatedState(clone, () => {
            for (const action of plan) {
              try { if (!plannerAppliquerAction(action)) break; } catch (erreur) { break; }
            }
            return snapshotState();
          });
        }
        const suivant = defaitesVueIndexSuivant(index);
        if (suivant < 0) return null;
        const fin = JSON.parse(tours[suivant].etat);
        fin.currentPlayer = tour.joueur;
        fin.turn = tour.tour;
        return JSON.stringify(fin);
      }

      function defaitesVueNoteJouee(index) {
        const v = defaitesVue;
        if (v.notesJouees[index] !== undefined) return v.notesJouees[index];
        let note = null;
        try {
          const fin = defaitesVueFinJouee(index);
          if (fin) note = defaitesVueNoter(fin, defaitesVueTours()[index].joueur);
        } catch (erreur) { note = null; }
        v.notesJouees[index] = note;
        return note;
      }

      /* Courbe : ce que l'IA pense de SA position au début de chacun de ses
         tours (IA contre IA : chaque camp, de son propre point de vue). */
      function defaitesVueCalculerCourbe() {
        const v = defaitesVue;
        v.courbe = defaitesVueTours().map(tour => {
          if (!tour.etat) return null;
          try {
            const clone = JSON.parse(tour.etat);
            clone.aiDifficulty = clone.aiDifficulty || "expert";
            return withSimulatedState(clone, () => avecGrilleTerre(() => evaluateStrategicState(defaitesVuePerspective(tour))));
          } catch (erreur) { return null; }
        });
      }

      /* Ce que l'IA d'AUJOURD'HUI jouerait à la place du joueur au trait. */
      function defaitesVueAnalyserIA(index) {
        const tour = defaitesVueTours()[index];
        const clone = JSON.parse(tour.etat);
        clone.aiDifficulty = clone.aiDifficulty || "expert";
        setTestRandomSeed(1);
        try {
          const rapport = withSimulatedState(clone, () => plannerChercherPlanRobuste(clone.currentPlayer));
          const a = rapport.anticipation || {};
          const envisages = a.plansExamines && a.plansExamines.length
            ? a.plansExamines.map(p => ({ plan: p.plan, note: p.noteRobuste }))
            : (rapport.finalistes || []).slice(0, 4).map(f => ({ plan: f.plan, note: Math.round(f.note) }));
          return {
            joueur: clone.currentPlayer,
            plan: rapport.plan,
            planLisible: autopsieDecrirePlan(rapport.plan, tour.etat),
            noteFin: Math.round(rapport.noteArrivee),
            noteRobuste: Number.isFinite(a.noteRobuste) ? a.noteRobuste : null,
            riposte: a.riposte || [],
            finalistes: envisages.map(f => ({ ...f, lisible: autopsieDecrirePlan(f.plan, tour.etat) }))
          };
        } finally {
          setTestRandomSeed(null);
        }
      }

      async function defaitesVueSauver() {
        const v = defaitesVue;
        if (!v || v.direct) return; // IA contre IA : dossier en mémoire, exporté sur demande
        try { await defaitesBiblio.mettreAJour(v.dossier); }
        catch (erreur) { showToast("Enregistrement impossible dans la bibliothèque."); }
      }

      /* --- Proposer un meilleur coup ------------------------------------- */

      function defaitesVueProposer() {
        const v = defaitesVue;
        if (!v || v.sandbox) return false;
        const tour = defaitesVueTours()[v.index];
        v.sandbox = { index: v.index, avant: tour.etat };
        kaykitEffacerTraceAnalyse();
        defaitesVueAfficher(v.index, 0);
        autopsieEnregistrerActions(true);
        showToast(`Jouez le tour ${tour.tour} à la place de ${defaitesVueNom(tour.joueur)}, avec ses cartes.`);
        return true;
      }

      function defaitesVueAnnulerProposition() {
        const v = defaitesVue;
        if (!v || !v.sandbox) return false;
        autopsieEnregistrerActions(false);
        revueActionsJouees = null;
        const index = v.sandbox.index;
        v.sandbox = null;
        defaitesVueAfficher(index, 0);
        return true;
      }

      async function defaitesVueValider() {
        const v = defaitesVue;
        if (!v || !v.sandbox) return null;
        const sb = v.sandbox;
        const tour = defaitesVueTours()[sb.index];
        const panneau = document.querySelector(".defaites-vue");
        const pourquoi = panneau ? (panneau.querySelector("[data-vue-pourquoi]") || {}).value || "" : "";
        const fin = snapshotState();
        const captees = (revueActionsJouees || []).slice();
        autopsieEnregistrerActions(false);
        revueActionsJouees = null;
        v.sandbox = null;
        if (panneau) {
          panneau.classList.add("defaites-vue-calcul");
          panneau.innerHTML = `<p><b>⏳ Évaluation de votre coup…</b></p>
            <p class="dv-discret">Votre coup et le coup joué affrontent chacun la meilleure riposte
              de l’IA (quelques secondes).</p>`;
        }
        await new Promise(r => setTimeout(r, 30));
        let vous = null;
        try { vous = defaitesVueNoter(fin, tour.joueur); } catch (erreur) { vous = null; }
        const joue = defaitesVueNoteJouee(sb.index);
        const ecart = vous && joue ? (() => {
          const noms = new Set([...vous.termes, ...joue.termes].map(t => t.terme));
          return [...noms].map(nom => {
            const a = (vous.termes.find(t => t.terme === nom) || {}).montant || 0;
            const b = (joue.termes.find(t => t.terme === nom) || {}).montant || 0;
            return { terme: nom, vous: a, joue: b, delta: a - b };
          }).filter(x => x.delta !== 0).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)).slice(0, 8);
        })() : [];
        const d = v.dossier;
        const proposition = {
          tour: tour.tour,
          index: sb.index,
          joueur: tour.joueur,
          camp: d.ia === tour.joueur || d.ia === null || d.ia === undefined ? "ia" : "humain",
          actions: captees.map(a => a.texte),
          changements: autopsieDiffPositions(sb.avant, fin),
          etatApres: fin,
          vous: vous ? { fin: vous.fin, robuste: vous.robuste, riposte: vous.riposte } : null,
          joue: joue ? { fin: joue.fin, robuste: joue.robuste, riposte: joue.riposte } : null,
          ecart,
          pourquoi: String(pourquoi).trim(),
          date: new Date().toISOString()
        };
        (d.propositions || (d.propositions = [])).push(proposition);
        // IA contre IA : la correction rejoint aussi le relevé de la revue (résumé, export).
        if (v.direct) {
          ILYOS_CORRECTIONS.push({
            tour: tour.tour,
            nomJoueur: defaitesVueNom(tour.joueur),
            planIA: tour.decision ? tour.decision.planLisible : null,
            noteIA: tour.decision ? `${tour.decision.noteDepart} → ${tour.decision.noteArrivee}` : null,
            votreCoup: proposition.changements,
            vosActions: captees,
            etatAvant: sb.avant,
            etatApres: fin,
            votreEvaluation: vous ? { note: vous.fin, termes: vous.termes } : null,
            ecart: ecart.map(x => ({ terme: x.terme, ia: x.joue, vous: x.vous, delta: x.delta })),
            verdictHumain: "meilleur",
            note: proposition.pourquoi,
            horodatage: proposition.date,
            proposition
          });
        }
        await defaitesVueSauver();
        v.trace = null;
        defaitesVueAfficher(sb.index, 0);
        return proposition;
      }

      /* --- Ouverture, fermeture ------------------------------------------ */

      function defaitesVueOuvrir(dossier, index, direct = null) {
        if (!dossier || !dossier.cadre || !(dossier.tours || []).some(t => t.etat)) {
          showToast("Cette partie ne peut pas être affichée.");
          return false;
        }
        if (dossier.regles && dossier.regles.grille) setBoardSize(dossier.regles.grille);
        const restaure = normalizeRestoredState(dossier.cadre);
        if (!restaure) { showToast("Cette partie n’est plus compatible avec le jeu."); return false; }
        stopTurnTimer();
        aiRunToken++;
        closeOnlineNetwork(false);
        state = restaure;
        state.onlineMode = false;
        const depart = index !== null && dossier.tours[index] && dossier.tours[index].etat
          ? index : dossier.tours.findIndex(t => t.etat);
        defaitesVue = {
          dossier, direct, index: depart, etape: 0, courbe: [], notesJouees: {}, analyses: {},
          sandbox: null, trace: null, traceApres: false, tracer: true, finTour: endTurn, texteBrut: null
        };
        // « Fin du tour » : sans effet en lecture, valide la proposition dans le bac à sable.
        endTurn = async function endTurnVisionneuse() {
          if (defaitesVue && defaitesVue.sandbox) return defaitesVueValider();
          showToast("Lecture seule : « Proposer un meilleur coup » pour jouer ce tour.");
          return false;
        };
        els.victoryModal.classList.add("hidden");
        els.victoryModal.classList.remove("victory-visible");
        defaitesFermerBibliotheque();
        els.setupScreen.classList.add("hidden");
        els.gameScreen.classList.remove("hidden");
        document.body.classList.add("defaites-vue-ouverte");
        defaitesVueCalculerCourbe();
        defaitesVueAfficher(depart, 0);
        return true;
      }

      function defaitesVoir(dossier, index = null) {
        return defaitesVueOuvrir(dossier, index, null);
      }

      function defaitesVueQuitter() {
        const v = defaitesVue;
        if (!v) return null;
        if (v.sandbox) { autopsieEnregistrerActions(false); revueActionsJouees = null; }
        endTurn = v.finTour;
        defaitesVue = null;
        try { kaykitEffacerTraceAnalyse(); kaykitDecalerCadrage(0); } catch (erreur) { /* scène absente */ }
        const panneau = document.querySelector(".defaites-vue");
        if (panneau) panneau.remove();
        document.body.classList.remove("defaites-vue-ouverte");
        els.gameScreen.classList.remove("defaites-vue-lecture");
        document.removeEventListener("keydown", defaitesVueClavier);
        return v;
      }

      function defaitesVueFermer() {
        const v = defaitesVueQuitter();
        if (v && v.direct) { revueRestaurerPartie(v); return; }
        resetToSetup();
        defaitesOuvrirBibliotheque();
      }

      /* « Reprendre la partie ici ». Défaite : partie vivante contre l'Expert
         depuis ce tour. IA contre IA : la partie automatique repart de ce tour
         — les décisions suivantes du journal n'ont alors plus eu lieu. */
      function defaitesVueReprendre() {
        const v = defaitesVue;
        if (!v) return;
        const { dossier, index } = v;
        const tour = dossier.tours[index];
        defaitesVueQuitter();
        if (!v.direct) { defaitesRejouer(dossier, index); return; }
        // Partie solo : on revient toujours à la position mise de côté.
        if (v.direct.solo) { revueRestaurerPartie(v); return; }
        revueRestaurerPartie(v, { etat: tour.actuelle ? null : tour.etat, journal: tour.actuelle ? null : tour.journalIndex });
        autopsieReprendre();
      }

      /* IA contre IA : la partie repart de VOTRE coup proposé — comme l'ancien
         « Jouer le tour » de la revue. */
      function defaitesVueContinuerDepuis(proposition) {
        const v = defaitesVue;
        if (!v || !v.direct || !proposition) return;
        const tour = v.dossier.tours[proposition.index];
        defaitesVueQuitter();
        revueRestaurerPartie(v, { etat: proposition.etatApres, journal: tour.actuelle ? null : tour.journalIndex });
        state.players.forEach(j => { j.isAI = true; });
        if (typeof startIlyosAutoplay === "function" && autopsieSuivi) {
          startIlyosAutoplay({ maxTurns: autopsieSuivi.maxTurns, difficulty: autopsieSuivi.difficulte });
          ILYOS_AUTOPLAY.startedTurn = autopsieSuivi.startedTurn;
          ILYOS_AUTOPLAY.logs = autopsieSuivi.logs;
          if (typeof renderIlyosAutoplayPanel === "function") renderIlyosAutoplayPanel();
        }
        autopsieSuivi = null;
        // La fin de VOTRE tour enchaîne sur l'IA, comme toute fin de tour.
        endTurn(true);
        revueRendre();
      }

      /* --- Navigation ------------------------------------------------------ */

      function defaitesVueAller(index) {
        const tours = defaitesVueTours();
        let i = Math.max(0, Math.min(tours.length - 1, index));
        const pas = i >= (defaitesVue ? defaitesVue.index : 0) ? 1 : -1;
        while (tours[i] && !tours[i].etat && i > 0 && i < tours.length - 1) i += pas;
        return defaitesVueAfficher(i, 0);
      }

      function defaitesVueEtape(delta) {
        const v = defaitesVue;
        if (!v || v.sandbox) return false;
        const n = defaitesVueEtapes(defaitesVueTours()[v.index]).length;
        const cible = v.etape + delta;
        if (cible > n) return defaitesVueAller(v.index + 1);
        if (cible < 0) {
          const precedent = v.index - 1;
          const tours = defaitesVueTours();
          if (precedent < 0 || !tours[precedent] || !tours[precedent].etat) return false;
          return defaitesVueAfficher(precedent, defaitesVueEtapes(tours[precedent]).length);
        }
        return defaitesVueAfficher(v.index, cible);
      }

      function defaitesVueClavier(evenement) {
        if (!defaitesVue || defaitesVue.sandbox) return;
        if (/^(INPUT|TEXTAREA|SELECT)$/.test((evenement.target || {}).tagName || "")) return;
        if (evenement.key === "ArrowRight") {
          evenement.preventDefault();
          if (evenement.shiftKey) defaitesVueAller(defaitesVue.index + 1); else defaitesVueEtape(1);
        } else if (evenement.key === "ArrowLeft") {
          evenement.preventDefault();
          if (evenement.shiftKey) defaitesVueAller(defaitesVue.index - 1); else defaitesVueEtape(-1);
        }
      }

      /* --- Rendu du panneau ------------------------------------------------ */

      function defaitesVueSigne(n) {
        if (n === null || n === undefined || !Number.isFinite(n)) return "—";
        return (n > 0 ? "+" : "") + Math.round(n).toLocaleString("fr-FR");
      }

      function defaitesVueCourbeSVG() {
        const v = defaitesVue;
        const d = v.dossier;
        const largeur = 320, hauteur = 74, milieu = hauteur / 2;
        const echelle = x => Math.sign(x) * Math.log10(1 + Math.abs(x) / 100) / Math.log10(1 + 40000 / 100);
        const valeurs = v.courbe;
        const n = valeurs.length;
        if (!n) return "";
        const X = i => 6 + (i * (largeur - 12)) / Math.max(1, n - 1);
        const Y = x => milieu - echelle(x) * (milieu - 6);
        /* L'évaluateur ne juge pas une position pareil selon qui a le trait
           (« qui joue ensuite ») : relier tours IA et tours humains donnait
           des zigzags de ±3 000 sans signification. Une ligne par IA, qui ne
           passe que par SES tours ; les tours humains, cliquables, sont posés
           sur l'axe. */
        const tours = defaitesVueTours();
        const ias = d.ia !== null && d.ia !== undefined ? [d.ia] : [...new Set(tours.map(t => t.joueur))].sort();
        const couleurs = [0x17384a, 0x8a4fd6];
        const lignes = ias.map((camp, k) => {
          const points = valeurs.map((x, i) => x === null || tours[i].joueur !== camp ? null
            : `${X(i).toFixed(1)},${Y(x).toFixed(1)}`).filter(Boolean);
          return `<polyline class="dv-ligne" style="stroke:${defaitesHex(couleurs[k % 2])}" points="${points.join(" ")}"/>`;
        }).join("");
        const signales = new Set((d.analyse ? d.analyse.signales : []).map(s => s.tour));
        const marques = tours.map((t, i) => {
          if (valeurs[i] === null) return "";
          const courant = i === v.index;
          const ia = ias.includes(t.joueur);
          const signale = ia && signales.has(t.tour);
          const annote = d.annotations && d.annotations[i];
          const classe = courant ? "dv-point-courant" : signale ? "dv-point-signale" : annote ? "dv-point-annote"
            : ia ? "dv-point" : "dv-point-humain";
          const y = ia ? Y(valeurs[i]) : milieu;
          const style = ia && !courant && !signale && !annote && ias.length > 1
            ? ` style="fill:${defaitesHex(couleurs[ias.indexOf(t.joueur) % 2])}"` : "";
          return `<circle class="${classe}"${style} data-vue-index="${i}" cx="${X(i).toFixed(1)}" cy="${y.toFixed(1)}" r="${courant ? 5 : signale ? 4 : 3}"><title>Tour ${t.tour} · ${defaitesVueNom(t.joueur)}${ia ? ` · ${defaitesVueSigne(valeurs[i])}` : ""}</title></circle>`;
        }).join("");
        return `<svg class="dv-courbe" viewBox="0 0 ${largeur} ${hauteur}" role="img"
            aria-label="Confiance de l’IA au début de chacun de ses tours">
          <line class="dv-zero" x1="0" y1="${milieu}" x2="${largeur}" y2="${milieu}"/>
          ${lignes}
          ${marques}
        </svg>`;
      }

      function defaitesVueTermes(termes, max = 6) {
        return (termes || []).slice().sort((a, b) => Math.abs(b.montant) - Math.abs(a.montant)).slice(0, max)
          .map(t => `<li><span>${defaitesEchapper(t.terme)}</span><b class="${t.montant >= 0 ? "dv-plus" : "dv-moins"}">${defaitesVueSigne(t.montant)}</b></li>`)
          .join("");
      }

      function defaitesVuePastille(cle) {
        const t = DEFAITES_TRACES[cle];
        return `<i class="dv-pastille" style="background:${defaitesHex(t.couleur)}" title="${t.nom}"></i>`;
      }

      function defaitesVueDetailIA(tour, index) {
        const d = tour.decision;
        if (!d) return "";
        const tours = defaitesVueTours();
        const suivante = tours.slice(index + 1).find(t => t.joueur === tour.joueur && t.decision);
        const constate = suivante ? suivante.decision.noteDepart : null;
        const signal = (defaitesVue.dossier.analyse ? defaitesVue.dossier.analyse.signales : [])
          .find(s => s.tour === tour.tour);
        const ligne = (libelle, valeur) => `<li><span>${libelle}</span><b>${valeur}</b></li>`;
        const envisages = (d.plansExamines || []).filter(p => p.plan && p.plan.length);
        return `<section class="dv-bloc">
          <h3>🧠 Ce que ${defaitesVueNom(tour.joueur)} a pensé</h3>
          ${d.repli ? `<p class="dv-alerte">Repli sur l’ancienne IA : ${defaitesEchapper(d.repli)}</p>` : ""}
          <ul class="dv-chiffres">
            ${ligne("note au départ", defaitesVueSigne(d.noteDepart))}
            ${ligne("à la fin de son tour", defaitesVueSigne(d.noteArrivee))}
            ${ligne("après la riposte qu’elle craignait", defaitesVueSigne(d.noteRobuste))}
            ${ligne("constaté à son tour suivant", defaitesVueSigne(constate))}
          </ul>
          ${d.riposte && d.riposte.length ? `<p><span class="dv-discret">riposte redoutée :</span>
            ${defaitesEchapper(d.riposte.join(" · "))}${d.garantie ? " (possible avec la seule réserve)" : " (demande une pioche favorable)"}</p>` : ""}
          ${envisages.length > 1 ? `<details class="dv-envisages"><summary>Les plans qu’elle a comparés (${envisages.length})</summary><ol>${
            envisages.map((p, k) => `<li><span>${k === 0 ? "<b>retenu</b> · " : ""}${defaitesVueSigne(p.noteFinTour)} → après riposte ${defaitesVueSigne(p.noteRobuste)}</span><br>
              ${defaitesEchapper(autopsieDecrirePlan(p.plan, tour.etat))}
              <button type="button" data-vue="tracer-envisage" data-k="${k}">${defaitesVuePastille("envisage")} tracer</button></li>`).join("")}</ol></details>`
            : d.classement && d.classement.length > 1 ? `<p><span class="dv-discret">ses meilleurs plans (après riposte) :</span>
            ${d.classement.map(defaitesVueSigne).join(" · ")}</p>` : ""}
          <p class="dv-discret">${d.etatsExplores ?? "?"} positions explorées${d.examines ? ` · ${d.examines} plans testés contre la riposte` : ""}${d.coupee ? " · réflexion coupée par le temps" : ""}</p>
          ${signal ? `<p class="dv-alerte">⚠ ${signal.raisons.map(defaitesEchapper).join(" ; ")}</p>` : ""}
        </section>`;
      }

      function defaitesVueRendre() {
        const v = defaitesVue;
        if (!v) return;
        let panneau = document.querySelector(".defaites-vue");
        if (!panneau) {
          panneau = document.createElement("aside");
          panneau.className = "defaites-vue";
          panneau.setAttribute("aria-label", "Visionneuse de partie");
          document.body.appendChild(panneau);
          panneau.addEventListener("click", defaitesVueClic);
          document.addEventListener("keydown", defaitesVueClavier);
        }
        panneau.classList.remove("defaites-vue-calcul");
        const tours = defaitesVueTours();
        const tour = tours[v.index];
        const d = v.dossier;
        const etapes = defaitesVueEtapes(tour);

        if (v.sandbox) {
          panneau.innerHTML = `<header class="dv-tete"><b>✏ Votre coup — tour ${tour.tour}</b></header>
            <p>Jouez ce tour à la place de <b>${defaitesVueNom(tour.joueur)}</b>, avec ses cartes, sur le plateau.
              Terminez par « ✓ Valider » (ou « Fin du tour »).</p>
            <label class="dv-etiquette">Pourquoi est-ce meilleur ? (facultatif)
              <textarea data-vue-pourquoi rows="3" placeholder="ex. je bloque son village avant qu’il ne valide"></textarea></label>
            <p class="dv-discret">Votre coup sera noté comme l’IA note les siens : après sa meilleure riposte.
              Il est gardé ${v.direct ? "dans l’analyse de la partie (export, résumé)" : "dans le dossier, l’export et l’analyse"}.</p>
            <div class="dv-actions">
              <button type="button" class="dv-principal" data-vue="valider">✓ Valider mon coup</button>
              <button type="button" data-vue="annuler">✗ Annuler</button>
            </div>`;
          return;
        }

        const note = v.courbe[v.index];
        const suivantIndex = defaitesVueIndexSuivant(v.index);
        // Même joueur au trait : seule comparaison qui ait un sens (voir la courbe).
        const memeJoueurIndex = tours.findIndex((t, i) => i > v.index && t.etat && t.joueur === tour.joueur);
        const noteSuivante = memeJoueurIndex >= 0 ? v.courbe[memeJoueurIndex] : null;
        const etapeTexte = v.etape > 0 && etapes[v.etape - 1] ? etapes[v.etape - 1].texte : null;
        const joueTexte = tour.actuelle ? "position actuelle de la partie — rien n’a encore été joué"
          : tour.decision && tour.decision.planLisible
            ? tour.decision.planLisible
            : (suivantIndex >= 0 ? autopsieDiffPositions(tour.etat, tours[suivantIndex].etat).join(" · ") : "fin de la partie");
        const perspective = defaitesVuePerspective(tour);
        let detailDepart = null;
        try {
          const clone = JSON.parse(tour.etat);
          clone.aiDifficulty = clone.aiDifficulty || "expert";
          detailDepart = withSimulatedState(clone, () => avecGrilleTerre(() => evaluerAvecDetail(perspective)));
        } catch (erreur) { detailDepart = null; }
        const analyse = v.analyses[v.index];
        const propositions = (d.propositions || []).filter(p => p.index === v.index);
        const annotation = (d.annotations || {})[v.index] || { texte: "", etiquettes: [] };
        const date = new Date(d.fin.date);
        const scores = d.fin.scores || [];
        const titre = v.direct && v.direct.solo
          ? `<b>Revue IA — partie en cours</b>
             <small>${defaitesEchapper(defaitesVueNom(d.humain))} ${scores[d.humain] ?? 0}-${scores[d.ia] ?? 0} IA Expert · tour ${d.fin.tours}</small>`
          : v.direct
          ? `<b>Partie IA contre IA — ${state && v.direct ? "en pause" : ""}</b>
             <small>${(d.joueurs || []).map((j, k) => `${defaitesEchapper(j.nom)} ${scores[k] ?? 0}`).join(" · ")} · tour ${d.fin.tours}</small>`
          : `<b>Partie du ${date.toLocaleDateString("fr-FR")}</b>
             <small>${defaitesEchapper(defaitesVueNom(d.humain))} ${scores[d.humain]}-${scores[d.ia]} IA Expert · ${d.fin.tours} tours</small>`;
        const traceNom = v.trace ? v.trace.nom : null;

        panneau.innerHTML = `
          <header class="dv-tete">
            <div>${titre}</div>
            <button type="button" data-vue="fermer" aria-label="Fermer la visionneuse">✕</button>
          </header>
          <div class="dv-courbe-bloc">
            <small class="dv-discret">Confiance ${d.ia !== null && d.ia !== undefined ? "de l’IA" : "de chaque IA"} au début de ses tours
              (au-dessus : elle pense mener) — cliquez un point. <span class="dv-leg-signale">●</span> tour signalé</small>
            ${defaitesVueCourbeSVG()}
          </div>
          <nav class="dv-nav">
            <button type="button" data-vue="premier" aria-label="Premier tour">⏮</button>
            <button type="button" data-vue="tour-" aria-label="Tour précédent">◀</button>
            <span><b>Tour ${tour.tour}</b> · ${defaitesVueNom(tour.joueur)}</span>
            <button type="button" data-vue="tour+" aria-label="Tour suivant">▶</button>
            <button type="button" data-vue="dernier" aria-label="Dernier tour">⏭</button>
          </nav>
          ${etapes.length && !v.trace ? `<nav class="dv-nav dv-etapes">
            <button type="button" data-vue="etape-" aria-label="Action précédente">◁</button>
            <span>${v.etape === 0 ? "début du tour" : `action ${v.etape} / ${etapes.length}`}</span>
            <button type="button" data-vue="etape+" aria-label="Action suivante">▷</button>
          </nav>
          ${etapeTexte ? `<p class="dv-etape-texte">${defaitesEchapper(etapeTexte)}</p>` : ""}` : ""}
          <div class="dv-legende">
            <label><input type="checkbox" data-vue-tracer ${v.tracer ? "checked" : ""}> tracer sur le plateau</label>
            <span>${Object.keys(DEFAITES_TRACES).map(k => `${defaitesVuePastille(k)} ${DEFAITES_TRACES[k].nom}`).join(" ")}</span>
          </div>
          ${traceNom ? `<p class="dv-apercu">${defaitesVuePastille(v.trace.cle)} ${defaitesEchapper(traceNom)}
            <br><button type="button" data-vue="apres">${v.traceApres ? "↺ position de départ" : "▶ position après ce coup"}</button>
            <button type="button" data-vue="sans-apercu">revenir au coup joué</button></p>` : ""}
          <section class="dv-bloc">
            <h3>${defaitesVuePastille("joue")} Ce qui a été joué</h3>
            <p>${defaitesEchapper(joueTexte)}</p>
          </section>
          <section class="dv-bloc">
            <h3>Évaluation de la position (vue par ${defaitesVueNom(perspective)})</h3>
            ${d.ia !== null && d.ia !== undefined && tour.joueur !== d.ia ? `<p class="dv-discret">Votre tour : l’IA juge la position avec vous au trait.
              Comparez-la à vos autres tours, pas aux siens.</p>` : ""}
            <ul class="dv-chiffres">
              <li><span>au début de ce tour</span><b>${defaitesVueSigne(note)}</b></li>
              <li><span>au prochain tour de ${defaitesVueNom(tour.joueur)}</span><b>${defaitesVueSigne(noteSuivante)}${note !== null && noteSuivante !== null
                ? ` <small class="${noteSuivante - note >= 0 ? "dv-plus" : "dv-moins"}">(${defaitesVueSigne(noteSuivante - note)})</small>` : ""}</b></li>
            </ul>
            ${detailDepart ? `<details><summary>Ce qui compose la note</summary>
              <ul class="dv-termes">${defaitesVueTermes(detailDepart.termes, 12)}</ul></details>` : ""}
          </section>
          ${tour.decision ? defaitesVueDetailIA(tour, v.index) : ""}
          <section class="dv-bloc">
            <h3>${defaitesVuePastille("ia")} L’IA d’aujourd’hui à la place de ${defaitesVueNom(tour.joueur)}</h3>
            ${analyse ? `<p>${defaitesEchapper(analyse.planLisible || "ne fait rien")}</p>
                <ul class="dv-chiffres">
                  <li><span>note à la fin du tour</span><b>${defaitesVueSigne(analyse.noteFin)}</b></li>
                  <li><span>après riposte</span><b>${defaitesVueSigne(analyse.noteRobuste)}</b></li>
                </ul>
                <button type="button" data-vue="tracer-analyse">${defaitesVuePastille("ia")} tracer sur le plateau</button>
                ${analyse.finalistes.length > 1 ? `<details class="dv-envisages"><summary>Autres plans envisagés</summary><ol>${
                  analyse.finalistes.map((f, k) => `<li>${defaitesVueSigne(f.note)} · ${defaitesEchapper(f.lisible)}
                    <button type="button" data-vue="tracer-finaliste" data-k="${k}">${defaitesVuePastille("envisage")} tracer</button></li>`).join("")}</ol></details>` : ""}`
              : `<button type="button" data-vue="analyser">Que jouerait l’IA aujourd’hui ?</button>
                 <small class="dv-discret">(une à quelques secondes)</small>`}
          </section>
          ${propositions.length ? `<section class="dv-bloc">
            <h3>${defaitesVuePastille("propose")} Coups proposés pour ce tour</h3>
            ${propositions.map((p, k) => `<div class="dv-proposition">
              <p>${defaitesEchapper((p.actions.length ? p.actions : p.changements).join(" · "))}</p>
              ${p.pourquoi ? `<p class="dv-discret">« ${defaitesEchapper(p.pourquoi)} »</p>` : ""}
              <ul class="dv-chiffres">
                <li><span>votre coup, après riposte</span><b>${defaitesVueSigne(p.vous && p.vous.robuste)}</b></li>
                <li><span>coup joué, après riposte</span><b>${defaitesVueSigne(p.joue && p.joue.robuste)}</b></li>
              </ul>
              ${p.vous && p.joue && p.vous.robuste !== null && p.joue.robuste !== null
                ? `<p class="${p.vous.robuste >= p.joue.robuste ? "dv-plus" : "dv-moins"}">${p.vous.robuste >= p.joue.robuste
                  ? "L’évaluateur de l’IA préfère votre coup." : "L’évaluateur de l’IA préfère le coup joué — s’il a tort, c’est son barème qu’il faut corriger."}</p>` : ""}
              ${p.ecart && p.ecart.length ? `<details><summary>Où les deux coups diffèrent</summary><ul class="dv-termes">${
                p.ecart.map(x => `<li><span>${defaitesEchapper(x.terme)}</span><b class="${x.delta >= 0 ? "dv-plus" : "dv-moins"}">${defaitesVueSigne(x.delta)}</b></li>`).join("")}</ul></details>` : ""}
              <button type="button" data-vue="tracer-proposition" data-k="${k}">${defaitesVuePastille("propose")} tracer votre coup</button>
              ${v.direct && !v.direct.solo ? `<button type="button" data-vue="continuer-proposition" data-k="${k}">▶ Continuer la partie depuis ce coup</button>` : ""}
            </div>`).join("")}
          </section>` : ""}
          <section class="dv-bloc">
            <h3>📝 Votre annotation</h3>
            <div class="dv-etiquettes">${DEFAITES_ETIQUETTES.map(([cle, libelle]) => `<label>
              <input type="checkbox" data-vue-etiquette="${cle}" ${annotation.etiquettes.includes(cle) ? "checked" : ""}> ${libelle}</label>`).join("")}</div>
            <textarea data-vue-annotation rows="2" placeholder="ce que vous remarquez à ce tour">${defaitesEchapper(annotation.texte)}</textarea>
            <button type="button" data-vue="annoter">Enregistrer l’annotation</button>
          </section>
          ${v.texteBrut ? `<section class="dv-bloc"><p class="dv-discret">Copie refusée par le navigateur : sélectionnez le texte.</p>
            <textarea readonly rows="8">${defaitesEchapper(v.texteBrut)}</textarea></section>` : ""}
          <footer class="dv-actions">
            ${tour.actuelle ? "" : `<button type="button" class="dv-principal" data-vue="proposer">✏ Proposer un meilleur coup</button>`}
            <button type="button" data-vue="reprendre">▶ ${v.direct && (tour.actuelle || v.direct.solo) ? "Reprendre la partie" : "Reprendre la partie ici"}</button>
            <button type="button" data-vue="exporter">⤓ Exporter</button>
            ${v.direct ? `<button type="button" data-vue="copier">⧉ Copier le résumé</button>` : ""}
          </footer>
          <p class="dv-discret dv-aide">← → : action par action · Maj + ← → : tour par tour</p>`;
      }

      async function defaitesVueCopierResume() {
        const v = defaitesVue;
        const texte = autopsieResumeRevue();
        let copie = false;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(texte); copie = true; }
        } catch (erreur) { copie = false; }
        if (!copie) {
          const zone = document.createElement("textarea");
          zone.value = texte;
          zone.style.cssText = "position:fixed;left:-9999px;top:0";
          document.body.appendChild(zone);
          zone.select();
          try { copie = document.execCommand("copy"); } catch (erreur) { copie = false; }
          zone.remove();
        }
        if (copie) { v.texteBrut = null; showToast("Résumé copié — collez-le où vous voulez."); }
        else v.texteBrut = texte;
        defaitesVueRendre();
      }

      function defaitesVueExporter() {
        const v = defaitesVue;
        if (!v.direct) { defaitesExporter(v.dossier); return; }
        defaitesTelecharger(v.dossier, defaitesNomFichier("ilyos-revue"));
      }

      async function defaitesVueClic(evenement) {
        const v = defaitesVue;
        if (!v) return;
        const point = evenement.target.closest("[data-vue-index]");
        if (point) { defaitesVueAller(Number(point.dataset.vueIndex)); return; }
        const case_ = evenement.target.closest("[data-vue-tracer]");
        if (case_) { v.tracer = case_.checked; defaitesVueAfficher(v.index, v.etape, { garderTrace: true }); return; }
        const bouton = evenement.target.closest("[data-vue]");
        if (!bouton) return;
        const action = bouton.dataset.vue;
        const tours = defaitesVueTours();
        const tour = tours[v.index];
        const k = Number(bouton.dataset.k);
        if (action === "fermer") defaitesVueFermer();
        else if (action === "premier") defaitesVueAller(tours.findIndex(t => t.etat));
        else if (action === "dernier") defaitesVueAller(tours.length - 1);
        else if (action === "tour-") defaitesVueAller(v.index - 1);
        else if (action === "tour+") defaitesVueAller(v.index + 1);
        else if (action === "etape-") defaitesVueEtape(-1);
        else if (action === "etape+") defaitesVueEtape(1);
        else if (action === "sans-apercu") { v.trace = null; defaitesVueAfficher(v.index, 0); }
        else if (action === "apres") { v.traceApres = !v.traceApres; defaitesVueAfficher(v.index, 0, { garderTrace: true }); }
        else if (action === "analyser") {
          bouton.disabled = true;
          bouton.textContent = "Calcul en cours…";
          await new Promise(r => setTimeout(r, 30));
          try { v.analyses[v.index] = defaitesVueAnalyserIA(v.index); }
          catch (erreur) { console.warn("[ILYOS] visionneuse : analyse impossible", erreur); showToast("Analyse impossible sur cette position."); }
          defaitesVueRendre();
        } else if (action === "tracer-analyse" || action === "tracer-finaliste") {
          const a = v.analyses[v.index];
          if (!a) return;
          const choix = action === "tracer-analyse" ? { plan: a.plan, lisible: a.planLisible, cle: "ia" }
            : { ...(a.finalistes[k] || {}), cle: "envisage" };
          if (!choix.plan) return;
          defaitesVueMontrer({ cle: choix.cle, nom: `${DEFAITES_TRACES[choix.cle].nom} : ${choix.lisible}`, plan: choix.plan,
            elements: defaitesTracePlan(tour.etat, choix.plan, DEFAITES_TRACES[choix.cle].couleur) });
        } else if (action === "tracer-envisage") {
          const p = ((tour.decision || {}).plansExamines || []).filter(x => x.plan && x.plan.length)[k];
          if (!p) return;
          defaitesVueMontrer({ cle: "envisage", nom: `plan envisagé : ${autopsieDecrirePlan(p.plan, tour.etat)}`, plan: p.plan,
            elements: defaitesTracePlan(tour.etat, p.plan, DEFAITES_TRACES.envisage.couleur) });
        } else if (action === "tracer-proposition") {
          const p = (v.dossier.propositions || []).filter(x => x.index === v.index)[k];
          if (!p) return;
          defaitesVueMontrer({ cle: "propose", nom: `votre coup : ${(p.actions.length ? p.actions : p.changements).join(" · ")}`,
            etatApres: p.etatApres, elements: defaitesTraceDiff(tour.etat, p.etatApres, DEFAITES_TRACES.propose.couleur) });
        } else if (action === "continuer-proposition") {
          const p = (v.dossier.propositions || []).filter(x => x.index === v.index)[k];
          defaitesVueContinuerDepuis(p);
        } else if (action === "annoter") {
          const panneau = bouton.closest(".defaites-vue");
          const texte = panneau.querySelector("[data-vue-annotation]").value.trim();
          const etiquettes = [...panneau.querySelectorAll("[data-vue-etiquette]:checked")].map(x => x.dataset.vueEtiquette);
          const annotations = v.dossier.annotations || (v.dossier.annotations = {});
          if (!texte && !etiquettes.length) delete annotations[v.index];
          else annotations[v.index] = { tour: tour.tour, joueur: tour.joueur, texte, etiquettes, date: new Date().toISOString() };
          // IA contre IA : l'annotation rejoint aussi la décision du journal (résumé, export de la revue).
          if (v.direct && Number.isInteger(tour.journalIndex) && ILYOS_AUTOPSIE_JOURNAL[tour.journalIndex]) {
            const e = ILYOS_AUTOPSIE_JOURNAL[tour.journalIndex];
            if (annotations[v.index]) {
              e.annotation = { coupAttendu: texte || etiquettes.join(", "), pourquoi: "", etiquettes, horodatage: annotations[v.index].date };
            } else delete e.annotation;
          }
          await defaitesVueSauver();
          showToast("Annotation enregistrée.");
          defaitesVueRendre();
        } else if (action === "proposer") defaitesVueProposer();
        else if (action === "valider") await defaitesVueValider();
        else if (action === "annuler") defaitesVueAnnulerProposition();
        else if (action === "reprendre") defaitesVueReprendre();
        else if (action === "exporter") defaitesVueExporter();
        else if (action === "copier") await defaitesVueCopierResume();
      }

      /* ---------------------------------------------------------------------
         3. La revue IA contre IA, dans la même visionneuse.

         Pendant une partie automatique avec la revue active, une barre
         discrète remplace l'ancien panneau : elle compte les décisions
         relevées et propose « Pause et analyser ». La pause tombe à la FIN du
         tour en cours (autopsiePause, jamais au milieu : c'est ce qui faisait
         naître des gardiens fantômes) ; on attend qu'elle soit effective et
         que les animations soient vidées avant de toucher au plateau. La
         partie en cours est mise de côté (serializeGameStateForSave) et
         restituée à la fermeture.
         ------------------------------------------------------------------- */

      let revueOuverture = null;

      /* Dossier au format des défaites, bâti depuis le journal de l'autopsie. */
      function revueDossierDirect() {
        const indexJournal = [];
        ILYOS_AUTOPSIE_JOURNAL.forEach((e, i) => { if (e.instantane) indexJournal.push(i); });
        const tours = indexJournal.map(i => {
          const e = ILYOS_AUTOPSIE_JOURNAL[i];
          const a = e.anticipation || {};
          return {
            tour: e.tour, joueur: e.joueur, ia: true, etat: e.instantane, journalIndex: i,
            decision: {
              repli: e.repli, plan: e.plan, planLisible: e.planLisible,
              noteDepart: e.noteDepart, noteArrivee: e.noteArrivee,
              noteRobuste: Number.isFinite(a.noteRobuste) ? a.noteRobuste : null,
              menace: Number.isFinite(a.menace) ? a.menace : null,
              riposte: a.riposte || null, garantie: a.garantie ?? null, examines: a.examines ?? null,
              classement: a.classement || null,
              plansExamines: a.plansExamines || (e.finalistes || []).map(f => ({ plan: f.plan, noteFinTour: f.note, noteRobuste: null })),
              etatsExplores: e.etatsExplores, candidatsGeneres: e.candidatsGeneres,
              coupee: !!(a.principaleCoupee || a.ripostesCoupees)
            }
          };
        });
        tours.push({ tour: state.turn, joueur: state.currentPlayer, ia: true, etat: snapshotState(), actuelle: true });
        const annotations = {};
        tours.forEach((t, k) => {
          const e = Number.isInteger(t.journalIndex) ? ILYOS_AUTOPSIE_JOURNAL[t.journalIndex] : null;
          if (e && e.annotation) {
            annotations[k] = { tour: t.tour, joueur: t.joueur, texte: e.annotation.coupAttendu || "",
              etiquettes: e.annotation.etiquettes || [], date: e.annotation.horodatage };
          }
        });
        // Les coups proposés lors d'une ouverture précédente de la même partie.
        const propositions = ILYOS_CORRECTIONS.filter(c => c.proposition).map(c => {
          const k = tours.findIndex(t => !t.actuelle && t.tour === c.proposition.tour && t.joueur === c.proposition.joueur);
          return k >= 0 ? { ...c.proposition, index: k } : null;
        }).filter(Boolean);
        return {
          jeu: "ILYOS", type: "revue-ia-contre-ia", schema: 1,
          id: `revue-${Date.now().toString(36)}`,
          debut: (ILYOS_AUTOPSIE_JOURNAL[0] || {}).horodatage || null,
          fin: {
            date: new Date().toISOString(), tours: state.turn, manches: state.round,
            vainqueur: state.winner ?? null, scores: state.players.map(j => j.score || 0)
          },
          version: window.ILYOS_BUILD || null,
          bundle: (document.querySelector('script[src*="game.js"]') || {}).src || null,
          regles: defaitesRegles(),
          joueurs: state.players.map(j => ({ id: j.id, nom: j.name, ia: true, difficulte: state.aiDifficulty || null })),
          humain: null, ia: null,
          poids: typeof PLAN_POIDS === "object" ? { ...PLAN_POIDS } : null,
          cadre: serializeGameStateForSave(),
          tours, annotations, propositions,
          analyse: { signales: [] }
        };
      }

      function revueAutoplayEnCours() {
        return typeof ILYOS_AUTOPLAY === "object" && ILYOS_AUTOPLAY && !!ILYOS_AUTOPLAY.active;
      }

      /* Plus aucune IA ne réfléchit ni n'anime : on peut toucher au plateau. */
      function revuePartieAuRepos() {
        if (!state) return false;
        if (revueAutoplayEnCours() || state.aiThinking || state.turnTransitioning) return false;
        try {
          if (kaykit3D && kaykit3D.pendingActionAnimations && kaykit3D.pendingActionAnimations.size) return false;
        } catch (erreur) { /* sans scène 3D, rien n'anime */ }
        return true;
      }

      async function revueOuvrirVisionneuse() {
        if (revueOuverture || defaitesVue || !state) return false;
        revueOuverture = { depuis: Date.now() };
        if (revueAutoplayEnCours()) autopsiePause();
        revueRendre();
        let calme = 0;
        const limite = Date.now() + 30000;
        while (Date.now() < limite) {
          calme = revuePartieAuRepos() ? calme + 1 : 0;
          if (calme >= 3) break;
          await new Promise(r => setTimeout(r, 200));
        }
        revueOuverture = null;
        if (calme < 3) { revueRendre(); showToast("La partie ne s’est pas arrêtée : réessayez."); return false; }
        autopsieViderAnimations();
        if (!ILYOS_AUTOPSIE_JOURNAL.some(e => e.instantane)) {
          revueRendre();
          showToast("Aucune décision relevée pour l’instant.");
          return false;
        }
        const dossier = revueDossierDirect();
        const direct = { cadre: dossier.cadre, visuel: state.visualMode };
        const index = Math.max(0, dossier.tours.length - 2);
        const ok = defaitesVueOuvrir(dossier, index, direct);
        revueRendre();
        return ok;
      }

      /* Remet la partie mise de côté — ou, sur demande, une autre position du
         même fil — sans relancer les IA. */
      function revueRestaurerPartie(v, { etat = null, journal = null } = {}) {
        const restaure = normalizeRestoredState(v.direct.cadre);
        if (!restaure) return false;
        stopTurnTimer();
        aiRunToken++;
        autopsieViderAnimations();
        state = restaure;
        state.onlineMode = false;
        if (etat) applyStateSnapshot(JSON.parse(etat));
        if (Number.isInteger(journal)) ILYOS_AUTOPSIE_JOURNAL.length = journal;
        if (v.direct.solo) {
          /* Partie solo : l'adversaire reste l'IA, et le journal des défaites
             reprend le même fil (il suit l'objet state, remplacé ici). */
          if (v.direct.journal) { v.direct.journal.etatRef = state; defaitesJournal = v.direct.journal; }
        } else {
          state.players.forEach(j => { j.isAI = false; });
        }
        state.undoHistory = [];
        state.inputLocked = false;
        state.aiThinking = false;
        state.turnTransitioning = false;
        autopsieCurseur = -1;
        applyVisualMode(v.direct.visuel || state.visualMode);
        els.setupScreen.classList.add("hidden");
        els.gameScreen.classList.remove("hidden");
        if (typeof syncKayKitScene === "function") syncKayKitScene();
        renderAll();
        if (v.direct.solo) startTurnTimer(true);
        revueRendre();
        return true;
      }

      /* PARTIE SOLO contre l'Expert : la visionneuse sur la partie en cours
         (menu ⚙ → « Revue IA »). Le journal des défaites a déjà chaque tour
         et chaque décision de l'IA ; à la fermeture, la partie reprend là où
         elle était, contre la même IA. */
      function revueDossierSolo(journal) {
        const humain = state.players.find(j => !j.isAI);
        const ia = state.players.find(j => j.isAI);
        const tours = journal.tours.filter(t => t.etat).map(t => ({ ...t }));
        tours.push({ tour: state.turn, joueur: state.currentPlayer, ia: false, etat: snapshotState(), actuelle: true });
        return {
          jeu: "ILYOS", type: "revue-partie-solo", schema: 1,
          id: `revue-${Date.now().toString(36)}`,
          debut: journal.debut,
          fin: {
            date: new Date().toISOString(), tours: state.turn, manches: state.round,
            vainqueur: null, scores: state.players.map(j => j.score || 0)
          },
          version: journal.version, bundle: journal.bundle, regles: journal.regles, joueurs: journal.joueurs,
          humain: humain ? humain.id : null, ia: ia ? ia.id : null,
          reprise: journal.reprise, origine: journal.origine,
          poids: typeof PLAN_POIDS === "object" ? { ...PLAN_POIDS } : null,
          tours, etatFinal: tours[tours.length - 1].etat,
          cadre: serializeGameStateForSave(),
          annotations: {}, propositions: [], analyse: { signales: [] }
        };
      }

      function revueSoloDisponible() {
        return !!(state && !defaitesVue && !revueAutoplayEnCours() && defaitesJournalCourant());
      }

      function revueOuvrirPartieSolo() {
        if (!revueSoloDisponible()) { showToast("La revue IA suit les parties solo contre l’IA Expert."); return false; }
        const joueur = state.players[state.currentPlayer];
        if (!revuePartieAuRepos() || (joueur && joueur.isAI)) {
          showToast("Revue IA disponible à votre tour, quand l’IA a fini de jouer.");
          return false;
        }
        const journal = defaitesJournalCourant();
        if (!journal.tours.some(t => t.decision && t.etat)) {
          showToast("Aucune décision de l’IA relevée pour l’instant.");
          return false;
        }
        const dossier = revueDossierSolo(journal);
        const direct = { cadre: dossier.cadre, visuel: state.visualMode, solo: true, journal };
        // Dernière décision de l'IA : c'est elle qu'on vient de subir.
        let index = dossier.tours.length - 1;
        while (index > 0 && !(dossier.tours[index].decision && dossier.tours[index].etat)) index--;
        return defaitesVueOuvrir(dossier, index, direct);
      }

      document.getElementById("revueIaBtn")?.addEventListener("click", () => {
        closeHudV2Drawer();
        revueOuvrirPartieSolo();
      });
      // Le bouton n'apparaît que dans une partie solo suivie contre l'Expert.
      document.getElementById("hudV2GearBtn")?.addEventListener("click", () => {
        document.getElementById("revueIaBtn")?.classList.toggle("hidden", !revueSoloDisponible());
      });

      function revueBarre() {
        let barre = document.querySelector(".revue-barre");
        if (!barre) {
          barre = document.createElement("aside");
          barre.className = "revue-barre";
          barre.setAttribute("aria-label", "Revue IA");
          document.body.appendChild(barre);
          barre.addEventListener("click", evenement => {
            const bouton = evenement.target.closest("[data-revue]");
            if (!bouton) return;
            const quoi = bouton.dataset.revue;
            if (quoi === "analyser") revueOuvrirVisionneuse();
            else if (quoi === "reprendre") { autopsieReprendre(); revueRendre(); }
            else if (quoi === "fermer") { plannerActiverAutopsie(false); revueRendre();
              if (typeof renderIlyosAutoplayPanel === "function") renderIlyosAutoplayPanel(); }
          });
        }
        return barre;
      }

      /* Remplace l'ancien panneau de la revue (même nom : autopsie.js
         l'appelle à chaque décision relevée). */
      function revueRendre() {
        if (!plannerAutopsieActive()) {
          document.querySelector(".revue-barre")?.remove();
          return;
        }
        const barre = revueBarre();
        const n = ILYOS_AUTOPSIE_JOURNAL.filter(e => e.instantane).length;
        const enCours = revueAutoplayEnCours();
        const finie = state && state.winner !== null && state.winner !== undefined;
        barre.innerHTML = `<b>🧠 REVUE IA</b>
          <span>${n} décision(s) relevée(s) · ${revueOuverture ? "pause à la fin du tour…" : enCours ? "partie en cours" : finie ? "partie terminée" : "partie en pause"}</span>
          <span class="revue-barre-actions">
            <button type="button" data-revue="analyser" ${revueOuverture ? "disabled" : ""}>${enCours ? "⏸ Pause et analyser" : "🔍 Analyser la partie"}</button>
            ${!enCours && !finie && !revueOuverture && state ? `<button type="button" data-revue="reprendre">▶ Reprendre</button>` : ""}
            <button type="button" data-revue="fermer" aria-label="Arrêter la revue">✕</button>
          </span>`;
      }
