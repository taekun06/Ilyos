      /* =====================================================================
         CERVEAU EXPERT V2 — évaluateur, candidats, recherche de plan de tour.

         Ce que change ce fragment. L'Expert Legacy calculait séparément son
         meilleur MOVE, son meilleur PUSH et sa meilleure MAGIE, puis comparait
         trois utilités produites par trois fonctions d'échelles différentes
         sous un seuil unique. Il répondait donc à « quelle action semble la
         meilleure maintenant ? ».

         Expert V2 répond à « quel état je veux obtenir à la fin de mon tour, et
         quelle séquence m'y conduit ? ». Une seule échelle : l'état résultant,
         noté par evaluateStrategicState. Les actions ne sont plus comparées
         entre elles, ce sont les POSITIONS qui le sont.

         Trois principes de construction, à tenir dans la durée :

         1. PEU DE CONCEPTS, RÉUTILISABLES. Score, proximité, sécurité,
            ressources, connectivité, contrôle. Pas de catalogue de situations
            particulières : un moteur de décision, pas une liste de réponses.

         2. AUCUNE HEURISTIQUE TAILLÉE POUR UN PUZZLE. Les échecs du banc
            d'essai désignent des capacités générales manquantes — comparer
            agir et s'arrêter, comprendre la magie comme une transformation du
            graphe, choisir le moment de poser, tenir compte d'une couronne à
            venir. Ce sont ces capacités qui sont implémentées ici.

         3. LES POIDS VIVENT AU MÊME ENDROIT (PLAN_POIDS). Le défaut structurel
            de l'Expert Legacy était d'avoir des coefficients dispersés dans
            chaque sous-système, donc incomparables entre eux.
         ===================================================================== */

      const PLAN_POIDS = {
        // Terminal : rien ne doit pouvoir rivaliser.
        victoire: 1e6,

        // Un point marqué domine tout avantage de position.
        pointValide: 4000,

        // Porter une couronne, et la rapprocher de sa validation.
        couronnePortee: 400,
        progressionPorteur: 900,
        surCaseValidation: 1500,
        porteurExpose: 1200,

        /* Une couronne libre appartient à qui peut l'atteindre le premier.
           Ce poids porte tout le GRADIENT d'approche : c'est lui qui doit
           rendre rentable un déplacement qui ne fait que se rapprocher, sans
           rien conclure. Calibré à 320, il était plus faible que la valeur
           des cartes dépensées pour l'approche, et l'IA préférait garder ses
           cartes plutôt que d'avancer vers une couronne à sa portée. */
        couronneLibre: 900,

        // Une couronne encore en attente vaut déjà quelque chose : elle
        // arrivera au sanctuaire au prochain tour.
        couronneEnAttente: 260,

        // Un gardien de plus, c'est une action de plus chaque tour.
        gardien: 180,
        gardienMobile: 25,

        /* Valeur d'une carte NON dépensée. Délibérément faible : elle ne doit
           jamais rivaliser avec un vrai gain, seulement rendre perdant le fait
           de jouer un coup qui n'apporte rien. C'est ce qui produit
           naturellement l'arrêt volontaire — sans bonus d'économie arbitraire,
           et sans jamais empêcher une victoire ou une défense urgente, qui
           pèsent des ordres de grandeur au-dessus. */
        carteConservee: 12,

        // Consommer une forme rare a un coût, proportionnel à sa raréfaction.
        formeConsommee: 90
      };

      /** Proximité décroissante et bornée, tirée d'une distance de déplacement
       *  réelle. Une distance inatteignable (repli 30+ de
       *  aiLandDistanceToTargets) vaut zéro : aucune valeur ne doit venir d'un
       *  objectif qu'aucune route ne relie. */
      function plannerProximite(distance) {
        if (!Number.isFinite(distance) || distance >= 30) return 0;
        return 1 / (1 + distance * 0.5);
      }

      function plannerAdversaire(playerId) {
        return state.players.find(p => p.id !== playerId) || null;
      }

      function plannerGardiensDe(playerId) {
        return state.characters.filter(ch => ch.player === playerId);
      }

      /** Distance de déplacement du gardien le plus proche d'un jeu de cases. */
      function plannerDistanceEquipe(playerId, cibles) {
        const gardiens = plannerGardiensDe(playerId);
        if (!gardiens.length || !cibles.length) return Infinity;
        let meilleure = Infinity;
        for (const g of gardiens) {
          const d = aiLandDistanceToTargets(g.r, g.c, cibles);
          if (d < meilleure) meilleure = d;
        }
        return meilleure;
      }

      /** Ressources encore disponibles, main et réserve confondues. */
      function plannerRessources(playerId) {
        const joueur = state.players[playerId];
        return {
          MOVE: availableActionCount("MOVE", joueur),
          PUSH: availableActionCount("PUSH", joueur),
          MAGIC: availableActionCount("MAGIC", joueur)
        };
      }

      function plannerTotalRessources(playerId) {
        const r = plannerRessources(playerId);
        return r.MOVE + r.PUSH + r.MAGIC;
      }

      /** Coût d'opportunité des formes déjà consommées. Nul quand le stock est
       *  illimité — shapeLimitPerOwner() fait autorité, 0 signifiant illimité. */
      function plannerCoutFormes(playerId) {
        const limite = shapeLimitPerOwner();
        if (!limite) return 0;
        let cout = 0;
        Object.keys(SHAPES).forEach(forme => {
          const utilisees = state.islands.filter(i =>
            i.owner === playerId && i.shapeKey === forme && !i.fromSetup).length;
          if (utilisees > 0) cout += PLAN_POIDS.formeConsommee * (utilisees / limite);
        });
        return cout;
      }

      /* ---------------------------------------------------------------------
         ÉVALUATEUR STRATÉGIQUE UNIQUE

         Note un ÉTAT du point de vue d'un joueur. Toutes les actions du planner
         sont comparées à travers lui, jamais entre elles : c'est ce qui rend
         un déplacement, une poussée, une rotation et une pose commensurables.
         ------------------------------------------------------------------- */
      function evaluateStrategicState(playerId) {
        const moi = state.players[playerId];
        if (!moi) return 0;
        const adverse = plannerAdversaire(playerId);

        // A. Terminal : domine absolument.
        if (state.winner !== null && state.winner !== undefined) {
          return state.winner === playerId ? PLAN_POIDS.victoire : -PLAN_POIDS.victoire;
        }

        let valeur = 0;

        // B. Points déjà marqués.
        valeur += (moi.score || 0) * PLAN_POIDS.pointValide;
        if (adverse) valeur -= (adverse.score || 0) * PLAN_POIDS.pointValide;

        const ciblesMoi = aiValidationTargetsForPlayer(moi);
        const ciblesAdverse = adverse ? aiValidationTargetsForPlayer(adverse) : [];

        // C. Couronnes actives : portées ou libres.
        for (const couronne of activeArtifacts()) {
          const porteur = couronne.carrierId ? characterById(couronne.carrierId) : null;

          if (porteur && porteur.player === playerId) {
            const d = aiLandDistanceToTargets(porteur.r, porteur.c, ciblesMoi);
            valeur += PLAN_POIDS.couronnePortee;
            valeur += PLAN_POIDS.progressionPorteur * plannerProximite(d);
            if (isCrownValidationCell(moi, porteur.r, porteur.c)) valeur += PLAN_POIDS.surCaseValidation;
            // Un porteur qu'une seule poussée jette dans le vide n'est pas un
            // porteur : la couronne est perdue dès le tour adverse.
            if (aiPushOffRisk(playerId, porteur.r, porteur.c)) valeur -= PLAN_POIDS.porteurExpose;

          } else if (porteur && adverse) {
            const d = aiLandDistanceToTargets(porteur.r, porteur.c, ciblesAdverse);
            valeur -= PLAN_POIDS.couronnePortee;
            valeur -= PLAN_POIDS.progressionPorteur * plannerProximite(d);
            if (isCrownValidationCell(adverse, porteur.r, porteur.c)) valeur -= PLAN_POIDS.surCaseValidation;
            if (aiPushOffRisk(adverse.id, porteur.r, porteur.c)) valeur += PLAN_POIDS.porteurExpose * 0.5;

          } else {
            // Libre : elle revient à qui peut l'atteindre le plus vite.
            const cible = [[couronne.r, couronne.c]];
            const dMoi = plannerDistanceEquipe(playerId, cible);
            const dAdv = adverse ? plannerDistanceEquipe(adverse.id, cible) : Infinity;
            valeur += PLAN_POIDS.couronneLibre * (plannerProximite(dMoi) - plannerProximite(dAdv));
          }
        }

        /* D. Couronnes en attente. Elles n'existent pas encore sur le plateau,
           mais entreront au sanctuaire au prochain tour : être déjà placé pour
           les prendre a une valeur réelle. Sans ce terme, l'IA ne peut au mieux
           que dériver vers le centre par défaut — ce qui n'est pas la même
           chose que d'anticiper. */
        const enAttente = (state.couronnesEnAttente || []).length;
        if (enAttente > 0) {
          const sanctuaire = [[CENTER.r, CENTER.c]];
          const dMoi = plannerDistanceEquipe(playerId, sanctuaire);
          const dAdv = adverse ? plannerDistanceEquipe(adverse.id, sanctuaire) : Infinity;
          valeur += enAttente * PLAN_POIDS.couronneEnAttente
            * (plannerProximite(dMoi) - plannerProximite(dAdv));
        }

        // E. Gardiens : nombre et capacité à agir.
        const miens = plannerGardiensDe(playerId);
        valeur += miens.length * PLAN_POIDS.gardien;
        if (adverse) valeur -= plannerGardiensDe(adverse.id).length * PLAN_POIDS.gardien;
        // Un gardien qui ne peut aller nulle part ne vaut pas un gardien libre.
        for (const g of miens) {
          if (movementEdges(g.r, g.c).some(e => isLand(e.r, e.c) && !characterAt(e.r, e.c))) {
            valeur += PLAN_POIDS.gardienMobile;
          }
        }

        // F. Ressources conservées : voir PLAN_POIDS.carteConservee.
        valeur += plannerTotalRessources(playerId) * PLAN_POIDS.carteConservee;

        // G. Formes consommées.
        valeur -= plannerCoutFormes(playerId);

        return valeur;
      }

      /* ---------------------------------------------------------------------
         GÉNÉRATEURS DE CANDIDATS

         Aucune recherche exhaustive : le facteur de branchement exploserait.
         Chaque générateur propose une liste courte mais diverse, pré-classée
         par un indice bon marché ; c'est ensuite l'évaluateur qui tranche sur
         l'état obtenu. Le pré-classement ne sert qu'à ne pas simuler des
         milliers de coups sans intérêt, jamais à décider.
         ------------------------------------------------------------------- */

      const PLAN_CANDIDATS = { move: 8, push: 5, magic: 4, pose: 6 };

      function plannerCandidatsMove(playerId) {
        const budget = availableActionCount("MOVE", state.players[playerId]);
        if (budget < 1) return [];
        const options = [];

        for (const gardien of plannerGardiensDe(playerId)) {
          const porte = characterCarriesCrown(gardien.id);
          const cibles = porte
            ? aiValidationTargetsForPlayer(state.players[playerId])
            : plannerObjectifsGardien(playerId);
          const depart = aiLandDistanceToTargets(gardien.r, gardien.c, cibles);
          const portee = movementRange(gardien, budget);

          for (const cle of portee) {
            const [r, c] = cle.split(",").map(Number);
            const chemin = shortestMovementPath(gardien, r, c, budget);
            if (!chemin?.length) continue;
            const cout = chemin.cost ?? chemin.length;

            /* Indice de pré-tri seulement : progression vers l'objectif,
               capture immédiate, mise en sécurité. Volontairement grossier —
               il ne fait que décider quels coups méritent d'être simulés. */
            const arrivee = aiLandDistanceToTargets(r, c, cibles);
            let indice = (depart - arrivee) * 10 - cout;
            if (looseArtifactAt(r, c) && !porte) indice += 60;
            if (porte && isCrownValidationCell(state.players[playerId], r, c)) indice += 120;
            if (porte && aiPushOffRisk(playerId, gardien.r, gardien.c)
              && !aiPushOffRisk(playerId, r, c)) indice += 80;

            options.push({ type: "MOVE", charId: gardien.id, r, c, cost: cout, indice });
          }
        }

        options.sort((a, b) => b.indice - a.indice);
        return options.slice(0, PLAN_CANDIDATS.move);
      }

      /** Objectifs d'un gardien qui ne porte pas : couronnes libres, sanctuaire
       *  si une couronne y est attendue, sinon le porteur adverse à intercepter. */
      function plannerObjectifsGardien(playerId) {
        const libres = activeArtifacts()
          .filter(a => a.carrierId === null)
          .map(a => [a.r, a.c]);
        if (libres.length) return libres;
        if ((state.couronnesEnAttente || []).length) return [[CENTER.r, CENTER.c]];
        const adverse = plannerAdversaire(playerId);
        const porteurAdverse = adverse && activeArtifacts()
          .map(a => a.carrierId ? characterById(a.carrierId) : null)
          .find(p => p && p.player !== playerId);
        if (porteurAdverse) {
          const autour = orthogonalNeighbors(porteurAdverse.r, porteurAdverse.c)
            .filter(([r, c]) => isLand(r, c));
          if (autour.length) return autour;
        }
        return [[CENTER.r, CENTER.c]];
      }

      function plannerCandidatsPush(playerId) {
        const budget = availableActionCount("PUSH", state.players[playerId]);
        if (budget < 1) return [];
        const options = [];

        for (const pousseur of plannerGardiensDe(playerId)) {
          for (const [r, c] of orthogonalNeighbors(pousseur.r, pousseur.c)) {
            const cible = characterAt(r, c);
            const couronne = cible ? null : looseArtifactAt(r, c);
            if (!cible && !couronne) continue;
            if (cible && cible.player === playerId) continue;

            const requise = cible ? collectPushLine(r, c, r - pousseur.r, c - pousseur.c).length : 1;
            for (let force = requise; force <= budget; force++) {
              // Indice grossier : viser un porteur, ou une couronne, compte plus.
              let indice = 10 - force;
              if (cible && characterCarriesCrown(cible.id)) indice += 70;
              if (couronne) indice += 40;
              // Une cible adossée au vide part du plateau.
              const derriere = [r + (r - pousseur.r), c + (c - pousseur.c)];
              if (!inside(derriere[0], derriere[1]) || !isLand(derriere[0], derriere[1])) indice += 90;
              options.push({ type: "PUSH", pusherId: pousseur.id, r, c, force, indice });
            }
          }
        }

        options.sort((a, b) => b.indice - a.indice);
        return options.slice(0, PLAN_CANDIDATS.push);
      }

      /* La magie est une TRANSFORMATION DU GRAPHE, pas un bonus local de
         contacts de terrain. Chaque rotation est donc pré-classée par son effet
         réel sur les distances qui comptent : celle de mon porteur vers sa
         validation, et celle du porteur adverse vers la sienne. Une rotation
         qui ne change aucune de ces deux quantités ne mérite pas d'être
         simulée, quelle que soit sa géométrie. */
      function plannerCandidatsMagic(playerId) {
        const budget = availableActionCount("MAGIC", state.players[playerId]);
        if (budget < 1) return [];
        const adverse = plannerAdversaire(playerId);
        const options = [];

        const mesurer = () => {
          const monPorteur = plannerGardiensDe(playerId).find(g => characterCarriesCrown(g.id));
          const porteurAdverse = adverse
            ? plannerGardiensDe(adverse.id).find(g => characterCarriesCrown(g.id))
            : null;
          const objectifs = plannerObjectifsGardien(playerId);
          return {
            moi: monPorteur
              ? aiLandDistanceToTargets(monPorteur.r, monPorteur.c, aiValidationTargetsForPlayer(state.players[playerId]))
              : plannerDistanceEquipe(playerId, objectifs),
            adverse: porteurAdverse && adverse
              ? aiLandDistanceToTargets(porteurAdverse.r, porteurAdverse.c, aiValidationTargetsForPlayer(adverse))
              : Infinity
          };
        };

        const avant = mesurer();

        for (const ile of state.islands) {
          for (const [pr, pc] of ile.cells) {
            for (const pas of [1, 2, 3]) {
              const direction = pas === 3 ? -1 : 1;
              const tours = pas === 3 ? 1 : pas;
              const rotation = calculateIslandRotationAroundPivot(ile, pr, pc, direction, tours);
              if (!rotation?.valid) continue;

              // Impact mesuré sur le graphe, en simulant réellement la rotation.
              const clone = cloneStateForSimulation();
              const impact = withSimulatedState(clone, () => {
                const ileClone = state.islands.find(i => i.id === ile.id);
                const rot = calculateIslandRotationAroundPivot(ileClone, pr, pc, direction, tours);
                if (!rot?.valid) return null;
                applyMagicRotationCore(ile.id, rot);
                return mesurer();
              });
              if (!impact) continue;

              const gainMoi = plannerProximite(impact.moi) - plannerProximite(avant.moi);
              const gainContre = plannerProximite(avant.adverse) - plannerProximite(impact.adverse);
              const indice = (gainMoi + gainContre) * 100;
              // Une rotation sans effet sur les distances utiles est écartée
              // avant même d'entrer dans la recherche.
              if (Math.abs(indice) < 1) continue;

              options.push({
                type: "MAGIC", islandId: ile.id, pivot: [pr, pc],
                direction, turns: tours, indice
              });
            }
          }
        }

        options.sort((a, b) => b.indice - a.indice);
        return options.slice(0, PLAN_CANDIDATS.magic);
      }

      function plannerCandidatsPose(playerId) {
        if (state.islandPlacedThisTurn) return [];
        const placements = findAutomaticIslandPlacement(playerId, PLAN_CANDIDATS.pose);
        if (!Array.isArray(placements)) return [];
        return placements.map(p => ({
          type: "POSE",
          shapeKey: p.shapeKey,
          cells: p.cells,
          relCells: p.relCells,
          anchor: p.anchor,
          owner: playerId
        }));
      }

      /* Transitions GRATUITES : elles ne consomment aucune carte et ne comptent
         pas comme une décision coûteuse. Elles ne sont plus des scripts joués
         avant le cerveau mais de vraies arêtes du graphe de recherche, ce qui
         permet à la recherche de découvrir d'elle-même des enchaînements du
         type MOVE → ramassage → transmission → MOVE. Les cycles sont évités par
         l'empreinte d'état, pas par un plafond arbitraire. */
      function plannerTransitionsGratuites(playerId) {
        const transitions = [];

        for (const gardien of plannerGardiensDe(playerId)) {
          if (characterCarriesCrown(gardien.id)) continue;
          for (const couronne of activeArtifacts()) {
            if (couronne.carrierId !== null) continue;
            if (Math.abs(gardien.r - couronne.r) + Math.abs(gardien.c - couronne.c) !== 1) continue;
            transitions.push({ type: "RAMASSAGE", charId: gardien.id, artifactId: couronne.id });
          }
        }

        const porteurs = plannerGardiensDe(playerId).filter(g => characterCarriesCrown(g.id));
        for (const porteur of porteurs) {
          for (const allie of plannerGardiensDe(playerId)) {
            if (allie.id === porteur.id || characterCarriesCrown(allie.id)) continue;
            if (Math.abs(porteur.r - allie.r) + Math.abs(porteur.c - allie.c) !== 1) continue;
            transitions.push({ type: "TRANSMISSION", deId: porteur.id, versId: allie.id });
          }
        }

        return transitions;
      }

      function applyFreePickupCore(charId, artifactId) {
        const gardien = characterById(charId);
        const couronne = [state.artifact, state.secondArtifact]
          .find(a => a && a.id === artifactId);
        if (!gardien || !couronne || couronne.carrierId !== null || !couronne.active) return null;
        if (characterCarriesCrown(gardien.id)) return null;
        if (Math.abs(gardien.r - couronne.r) + Math.abs(gardien.c - couronne.c) !== 1) return null;
        return giveArtifactToCharacter(couronne, gardien)
          ? { type: "RAMASSAGE", charId, artifactId }
          : null;
      }

      function applyFreeHandoffCore(deId, versId) {
        const porteur = characterById(deId);
        const allie = characterById(versId);
        if (!porteur || !allie || characterCarriesCrown(allie.id)) return null;
        const couronne = artifactCarriedBy(porteur.id);
        if (!couronne) return null;
        if (Math.abs(porteur.r - allie.r) + Math.abs(porteur.c - allie.c) !== 1) return null;
        couronne.carrierId = null;
        couronne.r = allie.r;
        couronne.c = allie.c;
        return giveArtifactToCharacter(couronne, allie)
          ? { type: "TRANSMISSION", deId, versId }
          : null;
      }

      /** Applique n'importe quelle action du planner, gratuite ou non. */
      function plannerAppliquerAction(action) {
        if (action.type === "RAMASSAGE") return applyFreePickupCore(action.charId, action.artifactId);
        if (action.type === "TRANSMISSION") return applyFreeHandoffCore(action.deId, action.versId);
        return appliquerActionNoyau(action);
      }

      function plannerActionGratuite(action) {
        return action.type === "RAMASSAGE" || action.type === "TRANSMISSION";
      }

      /* ---------------------------------------------------------------------
         RECHERCHE DE PLAN DE TOUR — beam search borné.

         Un nœud est un état simulé, la séquence qui y mène, et sa note. À
         chaque niveau on développe les meilleurs nœuds, on déduplique par
         empreinte stratégique, et on retient les meilleurs.

         Trois points de conception méritent d'être explicités.

         S'ARRÊTER EST UN COUP. Tout nœud dont la pose obligatoire est faite est
         candidat au résultat final. La recherche compare donc en permanence
         « continuer » et « s'arrêter ici », ce qui est exactement ce qui
         manquait à l'Expert Legacy : il ne comparait que des actions entre
         elles, si bien qu'un porteur menacé dont toutes les fuites semblaient
         mauvaises restait immobile faute d'avoir jamais évalué l'immobilité.

         LA PROFONDEUR NE SE COMPTE PAS EN CLICS. Les transitions gratuites
         (ramassage, transmission) n'entament pas le budget de décisions : un
         plan légitime peut enchaîner beaucoup de transitions pour peu de
         cartes dépensées. La recherche est bornée par les ressources
         réellement consommées, le nombre d'états et le temps.

         DÉDUPLICATION PAR EMPREINTE. Deux chemins qui aboutissent au même état
         stratégique sont le même plan ; on garde celui qui a le mieux noté.
         ------------------------------------------------------------------- */

      const PLAN_BUDGET = {
        largeurFaisceau: 10,
        decisionsMax: 6,
        etatsMax: 900,
        tempsMaxMs: 350
      };

      // Dernier plan calculé — lu par l'outillage de diagnostic et par
      // l'exécution du tour. Jamais utilisé comme mémoire entre deux tours.
      let plannerDernierRapport = null;

      function plannerChercherPlan(playerId, options = {}) {
        const budget = Object.assign({}, PLAN_BUDGET, options);
        const debut = performance.now();
        let etatsExplores = 0;
        let candidatsGeneres = 0;

        const racine = {
          etat: cloneStateForSimulation(),
          plan: [],
          decisions: 0
        };
        racine.note = withSimulatedState(racine.etat, () => evaluateStrategicState(playerId));
        racine.terminal = racine.etat.islandPlacedThisTurn;

        let meilleur = racine.terminal ? racine : null;
        let faisceau = [racine];
        const vus = new Set();
        let profondeurAtteinte = 0;

        for (let niveau = 0; niveau < budget.decisionsMax; niveau++) {
          const suivants = [];

          for (const noeud of faisceau) {
            if (performance.now() - debut > budget.tempsMaxMs) break;
            if (etatsExplores > budget.etatsMax) break;

            const actions = withSimulatedState(noeud.etat, () => {
              const gratuites = plannerTransitionsGratuites(playerId);
              const payantes = noeud.decisions >= budget.decisionsMax ? [] : [
                ...plannerCandidatsMove(playerId),
                ...plannerCandidatsPush(playerId),
                ...plannerCandidatsMagic(playerId),
                ...plannerCandidatsPose(playerId)
              ];
              return [...gratuites, ...payantes];
            });
            candidatsGeneres += actions.length;

            for (const action of actions) {
              if (performance.now() - debut > budget.tempsMaxMs) break;
              if (etatsExplores > budget.etatsMax) break;

              const clone = structuredClone(noeud.etat);
              const resultat = withSimulatedState(clone, () => {
                const applique = plannerAppliquerAction(action);
                if (!applique) return null;
                return {
                  note: evaluateStrategicState(playerId),
                  empreinte: strategicStateFingerprint(clone)
                };
              });
              if (!resultat) continue;
              etatsExplores++;

              if (vus.has(resultat.empreinte)) continue;
              vus.add(resultat.empreinte);

              const enfant = {
                etat: clone,
                plan: [...noeud.plan, action],
                // Une transition gratuite ne consomme pas de profondeur.
                decisions: noeud.decisions + (plannerActionGratuite(action) ? 0 : 1),
                note: resultat.note,
                terminal: clone.islandPlacedThisTurn
              };
              suivants.push(enfant);

              // « S'arrêter ici » entre en concurrence avec toute continuation.
              if (enfant.terminal && (!meilleur || enfant.note > meilleur.note)) {
                meilleur = enfant;
              }
            }
          }

          if (!suivants.length) break;
          suivants.sort((a, b) => b.note - a.note);
          faisceau = suivants.slice(0, budget.largeurFaisceau);
          profondeurAtteinte = niveau + 1;
          if (performance.now() - debut > budget.tempsMaxMs) break;
          if (etatsExplores > budget.etatsMax) break;
        }

        const duree = performance.now() - debut;
        plannerDernierRapport = {
          joueur: playerId,
          plan: meilleur ? meilleur.plan : [],
          noteDepart: racine.note,
          noteArrivee: meilleur ? meilleur.note : racine.note,
          etatsExplores,
          candidatsGeneres,
          profondeurAtteinte,
          largeurFaisceau: budget.largeurFaisceau,
          dureeMs: Math.round(duree),
          // Empreinte attendue après exécution : sert au contrôle de fidélité
          // entre l'état prévu et l'état réellement obtenu.
          empreinteAttendue: meilleur ? strategicStateFingerprint(meilleur.etat) : null
        };
        return plannerDernierRapport;
      }
