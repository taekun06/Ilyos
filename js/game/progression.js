      /* =====================================================================
         PROGRESSION DU JOUEUR — niveau et XP (étape 1 du plan de gamification)

         Chaque partie terminée rapporte de l'XP, perdue, nulle ou gagnée ; la
         victoire en rapporte davantage, la première du jour encore plus. Le
         niveau ne redescend jamais. Les quêtes, l'offrande du jour, la saison
         et les cosmétiques viendront se brancher sur ce même profil.

         Le profil vit sur l'appareil, sous une seule clé. La sauvegarde est
         automatique : pas d'export, pas d'import, rien à demander au joueur.
         navigator.storage.persist() demande au navigateur de ne pas effacer
         ces données de lui-même quand l'espace manque.

         Le calcul se fait sur les compteurs FINAUX de la partie : les
         annulations sont donc prises en compte sans effort, et les parties
         simulées par l'IA (ilyosSimulationActive) n'atteignent jamais l'écran
         de fin qui déclenche ce module.
         ===================================================================== */

      const PROGRESSION_STORAGE_KEY = "ilyos-profil-v1";
      const PROGRESSION_VERSION = 1;
      /* Valeurs de départ, à régler sur le jeu réel (étape 5 du plan). */
      const PROGRESSION_XP = {
        partie: 50,
        victoire: 50,
        nul: 25,
        premiereVictoireDuJour: 100,
        puzzle: 40,
        puzzleRejoue: 10,
        puzzleRejouesParJour: 3,
        tutoriel: 150
      };
      const PROGRESSION_DIFFICULTE = { easy: .8, normal: 1, hard: 1.25, expert: 1.5 };
      const PROGRESSION_DIFFICULTE_NOM = { easy: "Facile", normal: "Normal", hard: "Difficile", expert: "Expert" };
      /* Une partie de moins de quatre manches rapporte moitié moins : on ne
         farme pas l'XP en bâclant des parties. */
      const PROGRESSION_MANCHES_MIN = 4;
      /* La journée de jeu commence à 4 h, heure locale : une partie tardive
         compte encore pour la veille. */
      const PROGRESSION_HEURE_BASCULE = 4;

      let progressionDernierePartie = null;
      let progressionPersistanceDemandee = false;

      /* XP nécessaire pour passer du niveau n au niveau n + 1. */
      function progressionXpPourPasser(niveau) {
        return Math.min(1000, 150 + 50 * Math.max(1, Math.floor(niveau)));
      }

      function progressionNiveauDepuisXp(xpTotal) {
        let reste = Math.max(0, Math.floor(Number(xpTotal) || 0));
        let niveau = 1;
        while (reste >= progressionXpPourPasser(niveau)) {
          reste -= progressionXpPourPasser(niveau);
          niveau++;
        }
        return { niveau, xpDansNiveau: reste, xpPourSuivant: progressionXpPourPasser(niveau) };
      }

      function progressionJour(date = new Date()) {
        const decale = new Date(date.getTime() - PROGRESSION_HEURE_BASCULE * 3600 * 1000);
        const deux = n => String(n).padStart(2, "0");
        return `${decale.getFullYear()}-${deux(decale.getMonth() + 1)}-${deux(decale.getDate())}`;
      }

      function progressionProfilVide() {
        return {
          version: PROGRESSION_VERSION,
          xp: 0,
          parties: 0,
          victoires: 0,
          derniereVictoireJour: null,
          puzzles: { jour: null, rejoues: 0 },
          tutorielRecompense: false
        };
      }

      function progressionCharger() {
        let brut = null;
        try { brut = JSON.parse(localStorage.getItem(PROGRESSION_STORAGE_KEY) || "null"); } catch (_) { }
        const profil = progressionProfilVide();
        if (!brut || typeof brut !== "object") return profil;
        /* Fusion champ par champ : un profil d'une version antérieure garde ce
           qu'il connaît et reçoit les valeurs par défaut du reste. */
        if (Number.isFinite(brut.xp) && brut.xp >= 0) profil.xp = Math.floor(brut.xp);
        if (Number.isFinite(brut.parties)) profil.parties = brut.parties;
        if (Number.isFinite(brut.victoires)) profil.victoires = brut.victoires;
        if (typeof brut.derniereVictoireJour === "string") profil.derniereVictoireJour = brut.derniereVictoireJour;
        if (brut.puzzles && typeof brut.puzzles === "object") {
          profil.puzzles.jour = typeof brut.puzzles.jour === "string" ? brut.puzzles.jour : null;
          profil.puzzles.rejoues = Number.isFinite(brut.puzzles.rejoues) ? brut.puzzles.rejoues : 0;
        }
        profil.tutorielRecompense = brut.tutorielRecompense === true;
        return profil;
      }

      function progressionEnregistrer(profil) {
        try { localStorage.setItem(PROGRESSION_STORAGE_KEY, JSON.stringify(profil)); } catch (_) { }
        if (!progressionPersistanceDemandee) {
          progressionPersistanceDemandee = true;
          try { navigator.storage?.persist?.().catch(() => { }); } catch (_) { }
        }
      }

      /* Moteur pur : le gain d'une partie, ligne par ligne, sans rien écrire.
         bilan = { resultat: "victoire" | "nul" | "defaite",
                   difficulte: "easy" | … | null (aucun CPU adverse),
                   manches }
         dejaGagneAujourdhui : le profil a déjà sa première victoire du jour. */
      function progressionCalculerGainPartie(bilan, dejaGagneAujourdhui = false) {
        const lignes = [{ libelle: "Partie terminée", xp: PROGRESSION_XP.partie }];
        if (bilan.resultat === "victoire") lignes.push({ libelle: "Victoire", xp: PROGRESSION_XP.victoire });
        else if (bilan.resultat === "nul") lignes.push({ libelle: "Match nul", xp: PROGRESSION_XP.nul });

        let total = lignes.reduce((somme, ligne) => somme + ligne.xp, 0);
        const facteur = PROGRESSION_DIFFICULTE[bilan.difficulte];
        if (facteur && facteur !== 1) {
          const avant = total;
          total = Math.round(total * facteur);
          lignes.push({ libelle: `CPU ${PROGRESSION_DIFFICULTE_NOM[bilan.difficulte]} ×${String(facteur).replace(".", ",")}`, xp: total - avant });
        }
        if ((Number(bilan.manches) || 0) < PROGRESSION_MANCHES_MIN) {
          const avant = total;
          total = Math.round(total / 2);
          lignes.push({ libelle: "Partie très courte ×0,5", xp: total - avant });
        }
        if (bilan.resultat === "victoire" && !dejaGagneAujourdhui) {
          lignes.push({ libelle: "Première victoire du jour", xp: PROGRESSION_XP.premiereVictoireDuJour });
          total += PROGRESSION_XP.premiereVictoireDuJour;
        }
        return { lignes, total };
      }

      /* Ajoute de l'XP au profil et dit ce qui a changé. */
      function progressionAjouterXp(profil, xp) {
        const avant = progressionNiveauDepuisXp(profil.xp);
        profil.xp += Math.max(0, Math.round(xp));
        const apres = progressionNiveauDepuisXp(profil.xp);
        return { avant, apres, niveauxGagnes: apres.niveau - avant.niveau };
      }

      /* Le joueur dont cet appareil tient le profil : en ligne, sa place ; en
         local, le premier humain (en duel local et en 2 contre 2, le siège 1).
         Aucun humain (IA contre IA) : pas de progression. */
      function progressionJoueurDeLAppareil() {
        if (!state || !Array.isArray(state.players)) return null;
        if (state.onlineMode) return Number.isInteger(localPlayerIndex) ? state.players[localPlayerIndex] || null : null;
        return state.players.find(joueur => !joueur.isAI) || null;
      }

      function progressionContexteHorsJeu() {
        if (ilyosSimulationActive) return true;
        try { if (TUTO.active) return true; } catch (_) { }
        try { if (EVEIL.active) return true; } catch (_) { }
        try { if (PUZZLE.active) return true; } catch (_) { }
        return false;
      }

      /* Appelée par l'écran de fin (showVictory, showEgalite). vainqueur =
         le joueur gagnant, ou null pour un match nul. */
      function progressionFinPartie(vainqueur) {
        let gain = null;
        try {
          if (!state || progressionDernierePartie === state || progressionContexteHorsJeu()) {
            if (progressionDernierePartie !== state) progressionRendreVictoire(null);
            return;
          }
          const moi = progressionJoueurDeLAppareil();
          if (!moi) { progressionRendreVictoire(null); return; }
          progressionDernierePartie = state;

          const resultat = !vainqueur ? "nul" : (vainqueur === moi || vainqueur.id === moi.id ? "victoire" : "defaite");
          const difficultes = state.players.filter(j => j.isAI && j.aiDifficulty).map(j => j.aiDifficulty);
          const difficulte = difficultes.sort((a, b) => (PROGRESSION_DIFFICULTE[b] || 0) - (PROGRESSION_DIFFICULTE[a] || 0))[0] || null;

          const profil = progressionCharger();
          const jour = progressionJour();
          gain = progressionCalculerGainPartie(
            { resultat, difficulte, manches: state.round },
            profil.derniereVictoireJour === jour
          );
          const changement = progressionAjouterXp(profil, gain.total);
          profil.parties++;
          if (resultat === "victoire") { profil.victoires++; profil.derniereVictoireJour = jour; }
          progressionEnregistrer(profil);
          gain = { ...gain, ...changement };
        } catch (erreur) {
          console.warn("[ILYOS] progression : gain non calculé", erreur);
          gain = null;
        }
        progressionRendreVictoire(gain);
      }

      /* Récompense hors partie (puzzle, tutoriel) : un toast, pas de fenêtre. */
      function progressionGainHorsPartie(profil, xp, libelle) {
        if (!(xp > 0)) return;
        const changement = progressionAjouterXp(profil, xp);
        progressionEnregistrer(profil);
        try {
          showToast(changement.niveauxGagnes > 0
            ? `${libelle} : +${xp} XP · Niveau ${changement.apres.niveau} atteint !`
            : `${libelle} : +${xp} XP`);
        } catch (_) { }
      }

      /* Appelée par puzzleRecordSolved. Première résolution : XP pleine ;
         ensuite une petite somme, trois fois par jour au plus. */
      function progressionPuzzleResolu(premiereFois) {
        try {
          const profil = progressionCharger();
          let xp = PROGRESSION_XP.puzzle;
          if (!premiereFois) {
            const jour = progressionJour();
            if (profil.puzzles.jour !== jour) profil.puzzles = { jour, rejoues: 0 };
            if (profil.puzzles.rejoues >= PROGRESSION_XP.puzzleRejouesParJour) return;
            profil.puzzles.rejoues++;
            xp = PROGRESSION_XP.puzzleRejoue;
          }
          progressionGainHorsPartie(profil, xp, premiereFois ? "Puzzle résolu" : "Puzzle rejoué");
        } catch (erreur) {
          console.warn("[ILYOS] progression : puzzle non compté", erreur);
        }
      }

      /* Appelée à la fin de chaque tutoriel ; ne paie qu'une seule fois. */
      function progressionTutorielTermine() {
        try {
          const profil = progressionCharger();
          if (profil.tutorielRecompense) return;
          profil.tutorielRecompense = true;
          progressionGainHorsPartie(profil, PROGRESSION_XP.tutoriel, "Tutoriel terminé");
        } catch (erreur) {
          console.warn("[ILYOS] progression : tutoriel non compté", erreur);
        }
      }

      /* Bloc de la fenêtre de fin, sous le bilan : niveau, barre qui se
         remplit, détail du gain. */
      function progressionRendreVictoire(gain) {
        const carte = els.victoryModal && els.victoryModal.querySelector(".victory-card");
        if (!carte) return;
        let bloc = carte.querySelector(".progression-gain");
        if (!gain) { if (bloc) bloc.remove(); return; }
        if (!bloc) {
          bloc = document.createElement("div");
          bloc.className = "progression-gain";
          carte.insertBefore(bloc, carte.querySelector(".modal-actions") || null);
        }
        const { avant, apres, niveauxGagnes } = gain;
        const part = info => Math.round(100 * info.xpDansNiveau / info.xpPourSuivant);
        /* La barre part de l'état d'avant la partie ; si un niveau est
           franchi, elle repart de zéro dans le nouveau niveau. */
        const depart = niveauxGagnes > 0 ? 0 : part(avant);
        const lignes = gain.lignes.map(ligne =>
          `<li><span>${ligne.libelle}</span><b>${ligne.xp >= 0 ? "+" : "−"}${Math.abs(ligne.xp)}</b></li>`).join("");
        bloc.innerHTML = `
          <div class="progression-tete">
            <span class="progression-niveau">Niveau ${apres.niveau}</span>
            <span class="progression-total">+${gain.total} XP</span>
          </div>
          <div class="progression-barre" role="progressbar" aria-valuemin="0"
               aria-valuemax="${apres.xpPourSuivant}" aria-valuenow="${apres.xpDansNiveau}"
               aria-label="Progression vers le niveau ${apres.niveau + 1}">
            <i style="width:${depart}%"></i>
          </div>
          <small class="progression-reste">${apres.xpDansNiveau} / ${apres.xpPourSuivant} XP vers le niveau ${apres.niveau + 1}</small>
          ${niveauxGagnes > 0 ? `<p class="progression-palier">Niveau ${apres.niveau} atteint !</p>` : ""}
          <ul class="progression-lignes">${lignes}</ul>`;
        const barre = bloc.querySelector(".progression-barre i");
        requestAnimationFrame(() => requestAnimationFrame(() => { barre.style.width = `${part(apres)}%`; }));
      }

      window.ILYOS_PROGRESSION = {
        profil: () => {
          const profil = progressionCharger();
          return { ...profil, ...progressionNiveauDepuisXp(profil.xp) };
        },
        calculerGainPartie: progressionCalculerGainPartie,
        xpPourPasser: progressionXpPourPasser,
        niveauDepuisXp: progressionNiveauDepuisXp,
        jour: date => progressionJour(date ? new Date(date) : new Date()),
        cle: PROGRESSION_STORAGE_KEY
      };
