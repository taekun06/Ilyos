            spawn
              ? "Une île et un gardien ont été placés automatiquement."
              : `Une île a été placée automatiquement. Limite de ${MAX_GUARDIANS_PER_PLAYER} gardiens atteinte.`
          );
        } else if (!spawn) {
          showToast(`Île placée. Limite de ${MAX_GUARDIANS_PER_PLAYER} gardiens atteinte.`);
        }
        return island;
      }

      /* Distance STRATÉGIQUE d'une case vers un jeu de cibles, exprimée dans la
       * même unité que les cartes Déplacement.
       *
       * Topologie : celle des vraies règles, orthogonal = 1, diagonale = 2 (voir
       * movementEdges). Elle ne l'était pas : le parcours se faisait en largeur
       * sur les seuls voisins orthogonaux, à coût uniforme 1. Deux conséquences,
       * toutes deux mesurées au banc d'essai.
       *
       *   — Sous-estimation. Une diagonale était comptée comme un pas alors
       *     qu'elle en coûte deux.
       *   — Bien pire : deux terrains qui ne se touchent QUE par un coin étaient
       *     déclarés non reliés. Le parcours échouait, le repli « 30 + Manhattan »
       *     s'appliquait, et l'IA croyait à plus de 30 points de déplacement une
       *     case qu'elle pouvait atteindre pour 2. Comme la valeur nourrit
       *     ensuite `- targetDistance * 1.2` dans aiBestMove(), la pénalité
       *     dépassait 40 et écrasait tout le reste du calcul : l'IA restait
       *     immobile plutôt que de faire un pas manifestement bon (puzzles 01,
       *     07 et 09 du banc d'essai).
       *
       * Occupation : volontairement IGNORÉE, comme dans la version précédente.
       * Cette fonction mesure l'accès TERRITORIAL — « à quelle distance ce coin
       * du plateau se trouve-t-il ? » — et non un trajet immédiatement jouable.
       * Un gardien de passage ne doit pas faire croire qu'une région est coupée
       * du monde. Les appelants qui ont besoin d'un chemin réellement praticable
       * ne passent pas par ici : ils utilisent shortestMovementPath(), qui
       * respecte les occupants et le budget de déplacement. Ne pas fusionner les
       * deux notions sans revoir tous les appelants.
       *
       * Le repli « 30 + Manhattan » est conservé à l'identique pour les cibles
       * réellement inatteignables : il donne encore une direction quand aucune
       * route n'existe, en attendant qu'une île fasse le pont. La correction ne
       * change donc que les cas où une route existait bel et bien. */
      function aiLandDistanceToTargets(startR, startC, targets) {
        const validTargets = (targets || []).filter(([r, c]) => inside(r, c) && isLand(r, c));
        if (!validTargets.length) return 99;

        const targetSet = new Set(validTargets.map(([r, c]) => key(r, c)));
        const startKey = key(startR, startC);
        if (targetSet.has(startKey)) return 0;
        if (!inside(startR, startC) || !isLand(startR, startC)) return 99;

        // Dijkstra : les arêtes n'ayant pas toutes le même poids, un parcours en
        // largeur donnerait un résultat faux dès la première diagonale.
        const meilleur = new Map([[startKey, 0]]);
        const file = [{ r: startR, c: startC, cout: 0 }];

        while (file.length) {
          let indexMin = 0;
          for (let i = 1; i < file.length; i++) {
            if (file[i].cout < file[indexMin].cout) indexMin = i;
          }
          const actuel = file.splice(indexMin, 1)[0];
          const actuelKey = key(actuel.r, actuel.c);
          if (actuel.cout > (meilleur.get(actuelKey) ?? Infinity)) continue;
          if (targetSet.has(actuelKey)) return actuel.cout;

          for (const arete of movementEdges(actuel.r, actuel.c)) {
            if (!isLand(arete.r, arete.c)) continue;
            const suivantKey = key(arete.r, arete.c);
            const suivantCout = actuel.cout + arete.cost;
            if (suivantCout >= (meilleur.get(suivantKey) ?? Infinity)) continue;
            meilleur.set(suivantKey, suivantCout);
            file.push({ r: arete.r, c: arete.c, cout: suivantCout });
          }
        }

        const fallback = Math.min(
          ...validTargets.map(([r, c]) => Math.abs(startR - r) + Math.abs(startC - c))
        );
        return 30 + fallback;
      }

      function aiValidationTargetsForPlayer(player) {
        const active = crownValidationCellsForPlayer(player)
          .filter(([r, c]) => isLand(r, c));

        return active.length
          ? active
          : villagesForPlayer(player).map(village => [village.r, village.c]);
      }

      function aiValidationDistanceForPlayer(player, r, c) {
        return aiLandDistanceToTargets(r, c, aiValidationTargetsForPlayer(player));
      }

      function aiNearestOwnCharacterDistance(r, c, excludedIds = []) {
        const excluded = new Set(excludedIds);
        const own = aiOwnCharacters().filter(char => !excluded.has(char.id));
        if (!own.length) return 99;
        return Math.min(...own.map(char => Math.abs(char.r - r) + Math.abs(char.c - c)));
      }

      function aiLooseCrownTargets() {
        return activeArtifacts()
          .filter(artifact => artifact.carrierId === null)
          .map(artifact => [artifact.r, artifact.c]);
      }

      function aiStrategicTargetsForCharacter(char) {
        if (characterCarriesCrown(char.id)) {
          return aiValidationTargetsForPlayer(currentPlayer());
        }

        const loose = aiLooseCrownTargets();
        if (loose.length) return loose;

        const opponentCarrier = aiOpponentCarrier();
        if (opponentCarrier) {
          const adjacent = orthogonalNeighbors(opponentCarrier.r, opponentCarrier.c)
            .filter(([r, c]) => isLand(r, c));
          if (adjacent.length) return adjacent;
        }

        return [[CENTER.r, CENTER.c]];
      }

      function simulateCharacterPushForAI(startR, startC, dr, dc, force) {
        const line = collectPushLine(startR, startC, dr, dc);
        const simulated = line.map(char => ({
          char,
          r: char.r,
          c: char.c,
          alive: true
        }));

        const movingIds = new Set(line.map(char => char.id));
        const fixedOccupants = new Set(
          state.characters
            .filter(char => !movingIds.has(char.id))
            .map(char => key(char.r, char.c))
        );

        const requiredForce = line.length;
        if (force < requiredForce) return simulated;
        const pushDistance = Math.max(1, force - requiredForce + 1);
        for (let step = 0; step < pushDistance; step++) {
          for (let i = simulated.length - 1; i >= 0; i--) {
            const item = simulated[i];
            if (!item.alive) continue;

            const nr = item.r + dr;
            const nc = item.c + dc;

            if (!inside(nr, nc) || !isLand(nr, nc)) {
              item.alive = false;
              continue;
            }

            const blockedByFixed = fixedOccupants.has(key(nr, nc));
            const blockedByLine = simulated.some((other, index) =>
              index !== i && other.alive && other.r === nr && other.c === nc
            );
            const blockedByCrown = !!looseArtifactAt(nr, nc);

            if (blockedByFixed || blockedByLine || blockedByCrown) continue;
            item.r = nr;
            item.c = nc;
          }
        }

        return simulated;
      }

      function aiExternalLandContacts(cells, ignoredIslandId = null) {
        const ownCells = new Set(cells.map(([r, c]) => key(r, c)));
        const contacts = new Set();

        cells.forEach(([r, c]) => {
          orthogonalNeighbors(r, c).forEach(([nr, nc]) => {
            const neighborKey = key(nr, nc);
            if (ownCells.has(neighborKey)) return;

            const neighborIsland = islandAt(nr, nc);
            const externalLand =
              !!villageAt(nr, nc)
              || isSanctuary(nr, nc)
              || (neighborIsland && neighborIsland.id !== ignoredIslandId);

            if (externalLand) contacts.add(neighborKey);
          });
        });

        return contacts.size;
      }

      function aiOwnCharacters() {
        return state.characters.filter(ch => ch.player === state.currentPlayer);
      }

      function aiOpponentCarrier() {
        return activeArtifacts()
          .map(artifact => characterById(artifact.carrierId))
          .find(carrier => carrier && carrier.player !== state.currentPlayer) || null;
      }

      function aiMoveGoal(char) {
        const targets = aiStrategicTargetsForCharacter(char);
        return [...targets].sort((a, b) =>
          (Math.abs(char.r - a[0]) + Math.abs(char.c - a[1])) -
          (Math.abs(char.r - b[0]) + Math.abs(char.c - b[1]))
        )[0] || [CENTER.r, CENTER.c];
      }

      function distanceToNearestOwnVillage(r, c) {
        return aiValidationDistanceForPlayer(currentPlayer(), r, c);
      }

      function aiAdjacentCrownPickup() {
        const options = [];
        const own = aiOwnCharacters().filter(char => !characterCarriesCrown(char.id));

        for (const char of own) {
          for (const artifact of activeArtifacts()) {
            if (artifact.carrierId !== null) continue;
            const distance = Math.abs(char.r - artifact.r) + Math.abs(char.c - artifact.c);
            if (distance !== 1) continue;

            options.push({
              char,
              artifact,
              // Départage volontairement minuscule entre porteurs équidistants.
              // Passé par gameRandom() : c'était le SEUL tirage de l'IA qu'aucun
              // réglage de difficulté ne neutralisait (cfg.randomness vaut 0 à
              // l'Expert mais ne s'applique pas ici), donc la seule source de
              // non-déterminisme restante de l'Expert.
              score: distanceToNearestOwnVillage(char.r, char.c) + gameRandom() * .08
            });
          }
        }

        options.sort((a, b) => a.score - b.score);
        return options[0] || null;
      }

      async function aiPerformFreeCrownPickup(option, token) {
        if (!option || token !== aiRunToken || !state) return false;
        if (characterCarriesCrown(option.char.id) || option.artifact.carrierId !== null) return false;

        saveUndoSnapshot();
        if (!giveArtifactToCharacter(option.artifact, option.char)) {
          discardLastUndoSnapshot();
          return false;
        }

        state.selectedCharId = option.char.id;
        state.phase = "ACTION_SELECT";
        renderAll();
        animateCellPulse(option.char.r, option.char.c, "crown-burst");
        playSfx("crownTake");   // Ramassage libre par l'IA.
        showToast("ORDINATEUR récupère gratuitement une couronne adjacente.");
        await sleep(520);
        resolveArtifactForCharacter(option.char);
        benchJournaliser({ type: "RAMASSAGE", gardien: option.char.id, case: [option.char.r, option.char.c] });
        return true;
      }


      function aiCrownActionUsed(artifactId, action) {
        return !!state.aiCrownMemory?.[`${artifactId}:${action}`];
      }

      function markAICrownAction(artifactId, action) {
        state.aiCrownMemory ||= {};
        state.aiCrownMemory[`${artifactId}:${action}`] = true;
      }

      function aiBestFreeCrownHandoff() {
        if (aiConfig().crownTactics < 1) return null;

        const own = aiOwnCharacters();
        const options = [];

        for (const carrier of own) {
          const artifact = artifactCarriedBy(carrier.id);
          if (!artifact || aiCrownActionUsed(artifact.id, "handoff")) continue;

          const carrierDistance = distanceToNearestOwnVillage(carrier.r, carrier.c);

          for (const ally of own) {
            if (ally.id === carrier.id || characterCarriesCrown(ally.id)) continue;

            const allyDistance = distanceToNearestOwnVillage(ally.r, ally.c);
            const gain = carrierDistance - allyDistance;
            if (gain < 1) continue;

            if (Math.abs(ally.r - carrier.r) + Math.abs(ally.c - carrier.c) === 1) {
              options.push({
                carrier, ally, artifact,
                direct: true,
                gain,
                score: -gain * 4
              });
            }

            for (const [dropR, dropC] of orthogonalNeighbors(carrier.r, carrier.c)) {
              if (!isLand(dropR, dropC) || characterAt(dropR, dropC) || looseArtifactAt(dropR, dropC)) continue;
              if (Math.abs(ally.r - dropR) + Math.abs(ally.c - dropC) !== 1) continue;

              options.push({
                carrier, ally, artifact,
                direct: false,
                dropR, dropC,
                gain,
                score: -gain * 2.2 + .3
              });
            }
          }
        }

        options.sort((a, b) => a.score - b.score);
        return options[0] || null;
      }

      async function aiPerformFreeCrownHandoff(option, token) {
        if (!option || token !== aiRunToken || !state) return false;
        const liveArtifact = artifactCarriedBy(option.carrier.id);
        if (!liveArtifact || liveArtifact.id !== option.artifact.id) return false;
        if (characterCarriesCrown(option.ally.id)) return false;

        saveUndoSnapshot();
        markAICrownAction(liveArtifact.id, "handoff");

        if (option.direct) {
          if (!giveArtifactToCharacter(liveArtifact, option.ally)) {
            discardLastUndoSnapshot();
            return false;
          }

          state.selectedCharId = option.ally.id;
          renderAll();
          animateCellPulse(option.ally.r, option.ally.c, "crown-burst");
          playSfx("crownTake");   // Transmission : l'allié prend la couronne.
          showToast("ORDINATEUR transmet directement la couronne à un allié adjacent.");
          await sleep(360);
          resolveArtifactForCharacter(option.ally);
          benchJournaliser({ type: "TRANSMISSION", de: option.carrier.id, vers: option.ally.id, directe: true });
          return true;
        }

        if (characterAt(option.dropR, option.dropC) || looseArtifactAt(option.dropR, option.dropC)) {
          discardLastUndoSnapshot();
          return false;
        }

        liveArtifact.carrierId = null;
        liveArtifact.r = option.dropR;
        liveArtifact.c = option.dropC;
        renderAll();
        animateCellPulse(option.dropR, option.dropC, "crown-burst");
        showToast("ORDINATEUR pose la couronne entre deux alliés.");
        await sleep(280);

        if (token !== aiRunToken || !state) return false;
        if (!giveArtifactToCharacter(liveArtifact, option.ally)) {
          discardLastUndoSnapshot();
          return false;
        }

        state.selectedCharId = option.ally.id;
        renderAll();
        animateCellPulse(option.ally.r, option.ally.c, "crown-burst");
        playSfx("crownTake");   // L'allié prend la couronne.
        showToast("L’allié récupère immédiatement la couronne.");
        await sleep(340);
        resolveArtifactForCharacter(option.ally);
        benchJournaliser({ type: "TRANSMISSION", de: option.carrier.id, vers: option.ally.id, directe: false, depot: [option.dropR, option.dropC] });
        return true;
      }

      function simulateLooseCrownPush(artifact, dr, dc, force, startR = artifact.r, startC = artifact.c) {
        const exactForce = Math.max(1, Math.floor(force || 1));
        let crossedVoid = false;

        for (let step = 1; step <= exactForce; step++) {
          const r = startR + dr * step;
          const c = startC + dc * step;

          if (!inside(r, c)) {
            return {
              r: startR,
              c: startC,
              moved: 0,
              valid: false,
              crossedVoid,
              reason: "outside"
            };
          }

          const otherCrown = looseArtifactAt(r, c);
          const obstacle =
            characterAt(r, c)
            || (otherCrown && otherCrown.id !== artifact.id);

          /*
           * La trajectoire peut passer au-dessus du vide, mais pas traverser
           * un gardien ni une autre couronne.
           */
          if (obstacle) {
            return {
              r: startR,
              c: startC,
              moved: 0,
              valid: false,
              crossedVoid,
              reason: "blocked"
            };
          }

          if (step < exactForce) {
            if (!isLand(r, c)) crossedVoid = true;
            continue;
          }

          /*
           * La force choisie doit faire atterrir exactement la couronne
           * sur une case de terrain. Une force trop faible ou trop forte
           * ne permet donc pas la poussée.
           */
          if (!isLand(r, c)) {
            return {
              r: startR,
              c: startC,
              moved: 0,
              valid: false,
              crossedVoid: true,
              reason: "no-landing"
            };
          }

          return {
            r,
            c,
            moved: exactForce,
            valid: true,
            crossedVoid,
            reason: null
          };
        }

        return {
          r: startR,
          c: startC,
          moved: 0,
          valid: false,
          crossedVoid,
          reason: "no-landing"
        };
      }

      function adjacentFreeAllyForCrown(r, c, excludedIds = []) {
        const excluded = new Set(excludedIds);
        return orthogonalNeighbors(r, c)
          .map(([nr, nc]) => characterAt(nr, nc))
          .find(char =>
            char
            && char.player === state.currentPlayer
            && !excluded.has(char.id)
            && !characterCarriesCrown(char.id)
          ) || null;
      }

      function aiBestDropAndPushCrown() {
        const cfg = aiConfig();
        if (cfg.crownTactics < 2 || availableActionCount("PUSH") < 1) return null;

        const availablePush = Math.min(
          availableActionCount("PUSH"),
          cfg.pushMax
        );
        const options = [];

        for (const carrier of aiOwnCharacters()) {
          const artifact = artifactCarriedBy(carrier.id);
          if (!artifact || aiCrownActionUsed(artifact.id, "drop-push")) continue;

          const startDistance = distanceToNearestOwnVillage(
            carrier.r,
            carrier.c
          );

          for (const [dropR, dropC] of orthogonalNeighbors(carrier.r, carrier.c)) {
            if (
              !isLand(dropR, dropC)
              || characterAt(dropR, dropC)
              || looseArtifactAt(dropR, dropC)
            ) continue;

            const dr = dropR - carrier.r;
            const dc = dropC - carrier.c;

            for (let force = 1; force <= availablePush; force++) {
              const simulation = simulateLooseCrownPush(
                artifact,
                dr,
                dc,
                force,
                dropR,
                dropC
              );
              if (!simulation.valid) continue;

              const endDistance = distanceToNearestOwnVillage(
                simulation.r,
                simulation.c
              );
              const receivingAlly = adjacentFreeAllyForCrown(
                simulation.r,
                simulation.c,
                [carrier.id]
              );
              const distanceGain = startDistance - endDistance;

              if (distanceGain < 2 && !receivingAlly) continue;

              const score =
                -distanceGain * 2.3
                - force * .35
                - (receivingAlly ? 7 : 0)
                - (simulation.crossedVoid ? .8 : 0)
                + gameRandom() * cfg.randomness;

              options.push({
                carrier,
                artifact,
                dropR,
                dropC,
                dr,
                dc,
                force,
                endR: simulation.r,
                endC: simulation.c,
                receivingAlly,
                distanceGain,
                score
              });
            }
          }
        }

        options.sort((a, b) => a.score - b.score);
        return options[0] || null;
      }

      async function aiPerformDropAndPushCrown(option, token) {
        if (!option || token !== aiRunToken || !state) return false;

        const artifact = artifactCarriedBy(option.carrier.id);
        if (!artifact || artifact.id !== option.artifact.id) return false;
        if (characterAt(option.dropR, option.dropC) || looseArtifactAt(option.dropR, option.dropC)) return false;

        saveUndoSnapshot();
        markAICrownAction(artifact.id, "drop-push");

        artifact.carrierId = null;
        artifact.r = option.dropR;
        artifact.c = option.dropC;
        state.phase = "ACTION_SELECT";
        renderAll();
        animateCellPulse(option.dropR, option.dropC, "crown-burst");
        showToast("ORDINATEUR pose la couronne pour préparer une poussée.");
        await sleep(360);

        if (token !== aiRunToken || !state) return false;

        state.phase = "ACTION";
        state.selectedActionType = "PUSH";
        state.selectedActionCount = Math.min(option.force, availableActionCount("PUSH"));
        state.pushForceChoice = state.selectedActionCount;
        state.selectedCharId = option.carrier.id;
        state.selectedIslandId = null;
        state.reachable = new Set(
          orthogonalNeighbors(option.carrier.r, option.carrier.c)
            .map(([r, c]) => key(r, c))
        );
        renderAll();
        await sleep(260);

        if (token !== aiRunToken || !state) return false;
        handlePushClick(option.dropR, option.dropC);
        await sleep(720);

        if (token !== aiRunToken || !state) return true;

        const pushedArtifact = artifactById(option.artifact.id);
        if (pushedArtifact?.carrierId === null) {
          const ally = adjacentFreeAllyForCrown(
            pushedArtifact.r,
            pushedArtifact.c,
            [option.carrier.id]
          );

          if (ally) {
            giveArtifactToCharacter(pushedArtifact, ally);
            state.selectedCharId = ally.id;
            renderAll();
            animateCellPulse(ally.r, ally.c, "crown-burst");
            playSfx("crownTake");   // Prise après poussée.
            showToast("Après la poussée, un allié récupère gratuitement la couronne.");
            await sleep(440);
            resolveArtifactForCharacter(ally);
          }
        }

        return true;
      }

      function aiCellThreatForPlayer(playerId, r, c) {
        let threat = 0;
        for (const enemy of state.characters) {
          if (enemy.player === playerId) continue;
          const d = Math.abs(enemy.r - r) + Math.abs(enemy.c - c);
          if (d === 1) threat += 12;
          else if (d === 2) threat += 4;
        }
        const edgeRisk = orthogonalNeighbors(r, c).filter(([nr, nc]) => !inside(nr, nc) || !isLand(nr, nc)).length;
        return threat + edgeRisk * 2.5;
      }

      /*
       * Anticipation locale (un coup) : un ennemi déjà adjacent à cette case
       * pourrait-il, dès son prochain tour, pousser le gardien qui s'y trouve
       * dans le vide avec une seule poussée de force 1 (aucune ligne de
       * gardiens à déplacer derrière lui) ? aiCellThreatForPlayer ne mesure
       * qu'une proximité générique ; ceci vérifie la perte immédiate et
       * concrète du porteur de couronne, le pire résultat possible.
       */
      function aiPushOffRisk(playerId, r, c) {
        for (const enemy of state.characters) {
          if (enemy.player === playerId) continue;
          const dr = r - enemy.r, dc = c - enemy.c;
          if (Math.abs(dr) + Math.abs(dc) !== 1) continue;
          const landR = r + dr, landC = c + dc;
          if (!inside(landR, landC) || !isLand(landR, landC)) return true;
        }
        return false;
      }

      function aiBestMove() {
        const availableMoves = availableActionCount("MOVE");
        if (availableMoves < 1) return null;
        const cfg = aiConfig();
        const maxCost = cfg.globalPlanning ? availableMoves : Math.min(availableMoves, cfg.maxMoveCost);
        const opponents = state.players.filter(p => p.id !== state.currentPlayer);
        const enemyValidation = new Set(opponents.flatMap(p => aiValidationTargetsForPlayer(p).map(([r, c]) => key(r, c))));
        let best = null;

        aiOwnCharacters().forEach(char => {
          const carrying = characterCarriesCrown(char.id);
          const alreadySafe = carrying && isCrownValidationCell(currentPlayer(), char.r, char.c);
          const targets = aiStrategicTargetsForCharacter(char);
          const startDistance = aiLandDistanceToTargets(char.r, char.c, targets);
          const startThreat = aiCellThreatForPlayer(char.player, char.r, char.c);

          for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
            if ((r === char.r && c === char.c) || !isLand(r, c) || characterAt(r, c)) continue;
            const path = shortestMovementPath(char, r, c, maxCost);
            if (!path?.length) continue;
            const cost = path.cost ?? path.length;
            const targetDistance = aiLandDistanceToTargets(r, c, targets);
            const progress = startDistance - targetDistance;
            const looseCrown = looseArtifactAt(r, c);
            const scoringCell = carrying && isCrownValidationCell(currentPlayer(), r, c);
            const opponentCarrier = aiOpponentCarrier();
            const adjacentOpponentCarrier = opponentCarrier && Math.abs(r - opponentCarrier.r) + Math.abs(c - opponentCarrier.c) === 1;
            const threat = aiCellThreatForPlayer(char.player, r, c);
            const blocksEnemyVillage = !carrying && enemyValidation.has(key(r, c));

            // Un porteur déjà sécurisé ne quitte pas son village sauf pour fuir un danger immédiat.
            if (alreadySafe && !scoringCell && startThreat < 12) continue;

            // defensePriority/denyScorePriority/crownPriority (définis dans
            // AI_LEVELS.expert) : coefficients normalisés autour de 5 (le
            // niveau implicite des difficultés inférieures) pour renforcer,
            // à l'Expert, la fuite du porteur menacé et la course pour priver
            // l'adversaire d'un point imminent — sans rien changer aux
            // niveaux qui ne définissent pas ces clés.
            const defenseScale = (cfg.defensePriority ?? 5) / 5;
            const denyScale = (cfg.denyScorePriority ?? 5) / 5;
            const crownScale = (cfg.crownPriority ?? 5) / 5;

            let utility = progress * 42 - cost * 3 - targetDistance * 1.2;
            if (carrying) utility += progress * 58 - threat * 13 * defenseScale;
            else utility -= threat * 3.2;
            // Un porteur qu'on amène volontairement à portée d'une poussée
            // dans le vide perd la couronne pour de bon dès le tour adverse
            // suivant — un coup d'avance suffit à repérer ce cas précis, bien
            // plus grave qu'une simple proximité (threat) déjà comptée.
            if (carrying && aiPushOffRisk(char.player, r, c)) utility -= 1800 * defenseScale;
            if (scoringCell) utility += 2200 * crownScale;
            if (looseCrown && !carrying) utility += 1050 * crownScale;
            if (adjacentOpponentCarrier && !carrying) utility += 360 * denyScale + aiOpponentScoreThreat() * 2 * denyScale;
            if (blocksEnemyVillage) utility += 95 * denyScale;
            if (progress <= 0) utility -= 18 + cost * 5;
            if (targetDistance >= 30) utility -= 28;
            if (alreadySafe && scoringCell) utility += 500 * crownScale;

            if (!best || utility > best.utility) {
              best = {
                char, r, c, cost, utility, score: -utility, progress, targetDistance, carrying,
                capturesCrown: !!(looseCrown && !carrying), scoringCell,
                adjacentOpponentCarrier: !!adjacentOpponentCarrier, threat
              };
            }
          }
        });
        return best && best.utility > 8 ? best : null;
      }

      function aiBestPush() {
        const availablePush = availableActionCount("PUSH");
        if (availablePush < 1) return null;
        const cfg = aiConfig();
        const maxForce = Math.min(availablePush, cfg.pushMax);
        const options = [];
        // Voir aiBestMove : mêmes coefficients normalisés autour de 5.
        const defenseScale = (cfg.defensePriority ?? 5) / 5;
        const denyScale = (cfg.denyScorePriority ?? 5) / 5;
        const crownScale = (cfg.crownPriority ?? 5) / 5;

        aiOwnCharacters().forEach(pusher => {
          orthogonalNeighbors(pusher.r, pusher.c).forEach(([r, c]) => {
            const targetChar = characterAt(r, c);
            const targetCrown = looseArtifactAt(r, c);
            if (!targetChar && !targetCrown) return;
            const dr = r - pusher.r, dc = c - pusher.c;

            if (targetCrown) {
              if (!characterCarriesCrown(pusher.id)) return;
              for (let force = 1; force <= maxForce; force++) {
                const simulation = simulateLooseCrownPush(targetCrown, dr, dc, force);
                if (simulation.moved < 1) continue;
                const before = distanceToNearestOwnVillage(targetCrown.r, targetCrown.c);
                const after = distanceToNearestOwnVillage(simulation.r, simulation.c);
                const ally = adjacentFreeAllyForCrown(simulation.r, simulation.c, [pusher.id]);
                const gain = before - after;
                const utility = gain * 85 * crownScale + (ally ? 190 : 0) - force * 8;
                if (utility > 15) options.push({ pusher, r, c, count: force, priority: -utility, utility, targetType: "crown" });
              }
              return;
            }

            const line = collectPushLine(r, c, dr, dc);
            const requiredForce = line.length;
            if (requiredForce < 1 || requiredForce > maxForce) return;
            for (let force = requiredForce; force <= maxForce; force++) {
              const simulation = simulateCharacterPushForAI(r, c, dr, dc, force);
              let utility = -force * 7;
              for (const item of simulation) {
                const isOwn = item.char.player === state.currentPlayer;
                const carrying = characterCarriesCrown(item.char.id);
                const owner = state.players[item.char.player];
                if (!item.alive) {
                  // Éliminer un gardien adverse (sans couronne) en le poussant
                  // dans le vide était sous-valorisé face aux gains de
                  // progression/déplacement, alors que c'est justement près
                  // du village adverse (deux bords proches à la fois) que ces
                  // occasions sont les plus fréquentes. Mis à l'échelle de
                  // denyScorePriority : moins de gardiens adverses, c'est
                  // aussi moins de capacité à défendre ou marquer plus tard.
                  utility += isOwn ? (carrying ? -1400 : -260) : (carrying ? 1150 : 480 * denyScale);
                  continue;
                }
                const beforeThreat = aiCellThreatForPlayer(item.char.player, item.char.r, item.char.c);
                const afterThreat = aiCellThreatForPlayer(item.char.player, item.r, item.c);
                utility += isOwn
                  ? (beforeThreat - afterThreat) * 8 * (carrying ? defenseScale : 1)
                  : (afterThreat - beforeThreat) * 5;
                if (carrying) {
                  const before = aiValidationDistanceForPlayer(owner, item.char.r, item.char.c);
                  const after = aiValidationDistanceForPlayer(owner, item.r, item.c);
                  // Repousser le porteur adverse pour l'éloigner de sa case de
                  // validation (denyScale) pèse désormais nettement plus lourd
                  // à l'Expert que faire progresser son propre porteur
                  // (crownScale) — priver l'adversaire d'un point imminent
                  // passe avant sa propre progression.
                  utility += isOwn ? (before - after) * 120 * crownScale : (after - before) * 145 * denyScale;
                  if (!isOwn && before === 0 && after > 0) utility += 950 * denyScale;
                  if (isOwn && after === 0) utility += 750 * crownScale;
                } else if (isOwn) {
                  utility -= 22;
                }
              }
              if (utility > 10) options.push({ pusher, r, c, count: force, priority: -utility, utility, targetType: "character", requiredForce });
            }
          });
        });
        options.sort((a, b) => b.utility - a.utility || a.count - b.count);
        return options[0] || null;
      }

      function aiBestMagic() {
        const availableMagic = availableActionCount("MAGIC");
        if (availableMagic < 1 || !state.islands.length) return null;
        const cfg = aiConfig();
        const options = [];
        // Voir aiBestMove : mêmes coefficients normalisés autour de 5.
        const denyScale = (cfg.denyScorePriority ?? 5) / 5;
        const crownScale = (cfg.crownPriority ?? 5) / 5;
        for (const island of state.islands) for (const pivot of island.cells) for (const steps of [1, 3, 2]) {
          const direction = steps === 3 ? -1 : 1, turns = steps === 3 ? 1 : steps;
          const rotation = calculateIslandRotationAroundPivot(island, pivot[0], pivot[1], direction, turns);
          if (!rotation.valid) continue;
          let utility = -12;
          for (const move of rotation.characterMoves) {
            const owner = state.players[move.char.player];
            const carrying = characterCarriesCrown(move.char.id);
            const isOwn = move.char.player === state.currentPlayer;
            if (carrying) {
              const before = aiValidationDistanceForPlayer(owner, move.char.r, move.char.c);
              const after = aiValidationDistanceForPlayer(owner, move.r, move.c);
              utility += isOwn ? (before - after) * 145 * crownScale : (after - before) * 165 * denyScale;
              if (isOwn && after === 0) utility += 900 * crownScale;
              if (!isOwn && before === 0 && after > 0) utility += 1000 * denyScale;
            } else {
              const beforeThreat = aiCellThreatForPlayer(move.char.player, move.char.r, move.char.c);
              const afterThreat = aiCellThreatForPlayer(move.char.player, move.r, move.c);
              utility += isOwn ? (beforeThreat - afterThreat) * 5 : (afterThreat - beforeThreat) * 3;
            }
          }
          for (const move of rotation.artifactMoves || []) {
            const before = aiNearestOwnCharacterDistance(move.artifact.r, move.artifact.c);
            const after = aiNearestOwnCharacterDistance(move.r, move.c);
            utility += (before - after) * 55;
          }
          // Poids fortement réduit : combler des trous de terrain n'est pas
          // un objectif en soi (un plateau plus morcelé peut même gêner
          // l'adversaire), ce terme ne doit plus pouvoir, à lui seul, motiver
          // une rotation qui n'apporte aucun gain de couronne/menace réel —
          // sinon la magie se gaspille sur du "rangement" plutôt que sur de
          // la tactique.
          const beforeContacts = aiExternalLandContacts(island.cells, island.id);
          const afterContacts = aiExternalLandContacts(rotation.absCells, island.id);
          utility += (afterContacts - beforeContacts) * 4;
          if (utility > 20) options.push({ island, pivot, steps, cost: 1, score: -utility, utility });
        }
        options.sort((a, b) => b.utility - a.utility);
        return options[0] || null;
      }

      async function aiPerformMove(option, token) {
        if (!option || token !== aiRunToken) return false;
        state.phase = "ACTION";
        state.selectedActionType = "MOVE";
        state.selectedActionCount = option.cost;
        state.selectedCharId = option.char.id;
        state.selectedIslandId = null;
        state.reachable = movementRange(option.char, option.cost);
        renderAll();
        await sleep(260);
        if (token !== aiRunToken || !state) return false;
        // Position réelle relevée avant/après le clic : l'IA peut demander un
        // déplacement que le moteur refuse, et un journal qui enregistrerait
        // l'intention plutôt que l'effet rendrait un échec de puzzle
        // indéchiffrable.
        const avant = [option.char.r, option.char.c];
        handleMoveClick(option.r, option.c);
        await sleep(650);
        // Relevé APRÈS l'attente : le déplacement se matérialise pendant
        // l'animation, pas au moment du clic. Mesuré juste après handleMoveClick,
        // `applique` aurait été faux même pour un déplacement parfaitement valide.
        benchJournaliser({
          type: "MOVE", gardien: option.char.id, depuis: avant,
          vers: [option.r, option.c], cout: option.cost, porte: !!option.carrying,
          arrivee: [option.char.r, option.char.c],
          applique: option.char.r !== avant[0] || option.char.c !== avant[1]
        });
        return true;
      }

      async function aiPerformPush(option, token) {
        if (!option || token !== aiRunToken) return false;
        state.phase = "ACTION";
        state.selectedActionType = "PUSH";
        state.selectedActionCount = option.count;
        state.selectedCharId = option.pusher.id;
        state.selectedIslandId = null;
        state.reachable = new Set(orthogonalNeighbors(option.pusher.r, option.pusher.c).map(([r, c]) => key(r, c)));
        renderAll();
        await sleep(260);
        if (token !== aiRunToken || !state) return false;
        handlePushClick(option.r, option.c);
        benchJournaliser({ type: "PUSH", pousseur: option.pusher.id, vers: [option.r, option.c], force: option.count });
        await sleep(650);
        return true;
      }

      async function aiPerformMagic(option, token) {
        if (!option || token !== aiRunToken) return false;
        state.phase = "ACTION";
        state.selectedActionType = "MAGIC";
        state.selectedActionCount = 1;
        state.selectedIslandId = option.island.id;
        state.selectedMagicPivot = [...option.pivot];
        state.magicPreviewSteps = option.steps;
        updateMagicPreview();
        renderAll();
        await sleep(380);
        if (token !== aiRunToken || !state) return false;
        confirmMagicRotation();
        benchJournaliser({ type: "MAGIC", ile: option.island.id, pivot: [...option.pivot], pas: option.steps });
        await sleep(620);
        return true;
      }

      function aiCrownValidationOption() {
        if (availableActionCount("MOVE") < 1) return null;
        const char = aiOwnCharacters().find(candidate =>
          characterCarriesCrown(candidate.id)
          && isCrownValidationCell(currentPlayer(), candidate.r, candidate.c)
        );
        return char ? { char } : null;
      }

      async function aiPerformCrownValidation(option, token) {
        if (!option || token !== aiRunToken || !state) return false;

        state.phase = "ACTION_SELECT";
        state.selectedActionType = null;
        state.selectedCharId = option.char.id;
        renderAll();
        showToast("ORDINATEUR valide une couronne pour 1 déplacement.");
        await sleep(320);

        if (token !== aiRunToken || !state) return false;
        const validated = validateCrownPoint(option.char, { fromAI: true });
        await sleep(520);
        return validated;
      }

      function aiOpponentScoreThreat() {
        const opponents = state.players.filter(player => player.id !== state.currentPlayer);
        let threat = 0;

        for (const opponent of opponents) {
          const carrier = state.characters.find(char =>
            char.player === opponent.id && characterCarriesCrown(char.id)
          );
          if (!carrier) continue;

          const distance = aiValidationDistanceForPlayer(
            opponent,
            carrier.r,
            carrier.c
          );

          if (distance === 0) threat = Math.max(threat, 140);
          else if (distance <= 2) threat = Math.max(threat, 95);
          else if (distance <= 4) threat = Math.max(threat, 55);
        }

        return threat;
      }

      function aiExpertActionChoice(move, push, magic) {
        const choices = [];
        if (move) choices.push({ type: "MOVE", option: move, value: move.utility ?? (-move.score) });
        if (push) choices.push({ type: "PUSH", option: push, value: push.utility ?? (-push.priority) });
        if (magic) choices.push({ type: "MAGIC", option: magic, value: magic.utility ?? (-magic.score) });
        choices.sort((a, b) => b.value - a.value);
        // L'Expert conserve ses cartes plutôt que de jouer un coup neutre ou nuisible.
        return choices.find(choice => choice.value > 12) || null;
      }

      async function runAITurn(token) {
        if (!state || token !== aiRunToken || !isCurrentPlayerAI()) return;

        const cfg = aiConfig();
        state.aiThinking = true;
        state.inputLocked = true;
        els.gameScreen.classList.add("ai-turn");
        renderAll();
        showToast(`ORDINATEUR · ${cfg.label.toUpperCase()} analyse le plateau…`);
        await sleep(cfg.thinkDelay);

        if (token !== aiRunToken || !state) return;

        if (!state.islandPlacedThisTurn) {
          createAutomaticIslandAndSpawn(state.currentPlayer, false);
          benchJournaliser({ type: "POSE", automatique: true, avantActions: true });
          await sleep(760);
        }

        let actionsPlayed = 0;
        let freeTacticsPlayed = 0;

        while (
          token === aiRunToken
          && state
          && state.winner === null
          && actionsPlayed < cfg.actionLimit
        ) {
          state.inputLocked = false;
          let acted = false;
          let consumedAction = false;

          /*
           * 1. Si un porteur est déjà sur l'une des 3 cases de son coin,
           * l'IA dépense 1 déplacement pour valider immédiatement le point.
           */
          const crownValidation = null; // Validation désormais automatique au début du tour.

          /*
           * 2. Une couronne adjacente est toujours récupérée gratuitement.
           */
          const freePickup = aiAdjacentCrownPickup();
          if (!acted && freePickup && freeTacticsPlayed < 3) {
            acted = await aiPerformFreeCrownPickup(freePickup, token);
            freeTacticsPlayed++;
          }

          /*
           * 2. Transfert gratuit : le porteur pose la couronne sur une case
           * commune et l'allié situé à deux cases la récupère immédiatement.
           */
          if (!acted && freeTacticsPlayed < 3) {
            const handoff = aiBestFreeCrownHandoff();
            if (handoff) {
              acted = await aiPerformFreeCrownHandoff(handoff, token);
              freeTacticsPlayed++;
            }
          }

          /*
           * 3. Aux niveaux Difficile et Expert, l'IA peut poser la couronne,
           * puis employer ses poussées pour la rapprocher d'un village ou
           * d'un allié.
           */
          if (!acted) {
            const dropPush = aiBestDropAndPushCrown();
            if (dropPush) {
              acted = await aiPerformDropAndPushCrown(dropPush, token);
              consumedAction = acted;
            }
          }

          const push = aiBestPush();
          const magic = aiBestMagic();
          const move = aiBestMove();
          const carrier = aiOwnCharacters().find(ch => characterCarriesCrown(ch.id));

          if (window.ILYOS && typeof window.ILYOS.yieldToMainThread === "function") {
            await window.ILYOS.yieldToMainThread();
          }
          if (!acted && cfg.globalPlanning) {
            const choice = aiExpertActionChoice(move, push, magic);

            if (choice?.type === "MOVE") {
              acted = await aiPerformMove(choice.option, token);
            } else if (choice?.type === "PUSH") {
              acted = await aiPerformPush(choice.option, token);
            } else if (choice?.type === "MAGIC") {
              acted = await aiPerformMagic(choice.option, token);
            }

            consumedAction = acted;
          } else {
            const strongMagicThreshold =
              cfg.crownTactics >= 3 ? 1.5 :
                cfg.crownTactics >= 2 ? -.5 :
                  -3;

            if (
              !acted
              && magic
              && magic.score < strongMagicThreshold
              && gameRandom() < cfg.magicProbability
            ) {
              acted = await aiPerformMagic(magic, token);
              consumedAction = acted;
            }

            if (
              !acted
              && push
              && (aiOpponentCarrier() || !carrier || push.priority < 0)
              && gameRandom() < cfg.pushProbability
            ) {
              acted = await aiPerformPush(push, token);
              consumedAction = acted;
            }

            if (!acted && move) {
              acted = await aiPerformMove(move, token);
              consumedAction = acted;
            }

            if (!acted && magic && gameRandom() < cfg.magicProbability) {
              acted = await aiPerformMagic(magic, token);
              consumedAction = acted;
            }
          }

          if (!acted) break;
          if (consumedAction) actionsPlayed++;
          await sleep(cfg.actionDelay);
        }

        if (token !== aiRunToken || !state || state.winner !== null) return;
        state.aiThinking = false;
        state.inputLocked = false;
        els.gameScreen.classList.remove("ai-turn");
        state.phase = "ACTION_SELECT";
        state.selectedActionType
