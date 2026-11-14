      /* =====================================================================
         MOTEUR DE RÈGLES — porte d'entrée unique (refonte, étape 1)

         Avant ce fragment, les règles existaient en morceaux : les noyaux de
         rules-core.js appliquaient une action supposée valide, la légalité
         vivait dans les clics de ui.js (portée affichée, cartes disponibles,
         case libre…), les actions gratuites dans planner.js, et la fin de tour
         en trois exemplaires (ui.js, planner.js, diagnostics.js). Rien ne
         permettait de demander simplement : « ce coup est-il permis ici, et
         qu'en résulte-t-il ? ».

         Ce fragment répond à cette question, et à elle seule :

           reglesVerifier(action)   le coup est-il permis dans `state` ?
           reglesAppliquer(action)  le joue dans `state`, rend les événements
           applyTurnStartCore()     ouverture du tour (règle seule)
           applyEndTurnCore()       fin du tour complète (règle seule)

         et, sans toucher à la partie en cours, sur un état fourni :

           ILYOS_REGLES.verifier(etat, action) → { ok, raison }
           ILYOS_REGLES.appliquer(etat, action) → { ok, raison, etat, evenements }
           ILYOS_REGLES.finDeTour(etat)         → { ok, etat, evenements }

         Une action est une DONNÉE, la même que celle du planner :
           MOVE { charId, r, c, cost }        PUSH { pusherId, r, c, force }
           MAGIC { islandId, pivot, direction, turns }
           POSE { shapeKey, cells, owner, relCells?, anchor?, spawn? }
           DEPOT { charId, r, c }   RAMASSAGE { charId, artifactId }
           VOL { charId, artifactId }   TRANSMISSION { deId, versId }
           DISSOLUTION { islandId }     SEQUENCE { actions: [...] }
           FIN_TOUR {}

         La légalité ne recopie aucune règle : elle interroge les fonctions
         que l'interface utilise déjà (movementRange, availableActionCount,
         calculateIslandRotationAroundPivot, occupantPoussable…), puis joue le
         coup sur une copie avec le noyau : un noyau qui refuse rend le coup
         illégal. Un mode qui remplace l'une de ces fonctions (Rotation, Bond,
         œufs) est donc suivi sans rien changer ici.

         Les ÉVÉNEMENTS sont déduits de l'état avant/après (qui a bougé, qui
         est tombé, quelle couronne a changé de mains, quelles cartes sont
         parties) : ils disent ce qui s'est passé, quel que soit le mode qui
         l'a produit. L'interface ne les consomme pas encore (étape suivante).

         Rien ici ne dessine, ne joue de son ni n'attend : tout est appelé
         sous ilyosSimulationActive quand l'état n'est pas la partie réelle.
         ===================================================================== */

      const REGLES_TYPES_CARTES = ["MOVE", "PUSH", "MAGIC"];

      function reglesRefus(raison) {
        return { ok: false, raison };
      }

      function reglesEntier(valeur, min, max) {
        return Number.isInteger(valeur) && valeur >= min && valeur <= max;
      }

      function reglesCase(r, c) {
        return Number.isInteger(r) && Number.isInteger(c) && inside(r, c);
      }

      /** Le gardien appartient-il au joueur au trait ? (2 contre 2 et minion
       *  neutre : char.player est déjà le joueur qui l'a en main ce tour-ci,
       *  voir confierGardiensEquipe.) Une créature n'obéit à personne. */
      function reglesGardienDuJoueur(id) {
        const gardien = characterById(id);
        if (!gardien) return { refus: "gardien introuvable" };
        if (gardien.creature) return { refus: "une créature ne se commande pas" };
        if (gardien.player !== state.currentPlayer) return { refus: "ce gardien n'est pas au joueur qui a la main" };
        return { gardien };
      }

      /** Les cellules forment-elles la forme `shapeKey`, dans l'une des
       *  orientations que la pose propose (rotations, miroir si retournable) ? */
      function reglesCellulesDeLaForme(shapeKey, cells) {
        const forme = SHAPES[shapeKey];
        if (!forme || !Array.isArray(cells) || cells.length !== forme.cells.length) return false;
        const signature = liste => normalizeShape(liste).map(([r, c]) => `${r},${c}`).sort().join("|");
        const cible = signature(cells);
        const depart = normalizeShape(forme.cells);
        const orientations = forme.flippable
          ? [depart, normalizeShape(depart.map(([r, c]) => [r, -c]))]
          : [depart];
        for (const orientation of orientations) {
          let tournee = orientation;
          for (let i = 0; i < 4; i++) {
            if (signature(tournee) === cible) return true;
            tournee = rotateCells(tournee, 1);
          }
        }
        return false;
      }

      /** Contrôles propres à chaque type, AVANT d'essayer le noyau. Rend une
       *  raison de refus, ou null si rien ne s'y oppose. */
      function reglesControleAvant(action) {
        switch (action.type) {
          case "MOVE": {
            const { gardien, refus } = reglesGardienDuJoueur(action.charId);
            if (refus) return refus;
            if (!reglesCase(action.r, action.c)) return "case hors du plateau";
            const dispo = availableActionCount("MOVE");
            if (!reglesEntier(action.cost, 1, Math.max(1, dispo))) return "coût de déplacement invalide";
            if (action.cost > dispo) return "pas assez de cartes Déplacer";
            const portee = movementRange(gardien, dispo);
            const cle = key(action.r, action.c);
            if (!portee.has(cle)) return "case hors d'atteinte";
            const cout = portee.costs?.get(cle);
            if (Number.isFinite(cout) && cout !== action.cost) return "le coût ne correspond pas au chemin le plus court";
            return null;
          }
          case "PUSH": {
            const { gardien, refus } = reglesGardienDuJoueur(action.pusherId);
            if (refus) return refus;
            if (!reglesCase(action.r, action.c)) return "case hors du plateau";
            if (Math.abs(gardien.r - action.r) + Math.abs(gardien.c - action.c) !== 1) return "la cible doit être adjacente";
            if (!occupantPoussable(action.r, action.c)) return "rien à pousser sur cette case";
            const dispo = availableActionCount("PUSH");
            if (!reglesEntier(action.force, 1, Math.max(1, dispo)) || action.force > dispo) return "pas assez de cartes Pousser";
            return null;
          }
          case "MAGIC": {
            const ile = state.islands.find(i => i.id === action.islandId);
            if (!ile) return "île introuvable";
            if (availableActionCount("MAGIC") < 1) return "pas de carte Magie";
            if (action.direction !== 1 && action.direction !== -1) return "sens de rotation invalide";
            if (!reglesEntier(action.turns, 1, 4)) return "nombre de quarts de tour invalide";
            // Tour complet (360°) : l'île revient à sa place, la carte est jouée.
            if (action.turns === 4) return null;
            const pivot = action.pivot;
            if (!Array.isArray(pivot) || !ile.cells.some(([r, c]) => r === pivot[0] && c === pivot[1])) {
              return "le pivot doit être une case de l'île";
            }
            const rotation = calculateIslandRotationAroundPivot(ile, pivot[0], pivot[1], action.direction, action.turns);
            if (!rotation?.valid) return "l'île ne peut pas tourner ainsi";
            return null;
          }
          case "POSE": {
            if (action.owner !== state.currentPlayer) return "seul le joueur qui a la main pose une île";
            if (state.islandPlacedThisTurn) return "une île a déjà été posée ce tour";
            if (!SHAPES[action.shapeKey]) return "forme inconnue";
            const limite = shapeLimitPerOwner();
            if (limite && shapeUsageCountForOwner(action.owner, action.shapeKey) >= limite) return "plus aucune île de cette forme";
            if (!peutPayerIle(state.players[action.owner])) return "pas assez de cartes pour payer l'île";
            const cells = action.cells;
            if (!reglesCellulesDeLaForme(action.shapeKey, cells)) return "les cases ne forment pas cette île";
            if (!cells.every(([r, c]) => reglesCase(r, c) && !isLand(r, c))) return "l'île doit tenir sur des cases vides du plateau";
            if (!refletIleValide(cells)) return "le reflet de l'île ne tient pas";
            if (state.quick && !quickPoseAutorisee(cells)) return "pose non prévue par cette étape";
            if (action.spawn) {
              const [sr, sc] = action.spawn;
              if (!cells.some(([r, c]) => r === sr && c === sc) || characterAt(sr, sc)) return "case d'apparition invalide";
            }
            return null;
          }
          case "DEPOT":
          case "RAMASSAGE":
          case "VOL":
            return reglesGardienDuJoueur(action.charId).refus || null;
          case "TRANSMISSION":
            return reglesGardienDuJoueur(action.deId).refus || null;
          case "DISSOLUTION":
            return null;
          case "FIN_TOUR":
            return null;
          default:
            return "type d'action inconnu";
        }
      }

      /** Exécute une action déjà contrôlée, par le noyau correspondant. */
      function reglesExecuterNoyau(action) {
        switch (action.type) {
          case "DEPOT": return applyFreeDropCore(action.charId, action.r, action.c);
          case "RAMASSAGE": return applyFreePickupCore(action.charId, action.artifactId);
          case "VOL": return applyFreeStealCore(action.charId, action.artifactId);
          case "TRANSMISSION": return applyFreeHandoffCore(action.deId, action.versId);
          case "DISSOLUTION": return applyDissolutionCore(action.islandId);
          case "FIN_TOUR": return applyEndTurnCore();
          case "MAGIC":
            if (action.turns === 4) {
              const depense = consumeSelectedActionCore("MAGIC", 1);
              return depense ? { type: "MAGIC", islandId: action.islandId, tourComplet: true, cout: depense } : null;
            }
            return appliquerActionNoyau(action);
          default: return appliquerActionNoyau(action);
        }
      }

      /* Photo minimale de ce qui peut changer, pour déduire les événements. */
      function reglesPhoto() {
        const joueur = state.players[state.currentPlayer];
        const cartes = {};
        if (joueur) REGLES_TYPES_CARTES.forEach(type => { cartes[type] = availableActionCount(type, joueur); });
        return {
          joueur: state.currentPlayer,
          tour: state.turn,
          cartes,
          gardiens: new Map((state.characters || []).map(g => [g.id, { r: g.r, c: g.c, player: g.player }])),
          couronnes: new Map([state.artifact, state.secondArtifact].filter(Boolean)
            .map(a => [a.id, { r: a.r, c: a.c, porteur: a.carrierId ?? null, active: !!a.active }])),
          iles: new Map((state.islands || []).map(i => [i.id, i.cells.map(([r, c]) => key(r, c)).sort().join(";")])),
          scores: (state.players || []).map(p => p.score || 0),
          vainqueur: state.winner ?? null
        };
      }

      function reglesEvenements(avant, apres) {
        const evenements = [];
        for (const [id, a] of avant.iles) {
          if (!apres.iles.has(id)) evenements.push({ type: "ile-retiree", ileId: id });
          else if (apres.iles.get(id) !== a) evenements.push({ type: "ile-tournee", ileId: id });
        }
        for (const id of apres.iles.keys()) {
          if (!avant.iles.has(id)) evenements.push({ type: "ile-posee", ileId: id });
        }
        for (const [id, a] of avant.gardiens) {
          const b = apres.gardiens.get(id);
          if (!b) evenements.push({ type: "chute", gardienId: id, depuis: [a.r, a.c] });
          else if (a.r !== b.r || a.c !== b.c) evenements.push({ type: "gardien-deplace", gardienId: id, depuis: [a.r, a.c], vers: [b.r, b.c] });
        }
        for (const [id, b] of apres.gardiens) {
          if (!avant.gardiens.has(id)) evenements.push({ type: "apparition", gardienId: id, case: [b.r, b.c] });
        }
        for (const [id, a] of avant.couronnes) {
          const b = apres.couronnes.get(id);
          if (!b) continue;
          if (a.porteur !== b.porteur) {
            evenements.push({ type: "couronne-change-de-mains", couronneId: id, de: a.porteur, vers: b.porteur });
          } else if (b.porteur === null && (a.r !== b.r || a.c !== b.c)) {
            evenements.push({ type: "couronne-deplacee", couronneId: id, depuis: [a.r, a.c], vers: [b.r, b.c] });
          }
          if (!a.active && b.active) evenements.push({ type: "couronne-entree", couronneId: id });
        }
        if (avant.joueur === apres.joueur) {
          REGLES_TYPES_CARTES.forEach(type => {
            const depense = (avant.cartes[type] || 0) - (apres.cartes[type] || 0);
            if (depense > 0) evenements.push({ type: "cartes-depensees", carte: type, nombre: depense });
          });
        }
        avant.scores.forEach((score, joueur) => {
          if ((apres.scores[joueur] || 0) > score) {
            evenements.push({ type: "point", joueur, score: apres.scores[joueur] });
          }
        });
        if (avant.joueur !== apres.joueur || avant.tour !== apres.tour) {
          evenements.push({ type: "nouveau-tour", joueur: apres.joueur, tour: apres.tour });
        }
        if (avant.vainqueur === null && apres.vainqueur !== null) {
          evenements.push({ type: "fin-de-partie", vainqueur: apres.vainqueur === MATCH_NUL ? null : apres.vainqueur, nul: apres.vainqueur === MATCH_NUL });
        }
        return evenements;
      }

      /** Joue `action` dans `state` si elle est permise.
       *  ATTENTION : mute l'état courant. Sur la partie réelle, l'appelant doit
       *  jouer sur une copie (reglesVerifier) avant, s'il veut pouvoir refuser
       *  sans rien avoir touché ; ILYOS_REGLES le fait toujours. */
      function reglesAppliquer(action) {
        if (!state) return reglesRefus("aucune partie");
        if (!action || typeof action !== "object" || typeof action.type !== "string") return reglesRefus("action illisible");
        if (state.winner !== null && state.winner !== undefined) return reglesRefus("la partie est terminée");

        if (action.type === "SEQUENCE") {
          if (!Array.isArray(action.actions) || !action.actions.length) return reglesRefus("séquence vide");
          const evenements = [];
          for (let i = 0; i < action.actions.length; i++) {
            const etape = reglesAppliquer(action.actions[i]);
            if (!etape.ok) return reglesRefus(`étape ${i + 1} : ${etape.raison}`);
            evenements.push(...etape.evenements);
          }
          return { ok: true, raison: null, evenements };
        }

        const refus = reglesControleAvant(action);
        if (refus) return reglesRefus(refus);

        const avant = reglesPhoto();
        const resultat = reglesExecuterNoyau(action);
        if (!resultat) return reglesRefus("refusé par les règles");
        // Option « Validation immédiate » : même déclenchement qu'après chaque
        // action de la partie réelle (validerCouronnesImmediates, turns.js).
        if (action.type !== "FIN_TOUR" && validationImmediate() && state.winner === null) {
          scoreCrownsAtTurnStart(state.players[state.currentPlayer], { immediat: true });
        }
        return { ok: true, raison: null, evenements: reglesEvenements(avant, reglesPhoto()) };
      }

      /** Le coup est-il permis dans `state` ? Ne touche à rien.
       *
       *  Complet par défaut : contrôles propres au type, PUIS essai du noyau
       *  sur une copie. `essai: false` s'en tient aux contrôles, sans exécuter
       *  aucun noyau. C'est le mode des gardes de la PARTIE RÉELLE : plusieurs
       *  modes enveloppent les noyaux avec des effets hors de `state` (compte
       *  des cartes dépensées d'une énigme, carte armée du marché, relevé du
       *  tour adverse…), qu'un essai, même sur une copie, déclencherait. */
      function reglesVerifier(action, { essai = true } = {}) {
        if (!state) return reglesRefus("aucune partie");
        if (!essai) {
          if (!action || typeof action !== "object" || typeof action.type !== "string") return reglesRefus("action illisible");
          if (state.winner !== null && state.winner !== undefined) return reglesRefus("la partie est terminée");
          // Une séquence se juge pas à pas : sans essai, seul son premier pas
          // se lit sur l'état présent.
          const premier = action.type === "SEQUENCE" ? (action.actions || [])[0] : action;
          if (!premier) return reglesRefus("séquence vide");
          if (premier.type === "SEQUENCE") return reglesVerifier(premier, { essai: false });
          const refus = reglesControleAvant(premier);
          return refus ? reglesRefus(refus) : { ok: true, raison: null };
        }
        const copie = cloneStateForSimulation();
        // Contexte de pose que la copie de simulation ne garde pas.
        copie.quick = state.quick;
        copie.draft = state.draft;
        const { ok, raison } = withSimulatedState(copie, () => reglesAppliquer(action));
        return { ok, raison };
      }

      /** Garde des gestes du joueur (ui.js) : demande au moteur, juste avant
       *  d'agir, si le coup est permis. Refusé, rien ne bouge et le joueur
       *  lit pourquoi. Rend true si le coup est REFUSÉ. L'interface filtre
       *  déjà ses clics ; ce contrôle garantit que la porte d'entrée et
       *  l'interface disent la même chose. */
      function reglesRefuserAuJoueur(action) {
        const verdict = reglesVerifier(action, { essai: false });
        if (verdict.ok) return false;
        console.warn("[ILYOS] coup refusé par le moteur de règles :", action && action.type, verdict.raison);
        showToast(`Coup impossible : ${verdict.raison}.`);
        return true;
      }

      /* ---------------------------------------------------------------------
         TOUR : ouverture et fin, réduites à leurs effets de règle.

         Même ordre que la partie réelle (endTurn de ui.js, réserve physique
         puis beginTurn de turns.js) : cartes non jouées rangées, joueur
         suivant, gardiens d'équipe confiés, couronnes validées au début du
         tour, fin au décompte si plus aucune île ne tient, pioche, verrou du
         sanctuaire relâché, couronnes en attente entrées.
         ------------------------------------------------------------------- */
      /* `distribuer(joueur)` remplace la pioche : l'anticipation du planner
         y donne la main PLAUSIBLE du joueur (applyTurnTransitionCore), au lieu
         de lire l'ordre caché de sa pioche. */
      function applyTurnStartCore({ distribuer = null } = {}) {
        const entrant = state.players[state.currentPlayer];
        if (!entrant) return null;
        state.journalCoups = [];
        confierGardiensEquipe(entrant.id);
        confierMinionNeutre(entrant.id);
        scoreCrownsAtTurnStart(entrant);
        if (state.winner !== null && state.winner !== undefined) return { continuer: false, vainqueur: state.winner, raison: "couronnes" };

        if (finParPoseImpossible(entrant.id)) {
          const vainqueur = vainqueurAuxCouronnes();
          state.winner = vainqueur === null ? MATCH_NUL : vainqueur;
          return { continuer: false, vainqueur: state.winner, raison: "plateau-plein" };
        }

        if (distribuer) {
          distribuer(entrant);
        } else {
          entrant.hand = [];
          entrant.stash ||= { MOVE: 0, PUSH: 0, MAGIC: 0 };
          drawCards(entrant, cartesPiocheesParTour());
        }
        state.islandPlacedThisTurn = islandLimitReachedForPlayer(entrant.id) || poseImpossiblePour(entrant.id);
        state.centerCrownTakenThisTurn = false;
        faireEntrerCouronnesEnAttente();
        state.phase = "ACTION_SELECT";
        state.selectedActionType = null;
        state.selectedCharId = null;
        state.selectedIslandId = null;
        state.reachable = new Set();
        return { continuer: true, vainqueur: null };
      }

      /** La main passe au joueur suivant ; une manche s'achève après le
       *  dernier joueur. Même passage que la vraie fin de tour (ui.js). */
      function applyPassageTourCore() {
        // Le tour qui s'achève, coup par coup, pour l'arbitre en ligne.
        state.journalTourPrecedent = [...(state.journalCoups || []), { type: "FIN_TOUR" }];
        state.journalCoups = [];
        const dernier = state.currentPlayer === state.players.length - 1;
        state.currentPlayer = (state.currentPlayer + 1) % state.players.length;
        state.turn++;
        if (dernier) state.round = (state.round || 1) + 1;
      }

      /** Fin de tour complète. La pose d'île encore due est faite d'office,
       *  comme à la fin du minuteur (createAutomaticIslandAndSpawn). */
      function applyEndTurnCore() {
        const sortant = state.players[state.currentPlayer];
        if (!sortant) return null;
        let poseAutomatique = null;
        if (!obligationIleRemplie()) {
          const pose = findAutomaticIslandPlacement(sortant.id);
          if (pose) {
            poseAutomatique = applyIslandPlacementCore(pose.shapeKey, pose.cells, sortant.id, pose.relCells, pose.anchor);
          } else {
            state.islandPlacedThisTurn = true;
          }
        }

        rangerEtDefausserFinDeTour(sortant);
        applyPassageTourCore();

        const ouverture = applyTurnStartCore();
        return { type: "FIN_TOUR", poseAutomatique, ...(ouverture || { continuer: false, vainqueur: state.winner }) };
      }


      /* ---------------------------------------------------------------------
         JOURNAL DES COUPS ET ARBITRE EN LIGNE (étape 4, en observation)

         Chaque coup réellement joué est noté en DONNÉE dans state.journalCoups
         (remis à zéro au début du tour ; le tour achevé passe dans
         state.journalTourPrecedent, terminé par FIN_TOUR). Le journal voyage
         avec l'état en ligne et suit l'annulation (snapshotState).

         En ligne, l'hôte garde l'état du début du tour de l'invité, rejoue le
         journal reçu avec le moteur et compare le plateau obtenu à celui que
         l'invité annonce. Pour l'instant il OBSERVE seulement : un désaccord
         est compté et signalé dans la console, l'état est accepté comme avant.
         Le refus viendra quand des parties réelles auront montré que l'arbitre
         ne contredit jamais un joueur honnête.
         ------------------------------------------------------------------- */
      const REGLES_CHAMPS = {
        MOVE: ["charId", "r", "c", "cost"],
        PUSH: ["pusherId", "r", "c", "force"],
        MAGIC: ["islandId", "pivot", "direction", "turns"],
        POSE: ["shapeKey", "cells", "owner", "relCells", "anchor", "spawn"],
        DEPOT: ["charId", "r", "c"],
        RAMASSAGE: ["charId", "artifactId"],
        VOL: ["charId", "artifactId"],
        TRANSMISSION: ["deId", "versId"],
        DISSOLUTION: ["islandId"]
      };

      function reglesNoter(action) {
        if (ilyosSimulationActive || !state || !action || !REGLES_CHAMPS[action.type]) return;
        const note = { type: action.type };
        REGLES_CHAMPS[action.type].forEach(champ => {
          if (action[champ] !== undefined && action[champ] !== null) note[champ] = copieRapide(action[champ]);
        });
        (state.journalCoups ||= []).push(note);
      }

      /** Le gardien d'une île posée par le joueur naît après la pose : sa case
       *  complète la dernière pose notée. */
      function reglesNoterApparition(r, c) {
        if (ilyosSimulationActive || !state) return;
        const pose = [...(state.journalCoups || [])].reverse().find(a => a.type === "POSE");
        if (pose && !pose.spawn) pose.spawn = [r, c];
      }

      /** Ce que l'arbitre compare : le plateau et le score, pas les cartes
       *  (une pioche remélangée tire au hasard). */
      function reglesEmpreintePlateau(etat) {
        const iles = (etat.islands || []).map(i => `${i.id}:${i.cells.map(([r, c]) => `${r},${c}`).sort().join(";")}`).sort();
        const gardiens = (etat.characters || []).map(g => `${g.id}:${g.r},${g.c}:${g.player}`).sort();
        const couronnes = [etat.artifact, etat.secondArtifact].filter(Boolean)
          .map(a => `${a.id}:${a.carrierId ?? "-"}:${a.carrierId ? "" : `${a.r},${a.c}`}:${a.active ? 1 : 0}`).sort();
        return JSON.stringify({
          iles, gardiens, couronnes,
          scores: (etat.players || []).map(p => p.score || 0),
          main: etat.currentPlayer, tour: etat.turn, vainqueur: etat.winner ?? null
        });
      }

      /** Rejoue `actions` depuis `depart` ; rend l'état obtenu ou le refus. */
      function reglesRejouer(depart, actions) {
        let copie;
        try {
          copie = reglesEtatDepuis(depart);
        } catch (erreur) {
          return { ok: false, raison: String(erreur.message || erreur) };
        }
        return withSimulatedState(copie, () => {
          for (let i = 0; i < actions.length; i++) {
            const r = reglesAppliquer(actions[i]);
            if (!r.ok) return { ok: false, raison: `coup ${i + 1} (${actions[i].type}) : ${r.raison}` };
          }
          return { ok: true, raison: null, etat: copie };
        });
      }

      const reglesArbitre = { reference: null, verifications: 0, accords: 0, desaccords: 0, ignores: 0, dernier: null };

      /** L'hôte note l'état du début du tour de l'invité (journal vide). */
      function reglesArbitreReference(etat, joueurLocal) {
        if (!etat || etat.currentPlayer === joueurLocal || (etat.journalCoups || []).length) return;
        reglesArbitre.reference = JSON.stringify(etat);
      }

      /** Juge un état reçu de l'invité. N'en refuse aucun (observation). */
      function reglesArbitreObserver(recu, joueurLocal) {
        try {
          if (!reglesArbitre.reference || !recu) return null;
          const finDeTour = recu.currentPlayer === joueurLocal;
          if (!finDeTour && recu.phase === "PLACE_SPAWN") { reglesArbitre.ignores++; return null; }
          const coups = finDeTour ? recu.journalTourPrecedent : recu.journalCoups;
          if (!Array.isArray(coups)) { reglesArbitre.ignores++; return null; }
          reglesArbitre.verifications++;
          const rejeu = reglesRejouer(reglesArbitre.reference, coups);
          const accord = rejeu.ok && reglesEmpreintePlateau(rejeu.etat) === reglesEmpreintePlateau(recu);
          const verdict = { accord, raison: rejeu.ok ? (accord ? null : "plateau différent de celui rejoué") : rejeu.raison, coups: coups.length, finDeTour };
          reglesArbitre.dernier = verdict;
          if (accord) reglesArbitre.accords++;
          else {
            reglesArbitre.desaccords++;
            console.warn("[ILYOS] arbitre en ligne : désaccord (observation seule)", verdict);
          }
          if (finDeTour) reglesArbitre.reference = null;
          return verdict;
        } catch (erreur) {
          reglesArbitre.ignores++;
          return null;
        }
      }

      /* ---------------------------------------------------------------------
         API PUBLIQUE, sur un état FOURNI (objet ou JSON de snapshotState).
         La partie en cours n'est jamais touchée.
         ------------------------------------------------------------------- */
      function reglesEtatDepuis(etat) {
        const brut = typeof etat === "string" ? JSON.parse(etat) : copieRapide(etat);
        if (!brut || !Array.isArray(brut.players) || !Array.isArray(brut.islands) || !Array.isArray(brut.characters)) {
          throw new Error("état illisible");
        }
        if (brut.boardSize && Number(brut.boardSize) !== GRID) {
          throw new Error(`plateau ${brut.boardSize}×${brut.boardSize} : le moteur est réglé sur ${GRID}×${GRID}`);
        }
        brut.reachable = new Set();
        brut.smartPushTargets = new Set();
        brut.undoHistory = [];
        brut.fxCells = [];
        brut.crownTransferTargetIds = [];
        brut.smartHoverPath = [];
        brut.winner ??= null;
        brut.couronnesEnAttente ||= [];
        brut.onlineMode = false;
        return brut;
      }

      function reglesSurEtat(etat, action) {
        let copie;
        try {
          copie = reglesEtatDepuis(etat);
        } catch (erreur) {
          return { ok: false, raison: String(erreur.message || erreur), etat: null, evenements: [] };
        }
        const resultat = withSimulatedState(copie, () => reglesAppliquer(action));
        return resultat.ok
          ? { ok: true, raison: null, etat: copie, evenements: resultat.evenements }
          : { ok: false, raison: resultat.raison, etat: null, evenements: [] };
      }

      window.ILYOS_REGLES = {
        verifier: (etat, action) => {
          const { ok, raison } = reglesSurEtat(etat, action);
          return { ok, raison };
        },
        appliquer: reglesSurEtat,
        finDeTour: etat => reglesSurEtat(etat, { type: "FIN_TOUR" }),
        /* Sur la partie en cours, sans la modifier. */
        verifierIci: action => reglesVerifier(action),
        rejouer: (etat, actions) => {
          const r = reglesRejouer(etat, actions || []);
          return r.ok ? { ok: true, raison: null, etat: r.etat, empreinte: reglesEmpreintePlateau(r.etat) } : r;
        },
        empreintePlateau: etat => reglesEmpreintePlateau(typeof etat === "string" ? JSON.parse(etat) : etat),
        journal: () => copieRapide((state && state.journalCoups) || []),
        arbitre: () => { const { reference, ...bilan } = reglesArbitre; return { ...bilan, reference: !!reference }; }
      };
