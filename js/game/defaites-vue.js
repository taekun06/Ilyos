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
          const resultat = origine.couronne.apply(this, arguments);
          if (resultat && char) {
            defaitesConsignerAction(porteurAvant
              ? `passe la couronne au gardien (${char.r},${char.c})`
              : `ramasse la couronne avec le gardien (${char.r},${char.c})`, porteurAvant ? "TRANSMISSION" : "RAMASSAGE");
          }
          return resultat;
        };
      })();

      /* ---------------------------------------------------------------------
         2. La visionneuse.
         ------------------------------------------------------------------- */

      let defaitesVue = null;

      const DEFAITES_ETIQUETTES = [
        ["erreur-ia", "Erreur de l'IA"],
        ["bon-coup", "Bon coup"],
        ["moment-cle", "Moment clé"],
        ["a-revoir", "À revoir"]
      ];

      /** Étapes d'un tour : actions consignées, ou à défaut (anciens dossiers)
       *  le plan de l'IA, rejouable action par action. */
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

      function defaitesVueAppliquer(tour, etape, { apercu = null, proposition = null } = {}) {
        if (proposition) {
          applyStateSnapshot(JSON.parse(proposition.etatApres));
          return;
        }
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
        if (apercu) {
          for (const action of apercu) {
            try { if (!plannerAppliquerAction(action)) break; } catch (erreur) { break; }
          }
        }
      }

      function defaitesVueAfficher(index, etape = 0, options = {}) {
        const v = defaitesVue;
        const tour = defaitesVueTours()[index];
        if (!v || !tour || !tour.etat) return false;
        v.index = index;
        v.etape = etape;
        v.apercu = options.apercu ? options.apercuNom : null;
        v.propositionVue = options.proposition || null;
        try {
          defaitesVueAppliquer(tour, etape, {
            apercu: options.apercu || null, proposition: options.proposition || null
          });
        } catch (erreur) {
          console.warn("[ILYOS] visionneuse : position illisible", erreur);
        }
        defaitesVueNeutraliser(!!v.sandbox);
        if (typeof syncKayKitScene === "function") syncKayKitScene();
        renderAll();
        defaitesVueRendre();
        return true;
      }

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
        const tour = tours[index], suivant = tours[index + 1];
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
        if (!suivant || !suivant.etat) return null;
        const fin = JSON.parse(suivant.etat);
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

      /* Courbe : ce que l'IA pense de SA position au début de chaque tour. */
      function defaitesVueCalculerCourbe() {
        const v = defaitesVue;
        v.courbe = defaitesVueTours().map(tour => {
          if (!tour.etat) return null;
          try {
            const clone = JSON.parse(tour.etat);
            clone.aiDifficulty = clone.aiDifficulty || "expert";
            return withSimulatedState(clone, () => avecGrilleTerre(() => evaluateStrategicState(v.dossier.ia)));
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
          return {
            joueur: clone.currentPlayer,
            plan: rapport.plan,
            planLisible: autopsieDecrirePlan(rapport.plan, tour.etat),
            noteFin: Math.round(rapport.noteArrivee),
            noteRobuste: Number.isFinite(a.noteRobuste) ? a.noteRobuste : null,
            riposte: a.riposte || [],
            finalistes: (rapport.finalistes || []).slice(0, 4).map(f => ({
              note: Math.round(f.note), lisible: autopsieDecrirePlan(f.plan, tour.etat), plan: f.plan
            }))
          };
        } finally {
          setTestRandomSeed(null);
        }
      }

      async function defaitesVueSauver() {
        try { await defaitesBiblio.mettreAJour(defaitesVue.dossier); }
        catch (erreur) { showToast("Enregistrement impossible dans la bibliothèque."); }
      }

      /* --- Proposer un meilleur coup ------------------------------------- */

      function defaitesVueProposer() {
        const v = defaitesVue;
        if (!v || v.sandbox) return false;
        const tour = defaitesVueTours()[v.index];
        v.sandbox = { index: v.index, avant: tour.etat };
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
        const actions = (revueActionsJouees || []).map(a => a.texte);
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
        let vous = null, joue = null;
        try { vous = defaitesVueNoter(fin, tour.joueur); } catch (erreur) { vous = null; }
        joue = defaitesVueNoteJouee(sb.index);
        const ecart = vous && joue ? (() => {
          const noms = new Set([...vous.termes, ...joue.termes].map(t => t.terme));
          return [...noms].map(nom => {
            const a = (vous.termes.find(t => t.terme === nom) || {}).montant || 0;
            const b = (joue.termes.find(t => t.terme === nom) || {}).montant || 0;
            return { terme: nom, vous: a, joue: b, delta: a - b };
          }).filter(x => x.delta !== 0).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)).slice(0, 8);
        })() : [];
        const proposition = {
          tour: tour.tour,
          index: sb.index,
          joueur: tour.joueur,
          camp: tour.joueur === v.dossier.ia ? "ia" : "humain",
          actions,
          changements: autopsieDiffPositions(sb.avant, fin),
          etatApres: fin,
          vous: vous ? { fin: vous.fin, robuste: vous.robuste, riposte: vous.riposte } : null,
          joue: joue ? { fin: joue.fin, robuste: joue.robuste, riposte: joue.riposte } : null,
          ecart,
          pourquoi: String(pourquoi).trim(),
          date: new Date().toISOString()
        };
        (v.dossier.propositions || (v.dossier.propositions = [])).push(proposition);
        await defaitesVueSauver();
        defaitesVueAfficher(sb.index, 0);
        return proposition;
      }

      /* --- Ouverture, fermeture ------------------------------------------ */

      function defaitesVoir(dossier, index = null) {
        if (!dossier || !dossier.cadre || !(dossier.tours || []).some(t => t.etat)) {
          showToast("Cette défaite ne peut pas être affichée.");
          return false;
        }
        if (dossier.regles && dossier.regles.grille) setBoardSize(dossier.regles.grille);
        const restaure = normalizeRestoredState(dossier.cadre);
        if (!restaure) { showToast("Cette défaite n’est plus compatible avec le jeu."); return false; }
        stopTurnTimer();
        aiRunToken++;
        closeOnlineNetwork(false);
        state = restaure;
        state.onlineMode = false;
        const depart = index !== null && dossier.tours[index] && dossier.tours[index].etat
          ? index : dossier.tours.findIndex(t => t.etat);
        defaitesVue = {
          dossier, index: depart, etape: 0, courbe: [], notesJouees: {}, analyses: {},
          sandbox: null, apercu: null, propositionVue: null, finTour: endTurn
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

      function defaitesVueQuitter() {
        const v = defaitesVue;
        if (!v) return;
        if (v.sandbox) { autopsieEnregistrerActions(false); revueActionsJouees = null; }
        endTurn = v.finTour;
        defaitesVue = null;
        const panneau = document.querySelector(".defaites-vue");
        if (panneau) panneau.remove();
        document.body.classList.remove("defaites-vue-ouverte");
        els.gameScreen.classList.remove("defaites-vue-lecture");
        document.removeEventListener("keydown", defaitesVueClavier);
      }

      function defaitesVueFermer() {
        defaitesVueQuitter();
        resetToSetup();
        defaitesOuvrirBibliotheque();
      }

      function defaitesVueReprendre() {
        const v = defaitesVue;
        if (!v) return;
        const { dossier, index } = v;
        defaitesVueQuitter();
        defaitesRejouer(dossier, index);
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

      function defaitesVueNom(joueur) {
        const v = defaitesVue;
        const j = (v.dossier.joueurs || [])[joueur];
        if (joueur === v.dossier.ia) return "l’IA";
        return j && j.nom ? j.nom : "vous";
      }

      function defaitesVueSigne(n) {
        if (n === null || n === undefined || !Number.isFinite(n)) return "—";
        return (n > 0 ? "+" : "") + Math.round(n).toLocaleString("fr-FR");
      }

      function defaitesVueCourbeSVG() {
        const v = defaitesVue;
        const largeur = 320, hauteur = 74, milieu = hauteur / 2;
        const echelle = x => Math.sign(x) * Math.log10(1 + Math.abs(x) / 100) / Math.log10(1 + 40000 / 100);
        const valeurs = v.courbe;
        const n = valeurs.length;
        if (!n) return "";
        const X = i => 6 + (i * (largeur - 12)) / Math.max(1, n - 1);
        const Y = x => milieu - echelle(x) * (milieu - 6);
        /* L'évaluateur ne juge pas une position pareil selon qui a le trait
           (« qui joue ensuite ») : relier tours IA et tours humains donnait
           des zigzags de ±3 000 sans signification. La ligne ne passe que par
           les tours de l'IA — ce qu'elle pensait au moment de décider ; les
           tours humains restent cliquables, posés sur l'axe. */
        const tours = defaitesVueTours();
        const estIA = i => tours[i].joueur === v.dossier.ia;
        const points = valeurs.map((x, i) => x === null || !estIA(i) ? null : `${X(i).toFixed(1)},${Y(x).toFixed(1)}`).filter(Boolean);
        const signales = new Set((v.dossier.analyse ? v.dossier.analyse.signales : []).map(s => s.tour));
        const marques = tours.map((t, i) => {
          if (valeurs[i] === null) return "";
          const courant = i === v.index;
          const ia = estIA(i);
          const signale = ia && signales.has(t.tour);
          const annote = v.dossier.annotations && v.dossier.annotations[i];
          const classe = courant ? "dv-point-courant" : signale ? "dv-point-signale" : annote ? "dv-point-annote"
            : ia ? "dv-point" : "dv-point-humain";
          const y = ia ? Y(valeurs[i]) : milieu;
          return `<circle class="${classe}" data-vue-index="${i}" cx="${X(i).toFixed(1)}" cy="${y.toFixed(1)}" r="${courant ? 5 : signale ? 4 : 3}"><title>Tour ${t.tour} · ${defaitesVueNom(t.joueur)}${ia ? ` · ${defaitesVueSigne(valeurs[i])}` : ""}</title></circle>`;
        }).join("");
        return `<svg class="dv-courbe" viewBox="0 0 ${largeur} ${hauteur}" role="img"
            aria-label="Confiance de l’IA au début de chaque tour">
          <line class="dv-zero" x1="0" y1="${milieu}" x2="${largeur}" y2="${milieu}"/>
          <polyline class="dv-ligne" points="${points.join(" ")}"/>
          ${marques}
        </svg>`;
      }

      function defaitesVueTermes(termes, max = 6) {
        return (termes || []).slice().sort((a, b) => Math.abs(b.montant) - Math.abs(a.montant)).slice(0, max)
          .map(t => `<li><span>${defaitesEchapper(t.terme)}</span><b class="${t.montant >= 0 ? "dv-plus" : "dv-moins"}">${defaitesVueSigne(t.montant)}</b></li>`)
          .join("");
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
        return `<section class="dv-bloc">
          <h3>🧠 Ce que l’IA a pensé</h3>
          ${d.repli ? `<p class="dv-alerte">Repli sur l’ancienne IA : ${defaitesEchapper(d.repli)}</p>` : ""}
          <ul class="dv-chiffres">
            ${ligne("note au départ", defaitesVueSigne(d.noteDepart))}
            ${ligne("à la fin de son tour", defaitesVueSigne(d.noteArrivee))}
            ${ligne("après la riposte qu’elle craignait", defaitesVueSigne(d.noteRobuste))}
            ${ligne("constaté à son tour suivant", defaitesVueSigne(constate))}
          </ul>
          ${d.riposte && d.riposte.length ? `<p><span class="dv-discret">riposte redoutée :</span>
            ${defaitesEchapper(d.riposte.join(" · "))}${d.garantie ? " (possible avec la seule réserve)" : " (demande une pioche favorable)"}</p>` : ""}
          ${d.classement && d.classement.length > 1 ? `<p><span class="dv-discret">ses meilleurs plans (après riposte) :</span>
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
          panneau.setAttribute("aria-label", "Visionneuse de la défaite");
          document.body.appendChild(panneau);
          panneau.addEventListener("click", defaitesVueClic);
          document.addEventListener("keydown", defaitesVueClavier);
        }
        panneau.classList.remove("defaites-vue-calcul");
        const tours = defaitesVueTours();
        const tour = tours[v.index];
        const d = v.dossier;
        const date = new Date(d.fin.date);
        const etapes = defaitesVueEtapes(tour);

        if (v.sandbox) {
          panneau.innerHTML = `<header class="dv-tete"><b>✏ Votre coup — tour ${tour.tour}</b></header>
            <p>Jouez ce tour à la place de <b>${defaitesVueNom(tour.joueur)}</b>, avec ses cartes, sur le plateau.
              Terminez par « ✓ Valider » (ou « Fin du tour »).</p>
            <label class="dv-etiquette">Pourquoi est-ce meilleur ? (facultatif)
              <textarea data-vue-pourquoi rows="3" placeholder="ex. je bloque son village avant qu’il ne valide"></textarea></label>
            <p class="dv-discret">Votre coup sera noté comme l’IA note les siens : après sa meilleure riposte.
              Il est gardé dans le dossier, l’export et l’analyse.</p>
            <div class="dv-actions">
              <button type="button" class="dv-principal" data-vue="valider">✓ Valider mon coup</button>
              <button type="button" data-vue="annuler">✗ Annuler</button>
            </div>`;
          return;
        }

        const note = v.courbe[v.index];
        const suivantIndex = tours.findIndex((t, i) => i > v.index && t.etat);
        // Même joueur au trait : seule comparaison qui ait un sens (voir la courbe).
        const memeJoueurIndex = tours.findIndex((t, i) => i > v.index && t.etat && t.joueur === tour.joueur);
        const noteSuivante = memeJoueurIndex >= 0 ? v.courbe[memeJoueurIndex] : null;
        const etapeTexte = v.etape > 0 && etapes[v.etape - 1] ? etapes[v.etape - 1].texte : null;
        const joueTexte = tour.decision && tour.decision.planLisible
          ? tour.decision.planLisible
          : (suivantIndex >= 0 ? autopsieDiffPositions(tour.etat, tours[suivantIndex].etat).join(" · ") : "fin de la partie");
        let detailDepart = null;
        try {
          const clone = JSON.parse(tour.etat);
          clone.aiDifficulty = clone.aiDifficulty || "expert";
          detailDepart = withSimulatedState(clone, () => avecGrilleTerre(() => evaluerAvecDetail(d.ia)));
        } catch (erreur) { detailDepart = null; }
        const analyse = v.analyses[v.index];
        const propositions = (d.propositions || []).filter(p => p.index === v.index);
        const annotation = (d.annotations || {})[v.index] || { texte: "", etiquettes: [] };

        panneau.innerHTML = `
          <header class="dv-tete">
            <div><b>Partie du ${date.toLocaleDateString("fr-FR")}</b>
              <small>${defaitesEchapper(defaitesVueNom(d.humain))} ${d.fin.scores[d.humain]}-${d.fin.scores[d.ia]} IA Expert · ${d.fin.tours} tours</small></div>
            <button type="button" data-vue="fermer" aria-label="Fermer la visionneuse">✕</button>
          </header>
          <div class="dv-courbe-bloc">
            <small class="dv-discret">Confiance de l’IA au début de chaque tour (au-dessus : elle pense mener) —
              cliquez un point. <span class="dv-leg-signale">●</span> tour signalé</small>
            ${defaitesVueCourbeSVG()}
          </div>
          <nav class="dv-nav">
            <button type="button" data-vue="premier" aria-label="Premier tour">⏮</button>
            <button type="button" data-vue="tour-" aria-label="Tour précédent">◀</button>
            <span><b>Tour ${tour.tour}</b> · ${defaitesVueNom(tour.joueur)}</span>
            <button type="button" data-vue="tour+" aria-label="Tour suivant">▶</button>
            <button type="button" data-vue="dernier" aria-label="Dernier tour">⏭</button>
          </nav>
          ${etapes.length ? `<nav class="dv-nav dv-etapes">
            <button type="button" data-vue="etape-" aria-label="Action précédente">◁</button>
            <span>${v.etape === 0 ? "début du tour" : `action ${v.etape} / ${etapes.length}`}</span>
            <button type="button" data-vue="etape+" aria-label="Action suivante">▷</button>
          </nav>
          ${etapeTexte ? `<p class="dv-etape-texte">${defaitesEchapper(etapeTexte)}</p>` : ""}` : ""}
          ${v.apercu ? `<p class="dv-apercu">Aperçu sur le plateau : ${defaitesEchapper(v.apercu)}
            <button type="button" data-vue="sans-apercu">revenir au coup joué</button></p>` : ""}
          ${v.propositionVue ? `<p class="dv-apercu">Aperçu : votre coup proposé
            <button type="button" data-vue="sans-apercu">revenir au coup joué</button></p>` : ""}
          <section class="dv-bloc">
            <h3>Ce qui a été joué</h3>
            <p>${defaitesEchapper(joueTexte)}</p>
          </section>
          <section class="dv-bloc">
            <h3>Évaluation de la position (vue par l’IA)</h3>
            ${tour.joueur !== d.ia ? `<p class="dv-discret">Votre tour : l’IA juge la position avec vous au trait.
              Comparez-la à vos autres tours, pas aux siens.</p>` : ""}
            <ul class="dv-chiffres">
              <li><span>au début de ce tour</span><b>${defaitesVueSigne(note)}</b></li>
              <li><span>au prochain tour de ${defaitesVueNom(tour.joueur)}</span><b>${defaitesVueSigne(noteSuivante)}${note !== null && noteSuivante !== null
                ? ` <small class="${noteSuivante - note >= 0 ? "dv-plus" : "dv-moins"}">(${defaitesVueSigne(noteSuivante - note)})</small>` : ""}</b></li>
            </ul>
            ${detailDepart ? `<details><summary>Ce qui compose la note</summary>
              <ul class="dv-termes">${defaitesVueTermes(detailDepart.termes, 12)}</ul></details>` : ""}
          </section>
          ${tour.joueur === d.ia ? defaitesVueDetailIA(tour, v.index) : ""}
          <section class="dv-bloc">
            <h3>🔍 L’IA d’aujourd’hui à la place de ${defaitesVueNom(tour.joueur)}</h3>
            ${analyse ? `<p>${defaitesEchapper(analyse.planLisible || "ne fait rien")}</p>
                <ul class="dv-chiffres">
                  <li><span>note à la fin du tour</span><b>${defaitesVueSigne(analyse.noteFin)}</b></li>
                  <li><span>après riposte</span><b>${defaitesVueSigne(analyse.noteRobuste)}</b></li>
                </ul>
                ${analyse.finalistes.length > 1 ? `<details><summary>Autres plans envisagés</summary><ol class="dv-finalistes">${
                  analyse.finalistes.map((f, k) => `<li>${defaitesVueSigne(f.note)} · ${defaitesEchapper(f.lisible)}
                    <button type="button" data-vue="voir-finaliste" data-k="${k}">voir</button></li>`).join("")}</ol></details>` : ""}
                <button type="button" data-vue="voir-analyse">👁 Voir ce coup sur le plateau</button>`
              : `<button type="button" data-vue="analyser">Que jouerait l’IA aujourd’hui ?</button>
                 <small class="dv-discret">(une à quelques secondes)</small>`}
          </section>
          ${propositions.length ? `<section class="dv-bloc">
            <h3>✏ Coups proposés pour ce tour</h3>
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
              <button type="button" data-vue="voir-proposition" data-k="${k}">👁 Voir votre coup</button>
            </div>`).join("")}
          </section>` : ""}
          <section class="dv-bloc">
            <h3>📝 Votre annotation</h3>
            <div class="dv-etiquettes">${DEFAITES_ETIQUETTES.map(([cle, libelle]) => `<label>
              <input type="checkbox" data-vue-etiquette="${cle}" ${annotation.etiquettes.includes(cle) ? "checked" : ""}> ${libelle}</label>`).join("")}</div>
            <textarea data-vue-annotation rows="2" placeholder="ce que vous remarquez à ce tour">${defaitesEchapper(annotation.texte)}</textarea>
            <button type="button" data-vue="annoter">Enregistrer l’annotation</button>
          </section>
          <footer class="dv-actions">
            <button type="button" class="dv-principal" data-vue="proposer">✏ Proposer un meilleur coup</button>
            <button type="button" data-vue="reprendre">▶ Reprendre la partie ici</button>
          </footer>
          <p class="dv-discret dv-aide">← → : action par action · Maj + ← → : tour par tour</p>`;
      }

      async function defaitesVueClic(evenement) {
        const v = defaitesVue;
        if (!v) return;
        const point = evenement.target.closest("[data-vue-index]");
        if (point) { defaitesVueAller(Number(point.dataset.vueIndex)); return; }
        const bouton = evenement.target.closest("[data-vue]");
        if (!bouton) return;
        const action = bouton.dataset.vue;
        const tours = defaitesVueTours();
        const k = Number(bouton.dataset.k);
        if (action === "fermer") defaitesVueFermer();
        else if (action === "premier") defaitesVueAller(tours.findIndex(t => t.etat));
        else if (action === "dernier") defaitesVueAller(tours.length - 1);
        else if (action === "tour-") defaitesVueAller(v.index - 1);
        else if (action === "tour+") defaitesVueAller(v.index + 1);
        else if (action === "etape-") defaitesVueEtape(-1);
        else if (action === "etape+") defaitesVueEtape(1);
        else if (action === "sans-apercu") defaitesVueAfficher(v.index, v.etape);
        else if (action === "analyser") {
          bouton.disabled = true;
          bouton.textContent = "Calcul en cours…";
          await new Promise(r => setTimeout(r, 30));
          try { v.analyses[v.index] = defaitesVueAnalyserIA(v.index); }
          catch (erreur) { console.warn("[ILYOS] visionneuse : analyse impossible", erreur); showToast("Analyse impossible sur cette position."); }
          defaitesVueRendre();
        } else if (action === "voir-analyse" || action === "voir-finaliste") {
          const a = v.analyses[v.index];
          if (!a) return;
          const plan = action === "voir-analyse" ? a.plan : (a.finalistes[k] || {}).plan;
          const nom = action === "voir-analyse" ? a.planLisible : (a.finalistes[k] || {}).lisible;
          if (plan) defaitesVueAfficher(v.index, 0, { apercu: plan, apercuNom: nom });
        } else if (action === "voir-proposition") {
          const p = (v.dossier.propositions || []).filter(x => x.index === v.index)[k];
          if (p) defaitesVueAfficher(v.index, 0, { proposition: p });
        } else if (action === "annoter") {
          const panneau = bouton.closest(".defaites-vue");
          const texte = panneau.querySelector("[data-vue-annotation]").value.trim();
          const etiquettes = [...panneau.querySelectorAll("[data-vue-etiquette]:checked")].map(x => x.dataset.vueEtiquette);
          const annotations = v.dossier.annotations || (v.dossier.annotations = {});
          if (!texte && !etiquettes.length) delete annotations[v.index];
          else annotations[v.index] = { tour: tours[v.index].tour, joueur: tours[v.index].joueur, texte, etiquettes, date: new Date().toISOString() };
          await defaitesVueSauver();
          showToast("Annotation enregistrée.");
          defaitesVueRendre();
        } else if (action === "proposer") defaitesVueProposer();
        else if (action === "valider") await defaitesVueValider();
        else if (action === "annuler") defaitesVueAnnulerProposition();
        else if (action === "reprendre") defaitesVueReprendre();
      }
