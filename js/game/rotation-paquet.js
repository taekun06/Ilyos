      /* =====================================================================
         MODE ROTATION — couche DECKBUILDING : le marché du sanctuaire.

         Règles (une ligne chacune, transposables telles quelles en jeu de
         plateau) :
         — À côté du plateau, 3 cartes du marché, face visible, communes.
         — Une fois par tour, tu en achètes une pour 2 cartes (même prix et
           même ordre de paiement qu'une île payante : Déplacer, puis
           Pousser, puis Magie). Elle va dans ta défausse ; la place se
           remplit aussitôt.
         — Affiner : en achetant, tu peux exiler un Déplacer de ta défausse.
           Le paquet ne descend jamais sous 8 cartes.
         — Cartes fortes : Élan vaut 2 Déplacer, Bélier 2 Pousser, Arcane
           2 Magie. Une carte forte se joue en premier, peut se jouer en deux
           fois dans le tour, et ne va jamais en réserve : elle repart à la
           défausse en fin de tour.

         Les cartes fortes portent leur propre nom d'action (ELAN, BELIER,
         ARCANE) : la réserve physique et l'ancien code les ignorent donc
         d'office. Seuls availableActionCount et consumeAvailableActions les
         comptent, enveloppés ici : l'IA, qui ne lit les cartes que par ces
         deux fonctions, en profite sans rien savoir de plus.
         ===================================================================== */
      const PAQUET_CARTES = {
        ELAN: { type: "MOVE", valeur: 2, nom: "Élan", effet: "Vaut 2 Déplacer" },
        BELIER: { type: "PUSH", valeur: 2, nom: "Bélier", effet: "Vaut 2 Pousser" },
        ARCANE: { type: "MAGIC", valeur: 2, nom: "Arcane", effet: "Vaut 2 Magie" },
        MOVE: { type: "MOVE", valeur: 1, nom: "Déplacer", effet: "1 case" },
        PUSH: { type: "PUSH", valeur: 1, nom: "Pousser", effet: "Force 1" },
        MAGIC: { type: "MAGIC", valeur: 1, nom: "Magie", effet: "Tourne une île" }
      };
      /* Nom et type affichés des cartes fortes (pioche, défausse, infobulles). */
      Object.entries(PAQUET_CARTES).forEach(([cle, def]) => {
        if (def.valeur > 1) ACTIONS[cle] = { ...ACTIONS[def.type], name: def.nom, desc: def.effet, type: def.type };
      });
      const PAQUET_PILE_MARCHE = [
        "ELAN", "ELAN", "ELAN", "BELIER", "BELIER", "BELIER", "ARCANE", "ARCANE",
        "PUSH", "PUSH", "PUSH", "MAGIC", "MAGIC", "MAGIC"
      ];
      const PAQUET_PRIX = 2;
      const PAQUET_MINIMUM = 8;
      const PAQUET_PAIEMENT = ["MOVE", "PUSH", "MAGIC"];

      function paquetActif(source = state) {
        return !!source?.rotation?.couches?.deckbuilding;
      }

      function carteForte(carte) {
        return !!carte && carte.action in PAQUET_CARTES && PAQUET_CARTES[carte.action].valeur > 1;
      }

      /** Cartes fortes de ce type encore chargées dans la main. */
      function paquetCartesFortes(type, player) {
        return (player?.hand || []).filter(c => carteForte(c) && PAQUET_CARTES[c.action].type === type
          && (c.restant ?? PAQUET_CARTES[c.action].valeur) > 0);
      }

      function paquetCharges(type, player) {
        return paquetCartesFortes(type, player)
          .reduce((total, c) => total + (c.restant ?? PAQUET_CARTES[c.action].valeur), 0);
      }

      /** Toutes les cartes du joueur : pioche, main, défausse et réserve. */
      function paquetTaille(player) {
        return ["deck", "hand", "discard", "reserveCards"]
          .reduce((total, zone) => total + (Array.isArray(player?.[zone]) ? player[zone].length : 0), 0);
      }

      function paquetCompte(player, action) {
        return ["deck", "hand", "discard", "reserveCards"].reduce((total, zone) =>
          total + (player?.[zone] || []).filter(c => c?.action === action).length, 0);
      }

      /* ---------- Comptes et consommation ------------------------------- */
      const paquetAvailableBase = availableActionCount;
      availableActionCount = function availableActionCountPaquet(type, player = currentPlayer()) {
        const base = paquetAvailableBase(type, player);
        return paquetActif() && player ? base + paquetCharges(type, player) : base;
      };

      const paquetConsumeBase = consumeAvailableActions;
      consumeAvailableActions = function consumeAvailableActionsPaquet(type, count = 1, player = currentPlayer()) {
        if (!paquetActif() || !player || count < 1) return paquetConsumeBase(type, count, player);
        let reste = Math.min(Math.floor(count), availableActionCount(type, player));
        const demande = reste;
        let forte = false;
        /* Les cartes fortes d'abord : elles ne peuvent pas aller en réserve,
           les cartes simples si. */
        for (const carte of paquetCartesFortes(type, player)) {
          if (reste <= 0) break;
          const charge = carte.restant ?? PAQUET_CARTES[carte.action].valeur;
          const pris = Math.min(reste, charge);
          carte.restant = charge - pris;
          reste -= pris;
          forte = true;
          if (carte.restant <= 0) {
            player.hand = player.hand.filter(c => c !== carte);
            player.discard = Array.isArray(player.discard) ? player.discard : [];
            player.discard.push({ ...carte, restant: PAQUET_CARTES[carte.action].valeur, used: false });
          }
        }
        if (reste > 0) reste -= paquetConsumeBase(type, reste, player);
        if (forte) carteJoueeEnvol(type, player);
        return demande - reste;
      };

      /* Une carte forte piochée repart pleine. */
      const paquetDrawCardsBase = drawCards;
      drawCards = function drawCardsPaquet(player, count) {
        const avant = new Set((player?.hand || []).map(c => c));
        paquetDrawCardsBase(player, count);
        (player?.hand || []).forEach(c => {
          if (!avant.has(c) && carteForte(c)) c.restant = PAQUET_CARTES[c.action].valeur;
        });
      };

      /* ---------- Marché ------------------------------------------------- */
      function paquetInstaller() {
        if (!paquetActif() || state.rotation.marche) return;
        const pile = shuffle(PAQUET_PILE_MARCHE.slice());
        state.rotation.marche = { visibles: pile.splice(0, 3), pile, achatTour: 0, exils: {}, affiner: {} };
      }

      /** Pourquoi ce joueur ne peut pas acheter maintenant ; null s'il peut. */
      function paquetRefusAchat(player = currentPlayer()) {
        const marche = state?.rotation?.marche;
        if (!paquetActif() || !marche || !player) return "Pas de marché dans cette partie.";
        if (state.winner !== null && state.winner !== undefined) return "La partie est finie.";
        if (marche.achatTour === state.turn) return "Un seul achat par tour.";
        if (state.phase !== "ACTION_SELECT") return "Termine d’abord l’action en cours.";
        if (cartesDisponibles(player) < PAQUET_PRIX) return "Il faut 2 cartes pour acheter.";
        return null;
      }

      /** Achète la carte `index` du marché pour le joueur au trait. */
      function paquetAcheter(index, exiler = null) {
        const player = currentPlayer();
        const marche = state?.rotation?.marche;
        const refus = paquetRefusAchat(player);
        const action = marche?.visibles?.[index];
        if (refus || !action) {
          if (refus && !ilyosSimulationActive) showToast(refus);
          return false;
        }
        if (!ilyosSimulationActive) saveUndoSnapshot();
        let paye = 0;
        for (const type of PAQUET_PAIEMENT) {
          while (paye < PAQUET_PRIX && availableActionCount(type, player) > 0) {
            const pris = consumeAvailableActions(type, Math.min(PAQUET_PRIX - paye, availableActionCount(type, player)), player);
            if (pris < 1) break;
            paye += pris;
          }
        }
        const carte = { id: `P${player.id}-M${state.turn}-${gameRandom().toString(36).slice(2, 7)}`, action, used: false };
        if (carteForte(carte)) carte.restant = PAQUET_CARTES[action].valeur;
        player.discard = Array.isArray(player.discard) ? player.discard : [];
        player.discard.push(carte);
        marche.visibles.splice(index, 1);
        if (marche.pile.length) marche.visibles.splice(index, 0, marche.pile.shift());
        marche.achatTour = state.turn;
        player.achats = (player.achats || 0) + 1;

        const veutExiler = exiler ?? (marche.affiner[player.id] !== false);
        let exile = false;
        if (veutExiler && paquetTaille(player) > PAQUET_MINIMUM) {
          const i = player.discard.map(c => c.action).lastIndexOf("MOVE");
          if (i >= 0) {
            player.discard.splice(i, 1);
            marche.exils[player.id] = (marche.exils[player.id] || 0) + 1;
            exile = true;
          }
        }
        if (!ilyosSimulationActive) {
          playSfx("crownTake");
          showToast(`${player.name} achète ${PAQUET_CARTES[action].nom}${exile ? " et exile un Déplacer" : ""}.`);
          renderAll();
        }
        return true;
      }

      /* L'IA achète en fin de tour, avec les cartes de sa main que son plan
         n'a pas jouées. Choix simple et lisible : la carte la plus forte,
         en préférant le type dont son paquet manque le plus. */
      const PAQUET_PRIORITE = { BELIER: 6, ELAN: 5, ARCANE: 5, MAGIC: 3, PUSH: 2, MOVE: 0 };
      function plannerChoisirAchat(playerId) {
        const player = state?.players?.[playerId];
        if (paquetRefusAchat(player)) return null;
        const reste = (player.hand || []).reduce((total, c) =>
          total + (c.used ? 0 : carteForte(c) ? (c.restant ?? 0) : 1), 0);
        if (reste < PAQUET_PRIX) return null;
        const visibles = state.rotation.marche.visibles;
        let meilleur = -1, note = -Infinity;
        const valeurDuType = type => Object.keys(PAQUET_CARTES)
          .filter(k => PAQUET_CARTES[k].type === type)
          .reduce((total, k) => total + paquetCompte(player, k) * PAQUET_CARTES[k].valeur, 0);
        visibles.forEach((action, i) => {
          const manque = 6 - Math.min(6, valeurDuType(PAQUET_CARTES[action].type));
          const n = PAQUET_PRIORITE[action] + manque * .4;
          if (n > note) { note = n; meilleur = i; }
        });
        if (meilleur < 0) return null;
        return { type: "ACHAT", index: meilleur, exiler: paquetCompte(player, "MOVE") > 4 };
      }

      /* ---------- Tours ------------------------------------------------- */
      const paquetBeginTurnBase = beginTurn;
      beginTurn = function beginTurnPaquet() {
        paquetBeginTurnBase();
        if (!paquetActif()) return;
        paquetInstaller();
        if (state.turn === 1 && !state.rotation.marche.annonce && !ilyosSimulationActive) {
          state.rotation.marche.annonce = true;
          setTimeout(() => showToast("Marché ouvert : une carte par tour pour 2 cartes de ta main."), 3400);
        }
        paquetRendreMarche();
      };

      const paquetEndTurnBase = endTurn;
      endTurn = async function endTurnPaquet(force = false) {
        const player = state && currentPlayer();
        if (paquetActif() && player?.isAI && state.winner === null) {
          const achat = plannerChoisirAchat(player.id);
          if (achat) paquetAcheter(achat.index, achat.exiler);
        }
        return paquetEndTurnBase(force);
      };

      /* ---------- Interface ---------------------------------------------- */
      let paquetPanneau = null;
      let paquetEmpreinte = "";

      function paquetIcone(action) {
        const def = PAQUET_CARTES[action];
        return HUD_V2_ICONS[def.type] || "";
      }

      function paquetRendreMarche() {
        if (typeof document === "undefined" || ilyosSimulationActive) return;
        const ecran = els?.gameScreen;
        const actif = paquetActif() && !!state?.rotation?.marche && ecran;
        if (!actif) {
          if (paquetPanneau) paquetPanneau.hidden = true;
          return;
        }
        if (!paquetPanneau) {
          paquetPanneau = document.createElement("aside");
          paquetPanneau.className = "rt-marche";
          paquetPanneau.setAttribute("aria-label", "Marché du sanctuaire");
          paquetPanneau.addEventListener("click", evenement => {
            const bouton = evenement.target.closest("[data-marche]");
            if (bouton) { evenement.stopPropagation(); paquetAcheter(Number(bouton.dataset.marche)); return; }
            const bascule = evenement.target.closest("[data-affiner]");
            if (bascule) {
              evenement.stopPropagation();
              const joueur = currentPlayer();
              const marche = state.rotation.marche;
              marche.affiner[joueur.id] = marche.affiner[joueur.id] === false;
              paquetRendreMarche();
            }
          });
          ecran.appendChild(paquetPanneau);
        }
        const joueur = currentPlayer();
        const marche = state.rotation.marche;
        const refus = joueur?.isAI ? "Tour de l’adversaire." : paquetRefusAchat(joueur);
        const affiner = marche.affiner[joueur?.id] !== false;
        const empreinte = JSON.stringify([marche.visibles, marche.pile.length, refus, affiner, joueur?.id, paquetTaille(joueur)]);
        paquetPanneau.hidden = false;
        if (empreinte === paquetEmpreinte) return;
        paquetEmpreinte = empreinte;
        const cartes = marche.visibles.map((action, i) => {
          const def = PAQUET_CARTES[action];
          const forte = def.valeur > 1;
          return `<button type="button" class="rt-mcarte rt-mcarte-${def.type.toLowerCase()}${forte ? " forte" : ""}" data-marche="${i}"
              ${refus ? "disabled" : ""} title="${refus || `Acheter ${def.nom} pour 2 cartes`}">
            <span class="rt-mcarte-ico">${paquetIcone(action)}${forte ? "<em>×2</em>" : ""}</span>
            <b>${def.nom}</b><i>${def.effet}</i></button>`;
        }).join("");
        paquetPanneau.innerHTML = `<div class="rt-marche-tete"><span>MARCHÉ</span><small>2 cartes · 1 achat par tour</small></div>
          <div class="rt-marche-cartes">${cartes || "<p class=\"rt-marche-vide\">Marché vide</p>"}</div>
          <button type="button" class="rt-marche-affiner${affiner ? " on" : ""}" data-affiner aria-pressed="${affiner}"
            title="En achetant, retirer un Déplacer de ta défausse (paquet jamais sous ${PAQUET_MINIMUM} cartes)">
            <span class="rt-bascule" aria-hidden="true"></span>Exiler un Déplacer</button>
          <div class="rt-marche-pied">Paquet ${paquetTaille(joueur)} · Pile ${marche.pile.length}</div>`;
      }

      /* Marque les boutons du dock quand une carte forte est en main. */
      function paquetMarquerDock() {
        if (typeof document === "undefined") return;
        const joueur = state && currentPlayer();
        [["MOVE", "hudV2MoveCount"], ["PUSH", "hudV2PushCount"], ["MAGIC", "hudV2MagicCount"]].forEach(([type, id]) => {
          const bouton = document.getElementById(id);
          if (!bouton) return;
          const fortes = paquetActif() && joueur ? paquetCartesFortes(type, joueur) : [];
          bouton.classList.toggle("hud-v2-pill-forte", fortes.length > 0);
          if (fortes.length) bouton.title = `${bouton.title} · ${fortes.map(c => PAQUET_CARTES[c.action].nom).join(", ")} en main`;
        });
      }

      const paquetRenderAllBase = renderAll;
      renderAll = function renderAllPaquet(...args) {
        const resultat = paquetRenderAllBase.apply(this, args);
        if (!ilyosSimulationActive) {
          try {
            paquetRendreMarche();
            paquetMarquerDock();
          } catch (erreur) {
            console.warn("[ILYOS] marché", erreur);
          }
        }
        return resultat;
      };

      window.ILYOS_ROTATION_PAQUET = {
        etat: () => (state?.rotation?.marche ? JSON.parse(JSON.stringify(state.rotation.marche)) : null),
        acheter: (index, exiler) => paquetAcheter(index, exiler),
        refus: () => paquetRefusAchat(),
        choixIA: playerId => plannerChoisirAchat(playerId ?? state?.currentPlayer),
        paquet: playerId => {
          const joueur = state?.players?.[playerId ?? state?.currentPlayer];
          return joueur ? { taille: paquetTaille(joueur), cartes: ["deck", "hand", "discard", "reserveCards"].flatMap(z => (joueur[z] || []).map(c => c.action)) } : null;
        }
      };
