
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

      /* Toute partie locale où joue un humain est suivie : « Analyse partie »
         (écran de fin) existe pour chacune, pas seulement contre l'Expert
         (demande de Taekun, 2026-11-09). Hors ligne, tutoriel, puzzle,
         simulation et parties automatiques. */
      function defaitesPartieSuivie() {
        if (!state || state.onlineMode || state.tutorial || state.puzzle) return false;
        if (typeof ilyosSimulationActive !== "undefined" && ilyosSimulationActive) return false;
        try { if (ILYOS_AUTOPLAY && ILYOS_AUTOPLAY.active) return false; } catch (erreur) { /* harnais absent */ }
        const joueurs = state.players || [];
        return joueurs.length >= 2 && joueurs.some(j => !j.isAI);
      }

      /* Défaite de l'Expert (humain vainqueur d'un Expert, en duel) : le
         dossier historique, que l'analyse de l'IA sait lire. Toute autre
         partie est un dossier « partie ». */
      function defaitesEstDefaiteExpert(vainqueur) {
        if (!state || !vainqueur || vainqueur.isAI || state.players.length !== 2) return false;
        const perdant = state.players.find(j => j.id !== vainqueur.id);
        return !!perdant && perdant.isAI && perdant.aiDifficulty === "expert";
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
            plansExamines: a.plansExamines || null,
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

      /* Note de l'IA sur une position, l'humain au trait : le point de vue de
         la riposte prévue. Repli sur la note enregistrée si l'état manque. */
      function defaitesNoteTraitHumain(etat, ia, humain, repli) {
        if (!etat || !Array.isArray(etat.players)) return repli;
        try {
          const copie = structuredClone(etat);
          copie.currentPlayer = humain;
          return Math.round(withSimulatedState(copie, () => evaluateStrategicState(ia)));
        } catch (erreur) {
          return repli;
        }
      }

      /* Partie quelconque : les moments clés lus dans les positions de début
         de tour — couronnes validées, gardiens perdus, couronnes ramassées ou
         volées. Aucun jugement d'IA ici : la visionneuse le donne, tour par
         tour, à qui le demande. */
      function defaitesAnalyserPartie(dossier) {
        const tours = dossier.tours || [];
        const nom = j => ((dossier.joueurs || [])[j] || {}).nom || `Joueur ${j + 1}`;
        const signales = [];
        let precedent = null;
        const porteurs = etat => new Map([etat.artifact, etat.secondArtifact]
          .filter(a => a && a.active && a.carrierId)
          .map(a => [a.carrierId, ((etat.characters || []).find(g => g.id === a.carrierId) || {}).player]));
        const etats = tours.map((t, i) => ({ t, i, etat: defaitesLire(t.etat) })).filter(x => x.etat);
        etats.push({ t: { tour: dossier.fin ? dossier.fin.tours : null }, i: tours.length - 1, etat: defaitesLire(dossier.etatFinal), fin: true });
        etats.forEach(({ t, i, etat, fin }) => {
          if (!etat) return;
          if (precedent) {
            const A = precedent.etat, raisons = [];
            let gravite = 0;
            (etat.players || []).forEach((j, k) => {
              const avant = ((A.players || [])[k] || {}).score || 0, apres = j.score || 0;
              if (apres > avant) { raisons.push(`${nom(k)} valide une couronne (${apres})`); gravite += 3000; }
            });
            const ids = new Set((etat.characters || []).map(g => g.id));
            const perdus = {};
            (A.characters || []).forEach(g => { if (!ids.has(g.id)) perdus[g.player] = (perdus[g.player] || 0) + 1; });
            Object.entries(perdus).forEach(([k, n]) => {
              raisons.push(`${nom(Number(k))} perd ${n} gardien${n > 1 ? "s" : ""}`);
              gravite += 900 * n;
            });
            const pA = porteurs(A), pB = porteurs(etat);
            pB.forEach((camp, id) => {
              if (camp === undefined) return;
              const avant = [...pA.values()].includes(camp);
              if (!avant) { raisons.push(`${nom(camp)} prend une couronne`); gravite += 600; }
            });
            if (raisons.length) {
              const t0 = precedent.t;
              signales.push({ index: precedent.i, tour: t0.tour, joueur: t0.joueur, gravite, raisons });
            }
          }
          if (!fin) precedent = { t, i, etat };
        });
        const principaux = signales.slice().sort((x, y) => y.gravite - x.gravite).slice(0, 8)
          .sort((x, y) => x.tour - y.tour);
        const scores = dossier.fin ? dossier.fin.scores : [];
        const lignes = [`Partie — ${dossier.fin ? dossier.fin.tours : "?"} tours, `
          + (dossier.joueurs || []).map((j, k) => `${j.nom} ${scores[k] ?? 0}`).join(" · ")];
        principaux.forEach(s => lignes.push(`• Tour ${s.tour} : ${s.raisons.join(" ; ")}`));
        if (!principaux.length) lignes.push("• Aucun moment ne se détache nettement.");
        return { decisions: 0, signales: principaux, tousSignales: signales.length, resume: lignes.join("\n") };
      }

      function defaitesAnalyser(dossier) {
        if (dossier && dossier.type === "partie") return defaitesAnalyserPartie(dossier);
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
          const noteDepartSuivante = suivante && suivante.decision ? suivante.decision.noteDepart : null;
          /* La riposte prévue se note à la FIN du tour humain, l'humain encore
             au trait. noteDepart se lit au début du tour suivant de l'IA, l'IA
             au trait : l'évaluateur y prend l'IA pour celle qui vient de jouer
             (lAdversaireJoue) et compte des menaces humaines qui ne seront
             jamais jouées — jusqu'à −4 000 de périls fantômes par couronne au
             sol. Comparer les deux grossissait la « menace non anticipée » :
             défaite du 22/10, tour 3, −6 010 lus contre −2 010 réels. */
          const constate = Number.isFinite(noteDepartSuivante)
            ? defaitesNoteTraitHumain(B, ia, humain, noteDepartSuivante) : null;
          if (Number.isFinite(prevu) && Number.isFinite(constate)) {
            const surprise = prevu - constate;
            if (surprise >= DEFAITES_SEUILS.surprise) {
              raisons.push(`menace humaine non anticipée (prévu ${prevu}, constaté ${constate})`);
              gravite += surprise;
            }
          }
          if (Number.isFinite(d.noteDepart) && Number.isFinite(noteDepartSuivante)) {
            // Deux débuts de tour de l'IA : même point de vue, comparables.
            const chute = d.noteDepart - noteDepartSuivante;
            if (chute >= DEFAITES_SEUILS.bascule) {
              raisons.push(`forte bascule (${d.noteDepart} → ${noteDepartSuivante})`);
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
        if (!journal || journal.etatRef !== state) return null;
        const expert = defaitesEstDefaiteExpert(vainqueur);
        const humain = expert ? vainqueur.id : null;
        const perdant = expert ? state.players.find(j => j.id !== humain) : null;
        let cadre = null;
        try { cadre = serializeGameStateForSave(); } catch (erreur) { cadre = null; }
        const dossier = {
          jeu: "ILYOS",
          type: expert ? "defaite-expert" : "partie",
          schema: 1,
          id: journal.id,
          debut: journal.debut,
          fin: {
            date: new Date().toISOString(),
            dureeMin: Math.round((Date.now() - journal.debutMs) / 60000),
            tours: state.turn,
            manches: state.round,
            vainqueur: vainqueur ? vainqueur.id : null,
            scores: state.players.map(j => j.score || 0)
          },
          version: journal.version,
          bundle: journal.bundle,
          regles: journal.regles,
          joueurs: journal.joueurs,
          humain,
          ia: perdant ? perdant.id : null,
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
        try { dossier = defaitesFermer(vainqueur); } catch (erreur) {
          console.warn("[ILYOS] journal des défaites : dossier non fermé", erreur);
        }
        defaitesDerniere = dossier;
        defaitesRendreVictoire(dossier);
        if (!dossier) return;
        /* Victoire contre l'Expert : la partie part à Taekun pour améliorer le
           CPU (js/retours.js), sauf si le joueur l'a refusé dans le menu. */
        if (dossier.type === "defaite-expert" && window.ILYOS_RETOURS) {
          try {
            if (!dossier.analyse) dossier.analyse = defaitesAnalyser(dossier);
            window.ILYOS_RETOURS.envoyerVictoire(dossier);
          } catch (erreur) { console.warn("[ILYOS] envoi de la victoire impossible", erreur); }
        }
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
          scores: d.fin.scores, humain: d.humain, ia: d.ia, type: d.type || "defaite-expert",
          nomHumain: ((d.joueurs || [])[d.humain] || {}).nom || "Joueur",
          noms: (d.joueurs || []).map(j => j.nom),
          epinglee: !!d.epinglee, signales: d.analyse ? d.analyse.signales.map(s => s.tour) : [],
          version: d.version
        });
        return {
          async enregistrer(dossier) {
            if (!dossier.analyse) dossier.analyse = defaitesAnalyser(dossier);
            await requete("readwrite", m => m ? m.put(dossier) : memoire.set(dossier.id, dossier));
            // Au-delà du plafond, les plus anciennes NON épinglées partent.
            const toutes = (await tout()).sort((a, b) => String(a.fin.date).localeCompare(String(b.fin.date)));
            // Plafond par sorte : les parties ordinaires ne chassent pas les
            // défaites de l'Expert, qui servent à régler l'IA.
            const sorte = d => d.type === "partie" ? "partie" : "expert";
            const memes = toutes.filter(d => sorte(d) === sorte(dossier));
            let exces = memes.length - DEFAITES_MAX;
            for (const d of memes) {
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
          // Annotations et coups proposés (visionneuse) : réécrit le dossier tel quel.
          mettreAJour: dossier => requete("readwrite", m => m ? m.put(dossier) : memoire.set(dossier.id, dossier)),
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
        defaitesTelecharger(dossier, defaitesNomFichier(dossier.type === "partie" ? "ilyos-partie" : "ilyos-defaite", dossier.fin.date));
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
        if (!restaure) { showToast("Cette partie n’est plus compatible avec le jeu."); return false; }
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

      /* Onglet « Analyse » du bandeau de fin (fin-partie.js) et bouton
         « Analyse partie » de sa rangée d'actions, pour toute partie suivie :
         les moments clés, puis revoir la partie tour par tour dans la
         visionneuse, l'exporter, ou ouvrir la bibliothèque. */
      function defaitesRendreVictoire(dossier, nombre = null) {
        const page = finPartiePage("analyse");
        const bouton = els.victoryModal && els.victoryModal.querySelector(".fin2-analyse");
        if (!page) return;
        let bloc = page.querySelector(".defaite-ia");
        if (!dossier) { if (bloc) bloc.remove(); finPartieAnalyseDisponible(false); return; }
        finPartieAnalyseDisponible(true);
        if (!bloc) {
          bloc = document.createElement("div");
          bloc.className = "defaite-ia";
          page.appendChild(bloc);
        }
        if (!dossier.analyse) {
          try { dossier.analyse = defaitesAnalyser(dossier); } catch (erreur) { dossier.analyse = null; }
        }
        const analyse = dossier.analyse;
        const expert = dossier.type !== "partie";
        const moments = analyse && analyse.signales.length
          ? `<ol class="fin2-moments">${analyse.signales.map(s => `<li><b>Tour ${s.tour}</b><span>${s.raisons.map(defaitesEchapper).join(" · ")}</span></li>`).join("")}</ol>`
          : `<p class="fin2-moments-vide">Aucun moment ne se détache nettement : revois la partie tour par tour.</p>`;
        bloc.innerHTML = `
          <div class="fin2-analyse-tete">
            <b>${expert ? "Ce qui a fait perdre l’Expert" : "Les moments clés"}</b>
            <small class="defaite-ia-etat">${nombre === null
              ? "Enregistrement dans la bibliothèque…"
              : `Enregistrée dans la bibliothèque des parties · ${analyse ? analyse.signales.length : 0} tour(s) à regarder`}</small>
          </div>
          ${moments}
          <div class="fin2-analyse-actions">
            <button type="button" class="fin2-btn fin2-btn-or defaite-ia-voir">👁 Revoir<span class="long"> la partie tour par tour</span></button>
            <button type="button" class="fin2-btn defaite-ia-exporter">⬇ Exporter</button>
            <button type="button" class="fin2-btn defaite-ia-biblio">📚 <span class="long">Bibliothèque</span><span class="court">Parties</span></button>
          </div>
          <pre class="defaite-ia-resume" hidden>${defaitesEchapper(analyse ? analyse.resume : "")}</pre>`;
        if (bouton) bouton.onclick = () => finPartieOnglet("analyse");
        bloc.querySelector(".defaite-ia-voir").addEventListener("click", () => defaitesVoir(dossier));
        bloc.querySelector(".defaite-ia-exporter").addEventListener("click", () => {
          const resultat = defaitesExporter(dossier);
          const resume = bloc.querySelector(".defaite-ia-resume");
          if (resultat && resume) { resume.textContent = resultat.resume; resume.hidden = false; }
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
          <h2>📚 Bibliothèque des parties</h2>
          <p class="defaites-biblio-aide">Chaque partie terminée est gardée ici pour être revue tour par tour
            (${DEFAITES_MAX} parties et ${DEFAITES_MAX} défaites de l’Expert au plus, sauf les épinglées).
            Exportez-en une, ou cochez-en plusieurs pour un seul fichier.</p>
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
          if (n) showToast(`${n} partie(s) exportée(s) dans un seul fichier.`);
        });

        const liste = modal.querySelector(".defaites-biblio-liste");
        const rendre = async () => {
          const entrees = await defaitesBiblio.lister();
          if (!entrees.length) {
            liste.innerHTML = `<p class="defaites-vide">Aucune partie enregistrée pour l’instant.
              Terminez une partie : elle apparaîtra ici toute seule.</p>`;
            boutonLot.disabled = true;
            return;
          }
          liste.innerHTML = entrees.map(e => {
            const date = new Date(e.date);
            return `<div class="defaites-ligne" data-id="${defaitesEchapper(e.id)}">
              <label class="defaites-titre"><input type="checkbox" class="defaites-choix" value="${defaitesEchapper(e.id)}">
                ${e.epinglee ? "📌 " : ""}${date.toLocaleDateString("fr-FR")} ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                · ${e.type === "partie"
                  ? (e.noms || []).map((n, k) => `${defaitesEchapper(n)} ${e.scores[k] ?? 0}`).join(" · ")
                  : `${defaitesEchapper(e.nomHumain)} ${e.scores[e.humain]}-${e.scores[e.ia]} contre l’Expert`}
                · ${e.tours} tours${e.dureeMin ? ` · ${e.dureeMin} min` : ""}
                · ${e.signales.length} tour(s) signalé(s)</label>
              <div class="defaites-actions">
                <button type="button" class="defaites-voir" data-action="voir">👁 Voir la partie</button>
                <button type="button" class="secondary-btn" data-action="exporter">Exporter</button>
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
                if (!window.confirm("Supprimer cette partie de la bibliothèque ?")) return;
                await defaitesBiblio.supprimer(id);
              } else if (action === "epingler") {
                await defaitesBiblio.epingler(id, bouton.textContent === "Épingler");
              } else if (action === "voir") {
                /* La visionneuse (defaites-vue.js) : toute la partie, tour par
                   tour ; « Reprendre la partie ici » y remplace l'ancien
                   « Rejouer », qui relançait une partie vivante sans rien
                   montrer de ce qui avait été joué. */
                const dossier = await defaitesBiblio.lire(id);
                if (dossier) defaitesVoir(dossier);
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
          bouton.textContent = `📚 Parties enregistrées (${entrees.length})`;
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
        // Visionneuse : ouvrir, et l'état courant (tests, outils).
        voir: (dossier, index = null) => defaitesVoir(dossier, index),
        vue: () => defaitesVue ? {
          index: defaitesVue.index, etape: defaitesVue.etape, sandbox: !!defaitesVue.sandbox,
          direct: !!defaitesVue.direct, tours: defaitesVue.dossier.tours.length,
          trace: defaitesVue.trace ? defaitesVue.trace.cle : null,
          traces: defaitesVue.tracesAffiches || 0,
          tour: (defaitesVue.dossier.tours[defaitesVue.index] || {}).tour,
          propositions: (defaitesVue.dossier.propositions || []).length,
          annotations: Object.keys(defaitesVue.dossier.annotations || {}).length
        } : null,
        // Plan du planner en langage de jeu (cases, gardiens), pour les outils.
        decrire: (plan, etat) => autopsieDecrirePlan(plan, etat),
        seuils: DEFAITES_SEUILS,
        /* Partie en cours jointe à un signalement de bug (js/retours.js) :
           l'état de reprise et les tours déjà joués, sans fermer le journal. */
        instantanePartie: () => {
          if (!state || !state.players || !state.players.length) return null;
          let cadre = null;
          try { cadre = serializeGameStateForSave(); } catch (erreur) { cadre = null; }
          const journal = defaitesJournal && defaitesJournal.etatRef === state ? defaitesJournal : null;
          return {
            jeu: "ILYOS", type: "signalement", schema: 1,
            date: new Date().toISOString(),
            version: window.ILYOS_BUILD || null,
            bundle: (document.querySelector('script[src*="game.js"]') || {}).src || null,
            regles: defaitesRegles(),
            tour: state.turn, manche: state.round,
            joueurs: state.players.map(j => ({ id: j.id, nom: j.name, ia: !!j.isAI, difficulte: j.aiDifficulty || null, score: j.score || 0 })),
            tours: journal ? journal.tours.map(t => ({ ...t })) : [],
            cadre
          };
        }
      };

      setTimeout(defaitesMajAcces, 0);
