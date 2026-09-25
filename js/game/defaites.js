
      /* =====================================================================
         DÉFAITES DE L'IA EXPERT — jouer, gagner, exporter en un clic

         L'autopsie explique UNE décision qu'on a déjà repérée ; il faut penser
         à l'activer, suivre la partie, désigner le tour fautif. Ce module fait
         l'inverse : il enregistre SEUL toute partie humain contre Expert, et
         quand l'humain gagne, la défaite entière part dans une bibliothèque du
         navigateur et s'exporte d'un clic. C'est l'analyse qui désigne ensuite
         les tours intéressants — pas le joueur.

         Coût en partie : un instantané par tour (≈ 8 Ko, 0,02 ms, mesuré) et
         la version légère du rapport que le planner produit de toute façon.
         Rien de ce qui rend l'autopsie chère (décompositions de score,
         candidats écartés) n'est calculé ici : on le recalcule après coup, sur
         les seules positions retenues (scripts/analyser-defaite.js).

         Ce module ne modifie jamais l'état du jeu, sauf sur demande explicite
         (« Rejouer depuis ce tour »), par le même chemin que la reprise d'une
         partie sauvegardée.
         ===================================================================== */

      const DEFAITES_MAX = 12;
      const DEFAITES_TOURS_MAX = 400;
      /* Seuils du récapitulatif, en points de l'évaluateur (une couronne
         validée vaut 4 000). Ce sont des signaux pour choisir quoi regarder,
         jamais un verdict : une IA peut perdre une position gagnée par un
         coup parfait de l'adversaire. */
      const DEFAITES_SEUILS = {
        surprise: 800,       // prévu (après riposte) − constaté au tour suivant
        bascule: 1500,       // note de départ − note au tour suivant
        serre: 120,          // écart entre les deux meilleurs plans après riposte
        peuExplore: 40       // états explorés
      };

      let defaitesJournal = null;
      let defaitesDerniere = null;

      /* Une partie compte si un humain y affronte un Expert, en local, hors
         tutoriel, puzzle, simulation et parties automatiques. */
      function defaitesPartieSuivie() {
        if (!state || state.onlineMode || state.tutorial || state.puzzle) return false;
        if (typeof ilyosSimulationActive !== "undefined" && ilyosSimulationActive) return false;
        try { if (ILYOS_AUTOPLAY && ILYOS_AUTOPLAY.active) return false; } catch (erreur) { /* harnais absent */ }
        const joueurs = state.players || [];
        return joueurs.some(j => !j.isAI) && joueurs.some(j => j.isAI && j.aiDifficulty === "expert");
      }

      function defaitesRegles() {
        return {
          grille: typeof GRID === "number" ? GRID : null,
          formesParJoueur: typeof shapeLimitPerOwner === "function" ? shapeLimitPerOwner() : null,
          reserveParType: (window.ILYOS_REGLES_RESERVE || {}).parType ?? null,
          optionsPartie: state && state.rules ? { ...state.rules } : null,
          depart: state ? state.startingBoardMode || null : null,
          preset: state ? state.startingBoardPreset || null : null
        };
      }

      /* Le journal suit l'OBJET state : une nouvelle partie, une reprise ou un
         rejeu remplacent cet objet, et un nouveau journal commence. */
      function defaitesJournalCourant() {
        if (!defaitesPartieSuivie()) return null;
        if (defaitesJournal && defaitesJournal.etatRef === state) return defaitesJournal;
        const origine = defaitesJournal && defaitesJournal.prochaineOrigine;
        defaitesJournal = {
          etatRef: state,
          id: `defaite-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
          debut: new Date().toISOString(),
          debutMs: Date.now(),
          version: window.ILYOS_BUILD || null,
          bundle: (document.querySelector('script[src*="game.js"]') || {}).src || null,
          regles: defaitesRegles(),
          joueurs: state.players.map(j => ({
            id: j.id, nom: j.name, ia: !!j.isAI, difficulte: j.aiDifficulty || null
          })),
          // Une partie reprise en cours de route n'a pas ses premiers tours.
          reprise: (state.turn || 1) > 1,
          origine: origine || null,
          tours: []
        };
        return defaitesJournal;
      }

      function defaitesInstantane() {
        if (!defaitesJournalCourant()) return null;
        try { return snapshotState(); } catch (erreur) { return null; }
      }

      function defaitesEntreeTour(journal, joueur) {
        const derniere = journal.tours[journal.tours.length - 1];
        if (derniere && derniere.tour === state.turn && derniere.joueur === joueur) return derniere;
        const entree = { tour: state.turn, joueur, ia: !!(state.players[joueur] || {}).isAI, etat: null };
        journal.tours.push(entree);
        if (journal.tours.length > DEFAITES_TOURS_MAX) journal.tours.shift();
        return entree;
      }

      /** Début de tour (turns.js) : la position que le joueur a devant lui. */
      function defaitesDebutTour() {
        try {
          const journal = defaitesJournalCourant();
          if (!journal) return;
          const entree = defaitesEntreeTour(journal, state.currentPlayer);
          entree.etat = snapshotState();
        } catch (erreur) {
          console.warn("[ILYOS] journal des défaites : début de tour non consigné", erreur);
        }
      }

      /** Décision Expert (ai.js) : la version légère du rapport, déjà calculée. */
      function defaitesDecision(joueur, instantane, rapport, repli = null) {
        try {
          const journal = defaitesJournalCourant();
          if (!journal) return;
          const entree = defaitesEntreeTour(journal, joueur);
          // L'instantané de décision prime : il est pris juste avant le calcul.
          if (instantane) entree.etat = instantane;
          const a = (rapport && rapport.anticipation) || {};
          entree.decision = {
            repli,
            plan: rapport && rapport.plan ? rapport.plan.map(x => ({ ...x })) : [],
            planLisible: rapport ? autopsieDecrirePlan(rapport.plan, entree.etat) : null,
            noteDepart: rapport ? Math.round(rapport.noteDepart) : null,
            noteArrivee: rapport ? Math.round(rapport.noteArrivee) : null,
            noteRobuste: Number.isFinite(a.noteRobuste) ? a.noteRobuste : null,
            menace: Number.isFinite(a.menace) ? a.menace : null,
            riposte: a.riposte || null,
            garantie: a.garantie ?? null,
            examines: a.examines ?? null,
            classement: a.classement || null,
            etatsExplores: rapport ? rapport.etatsExplores ?? null : null,
            // Recherche arrêtée par un plafond de temps : décision non reproductible.
            coupee: !!(a.principaleCoupee || a.ripostesCoupees),
            candidatsGeneres: rapport ? rapport.candidatsGeneres ?? null : null,
            profondeur: rapport ? rapport.profondeurAtteinte ?? null : null,
            dureeMs: rapport ? rapport.dureeTotaleMs ?? rapport.dureeMs ?? null : null
          };
        } catch (erreur) {
          console.warn("[ILYOS] journal des défaites : décision non consignée", erreur);
        }
      }

      /* ---------------------------------------------------------------------
         Analyse : repérer ce qui mérite d'être regardé, sans juger.
         ------------------------------------------------------------------- */

      function defaitesLire(etat) {
        if (!etat) return null;
        try { return typeof etat === "string" ? JSON.parse(etat) : etat; } catch (erreur) { return null; }
      }

      function defaitesPorteur(etat, joueur) {
        return (etat.characters || []).find(g => g.player === joueur
          && [etat.artifact, etat.secondArtifact].some(a => a && a.active && a.carrierId === g.id)) || null;
      }

      function defaitesDistanceValidation(etat, joueur, r, c) {
        const cellules = crownValidationCellsForPlayer((etat.players || [])[joueur]);
        if (!cellules.length) return Infinity;
        return Math.min(...cellules.map(([vr, vc]) => Math.abs(vr - r) + Math.abs(vc - c)));
      }

      function defaitesAnalyser(dossier) {
        const ia = dossier.ia, humain = dossier.humain;
        const tours = dossier.tours || [];
        const decisions = tours.map((t, i) => ({ t, i })).filter(x => x.t.ia && x.t.joueur === ia && x.t.decision);
        const signales = [];

        decisions.forEach(({ t, i }, k) => {
          const d = t.decision;
          const suivante = decisions[k + 1] ? decisions[k + 1].t : null;
          const A = defaitesLire(t.etat);
          const tourHumain = tours.slice(i + 1).find(x => x.joueur === humain) || null;
          const B = suivante ? defaitesLire(suivante.etat) : defaitesLire(dossier.etatFinal);
          const raisons = [];
          let gravite = 0;

          const prevu = d.noteRobuste ?? d.noteArrivee;
          const constate = suivante && suivante.decision ? suivante.decision.noteDepart : null;
          if (Number.isFinite(prevu) && Number.isFinite(constate)) {
            const surprise = prevu - constate;
            if (surprise >= DEFAITES_SEUILS.surprise) {
              raisons.push(`menace humaine non anticipée (prévu ${prevu}, constaté ${constate})`);
              gravite += surprise;
            }
          }
          if (Number.isFinite(d.noteDepart) && Number.isFinite(constate)) {
            const chute = d.noteDepart - constate;
            if (chute >= DEFAITES_SEUILS.bascule) {
              raisons.push(`forte bascule (${d.noteDepart} → ${constate})`);
              gravite += chute / 2;
            }
          }
          if (A && B) {
            const scoreA = j => ((A.players || [])[j] || {}).score || 0;
            const scoreB = j => ((B.players || [])[j] || {}).score || 0;
            const idsB = new Set((B.characters || []).map(g => g.id));
            const perdus = (A.characters || []).filter(g => g.player === ia && !idsB.has(g.id)).length
              - Math.max(0, scoreB(ia) - scoreA(ia));
            if (perdus > 0) {
              raisons.push(`${perdus} gardien(s) IA perdu(s) avant sa décision suivante`);
              gravite += 900 * perdus;
            }
            if (scoreB(humain) > scoreA(humain)) {
              raisons.push(`l'humain marque (${scoreA(humain)} → ${scoreB(humain)})`);
              gravite += 2500;
            }
            const porteurH = defaitesPorteur(B, humain);
            if (porteurH && scoreB(humain) === scoreA(humain)
              && defaitesDistanceValidation(B, humain, porteurH.r, porteurH.c) <= 1) {
              raisons.push("un porteur humain arrive au bord de la validation");
              gravite += 1200;
            }
          }
          if (d.repli) { raisons.push(`repli : ${d.repli}`); gravite += 1500; }
          if (d.coupee) { raisons.push("recherche coupée par le temps (machine lente)"); gravite += 400; }
          // Écart NUL : deux finalistes menant à la même position, pas un choix serré.
          const ecartTete = Array.isArray(d.classement) && d.classement.length > 1
            ? Math.abs(d.classement[0] - d.classement[1]) : Infinity;
          if (ecartTete > 0 && ecartTete <= DEFAITES_SEUILS.serre) {
            raisons.push(`finalistes à égalité (${d.classement[0]} / ${d.classement[1]})`);
            gravite += 200;
          }
          if (Number.isFinite(d.etatsExplores) && d.etatsExplores < DEFAITES_SEUILS.peuExplore && !d.repli) {
            raisons.push(`peu d'états examinés (${d.etatsExplores})`);
            gravite += 300;
          }
          if (A) {
            const porteurIA = defaitesPorteur(A, ia), porteurH = defaitesPorteur(A, humain);
            if (porteurIA || (porteurH && defaitesDistanceValidation(A, humain, porteurH.r, porteurH.c) <= 3)) {
              raisons.push(porteurIA ? "l'IA porte une couronne" : "porteur humain près de son village");
              if (raisons.length > 1) gravite += 150;
            }
          }
          if (!suivante) { raisons.push("dernière décision avant la défaite"); gravite += 1000; }

          // Une position « chaude » seule n'est pas un signal : il faut autre chose.
          const fortes = raisons.filter(r => !/porte une couronne|près de son village/.test(r));
          if (!fortes.length) return;
          signales.push({
            index: i,
            tour: t.tour,
            gravite: Math.round(gravite),
            raisons,
            planIA: d.planLisible,
            suiteHumaine: tourHumain && tourHumain.etat && B
              ? autopsieDiffPositions(tourHumain.etat, B) : null
          });
        });

        const principaux = signales.slice().sort((x, y) => y.gravite - x.gravite).slice(0, 8)
          .sort((x, y) => x.tour - y.tour);
        const nomHumain = ((dossier.joueurs || [])[humain] || {}).nom || "humain";
        const lignes = [`Défaite Expert — ${dossier.fin ? dossier.fin.tours : "?"} tours, `
          + `${nomHumain} ${dossier.fin ? dossier.fin.scores[humain] : "?"}-${dossier.fin ? dossier.fin.scores[ia] : "?"}`];
        principaux.forEach(s => lignes.push(`• Tour ${s.tour} : ${s.raisons.join(" ; ")}`));
        if (!principaux.length) lignes.push("• Aucun tour ne se détache nettement.");
        return {
          decisions: decisions.length,
          seuils: { ...DEFAITES_SEUILS },
          signales: principaux,
          tousSignales: signales.length,
          resume: lignes.join("\n")
        };
      }

      /* ---------------------------------------------------------------------
         Fin de partie : fermer le dossier, l'archiver, proposer l'export.
         ------------------------------------------------------------------- */

      function defaitesFermer(vainqueur) {
        const journal = defaitesJournal;
        if (!journal || journal.etatRef !== state || !vainqueur) return null;
        const humain = vainqueur.id;
        const perdant = state.players.find(j => j.id !== humain);
        if (vainqueur.isAI || !perdant || !perdant.isAI || perdant.aiDifficulty !== "expert") return null;
        let cadre = null;
        try { cadre = serializeGameStateForSave(); } catch (erreur) { cadre = null; }
        const dossier = {
          jeu: "ILYOS",
          type: "defaite-expert",
          schema: 1,
          id: journal.id,
          debut: journal.debut,
          fin: {
            date: new Date().toISOString(),
            dureeMin: Math.round((Date.now() - journal.debutMs) / 60000),
            tours: state.turn,
            manches: state.round,
            vainqueur: humain,
            scores: state.players.map(j => j.score || 0)
          },
          version: journal.version,
          bundle: journal.bundle,
          regles: journal.regles,
          joueurs: journal.joueurs,
          humain,
          ia: perdant.id,
          reprise: journal.reprise,
          origine: journal.origine,
          poids: typeof PLAN_POIDS === "object" ? { ...PLAN_POIDS } : null,
          tours: journal.tours.map(t => ({ ...t })),
          etatFinal: (() => { try { return snapshotState(); } catch (erreur) { return null; } })(),
          // État complet de reprise : c'est lui qui permet « Rejouer depuis ».
          cadre
        };
        journal.etatRef = null;
        return dossier;
      }

      /** Appelé par showVictory / showEgalite (ui.js). */
      function defaitesFinPartie(vainqueur) {
        let dossier = null;
        try { dossier = vainqueur ? defaitesFermer(vainqueur) : null; } catch (erreur) {
          console.warn("[ILYOS] journal des défaites : dossier non fermé", erreur);
        }
        defaitesDerniere = dossier;
        defaitesRendreVictoire(dossier);
        if (!dossier) return;
        defaitesBiblio.enregistrer(dossier).then(nombre => {
          defaitesRendreVictoire(dossier, nombre);
          defaitesMajAcces();
        }).catch(erreur => console.warn("[ILYOS] bibliothèque des défaites indisponible", erreur));
      }

      /* ---------------------------------------------------------------------
         Bibliothèque : IndexedDB (un dossier ≈ 0,5 Mo — localStorage, limité
         à ~5 Mo, saturerait vers dix parties). Repli en mémoire si bloqué.
         ------------------------------------------------------------------- */

      const defaitesBiblio = (() => {
        const BASE = "ilyos-defaites", MAGASIN = "defaites";
        let base = null;
        const memoire = new Map();
        const ouvrir = () => {
          if (base) return base;
          base = new Promise((resoudre, rejeter) => {
            if (!window.indexedDB) { rejeter(new Error("IndexedDB absent")); return; }
            const req = indexedDB.open(BASE, 1);
            req.onupgradeneeded = () => {
              if (!req.result.objectStoreNames.contains(MAGASIN)) req.result.createObjectStore(MAGASIN, { keyPath: "id" });
            };
            req.onsuccess = () => resoudre(req.result);
            req.onerror = () => rejeter(req.error);
          }).catch(erreur => { console.warn("[ILYOS] bibliothèque en mémoire seulement", erreur); return null; });
          return base;
        };
        const requete = (mode, fn) => ouvrir().then(db => new Promise((resoudre, rejeter) => {
          if (!db) { resoudre(fn(null)); return; }
          const tx = db.transaction(MAGASIN, mode);
          const resultat = fn(tx.objectStore(MAGASIN));
          tx.oncomplete = () => resoudre(resultat && "result" in resultat ? resultat.result : resultat);
          tx.onerror = () => rejeter(tx.error);
        }));
        const tout = () => requete("readonly", m => m ? m.getAll() : [...memoire.values()]);
        const resume = d => ({
          id: d.id, date: d.fin.date, tours: d.fin.tours, dureeMin: d.fin.dureeMin,
          scores: d.fin.scores, humain: d.humain, ia: d.ia,
          nomHumain: ((d.joueurs || [])[d.humain] || {}).nom || "Joueur",
          epinglee: !!d.epinglee, signales: d.analyse ? d.analyse.signales.map(s => s.tour) : [],
          version: d.version
        });
        return {
          async enregistrer(dossier) {
            if (!dossier.analyse) dossier.analyse = defaitesAnalyser(dossier);
            await requete("readwrite", m => m ? m.put(dossier) : memoire.set(dossier.id, dossier));
            // Au-delà du plafond, les plus anciennes NON épinglées partent.
            const toutes = (await tout()).sort((a, b) => String(a.fin.date).localeCompare(String(b.fin.date)));
            let exces = toutes.length - DEFAITES_MAX;
            for (const d of toutes) {
              if (exces <= 0) break;
              if (d.epinglee || d.id === dossier.id) continue;
              await this.supprimer(d.id);
              exces--;
            }
            return (await tout()).length;
          },
          async lister() {
            return (await tout()).map(resume).sort((a, b) => String(b.date).localeCompare(String(a.date)));
          },
          lire: id => requete("readonly", m => m ? m.get(id) : memoire.get(id)),
          supprimer: id => requete("readwrite", m => m ? m.delete(id) : memoire.delete(id)),
          async epingler(id, oui) {
            const d = await this.lire(id);
            if (!d) return false;
            d.epinglee = !!oui;
            await requete("readwrite", m => m ? m.put(d) : memoire.set(d.id, d));
            return true;
          }
        };
      })();

      function defaitesTelecharger(contenu, nom) {
        const lien = document.createElement("a");
        lien.href = URL.createObjectURL(new Blob([JSON.stringify(contenu)], { type: "application/json" }));
        lien.download = nom;
        document.body.appendChild(lien);
        lien.click();
        setTimeout(() => { URL.revokeObjectURL(lien.href); lien.remove(); }, 1000);
      }

      function defaitesNomFichier(prefixe, date = new Date()) {
        const d = new Date(date);
        const deux = n => String(n).padStart(2, "0");
        return `${prefixe}-${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`
          + `-${deux(d.getHours())}h${deux(d.getMinutes())}.json`;
      }

      function defaitesExporter(dossier) {
        if (!dossier) return null;
        if (!dossier.analyse) dossier.analyse = defaitesAnalyser(dossier);
        defaitesTelecharger(dossier, defaitesNomFichier("ilyos-defaite", dossier.fin.date));
        return dossier.analyse;
      }

      async function defaitesExporterLot(ids) {
        const dossiers = (await Promise.all(ids.map(id => defaitesBiblio.lire(id)))).filter(Boolean);
        if (!dossiers.length) return 0;
        defaitesTelecharger({ jeu: "ILYOS", type: "lot-defaites-expert", schema: 1,
          exporte: new Date().toISOString(), defaites: dossiers }, defaitesNomFichier("ilyos-defaites-lot"));
        return dossiers.length;
      }

      /* ---------------------------------------------------------------------
         Rejouer : remettre la position d'un tour en jeu, humain contre Expert,
         par le chemin de « Reprendre une partie sauvegardée ».
         ------------------------------------------------------------------- */

      function defaitesRejouer(dossier, index) {
        const tour = (dossier.tours || [])[index];
        if (!tour || !tour.etat || !dossier.cadre) { showToast("Position indisponible."); return false; }
        if (dossier.regles && dossier.regles.grille) setBoardSize(dossier.regles.grille);
        const restaure = normalizeRestoredState(dossier.cadre);
        if (!restaure) { showToast("Cette défaite n’est plus compatible avec le jeu."); return false; }
        stopTurnTimer();
        aiRunToken++;
        closeOnlineNetwork(false);
        state = restaure;
        state.onlineMode = false;
        applyStateSnapshot(JSON.parse(tour.etat));
        state.winner = null;
        state.undoHistory = [];
        state.inputLocked = false;
        state.aiThinking = false;
        state.turnTransitioning = false;
        // Le journal qui s'ouvre saura d'où vient cette partie.
        defaitesJournal = { prochaineOrigine: { defaite: dossier.id, tour: tour.tour } };
        applyVisualMode(state.visualMode);
        els.victoryModal.classList.add("hidden");
        els.victoryModal.classList.remove("victory-visible");
        defaitesFermerBibliotheque();
        els.setupScreen.classList.add("hidden");
        els.gameScreen.classList.remove("hidden");
        els.gameScreen.classList.toggle("ai-turn", isCurrentPlayerAI());
        if (typeof syncKayKitScene === "function") syncKayKitScene();
        renderAll();
        startAmbient();
        startTurnTimer(true);
        defaitesDebutTour();
        showToast(`Position du tour ${tour.tour} reprise.`);
        if (isCurrentPlayerAI()) {
          const token = ++aiRunToken;
          setTimeout(() => runAITurn(token), 500);
        }
        return true;
      }

      /* ---------------------------------------------------------------------
         Interface : écran de fin, bibliothèque, accès depuis la configuration.
         ------------------------------------------------------------------- */

      function defaitesEchapper(texte) {
        return String(texte == null ? "" : texte)
          .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      }

      function defaitesRendreVictoire(dossier, nombre = null) {
        const carte = els.victoryModal && els.victoryModal.querySelector(".victory-card");
        if (!carte) return;
        let bloc = carte.querySelector(".defaite-ia");
        if (!dossier) { if (bloc) bloc.remove(); return; }
        if (!bloc) {
          bloc = document.createElement("div");
          bloc.className = "defaite-ia";
          const actions = carte.querySelector(".modal-actions");
          carte.insertBefore(bloc, actions || null);
        }
        const signales = dossier.analyse ? dossier.analyse.signales.length : 0;
        bloc.innerHTML = `
          <button type="button" class="defaite-ia-analyser">🧠 Analyser cette défaite de l’IA</button>
          <small class="defaite-ia-etat">${nombre === null
            ? "Enregistrement dans la bibliothèque…"
            : `Enregistrée dans la bibliothèque des défaites · ${signales} tour(s) à regarder`}</small>
          <button type="button" class="secondary-btn defaite-ia-biblio">📚 Bibliothèque des défaites</button>
          <pre class="defaite-ia-resume" hidden></pre>`;
        bloc.querySelector(".defaite-ia-analyser").addEventListener("click", () => {
          const analyse = defaitesExporter(dossier);
          const resume = bloc.querySelector(".defaite-ia-resume");
          if (analyse && resume) { resume.textContent = analyse.resume; resume.hidden = false; }
        });
        bloc.querySelector(".defaite-ia-biblio").addEventListener("click", defaitesOuvrirBibliotheque);
      }

      function defaitesFermerBibliotheque() {
        const modal = document.querySelector(".defaites-biblio");
        if (modal) modal.remove();
      }

      async function defaitesOuvrirBibliotheque() {
        defaitesFermerBibliotheque();
        const modal = document.createElement("div");
        modal.className = "defaites-biblio";
        modal.innerHTML = `<div class="modal-card defaites-biblio-carte">
          <h2>📚 Défaites de l’IA Expert</h2>
          <p class="defaites-biblio-aide">Chaque partie gagnée contre l’Expert est gardée ici
            (${DEFAITES_MAX} au plus, sauf les épinglées). Exportez-en une, ou cochez-en plusieurs
            pour un seul fichier.</p>
          <div class="defaites-biblio-liste">Chargement…</div>
          <div class="modal-actions">
            <button type="button" class="defaites-lot" data-defaites="lot" disabled>Exporter la sélection</button>
            <button type="button" class="secondary-btn" data-defaites="fermer">Fermer</button>
          </div>
        </div>`;
        document.body.appendChild(modal);
        modal.addEventListener("click", e => { if (e.target === modal) defaitesFermerBibliotheque(); });
        modal.querySelector('[data-defaites="fermer"]').addEventListener("click", defaitesFermerBibliotheque);
        const boutonLot = modal.querySelector('[data-defaites="lot"]');
        const coches = () => [...modal.querySelectorAll(".defaites-choix:checked")].map(x => x.value);
        boutonLot.addEventListener("click", async () => {
          const n = await defaitesExporterLot(coches());
          if (n) showToast(`${n} défaite(s) exportée(s) dans un seul fichier.`);
        });

        const liste = modal.querySelector(".defaites-biblio-liste");
        const rendre = async () => {
          const entrees = await defaitesBiblio.lister();
          if (!entrees.length) {
            liste.innerHTML = `<p class="defaites-vide">Aucune défaite enregistrée pour l’instant.
              Battez l’Expert : la partie apparaîtra ici toute seule.</p>`;
            boutonLot.disabled = true;
            return;
          }
          liste.innerHTML = entrees.map(e => {
            const date = new Date(e.date);
            const options = [`<option value="debut">début de la partie</option>`]
              .concat(e.signales.map(t => `<option value="${t}">tour ${t} (signalé)</option>`)).join("");
            return `<div class="defaites-ligne" data-id="${defaitesEchapper(e.id)}">
              <label class="defaites-titre"><input type="checkbox" class="defaites-choix" value="${defaitesEchapper(e.id)}">
                ${e.epinglee ? "📌 " : ""}${date.toLocaleDateString("fr-FR")} ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                · ${defaitesEchapper(e.nomHumain)} ${e.scores[e.humain]}-${e.scores[e.ia]}
                · ${e.tours} tours${e.dureeMin ? ` · ${e.dureeMin} min` : ""}
                · ${e.signales.length} tour(s) signalé(s)</label>
              <div class="defaites-actions">
                <button type="button" class="secondary-btn" data-action="exporter">Exporter</button>
                <select class="defaites-tour" aria-label="Tour à rejouer">${options}</select>
                <button type="button" class="secondary-btn" data-action="rejouer">Rejouer</button>
                <button type="button" class="secondary-btn" data-action="epingler">${e.epinglee ? "Désépingler" : "Épingler"}</button>
                <button type="button" class="secondary-btn" data-action="supprimer" aria-label="Supprimer">🗑</button>
              </div>
            </div>`;
          }).join("");
          boutonLot.disabled = true;
          liste.querySelectorAll(".defaites-choix").forEach(c =>
            c.addEventListener("change", () => { boutonLot.disabled = !coches().length; }));
          liste.querySelectorAll(".defaites-ligne").forEach(ligne => {
            const id = ligne.dataset.id;
            ligne.querySelectorAll("[data-action]").forEach(bouton => bouton.addEventListener("click", async () => {
              const action = bouton.dataset.action;
              if (action === "exporter") { defaitesExporter(await defaitesBiblio.lire(id)); return; }
              if (action === "supprimer") {
                if (!window.confirm("Supprimer cette défaite de la bibliothèque ?")) return;
                await defaitesBiblio.supprimer(id);
              } else if (action === "epingler") {
                await defaitesBiblio.epingler(id, bouton.textContent === "Épingler");
              } else if (action === "rejouer") {
                const dossier = await defaitesBiblio.lire(id);
                if (!dossier) return;
                const choix = ligne.querySelector(".defaites-tour").value;
                const index = choix === "debut"
                  ? dossier.tours.findIndex(t => t.etat)
                  : dossier.tours.findIndex(t => t.tour === Number(choix) && t.joueur === dossier.ia && t.etat);
                if (index >= 0) defaitesRejouer(dossier, index);
                return;
              }
              await rendre();
              defaitesMajAcces();
            }));
          });
        };
        await rendre();
      }

      /* Accès hors partie, visible dès qu'une défaite est enregistrée. Le menu
         est un iframe plein écran, autonome (menu/README.md) : plutôt que d'y
         toucher, un bouton flottant s'affiche par-dessus tant qu'il est
         ouvert (body.ilyos-menu-v11-active, voir defaites-expert.css). */
      async function defaitesMajAcces() {
        try {
          let bouton = document.getElementById("defaitesAccesBtn");
          const entrees = await defaitesBiblio.lister();
          if (!entrees.length) { if (bouton) bouton.remove(); return; }
          if (!bouton) {
            bouton = document.createElement("button");
            bouton.type = "button";
            bouton.id = "defaitesAccesBtn";
            bouton.className = "defaites-acces";
            bouton.addEventListener("click", defaitesOuvrirBibliotheque);
            document.body.appendChild(bouton);
          }
          bouton.textContent = `📚 Défaites de l’IA Expert (${entrees.length})`;
        } catch (erreur) { /* accessoire : jamais bloquant */ }
      }

      window.ILYOS_DEFAITES = {
        journal: () => defaitesJournal,
        derniere: () => defaitesDerniere,
        analyser: dossier => defaitesAnalyser(dossier || defaitesDerniere),
        exporter: dossier => defaitesExporter(dossier || defaitesDerniere),
        bibliotheque: defaitesOuvrirBibliotheque,
        lister: () => defaitesBiblio.lister(),
        lire: id => defaitesBiblio.lire(id),
        supprimer: id => defaitesBiblio.supprimer(id),
        rejouer: (dossier, index) => defaitesRejouer(dossier, index),
        // Plan du planner en langage de jeu (cases, gardiens), pour les outils.
        decrire: (plan, etat) => autopsieDecrirePlan(plan, etat),
        seuils: DEFAITES_SEUILS
      };

      setTimeout(defaitesMajAcces, 0);
