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
      ACTIONS.BOUE = { name: "Boue", icon: "🟫", desc: "Ne fait rien : affine ton paquet pour t’en débarrasser.", bg: "#5a4a32" };
      /* 19 cartes : 3 au marché et 9 révélées au choix de départ, dont 3
         reviennent sous la pile en duel. */
      const PAQUET_PILE_MARCHE = [
        "ELAN", "ELAN", "ELAN", "ELAN", "BELIER", "BELIER", "BELIER", "BELIER",
        "ARCANE", "ARCANE", "ARCANE",
        "PUSH", "PUSH", "PUSH", "PUSH", "MAGIC", "MAGIC", "MAGIC", "MAGIC"
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
          const actions = player.discard.map(c => c.action);
          const boue = actions.lastIndexOf("BOUE");
          const i = boue >= 0 ? boue : actions.lastIndexOf("MOVE");
          if (i >= 0) {
            player.discard.splice(i, 1);
            marche.exils[player.id] = (marche.exils[player.id] || 0) + 1;
            exile = true;
          }
        }
        if (!ilyosSimulationActive) {
          playSfx("crownTake");
          showToast(`${player.name} achète ${PAQUET_CARTES[action].nom}${exile ? " et affine son paquet" : ""}.`);
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
          total + (c.used || !(c.action in PAQUET_CARTES) ? 0 : carteForte(c) ? (c.restant ?? 0) : 1), 0);
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

      /* ---------- Choix de départ (paquet construit) -------------------- */
      /* Avant le premier coup, on révèle 9 cartes de la pile. Le dernier
         joueur du tour choisit le premier, puis l'ordre remonte, et ainsi de
         suite jusqu'à 3 cartes chacun : choisir en premier compense le fait
         de jouer en dernier. Chaque carte prise remplace un Déplacer du
         paquet ; celles qui restent repartent sous la pile du marché.
         Personne ne joue tant que le choix n'est pas fini. */
      const PAQUET_CHOIX_PAR_JOUEUR = 3;
      const PAQUET_CHOIX_REVELEES = 9;

      function choixEnCours(source = state) {
        const choix = source?.rotation?.choix;
        return !!choix && !choix.fini;
      }

      function choixJoueurAuTrait() {
        const choix = state?.rotation?.choix;
        return choixEnCours() ? state.players[choix.ordre[choix.pris.length]] : null;
      }

      function choixInstaller() {
        if (!paquetActif() || state.rotation.choix || state.turn !== 1) return;
        const marche = state.rotation.marche;
        const n = state.players.length;
        const tour = Array.from({ length: n }, (_, i) => state.players[(state.currentPlayer + i) % n].id);
        const remontee = tour.slice().reverse();
        const ordre = [];
        for (let k = 0; k < PAQUET_CHOIX_PAR_JOUEUR; k++) ordre.push(...remontee);
        const revelees = Math.max(PAQUET_CHOIX_REVELEES, ordre.length);
        const cartes = marche.pile.splice(0, Math.min(revelees, marche.pile.length));
        state.rotation.choix = { cartes, ordre: ordre.slice(0, cartes.length), pris: [], fini: !cartes.length };
      }

      /** Le joueur au trait du choix de départ prend la carte `index`. */
      function choixPrendre(index) {
        const choix = state?.rotation?.choix;
        const player = choixJoueurAuTrait();
        const action = choix?.cartes?.[index];
        if (!player || !action || choix.pris.some(x => x.index === index)) return false;
        const carte = { id: `P${player.id}-C${choix.pris.length}-${gameRandom().toString(36).slice(2, 7)}`, action, used: false };
        if (carteForte(carte)) carte.restant = PAQUET_CARTES[action].valeur;
        // Remplace un Déplacer : d'abord dans la pioche, sinon dans la main.
        for (const zone of ["deck", "discard", "hand"]) {
          const i = (player[zone] || []).findIndex(c => c.action === "MOVE");
          if (i >= 0) { player[zone].splice(i, 1); break; }
        }
        player.deck = Array.isArray(player.deck) ? player.deck : [];
        player.deck.splice(Math.floor(gameRandom() * (player.deck.length + 1)), 0, carte);
        choix.pris.push({ joueur: player.id, action, index });
        if (choix.pris.length >= choix.ordre.length) {
          choix.fini = true;
          // Les cartes non prises repartent sous la pile du marché.
          const restes = choix.cartes.filter((_, i) => !choix.pris.some(x => x.index === i));
          state.rotation.marche.pile.push(...restes);
        }
        if (!ilyosSimulationActive) {
          playSfx("crownTake");
          showToast(`${player.name} prend ${PAQUET_CARTES[action].nom}.`);
          renderAll();
          choixProgrammerIA();
        }
        return true;
      }

      /* L'IA prend la carte la plus forte, en préférant le type qui manque à
         son paquet : même lecture que pour l'achat au marché. */
      function plannerChoisirDepart(playerId) {
        const choix = state?.rotation?.choix;
        const player = state?.players?.[playerId];
        if (!choixEnCours() || !player || choixJoueurAuTrait()?.id !== playerId) return null;
        const valeurDuType = type => Object.keys(PAQUET_CARTES)
          .filter(k => PAQUET_CARTES[k].type === type)
          .reduce((total, k) => total + paquetCompte(player, k) * PAQUET_CARTES[k].valeur, 0);
        let meilleur = -1, note = -Infinity;
        choix.cartes.forEach((action, i) => {
          if (choix.pris.some(x => x.index === i)) return;
          const n = PAQUET_PRIORITE[action] + (6 - Math.min(6, valeurDuType(PAQUET_CARTES[action].type))) * .4;
          if (n > note) { note = n; meilleur = i; }
        });
        return meilleur < 0 ? null : { type: "CHOIX_DEPART", index: meilleur };
      }

      /* Rappelée à chaque rendu : un joueur qui devient ordinateur en cours
         de route (partie automatique) choisit aussi. */
      let choixMinuteur = null;
      let choixMinuteurCle = null;
      function choixProgrammerIA() {
        const joueur = choixJoueurAuTrait();
        const cle = joueur?.isAI ? `${joueur.id}:${state.rotation.choix.pris.length}` : null;
        if (cle === choixMinuteurCle) return;
        clearTimeout(choixMinuteur);
        choixMinuteurCle = cle;
        if (!cle) return;
        choixMinuteur = setTimeout(() => {
          choixMinuteurCle = null;
          const decision = choixJoueurAuTrait()?.id === joueur.id ? plannerChoisirDepart(joueur.id) : null;
          if (decision) choixPrendre(decision.index);
        }, 900);
      }

      /* L'ordinateur ne commence son tour qu'une fois le choix terminé. */
      const paquetRunAIBase = runAITurn;
      runAITurn = async function runAITurnPaquet(token) {
        while (state && choixEnCours()) await sleep(250);
        return paquetRunAIBase(token);
      };

      /* ---------- Tours ------------------------------------------------- */
      const paquetBeginTurnBase = beginTurn;
      beginTurn = function beginTurnPaquet() {
        paquetBeginTurnBase();
        if (!paquetActif()) return;
        paquetInstaller();
        choixInstaller();
        if (state.turn === 1 && !state.rotation.marche.annonce && !ilyosSimulationActive) {
          state.rotation.marche.annonce = true;
          setTimeout(() => showToast("Marché ouvert : une carte par tour pour 2 cartes de ta main."), 3400);
        }
        paquetRendreMarche();
        if (!ilyosSimulationActive) { paquetRendreChoix(); choixProgrammerIA(); }
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
            const enButin = typeof creaturesButinEnAttente === "function" && creaturesButinEnAttente(currentPlayer()?.id) > 0;
            if (bouton) {
              evenement.stopPropagation();
              if (enButin) creaturesPrendreButin(Number(bouton.dataset.marche));
              else paquetAcheter(Number(bouton.dataset.marche));
              return;
            }
            if (evenement.target.closest("[data-butin-exil]")) { evenement.stopPropagation(); creaturesPrendreButin("exil"); return; }
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
        const butin = !joueur?.isAI && typeof creaturesButinEnAttente === "function" ? creaturesButinEnAttente(joueur?.id) : 0;
        const refus = joueur?.isAI ? "Tour de l’adversaire." : butin ? null : paquetRefusAchat(joueur);
        const affiner = marche.affiner[joueur?.id] !== false;
        const empreinte = JSON.stringify([marche.visibles, marche.pile.length, refus, affiner, joueur?.id, paquetTaille(joueur), butin]);
        paquetPanneau.hidden = false;
        if (empreinte === paquetEmpreinte) return;
        paquetEmpreinte = empreinte;
        const cartes = marche.visibles.map((action, i) => {
          const def = PAQUET_CARTES[action];
          const forte = def.valeur > 1;
          return `<button type="button" class="rt-mcarte rt-mcarte-${def.type.toLowerCase()}${forte ? " forte" : ""}" data-marche="${i}"
              ${refus ? "disabled" : ""} title="${refus || (butin ? `Prendre ${def.nom} gratuitement (butin)` : `Acheter ${def.nom} pour 2 cartes`)}">
            <span class="rt-mcarte-ico">${paquetIcone(action)}${forte ? "<em>×2</em>" : ""}</span>
            <b>${def.nom}</b><i>${def.effet}</i></button>`;
        }).join("");
        paquetPanneau.classList.toggle("butin", !!butin);
        paquetPanneau.innerHTML = `<div class="rt-marche-tete"><span>${butin ? "BUTIN" : "MARCHÉ"}</span><small>${butin ? "Une carte gratuite, ou exile 2 cartes" : "2 cartes · 1 achat par tour"}</small></div>
          <div class="rt-marche-cartes">${cartes || "<p class=\"rt-marche-vide\">Marché vide</p>"}</div>
          ${butin ? `<button type="button" class="rt-marche-exil" data-butin-exil>Exiler 2 cartes</button>` : `<button type="button" class="rt-marche-affiner${affiner ? " on" : ""}" data-affiner aria-pressed="${affiner}"
            title="En achetant, retirer une Boue ou un Déplacer de ta défausse (paquet jamais sous ${PAQUET_MINIMUM} cartes)">
            <span class="rt-bascule" aria-hidden="true"></span>Affiner</button>`}
          <div class="rt-marche-pied">Paquet ${paquetTaille(joueur)} · Pile ${marche.pile.length}</div>`;
      }

      /* Fenêtre du choix de départ : posée sur le plateau, elle bloque les
         clics tant que le choix n'est pas fini. */
      let choixPanneau = null;
      let choixEmpreinte = "";
      function paquetRendreChoix() {
        if (typeof document === "undefined" || ilyosSimulationActive) return;
        const ecran = els?.gameScreen;
        const ouvert = !!ecran && paquetActif() && choixEnCours();
        document.body.classList.toggle("rt-choix-actif", ouvert);
        if (!ouvert) {
          if (choixPanneau) choixPanneau.hidden = true;
          choixEmpreinte = "";
          return;
        }
        if (!choixPanneau) {
          choixPanneau = document.createElement("div");
          choixPanneau.className = "rt-choix";
          choixPanneau.setAttribute("role", "dialog");
          choixPanneau.setAttribute("aria-label", "Choix de départ");
          choixPanneau.addEventListener("click", evenement => {
            evenement.stopPropagation();
            const bouton = evenement.target.closest("[data-choix]");
            if (bouton && !choixJoueurAuTrait()?.isAI) choixPrendre(Number(bouton.dataset.choix));
          });
          ["pointerdown", "mousedown", "touchstart", "wheel"].forEach(t => choixPanneau.addEventListener(t, e => e.stopPropagation(), { passive: true }));
          ecran.appendChild(choixPanneau);
        }
        const choix = state.rotation.choix;
        const joueur = choixJoueurAuTrait();
        const empreinte = JSON.stringify([choix.cartes, choix.pris, joueur?.id]);
        choixPanneau.hidden = false;
        if (empreinte === choixEmpreinte) return;
        choixEmpreinte = empreinte;
        const ia = !!joueur?.isAI;
        const cartes = choix.cartes.map((action, i) => {
          const def = PAQUET_CARTES[action];
          const forte = def.valeur > 1;
          const prise = choix.pris.find(x => x.index === i);
          const preneur = prise ? state.players[prise.joueur] : null;
          return `<button type="button" class="rt-mcarte rt-ccarte${forte ? " forte" : ""}${prise ? " prise" : ""}" data-choix="${i}"
              ${ia || prise ? "disabled" : ""} ${preneur ? `style="--pc:${preneur.color}"` : ""}
              title="${preneur ? `Prise par ${defaitesEchapper(preneur.name)}` : `Prendre ${def.nom} (remplace un Déplacer)`}">
            <span class="rt-mcarte-ico">${paquetIcone(action)}${forte ? "<em>×2</em>" : ""}</span>
            <b>${def.nom}</b><i>${def.effet}</i>${preneur ? `<u>${defaitesEchapper(preneur.name)}</u>` : ""}</button>`;
        }).join("");
        const pris = state.players.map(p => {
          const siens = choix.pris.filter(x => x.joueur === p.id).map(x => PAQUET_CARTES[x.action].nom);
          const vides = Math.max(0, choix.ordre.filter(id => id === p.id).length - siens.length);
          return `<li style="--pc:${p.color}"><span>${defaitesEchapper(p.name)}</span>${siens.map(n => `<b>${n}</b>`).join("")}${"<i></i>".repeat(vides)}</li>`;
        }).join("");
        choixPanneau.innerHTML = `<div class="rt-choix-boite" style="--pc:${joueur?.color || "#f4d28e"}">
          <div class="rt-marche-tete"><span>CHOIX DE DÉPART</span><small>Chaque carte prise remplace un Déplacer de ton paquet</small></div>
          <p class="rt-choix-trait">${ia ? `${defaitesEchapper(joueur.name)} choisit…` : `À ${defaitesEchapper(joueur?.name || "toi")} de choisir`}</p>
          <div class="rt-choix-cartes">${cartes}</div>
          <ul class="rt-choix-pris">${pris}</ul></div>`;
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
            paquetRendreChoix();
            if (choixEnCours()) choixProgrammerIA();
            paquetMarquerDock();
          } catch (erreur) {
            console.warn("[ILYOS] marché", erreur);
          }
        }
        return resultat;
      };

      /* Noms des cartes du marché pour les panneaux Pioche / Défausse
         (js/deck-discard-viewer-v2.js), qui ne lisent que l'état sauvegardé. */
      window.ILYOS_CARTES_SPECIALES = Object.fromEntries([
        ...Object.entries(PAQUET_CARTES).filter(([, def]) => def.valeur > 1)
          .map(([cle, def]) => [cle, { nom: def.nom, type: def.type, valeur: def.valeur, effet: def.effet }]),
        ["BOUE", { nom: "Boue", type: null, valeur: 0, effet: "Ne fait rien" }]
      ]);

      window.ILYOS_ROTATION_PAQUET = {
        etat: () => (state?.rotation?.marche ? JSON.parse(JSON.stringify(state.rotation.marche)) : null),
        acheter: (index, exiler) => paquetAcheter(index, exiler),
        refus: () => paquetRefusAchat(),
        choix: () => (state?.rotation?.choix ? JSON.parse(JSON.stringify(state.rotation.choix)) : null),
        prendre: index => choixPrendre(index),
        choixIA: playerId => plannerChoisirAchat(playerId ?? state?.currentPlayer),
        paquet: playerId => {
          const joueur = state?.players?.[playerId ?? state?.currentPlayer];
          return joueur ? { taille: paquetTaille(joueur), cartes: ["deck", "hand", "discard", "reserveCards"].flatMap(z => (joueur[z] || []).map(c => c.action)) } : null;
        }
      };
