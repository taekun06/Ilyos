      /* =====================================================================
         NOYAUX DE RÈGLES — la vérité du jeu, séparée de sa mise en scène.

         Problème que ce fragment corrige. Les exécuteurs d'actions mélangeaient
         règles, mutation d'état, rendu, animation, son et attentes. Pour le
         déplacement, la mutation logique était même posée DANS le callback de
         fin d'animation :

             queueKayKitActionAnimation(..., () => {
               char.r = r; char.c = c;        // ← la règle, à mi-animation
               resolveArtifactForCharacter(char);
               useSelectedCard(cost);
             });

         Conséquence mesurée au Prompt 1 : l'IA lisait parfois la position d'un
         gardien avant que son déplacement ne se soit matérialisé, rejouait le
         même coup, et sa séquence dépendait du temps réel. À graine figée, le
         puzzle 07 jouait une transmission de plus au premier passage.

         Principe retenu ici : le gameplay est autoritaire, l'animation ne fait
         que raconter le résultat. Ce n'est d'ailleurs pas une invention — c'est
         déjà ce que dit syncKayKitCharacters(), qui ne repositionne un visuel
         que si aucune animation n'est en cours (`if (!visual.move && ...)`).
         Muter l'état immédiatement ne casse donc pas la marche : le visuel
         continue son trajet et se cale à la fin.

         Ces fonctions sont SYNCHRONES et n'effectuent aucun rendu, aucune
         animation, aucun son, aucune attente, aucun accès au DOM. Elles sont
         appelées à la fois par le jeu réel et par la simulation du planner :
         une seule source de vérité, donc aucune divergence possible entre ce
         que l'IA prévoit et ce que le jeu applique.
         ===================================================================== */

      /** Ramassage d'une couronne libre par un gardien arrivant sur sa case.
       *  Version sans message : le toast appartient à la présentation. */
      function resolveArtifactCore(char) {
        if (!char || characterCarriesCrown(char.id)) return null;
        const libre = looseArtifactAt(char.r, char.c);
        if (!libre) return null;
        return giveArtifactToCharacter(libre, char) ? libre : null;
      }

      /** Consomme des cartes et remet la sélection à zéro.
       *  Extrait de useSelectedCard(), dont il ne reste que la présentation
       *  (rendu, bandeau de consommation, toasts). */
      function consumeSelectedActionCore(type, count) {
        if (!type) return 0;
        const depense = consumeAvailableActions(type, count);

        state.selectedActionCardId = null;
        state.selectedActionType = null;
        state.selectedActionCount = 1;
        state.selectedCharId = null;
        state.selectedIslandId = null;
        state.magicHoverIslandId = null;
        state.magicHoverPivot = null;
        state.magicHoverPreviewCells = null;
        state.magicHoverPreviewValid = false;
        state.actionHoverCell = null;
        state.smartHoverType = null;
        state.smartHoverPath = [];
        state.pendingDirectMoveTarget = null;
        state.reachable = new Set();
        state.phase = "ACTION_SELECT";
        return depense;
      }

      /** Déplacement : mutation logique complète et immédiate.
       *  L'appelant reste responsable de lancer l'animation correspondante, en
       *  lui passant la case de DÉPART renvoyée ici — la position du gardien
       *  ayant déjà changé, elle ne peut plus être relue depuis l'état. */
      function applyMoveCore(charId, r, c, cost) {
        const char = characterById(charId);
        if (!char) return null;
        const depuis = [char.r, char.c];
        char.r = r;
        char.c = c;
        const ramassee = resolveArtifactCore(char);
        const depense = consumeSelectedActionCore("MOVE", cost);
        return {
          type: "MOVE",
          charId: char.id,
          depuis,
          vers: [r, c],
          cout: depense,
          couronneRamassee: ramassee ? ramassee.id : null
        };
      }

      /** Poussée : la ligne était déjà déplacée de façon synchrone par
       *  pushCharacter()/pushLooseArtifact(), seule la consommation de carte
       *  restait différée dans le callback d'animation. Le noyau ferme ce
       *  dernier écart. */
      function applyPushCore(pusherId, r, c, force) {
        const pousseur = characterById(pusherId);
        if (!pousseur) return null;
        const dr = r - pousseur.r;
        const dc = c - pousseur.c;
        if (Math.abs(dr) + Math.abs(dc) !== 1) return null;

        const cible = characterAt(r, c);
        const couronne = cible ? null : looseArtifactAt(r, c);
        if (!cible && !couronne) return null;

        const resultat = cible
          ? pushCharacter(cible, dr, dc, force, r, c)
          : pushLooseArtifact(couronne, dr, dc, force, r, c);
        if (!resultat) return null;

        const depense = consumeSelectedActionCore("PUSH", force);
        return { type: "PUSH", pusherId, vers: [r, c], force: depense, resultat };
      }

      /** Rotation d'île : applique la transformation déjà calculée par
       *  calculateIslandRotationAroundPivot(), y compris le déplacement des
       *  gardiens et des couronnes portés par l'île.
       *
       *  Comme pour le déplacement, la mutation vivait dans le callback de fin
       *  d'animation. Elle est désormais immédiate ; c'est l'appelant qui doit
       *  empêcher la scène de reconstruire le calque d'îles pendant que
       *  l'animation raconte encore la rotation (voir islandRotationEnCours). */
      function applyMagicRotationCore(islandId, rotation) {
        const ile = state.islands.find(is => is.id === islandId);
        if (!ile || !rotation?.valid) return null;

        const avant = ile.cells.map(([r, c]) => [r, c]);
        ile.cells = rotation.absCells;
        ile.relCells = rotation.relCells;
        ile.anchor = rotation.anchor;

        for (const deplacement of rotation.characterMoves || []) {
          deplacement.char.r = deplacement.r;
          deplacement.char.c = deplacement.c;
        }
        for (const deplacement of rotation.artifactMoves || []) {
          deplacement.artifact.r = deplacement.r;
          deplacement.artifact.c = deplacement.c;
        }

        const depense = consumeSelectedActionCore("MAGIC", 1);
        return { type: "MAGIC", islandId, cellulesAvant: avant, cout: depense };
      }

      /** Pose d'île — macro-action COMPLÈTE.
       *
       *  Une pose n'est pas seulement du terrain. Selon les règles elle
       *  entraîne aussi l'apparition d'un gardien, le choix de sa case, et la
       *  résolution éventuelle d'une couronne si ce gardien apparaît dessus.
       *  Un planner qui ne modéliserait que le terrain sous-évaluerait
       *  systématiquement la pose précoce, alors qu'elle offre une pièce
       *  jouable immédiatement.
       *
       *  Le choix de la case de spawn reprend exactement celui de
       *  createAutomaticIslandAndSpawn : la case libre la plus proche de la
       *  cible de placement automatique. */
      function applyIslandPlacementCore(shapeKey, cells, ownerId, relCells = null, anchor = null) {
        if (!state || !Array.isArray(cells) || !cells.length) return null;

        const cellules = cloneCells(cells);
        const identifiant = state.nextIslandId++;
        const ile = {
          id: identifiant,
          owner: ownerId,
          shapeKey,
          anchor: anchor ? { ...anchor } : { r: cellules[0][0], c: cellules[0][1] },
          relCells: cloneCells(relCells || cellules.map(([r, c]) => [r - cellules[0][0], c - cellules[0][1]])),
          cells: cellules,
          visualVariant: chooseIslandVisualVariant(cellules, identifiant, state.islands)
        };
        state.islands.push(ile);
        state.islandPlacedThisTurn = true;

        let gardien = null;
        let couronneRamassee = null;
        if (canCreateGuardian(ownerId)) {
          const cible = automaticPlacementTarget(ownerId);
          const libres = ile.cells.filter(([r, c]) => !characterAt(r, c));
          libres.sort((a, b) =>
            (Math.abs(a[0] - cible[0]) + Math.abs(a[1] - cible[1])) -
            (Math.abs(b[0] - cible[0]) + Math.abs(b[1] - cible[1])));
          const [sr, sc] = libres[0] || ile.cells[0];
          gardien = { id: `char-${state.nextCharId++}`, player: ownerId, r: sr, c: sc };
          state.characters.push(gardien);
          couronneRamassee = resolveArtifactCore(gardien);
        }

        state.phase = "ACTION_SELECT";
        state.pendingSpawnIslandId = null;
        state.selectedIslandShape = null;
        state.placementCells = null;
        state.placementOriginIndex = 0;
        state.hoverAnchor = null;

        return {
          type: "POSE",
          ileId: ile.id,
          forme: shapeKey,
          cellules: ile.cells.map(([r, c]) => [r, c]),
          gardienId: gardien ? gardien.id : null,
          gardienCase: gardien ? [gardien.r, gardien.c] : null,
          couronneRamassee: couronneRamassee ? couronneRamassee.id : null
        };
      }

      /* ---------------------------------------------------------------------
         ÉTAT STRATÉGIQUE CANONIQUE

         Forme réduite de `state`, dérivée du même inventaire que
         snapshotState() mais débarrassée de tout ce qui ne participe pas aux
         règles : survol, aperçus de magie, portée affichée, effets, minuteurs
         d'interface, sélection en cours.

         Deux usages : comparer un état simulé à un état réel (test de
         fidélité), et servir de base au planner sans lui laisser voir ce qu'un
         joueur ne voit pas.

         INFORMATION CACHÉE. `player.deck` est un tableau MÉLANGÉ et ORDONNÉ :
         le donner au planner reviendrait à lui montrer l'ordre exact des
         pioches à venir. Seul son EFFECTIF est conservé. Les identifiants de
         cartes en main sont également retirés : ils n'ont aucune valeur de
         règle et rendraient deux états identiques comparables comme
         différents.
         ------------------------------------------------------------------- */
      function canonicalStrategicState(source = state) {
        if (!source) return null;
        const trierCellules = cellules =>
          [...(cellules || [])].map(([r, c]) => [r, c]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);

        return {
          tour: source.turn,
          manche: source.round,
          joueurCourant: source.currentPlayer,
          vainqueur: source.winner ?? null,
          ilePoseeCeTour: !!source.islandPlacedThisTurn,
          couronneCentreePriseCeTour: !!source.centerCrownTakenThisTurn,
          couronnesEnAttente: [...(source.couronnesEnAttente || [])].sort(),
          regles: {
            allowDissolve: !!source.rules?.allowDissolve,
            islandLimitPerPlayer: source.rules?.islandLimitPerPlayer || 0,
            shapeLimitPerOwner: source.rules?.shapeLimitPerOwner
          },
          joueurs: (source.players || []).map(p => ({
            id: p.id,
            score: p.score || 0,
            estIA: !!p.isAI,
            // Effectif seul : jamais l'ordre. Voir la note sur l'information
            // cachée ci-dessus.
            cartesEnPioche: (p.deck || []).length,
            // Triées : deux mains de même composition sont le même état.
            main: (p.hand || []).filter(c => !c.used).map(c => c.action).sort(),
            defausse: (p.discard || []).map(c => c.action).sort(),
            reserve: {
              MOVE: p.stash?.MOVE || 0,
              PUSH: p.stash?.PUSH || 0,
              MAGIC: p.stash?.MAGIC || 0
            }
          })),
          gardiens: (source.characters || [])
            .map(ch => ({ id: ch.id, joueur: ch.player, r: ch.r, c: ch.c }))
            .sort((a, b) => String(a.id).localeCompare(String(b.id))),
          couronnes: [source.artifact, source.secondArtifact].filter(Boolean).map(a => ({
            id: a.id,
            r: a.r,
            c: a.c,
            active: !!a.active,
            porteur: a.carrierId ?? null
          })).sort((a, b) => String(a.id).localeCompare(String(b.id))),
          iles: (source.islands || [])
            .map(i => ({
              id: i.id,
              proprietaire: i.owner,
              forme: i.shapeKey,
              deFormation: !!i.fromSetup,
              cellules: trierCellules(i.cells)
            }))
            .sort((a, b) => a.id - b.id)
        };
      }

      /** Empreinte comparable d'un état stratégique. Deux états identiques au
       *  sens des règles produisent la même chaîne, quel que soit l'ordre
       *  interne des tableaux. */
      function strategicStateFingerprint(source = state) {
        return JSON.stringify(canonicalStrategicState(source));
      }

      /* ---------------------------------------------------------------------
         SIMULATION

         Exécute une fonction sur un CLONE de l'état, présentation coupée, puis
         restaure tout. C'est ce qui permet au planner d'appeler exactement les
         mêmes fonctions de règles que le jeu réel au lieu d'en réimplémenter
         une seconde version — le risque principal de toute cette refonte.

         Deux conditions strictes, l'une et l'autre indispensables :

         — SYNCHRONE de bout en bout. Aucun `await`, aucun timer, aucun callback
           différé pendant que la globale `state` désigne le clone : le premier
           retour à la boucle d'événements exposerait le clone au reste du jeu.
           C'est possible précisément parce que les noyaux de règles n'attendent
           plus rien.
         — RESTAURATION EN `finally`. Une exception au milieu d'une simulation
           laisserait sinon le jeu réel branché sur un état de travail.
         ------------------------------------------------------------------- */
      function cloneStateForSimulation(source = state) {
        // structuredClone plutôt que JSON : `state` contient des Set (reachable,
        // smartPushTargets) qu'un aller-retour JSON transformerait silencieusement
        // en objets vides. Les champs non clonables (aucun aujourd'hui, mais la
        // garde évite une régression sournoise) feraient échouer bruyamment.
        const clone = structuredClone({
          players: source.players,
          currentPlayer: source.currentPlayer,
          round: source.round,
          turn: source.turn,
          islands: source.islands,
          characters: source.characters,
          artifact: source.artifact,
          secondArtifact: source.secondArtifact,
          couronnesEnAttente: source.couronnesEnAttente || [],
          phase: source.phase,
          islandPlacedThisTurn: !!source.islandPlacedThisTurn,
          centerCrownTakenThisTurn: !!source.centerCrownTakenThisTurn,
          rules: source.rules || {},
          nextIslandId: source.nextIslandId,
          nextCharId: source.nextCharId,
          winner: source.winner ?? null,
          selectedActionType: source.selectedActionType,
          selectedActionCount: source.selectedActionCount,
          selectedCharId: source.selectedCharId,
          selectedIslandId: source.selectedIslandId,
          pushForceChoice: source.pushForceChoice || 1
        });
        // Champs attendus par les fonctions de règles, reconstruits vides : ils
        // ne portent aucune information de jeu.
        clone.reachable = new Set();
        clone.undoHistory = [];
        clone.fxCells = [];
        clone.crownTransferTargetIds = [];
        clone.smartHoverPath = [];
        clone.smartPushTargets = new Set();
        clone.inputLocked = false;
        clone.soloMode = !!source.soloMode;
        clone.onlineMode = false;
        return clone;
      }

      function withSimulatedState(clone, fn) {
        const etatReel = state;
        const simulationPrecedente = ilyosSimulationActive;
        state = clone;
        ilyosSimulationActive = true;
        try {
          return fn(clone);
        } finally {
          ilyosSimulationActive = simulationPrecedente;
          state = etatReel;
        }
      }

      /** Simule une action sur une copie et rend l'empreinte de l'état obtenu,
       *  sans toucher à la partie en cours. */
      function simulateActionFingerprint(action) {
        const clone = cloneStateForSimulation();
        return withSimulatedState(clone, () => {
          appliquerActionNoyau(action);
          return strategicStateFingerprint(clone);
        });
      }

      /** Point d'entrée unique des noyaux, utilisé par la simulation comme par
       *  les tests de fidélité. Une action est une donnée, pas un appel. */
      function appliquerActionNoyau(action) {
        if (!action) return null;
        switch (action.type) {
          case "MOVE": return applyMoveCore(action.charId, action.r, action.c, action.cost);
          case "PUSH": return applyPushCore(action.pusherId, action.r, action.c, action.force);
          case "MAGIC": {
            const ile = state.islands.find(is => is.id === action.islandId);
            if (!ile) return null;
            const rotation = calculateIslandRotationAroundPivot(
              ile, action.pivot[0], action.pivot[1], action.direction, action.turns
            );
            return applyMagicRotationCore(action.islandId, rotation);
          }
          case "POSE": return applyIslandPlacementCore(
            action.shapeKey, action.cells, action.owner, action.relCells, action.anchor
          );
          default: return null;
        }
      }
