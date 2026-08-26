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
