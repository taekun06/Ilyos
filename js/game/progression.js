      /* =====================================================================
         PROGRESSION DU JOUEUR — niveau, XP, quêtes et offrande du jour

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

      /* QUÊTES. Chacune se compte sur un « événement » : la fin d'une partie
         (bilan, compteurs finaux) ou un puzzle résolu. Trois quêtes du jour au
         plus : chaque nouvelle journée complète les places libres, et une
         quête non faite reste en attente — manquer un jour ne fait rien
         perdre. « requiert » : jamais de quête dans un mode jamais essayé. */
      const PROGRESSION_QUETES_JOUR = [
        { type: "parties", cible: 2, xp: 75, texte: "Terminer 2 parties", compte: e => e.partie ? 1 : 0 },
        { type: "poussees", cible: 6, xp: 75, texte: "Pousser 6 fois", compte: e => e.stats ? e.stats.poussees || 0 : 0 },
        { type: "couronnes", cible: 3, xp: 75, texte: "Ramasser 3 couronnes", compte: e => e.stats ? e.stats.couronnes || 0 : 0 },
        { type: "iles", cible: 8, xp: 75, texte: "Poser 8 îles", compte: e => e.iles || 0 },
        { type: "sansChute", cible: 1, xp: 100, texte: "Gagner sans qu'un de ses gardiens tombe",
          compte: e => e.resultat === "victoire" && e.stats && !e.stats.chutes ? 1 : 0 },
        { type: "cpuFort", cible: 1, xp: 150, texte: "Battre le CPU Difficile ou Expert", requiert: "solo",
          compte: e => e.resultat === "victoire" && (e.difficulte === "hard" || e.difficulte === "expert") ? 1 : 0 },
        { type: "grand", cible: 1, xp: 75, texte: "Jouer en 13×13 ou en duel symétrique",
          compte: e => e.partie && (e.taille === 13 || e.plateau === "symmetric") ? 1 : 0 },
        { type: "puzzle", cible: 1, xp: 75, texte: "Résoudre un puzzle", compte: e => e.puzzle ? 1 : 0 },
        { type: "ensemble", cible: 1, xp: 100, texte: "Jouer en ligne ou en 2 contre 2", requiert: "multi",
          compte: e => e.partie && (e.mode === "online" || e.mode === "team") ? 1 : 0 }
      ];
      const PROGRESSION_QUETES_SEMAINE = [
        { type: "victoires", cible: 5, xp: 300, texte: "Gagner 5 parties", compte: e => e.resultat === "victoire" ? 1 : 0 },
        { type: "poussees", cible: 30, xp: 300, texte: "Pousser 30 fois", compte: e => e.stats ? e.stats.poussees || 0 : 0 },
        { type: "parties", cible: 8, xp: 300, texte: "Terminer 8 parties", compte: e => e.partie ? 1 : 0 },
        { type: "puzzles", cible: 3, xp: 250, texte: "Résoudre 3 puzzles", compte: e => e.puzzle ? 1 : 0 }
      ];
      const PROGRESSION_QUETES_MAX = 3;

      /* OFFRANDE DU JOUR : un calendrier de 7 cases qui compte les jours de
         présence, pas les jours consécutifs. Revenir après une absence reprend
         simplement à la case suivante ; rien ne retombe à zéro. */
      const PROGRESSION_OFFRANDES = [
        { xp: 30, texte: "30 XP" },
        { xp: 40, texte: "40 XP" },
        { xp: 50, texte: "50 XP" },
        { vent: 2, texte: "Vent porteur : +50 % d'XP sur 2 parties" },
        { xp: 60, texte: "60 XP" },
        { xp: 75, texte: "75 XP" },
        { xp: 150, texte: "150 XP" }
      ];
      const PROGRESSION_VENT_BONUS = .5;

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
          tutorielRecompense: false,
          modes: {},
          quetes: { jour: null, actives: [], changeeLe: null, semaine: null },
          offrande: { prochaine: 0, dernierJour: null, vent: 0 }
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
        if (brut.modes && typeof brut.modes === "object") profil.modes = { ...brut.modes };
        const q = brut.quetes;
        if (q && typeof q === "object") {
          profil.quetes.jour = typeof q.jour === "string" ? q.jour : null;
          profil.quetes.changeeLe = typeof q.changeeLe === "string" ? q.changeeLe : null;
          profil.quetes.actives = Array.isArray(q.actives)
            ? q.actives.filter(a => a && progressionModeleQuete(PROGRESSION_QUETES_JOUR, a.type)).slice(0, PROGRESSION_QUETES_MAX)
            : [];
          profil.quetes.semaine = q.semaine && progressionModeleQuete(PROGRESSION_QUETES_SEMAINE, q.semaine.type) ? q.semaine : null;
        }
        const o = brut.offrande;
        if (o && typeof o === "object") {
          profil.offrande.prochaine = Number.isInteger(o.prochaine) ? ((o.prochaine % 7) + 7) % 7 : 0;
          profil.offrande.dernierJour = typeof o.dernierJour === "string" ? o.dernierJour : null;
          profil.offrande.vent = Number.isFinite(o.vent) ? Math.max(0, o.vent) : 0;
        }
        return profil;
      }

      function progressionEnregistrer(profil) {
        try { localStorage.setItem(PROGRESSION_STORAGE_KEY, JSON.stringify(profil)); } catch (_) { }
        if (!progressionPersistanceDemandee) {
          progressionPersistanceDemandee = true;
          try { navigator.storage?.persist?.().catch(() => { }); } catch (_) { }
        }
      }

      /* ---------- Quêtes ---------------------------------------------- */
      function progressionModeleQuete(catalogue, type) {
        return catalogue.find(modele => modele.type === type) || null;
      }

      /* Le lundi de la semaine du jour donné, comme clé de semaine. */
      function progressionSemaine(jour) {
        const [a, m, j] = jour.split("-").map(Number);
        const date = new Date(a, m - 1, j, 12);
        date.setDate(date.getDate() - (date.getDay() + 6) % 7);
        return progressionJour(new Date(date.getTime() + PROGRESSION_HEURE_BASCULE * 3600 * 1000));
      }

      function progressionQuetePermise(profil, modele) {
        if (modele.requiert === "solo") return !!profil.modes.solo;
        if (modele.requiert === "multi") return !!(profil.modes.online || profil.modes.team);
        return true;
      }

      function progressionTirerQuete(profil, exclus) {
        const choix = PROGRESSION_QUETES_JOUR.filter(modele =>
          !exclus.includes(modele.type) && progressionQuetePermise(profil, modele));
        if (!choix.length) return null;
        const modele = choix[Math.floor(Math.random() * choix.length)];
        return { type: modele.type, fait: 0, finie: false };
      }

      /* Nouvelle journée : les quêtes finies s'en vont, les places libres se
         remplissent. Nouvelle semaine : une nouvelle quête de la semaine. */
      function progressionRenouvelerQuetes(profil, jour = progressionJour()) {
        const q = profil.quetes;
        let change = false;
        if (q.jour !== jour) {
          q.actives = q.actives.filter(a => !a.finie);
          while (q.actives.length < PROGRESSION_QUETES_MAX) {
            const nouvelle = progressionTirerQuete(profil, q.actives.map(a => a.type));
            if (!nouvelle) break;
            q.actives.push(nouvelle);
          }
          q.jour = jour;
          change = true;
        }
        const semaine = progressionSemaine(jour);
        if (!q.semaine || q.semaine.cle !== semaine) {
          const modele = PROGRESSION_QUETES_SEMAINE[Math.floor(Math.random() * PROGRESSION_QUETES_SEMAINE.length)];
          q.semaine = { cle: semaine, type: modele.type, fait: 0, finie: false };
          change = true;
        }
        return change;
      }

      /* Fait avancer chaque quête sur un événement ; renvoie celles qui
         viennent de s'achever, avec leur XP (pas encore ajoutée). */
      function progressionAvancerQuetes(profil, evenement) {
        const finies = [];
        const avancer = (quete, catalogue) => {
          const modele = quete && progressionModeleQuete(catalogue, quete.type);
          if (!modele || quete.finie) return;
          const pas = Math.max(0, Number(modele.compte(evenement)) || 0);
          if (!pas) return;
          quete.fait = Math.min(modele.cible, (quete.fait || 0) + pas);
          if (quete.fait >= modele.cible) {
            quete.finie = true;
            finies.push({ texte: modele.texte, xp: modele.xp, semaine: catalogue === PROGRESSION_QUETES_SEMAINE });
          }
        };
        profil.quetes.actives.forEach(quete => avancer(quete, PROGRESSION_QUETES_JOUR));
        avancer(profil.quetes.semaine, PROGRESSION_QUETES_SEMAINE);
        return finies;
      }

      /* Vue lisible des quêtes, pour la fenêtre de fin et le menu. */
      function progressionVueQuetes(profil) {
        const vue = (quete, catalogue) => {
          const modele = quete && progressionModeleQuete(catalogue, quete.type);
          return modele ? { texte: modele.texte, xp: modele.xp, cible: modele.cible,
            fait: Math.min(modele.cible, quete.fait || 0), finie: !!quete.finie } : null;
        };
        return {
          jour: profil.quetes.actives.map(q => vue(q, PROGRESSION_QUETES_JOUR)).filter(Boolean),
          semaine: vue(profil.quetes.semaine, PROGRESSION_QUETES_SEMAINE),
          changementDispo: profil.quetes.changeeLe !== progressionJour()
            && profil.quetes.actives.some(q => !q.finie)
        };
      }

      /* Une fois par jour, remplacer une quête non finie par une autre. */
      function progressionChangerQuete(index) {
        const profil = progressionCharger();
        progressionRenouvelerQuetes(profil);
        const jour = progressionJour();
        const quete = profil.quetes.actives[index];
        if (!quete || quete.finie || profil.quetes.changeeLe === jour) return false;
        const exclus = profil.quetes.actives.map(a => a.type);
        const nouvelle = progressionTirerQuete(profil, exclus);
        if (!nouvelle) return false;
        profil.quetes.actives[index] = nouvelle;
        profil.quetes.changeeLe = jour;
        progressionEnregistrer(profil);
        return true;
      }

      /* ---------- Offrande du jour ------------------------------------- */
      function progressionOffrandeDispo(profil) {
        return profil.offrande.dernierJour !== progressionJour();
      }

      function progressionReclamerOffrande() {
        const profil = progressionCharger();
        if (!progressionOffrandeDispo(profil)) return null;
        const indice = profil.offrande.prochaine;
        const offrande = PROGRESSION_OFFRANDES[indice];
        profil.offrande.dernierJour = progressionJour();
        profil.offrande.prochaine = (indice + 1) % PROGRESSION_OFFRANDES.length;
        if (offrande.vent) profil.offrande.vent += offrande.vent;
        const changement = progressionAjouterXp(profil, offrande.xp || 0);
        progressionEnregistrer(profil);
        return { indice, texte: offrande.texte, ...changement };
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

      function progressionModeDeLaPartie() {
        if (state.onlineMode) return "online";
        if (state.players.length === 4) return "team";
        return state.soloMode ? "solo" : "duel";
      }

      /* Pendant la partie : prévenir dès qu'une quête est remplie, sans rien
         enregistrer (le compte officiel se fait sur les compteurs finaux).
         Appelée par compterStatistique (core.js). */
      let progressionAnnoncees = { partie: null, types: new Set() };
      function progressionSuiviEnJeu(indexJoueur, cle) {
        try {
          if (cle !== "poussees" && cle !== "couronnes") return;
          if (!state || state.winner !== null || progressionContexteHorsJeu()) return;
          const moi = progressionJoueurDeLAppareil();
          if (!moi || moi.id !== indexJoueur) return;
          if (progressionAnnoncees.partie !== state) progressionAnnoncees = { partie: state, types: new Set() };
          const profil = progressionCharger();
          progressionRenouvelerQuetes(profil);
          const enCours = statistiquesDuJoueur(indexJoueur)[cle] || 0;
          const verifier = (quete, catalogue, cleAnnonce) => {
            const modele = quete && progressionModeleQuete(catalogue, quete.type);
            if (!modele || quete.finie || modele.type !== cle) return;
            if (progressionAnnoncees.types.has(cleAnnonce)) return;
            const total = (quete.fait || 0) + enCours;
            if (total >= modele.cible) {
              progressionAnnoncees.types.add(cleAnnonce);
              showToast(`✦ Quête accomplie : ${modele.texte} (+${modele.xp} XP en fin de partie)`);
            }
          };
          profil.quetes.actives.forEach(q => verifier(q, PROGRESSION_QUETES_JOUR, `j-${q.type}`));
          verifier(profil.quetes.semaine, PROGRESSION_QUETES_SEMAINE, `s-${cle}`);
        } catch (_) { }
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
          const mode = progressionModeDeLaPartie();
          profil.modes[mode] = true;
          progressionRenouvelerQuetes(profil, jour);
          gain = progressionCalculerGainPartie(
            { resultat, difficulte, manches: state.round },
            profil.derniereVictoireJour === jour
          );
          if (profil.offrande.vent > 0) {
            const bonus = Math.round(gain.total * PROGRESSION_VENT_BONUS);
            gain.lignes.push({ libelle: "Vent porteur +50 %", xp: bonus });
            gain.total += bonus;
            profil.offrande.vent--;
          }
          const finies = progressionAvancerQuetes(profil, {
            partie: true, resultat, difficulte, mode,
            taille: Number(state.boardSize || GRID), plateau: state.startingBoardMode,
            stats: { ...statistiquesDuJoueur(moi.id) }, iles: ilesPoseesPar(moi.id)
          });
          finies.forEach(quete => {
            gain.lignes.push({ libelle: `Quête : ${quete.texte}`, xp: quete.xp, quete: true });
            gain.total += quete.xp;
          });
          const changement = progressionAjouterXp(profil, gain.total);
          profil.parties++;
          if (resultat === "victoire") { profil.victoires++; profil.derniereVictoireJour = jour; }
          progressionEnregistrer(profil);
          gain = { ...gain, ...changement, quetes: progressionVueQuetes(profil) };
        } catch (erreur) {
          console.warn("[ILYOS] progression : gain non calculé", erreur);
          gain = null;
        }
        progressionRendreVictoire(gain);
      }

      /* Récompense hors partie (puzzle, tutoriel) : un toast, pas de fenêtre. */
      function progressionGainHorsPartie(profil, xp, libelle) {
        if (!(xp > 0)) { progressionEnregistrer(profil); return; }
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
            if (profil.puzzles.rejoues >= PROGRESSION_XP.puzzleRejouesParJour) xp = 0;
            else { profil.puzzles.rejoues++; xp = PROGRESSION_XP.puzzleRejoue; }
          }
          progressionRenouvelerQuetes(profil);
          const finies = progressionAvancerQuetes(profil, { puzzle: true });
          finies.forEach(quete => { xp += quete.xp; });
          progressionGainHorsPartie(profil, xp, finies.length
            ? `Quête accomplie : ${finies.map(q => q.texte).join(", ")}`
            : (premiereFois ? "Puzzle résolu" : "Puzzle rejoué"));
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

      /* Bloc de la fenêtre de fin, sous le bilan : emblème du niveau, gain
         qui se compte, barre qui se remplit, détail en pastilles. Un niveau
         franchi fait briller l'emblème. */
      function progressionRendreVictoire(gain) {
        const carte = els.victoryModal && els.victoryModal.querySelector(".victory-card");
        if (!carte) return;
        let bloc = carte.querySelector(".progression-gain");
        if (!gain) { if (bloc) bloc.remove(); return; }
        if (!bloc) {
          bloc = document.createElement("div");
          carte.insertBefore(bloc, carte.querySelector(".modal-actions") || null);
        }
        const { avant, apres, niveauxGagnes } = gain;
        const monte = niveauxGagnes > 0;
        bloc.className = `progression-gain${monte ? " progression-monte" : ""}`;
        const part = info => Math.round(100 * info.xpDansNiveau / info.xpPourSuivant);
        /* La barre part de l'état d'avant la partie ; si un niveau est
           franchi, elle repart de zéro dans le nouveau niveau. */
        const depart = monte ? 0 : part(avant);
        const quetesHtml = progressionHtmlQuetes(gain.quetes);
        const pastilles = gain.lignes.filter(ligne => !ligne.quete).map(ligne =>
          `<li${ligne.xp < 0 ? ' class="progression-moins"' : ""}><span>${ligne.libelle}</span><b>${ligne.xp >= 0 ? "+" : "−"}${Math.abs(ligne.xp)}</b></li>`).join("");
        bloc.innerHTML = `
          <div class="progression-embleme" aria-hidden="true">
            <span class="progression-rayons"></span>
            <span class="progression-hexagone">
              <small>NIV.</small><strong>${apres.niveau}</strong>
            </span>
          </div>
          <div class="progression-corps">
            <div class="progression-tete">
              <span class="progression-titre">${monte ? `Niveau ${apres.niveau} atteint&nbsp;!` : `Niveau ${apres.niveau}`}</span>
              <span class="progression-total">+<b>0</b> XP</span>
            </div>
            <div class="progression-barre" role="progressbar" aria-valuemin="0"
                 aria-valuemax="${apres.xpPourSuivant}" aria-valuenow="${apres.xpDansNiveau}"
                 aria-label="Progression vers le niveau ${apres.niveau + 1}">
              <i style="width:${depart}%"></i>
            </div>
            <small class="progression-reste">${apres.xpDansNiveau} / ${apres.xpPourSuivant} XP · niveau ${apres.niveau + 1} ensuite</small>
            <ul class="progression-lignes">${pastilles}</ul>
          </div>
          ${quetesHtml}`;
        const barre = bloc.querySelector(".progression-barre i");
        const compteur = bloc.querySelector(".progression-total b");
        const duree = 1200, debut = performance.now();
        const compter = maintenant => {
          const t = Math.min(1, (maintenant - debut) / duree);
          compteur.textContent = String(Math.round(gain.total * (1 - Math.pow(1 - t, 3))));
          if (t < 1) requestAnimationFrame(compter);
        };
        requestAnimationFrame(() => requestAnimationFrame(maintenant => {
          barre.style.width = `${part(apres)}%`;
          compter(maintenant);
        }));
      }

      /* Quêtes sous le gain : une ligne par quête, sa barre, et l'éclat
         « accomplie » pour celles de la partie. */
      function progressionHtmlQuetes(vue) {
        if (!vue) return "";
        const ligne = (q, semaine) => {
          const pct = Math.round(100 * q.fait / q.cible);
          return `<li class="${q.finie ? "progression-quete-finie" : ""}">
            <span class="progression-quete-texte">${semaine ? "<em>Semaine</em> " : ""}${q.texte}</span>
            <span class="progression-quete-barre"><i style="width:${pct}%"></i></span>
            <b>${q.finie ? `✓ +${q.xp}` : `${q.fait}/${q.cible}`}</b>
          </li>`;
        };
        const lignes = vue.jour.map(q => ligne(q, false)).join("") + (vue.semaine ? ligne(vue.semaine, true) : "");
        return lignes ? `<ul class="progression-quetes">${lignes}</ul>` : "";
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
        semaine: jour => progressionSemaine(jour),
        /* Pour le menu : renouvelle les quêtes du jour si besoin, puis dit
           tout ce qu'il faut afficher. */
        etat: () => {
          const profil = progressionCharger();
          if (progressionRenouvelerQuetes(profil)) progressionEnregistrer(profil);
          return {
            ...progressionNiveauDepuisXp(profil.xp),
            quetes: progressionVueQuetes(profil),
            offrande: {
              dispo: progressionOffrandeDispo(profil),
              prochaine: profil.offrande.prochaine,
              vent: profil.offrande.vent,
              cases: PROGRESSION_OFFRANDES.map(o => o.texte)
            }
          };
        },
        reclamerOffrande: progressionReclamerOffrande,
        changerQuete: progressionChangerQuete,
        avancerQuetes: (profil, evenement) => progressionAvancerQuetes(profil, evenement),
        renouvelerQuetes: (profil, jour) => progressionRenouvelerQuetes(profil, jour),
        profilVide: progressionProfilVide,
        cle: PROGRESSION_STORAGE_KEY
      };
