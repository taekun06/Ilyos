
      /* ======================================================================
       * CARTES — RÉSERVE PHYSIQUE V1
       *
       * Cycle autoritaire :
       *   PIOCHE -> MAIN -> DÉFAUSSE (si jouée)
       *                  -> RÉSERVE  (si inutilisée en fin de tour)
       *   RÉSERVE -> DÉFAUSSE quand la carte stockée est finalement jouée
       *   DÉFAUSSE -> PIOCHE uniquement lorsque drawCards() doit remélanger.
       *
       * `player.reserveCards` contient les vraies cartes mises de côté.
       * `player.stash` reste uniquement un miroir 0..5 par type afin de garder
       * compatibles le HUD, l'IA et les anciennes lectures de sauvegarde.
       * ====================================================================== */
      {
        const PHYSICAL_RESERVE_LIMIT_PER_TYPE = 5;
        const PHYSICAL_RESERVE_TYPES = ["MOVE", "PUSH", "MAGIC"];

        function physicalReserveCounts(player) {
          const counts = { MOVE: 0, PUSH: 0, MAGIC: 0 };
          (player?.reserveCards || []).forEach(card => {
            if (PHYSICAL_RESERVE_TYPES.includes(card?.action)) counts[card.action]++;
          });
          return counts;
        }

        function syncPhysicalReserveStash(player) {
          if (!player) return { MOVE: 0, PUSH: 0, MAGIC: 0 };
          const counts = physicalReserveCounts(player);
          player.stash = {
            MOVE: Math.min(PHYSICAL_RESERVE_LIMIT_PER_TYPE, counts.MOVE),
            PUSH: Math.min(PHYSICAL_RESERVE_LIMIT_PER_TYPE, counts.PUSH),
            MAGIC: Math.min(PHYSICAL_RESERVE_LIMIT_PER_TYPE, counts.MAGIC)
          };
          return player.stash;
        }

        function removeCardFromZoneById(zone, id) {
          if (!Array.isArray(zone) || id == null) return null;
          const index = zone.findIndex(card => String(card?.id) === String(id));
          if (index < 0) return null;
          return zone.splice(index, 1)[0] || null;
        }

        function pullMatchingCard(player, type) {
          for (const zoneName of ["discard", "deck"]) {
            const zone = player?.[zoneName];
            if (!Array.isArray(zone)) continue;
            const index = zone.findIndex(card => card?.action === type);
            if (index >= 0) return zone.splice(index, 1)[0];
          }
          return null;
        }

        function sanitizePhysicalReserve(player) {
          if (!player) return [];
          player.reserveCards = Array.isArray(player.reserveCards) ? player.reserveCards : [];
          const seen = new Set();
          const perType = { MOVE: 0, PUSH: 0, MAGIC: 0 };
          player.reserveCards = player.reserveCards.filter(card => {
            if (!card || !PHYSICAL_RESERVE_TYPES.includes(card.action)) return false;
            const key = String(card.id ?? "");
            if (key && seen.has(key)) return false;
            if (perType[card.action] >= PHYSICAL_RESERVE_LIMIT_PER_TYPE) return false;
            if (key) seen.add(key);
            perType[card.action]++;
            card.used = false;
            card.fromStash = false;
            card.fromReserve = true;
            return true;
          });
          syncPhysicalReserveStash(player);
          return player.reserveCards;
        }

        function migrateLegacyStashToPhysicalReserve(player) {
          if (!player) return [];
          if (Array.isArray(player.reserveCards)) return sanitizePhysicalReserve(player);

          const wanted = {
            MOVE: Math.min(5, Math.max(0, Number(player.stash?.MOVE) || 0)),
            PUSH: Math.min(5, Math.max(0, Number(player.stash?.PUSH) || 0)),
            MAGIC: Math.min(5, Math.max(0, Number(player.stash?.MAGIC) || 0))
          };
          player.reserveCards = [];

          PHYSICAL_RESERVE_TYPES.forEach(type => {
            for (let i = 0; i < wanted[type]; i++) {
              const card = pullMatchingCard(player, type);
              if (!card) break;
              card.used = false;
              card.fromStash = false;
              card.fromReserve = true;
              player.reserveCards.push(card);
            }
          });

          return sanitizePhysicalReserve(player);
        }

        function ensurePhysicalReserve(player) {
          return Array.isArray(player?.reserveCards)
            ? sanitizePhysicalReserve(player)
            : migrateLegacyStashToPhysicalReserve(player);
        }

        /* ------------------------------------------------------------------
         * Les lectures d'actions utilisent désormais les vraies cartes.
         * ------------------------------------------------------------------ */
        storedActionCount = function storedActionCountPhysical(type, player = currentPlayer()) {
          if (!player || !PHYSICAL_RESERVE_TYPES.includes(type)) return 0;
          ensurePhysicalReserve(player);
          return Math.min(
            PHYSICAL_RESERVE_LIMIT_PER_TYPE,
            player.reserveCards.filter(card => card.action === type).length
          );
        };

        availableActionCount = function availableActionCountPhysical(type, player = currentPlayer()) {
          if (!state || !player) return 0;
          return unusedCardsOfType(type, player).length + storedActionCount(type, player);
        };

        /* ------------------------------------------------------------------
         * Jouer une action déplace immédiatement la vraie carte vers Défausse.
         * Priorité inchangée : cartes fraîches de la main, puis réserve.
         * ------------------------------------------------------------------ */
        consumeAvailableActions = function consumeAvailableActionsPhysical(type, count = 1, player = currentPlayer()) {
          if (!player || count < 1 || !PHYSICAL_RESERVE_TYPES.includes(type)) return 0;
          ensurePhysicalReserve(player);
          player.hand = Array.isArray(player.hand) ? player.hand : [];
          player.discard = Array.isArray(player.discard) ? player.discard : [];

          let remaining = Math.min(
            Math.max(0, Math.floor(count)),
            availableActionCount(type, player)
          );
          const requested = remaining;
          let freshUsed = 0;
          let reserveUsed = 0;

          /* Main -> Défausse : la carte jouée quitte réellement la main. */
          while (remaining > 0) {
            const index = player.hand.findIndex(card => !card.used && card.action === type);
            if (index < 0) break;
            const [card] = player.hand.splice(index, 1);
            if (!card) break;
            player.discard.push({
              ...card,
              used: false,
              fromStash: false,
              fromReserve: false
            });
            freshUsed++;
            remaining--;
          }

          /* Réserve -> Défausse : la carte stockée quitte physiquement sa zone. */
          while (remaining > 0) {
            const index = player.reserveCards.findIndex(card => card.action === type);
            if (index < 0) break;
            const [card] = player.reserveCards.splice(index, 1);
            if (!card) break;
            player.discard.push({
              ...card,
              used: false,
              fromStash: false,
              fromReserve: false
            });
            reserveUsed++;
            remaining--;
          }

          syncPhysicalReserveStash(player);

          if (freshUsed > 0) {
            window.dispatchEvent(new CustomEvent("ilyos:fresh-card-used", {
              detail: { type, count: freshUsed }
            }));
          }
          if (reserveUsed > 0) {
            window.dispatchEvent(new CustomEvent("ilyos:reserve-card-used", {
              detail: { type, count: reserveUsed }
            }));
          }

          return requested - remaining;
        };

        /* ------------------------------------------------------------------
         * Fin de tour : les cartes encore en main sont toutes inutilisées.
         * On les place en réserve jusqu'à 5 PAR TYPE. Un éventuel surplus
         * reste dans la main quelques millisecondes afin que endTurn() legacy
         * l'envoie normalement à la défausse. Une carte réservée n'y va pas.
         * ------------------------------------------------------------------ */
        const endTurnBeforePhysicalReserve = endTurn;
        /* Rangement de fin de tour, corps unique. Ce qui tient en réserve y
           va physiquement ; le reste part à la défausse, d'où la pioche se
           reconstitue. Le self-play appelle exactement cette fonction : une
           seconde implémentation, même fidèle au départ, finit toujours par
           diverger — c'est arrivé dès le premier essai. */
        rangerCartesFinDeTour = function rangerCartesReservePhysique(player) {
          const range = { MOVE: 0, PUSH: 0, MAGIC: 0 };
          if (!player) return range;
          ensurePhysicalReserve(player);
          player.hand = Array.isArray(player.hand) ? player.hand : [];
          player.discard = Array.isArray(player.discard) ? player.discard : [];
          const comptes = physicalReserveCounts(player);
          const gardees = [];

          player.hand.forEach(carte => {
            const type = carte?.action;
            const rangeable = !carte?.used
              && PHYSICAL_RESERVE_TYPES.includes(type)
              && comptes[type] < PHYSICAL_RESERVE_LIMIT_PER_TYPE;
            if (rangeable) {
              comptes[type]++;
              range[type]++;
              player.reserveCards.push({ ...carte, used: false, fromStash: false, fromReserve: true });
            } else {
              gardees.push(carte);
            }
          });
          player.hand = gardees;
          syncPhysicalReserveStash(player);
          return range;
        };

        endTurn = async function endTurnPhysicalReserve(force = false) {
          if (!state || state.winner !== null || state.turnTransitioning) return;

          /* Même garde que la fonction historique, exécutée AVANT de déplacer
             une carte pour qu'un clic invalide ne modifie jamais la réserve. */
          if (!force && state.phase !== "ACTION_SELECT") {
            const cancellableSelection = state.islandPlacedThisTurn
              && (state.phase === "SMART_CHAR" || (state.phase === "ACTION" && !!state.selectedActionType));
            if (!cancellableSelection || !prepareActionSwitch()) return;
          }
          if (!state.islandPlacedThisTurn && !force) {
            showToast("Vous devez poser une île avant de terminer le tour.");
            return;
          }

          const player = currentPlayer();
          const banked = rangerCartesFinDeTour(player);

          if (banked.MOVE || banked.PUSH || banked.MAGIC) {
            window.dispatchEvent(new CustomEvent("ilyos:cards-banked", { detail: { ...banked } }));
          }

          /* La fonction historique conserve tout le reste du lifecycle :
             transition, IA, tour suivant, sync online. Les cartes réservées ont
             déjà quitté la main, donc elle ne peut plus les défausser. */
          return endTurnBeforePhysicalReserve(force);
        };

        /* ------------------------------------------------------------------
         * Sauvegardes : V1 inclut reserveCards dans l'état sérialisé. Pour les
         * anciennes sauvegardes à stash virtuel, on retire autant de vraies
         * cartes que possible de Défausse puis Pioche et on les met de côté.
         * ------------------------------------------------------------------ */
        const normalizeRestoredStateBeforePhysicalReserve = normalizeRestoredState;
        normalizeRestoredState = function normalizeRestoredStatePhysicalReserve(raw) {
          if (!raw || !Array.isArray(raw.players) || !raw.players.length) return null;

          const prepared = JSON.parse(JSON.stringify(raw));
          const savedPhysical = prepared.players.map(player =>
            Array.isArray(player.reserveCards) ? JSON.parse(JSON.stringify(player.reserveCards)) : null
          );

          /* La normalisation V64 compte 13 cartes seulement dans deck/main/
             discard. On y remet temporairement les cartes de réserve pour que
             cette vérification voie bien l'intégralité du paquet physique. */
          prepared.players.forEach((player, index) => {
            const reserve = savedPhysical[index];
            if (!reserve) return;
            player.deck = Array.isArray(player.deck) ? player.deck : [];
            player.hand = Array.isArray(player.hand) ? player.hand : [];
            player.discard = Array.isArray(player.discard) ? player.discard : [];
            const reserveIds = new Set(reserve.map(card => String(card?.id)));
            ["deck", "hand", "discard"].forEach(zoneName => {
              player[zoneName] = player[zoneName].filter(card => !reserveIds.has(String(card?.id)));
            });
            player.discard.push(...reserve.map(card => ({ ...card, used: false, fromReserve: false, fromStash: false })));
            player.stash = { MOVE: 0, PUSH: 0, MAGIC: 0 };
            delete player.reserveCards;
          });

          const restored = normalizeRestoredStateBeforePhysicalReserve(prepared);
          if (!restored) return null;

          restored.players.forEach((player, index) => {
            const wanted = savedPhysical[index];
            if (!wanted) {
              /* Ancienne sauvegarde : physicalisation best-effort de l'ancien
                 stash, sans créer de cartes supplémentaires. */
              migrateLegacyStashToPhysicalReserve(player);
              return;
            }

            player.reserveCards = [];
            wanted.forEach(savedCard => {
              let card = null;
              for (const zoneName of ["discard", "deck", "hand"]) {
                card = removeCardFromZoneById(player[zoneName], savedCard?.id);
                if (card) break;
              }
              if (!card && PHYSICAL_RESERVE_TYPES.includes(savedCard?.action)) {
                card = pullMatchingCard(player, savedCard.action);
              }
              if (card) {
                player.reserveCards.push({ ...card, used: false, fromStash: false, fromReserve: true });
              }
            });
            sanitizePhysicalReserve(player);
          });

          return restored;
        };

        /* Synchronise les joueurs déjà créés lors d'une reprise/live reload. */
        if (state?.players) state.players.forEach(ensurePhysicalReserve);
      }
