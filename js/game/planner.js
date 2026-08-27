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

        /* DÉFENSE DU POINT ADVERSE.

           Marquer exige que le porteur SOIT sur une de ses trois cases de
           validation. Deux conséquences que l'IA ignorait :

             — occuper une de ces cases la rend inatteignable, donc prive
               l'adversaire d'un point sans avoir à toucher à son porteur ;
             — toutes ces cases sont éjectables, villages en coin obligent : il
               existe toujours une poussée qui jette le porteur hors du plateau.

           Défendre est donc toujours possible — encore faut-il être là. Or
           l'évaluateur ne notait que la progression vers SES propres couronnes :
           approcher un gardien du village adverse alors que rien ne se passe
           encore ne valait rien, et l'IA arrivait systématiquement trop tard.

           Ces deux termes sont pondérés par la menace réelle (voir plus bas) :
           camper devant un village quand l'adversaire ne porte rien ne vaut
           rien non plus. */
        contesteValidation: 700,
        presenceDefensive: 500,

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
         MENACE D'EXPULSION À COURTE PORTÉE

         aiPushOffRisk ne voit qu'un adversaire DÉJÀ adjacent. Or une poussée se
         prépare : l'adversaire se déplace, puis pousse. Une case peut donc être
         parfaitement sûre à l'instant t et parfaitement perdante au tour
         suivant, ce qu'aucune évaluation purement locale ne peut distinguer.

         Cette fonction généralise la notion : existe-t-il un gardien adverse
         capable, dans le budget qu'on lui suppose, d'atteindre une case d'où il
         expulserait la victime hors du plateau ?

         Un seul concept, deux usages — l'évaluateur s'en sert pour noter la
         sécurité d'un porteur, le générateur de déplacements pour proposer des
         replis. Sans cela, une retraite salvatrice ne serait même pas produite
         comme candidate, et l'anticipation adverse n'aurait rien à départager.

         Le budget prêté à l'adversaire mélange sa RÉSERVE (connue avec
         certitude) et la main plausible tirée de la composition publique du
         paquet — jamais ses vraies cartes futures. */
      /** Budget de déplacement et de poussée prêté à l'adversaire : sa réserve,
       *  connue avec certitude, plus la main plausible. */
      function plannerBudgetAdverse(playerId) {
        const adverse = plannerAdversaire(playerId);
        const reserve = (adverse && state.players[adverse.id] && state.players[adverse.id].stash) || {};
        return {
          move: (reserve.MOVE || 0) + PLAN_MAIN_PLAUSIBLE.filter(a => a === "MOVE").length,
          push: (reserve.PUSH || 0) + PLAN_MAIN_PLAUSIBLE.filter(a => a === "PUSH").length
        };
      }

      /** Cases atteignables par CHAQUE gardien adverse, calculées une fois.
       *
       *  C'est le remède à une explosion de coût mesurée en intégration
       *  continue : plannerMenaceExpulsion interrogeait shortestMovementPath
       *  pour chaque direction, chaque ennemi et CHAQUE case candidate, soit
       *  des milliers de recherches de chemin par génération de candidats. Une
       *  partie complète se figeait sur une machine plus lente que le poste de
       *  développement.
       *
       *  movementRange rend l'ensemble des cases joignables en une seule
       *  recherche par gardien. La menace se réduit alors à une consultation
       *  d'ensemble, et le coût passe de « milliers » à « un par adversaire ». */
      function plannerPorteesAdverses(playerId, budgetMove) {
        const adverse = plannerAdversaire(playerId);
        if (!adverse) return [];
        return plannerGardiensDe(adverse.id).map(ennemi => movementRange(ennemi, budgetMove));
      }

      function plannerMenaceExpulsion(playerId, r, c, budget) {
        const adverse = plannerAdversaire(playerId);
        if (!adverse) return false;

        const reserve = state.players[adverse.id] && state.players[adverse.id].stash || {};
        const plausibleMove = PLAN_MAIN_PLAUSIBLE.filter(a => a === "MOVE").length;
        const plausiblePush = PLAN_MAIN_PLAUSIBLE.filter(a => a === "PUSH").length;
        const budgetMove = budget && budget.move !== undefined
          ? budget.move : (reserve.MOVE || 0) + plausibleMove;
        const budgetPush = budget && budget.push !== undefined
          ? budget.push : (reserve.PUSH || 0) + plausiblePush;
        if (budgetPush < 1) return false;
        // Fournies par l'appelant quand il enchaîne beaucoup de cases,
        // calculées ici sinon. Dans les deux cas, une seule fois.
        const portees = (budget && budget.portees) || plannerPorteesAdverses(playerId, budgetMove);

        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          // La victime ne tombe que si la case DERRIÈRE elle n'est pas du terrain.
          const derriereR = r + dr, derriereC = c + dc;
          if (inside(derriereR, derriereC) && isLand(derriereR, derriereC)) continue;
          // Case d'où pousser, du côté opposé au vide.
          const posteR = r - dr, posteC = c - dc;
          if (!inside(posteR, posteC) || !isLand(posteR, posteC)) continue;

          const occupant = characterAt(posteR, posteC);
          if (occupant) {
            // Déjà en place : menace immédiate.
            if (occupant.player !== playerId) return true;
            continue;
          }
          // Sinon, un gardien adverse peut-il rejoindre ce poste à temps ?
          const postePorte = key(posteR, posteC);
          for (const portee of portees) {
            if (portee.has(postePorte)) return true;
          }
        }
        return false;
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

        let menaceAdverse = 0;
        const ciblesMoi = aiValidationTargetsForPlayer(moi);
        const ciblesAdverse = adverse ? aiValidationTargetsForPlayer(adverse) : [];

        // C. Couronnes actives : portées ou libres.
        for (const couronne of activeArtifacts()) {
          const porteur = couronne.carrierId ? characterById(couronne.carrierId) : null;

          if (porteur && porteur.player === playerId) {
            const d = aiLandDistanceToTargets(porteur.r, porteur.c, ciblesMoi);
            valeur += PLAN_POIDS.couronnePortee;
            valeur += PLAN_POIDS.progressionPorteur * plannerProximite(d);
            // Se tenir sur une case de validation ne vaut que si l'adversaire
            // n'occupe aucune des trois cases du village (blocage de zone V67).
            if (isCrownValidationCell(moi, porteur.r, porteur.c)
              && !validationBloqueeParAdversaire(moi, porteur.r, porteur.c)) {
              valeur += PLAN_POIDS.surCaseValidation;
            }
            // Un porteur qu'une seule poussée jette dans le vide n'est pas un
            // porteur : la couronne est perdue dès le tour adverse.
            // Menace élargie aux combinaisons courtes (déplacement puis
            // poussée) : une case sûre à l'instant t peut être perdante au
            // tour suivant, et c'est là que se joue le sort d'une couronne.
            if (plannerMenaceExpulsion(playerId, porteur.r, porteur.c)) valeur -= PLAN_POIDS.porteurExpose;

          } else if (porteur && adverse) {
            const d = aiLandDistanceToTargets(porteur.r, porteur.c, ciblesAdverse);
            // Sert à pondérer la défense : plus l'adversaire est près de
            // marquer, plus contester ses cases de validation compte.
            menaceAdverse = Math.max(menaceAdverse, plannerProximite(d));
            // Un porteur posté sur une case de validation est à un souffle de
            // marquer — sauf si l'un de mes gardiens tient déjà le village.
            const surCaseAdverse = isCrownValidationCell(adverse, porteur.r, porteur.c)
              && !validationBloqueeParAdversaire(adverse, porteur.r, porteur.c);
            if (surCaseAdverse) menaceAdverse = 1;
            valeur -= PLAN_POIDS.couronnePortee;
            valeur -= PLAN_POIDS.progressionPorteur * plannerProximite(d);
            if (surCaseAdverse) valeur -= PLAN_POIDS.surCaseValidation;
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

        /* D bis. DÉFENSE DU POINT ADVERSE. Contester les cases où
           l'adversaire doit se tenir pour marquer — en les occupant, ce qui les
           rend inatteignables, ou en restant assez près pour intervenir à
           temps. Entièrement pondéré par menaceAdverse : sans porteur adverse,
           ce terme vaut zéro et l'IA ne campe pas pour rien. */
        if (adverse && menaceAdverse > 0) {
          /* Le blocage se joue village par village : un seul gardien posté sur
             l'une des trois cases neutralise tout le village. Compter les cases
             occupées récompenserait un empilement sans valeur défensive. */
          let neutralises = 0;
          let total = 0;
          const aDefendre = [];
          for (const village of villagesForPlayer(adverse)) {
            total++;
            const cells = cornerCrownCellsForVillage(village);
            const tenu = cells.some(([vr, vc]) => {
              const occupant = characterAt(vr, vc);
              return occupant && occupant.player === playerId;
            });
            if (tenu) neutralises++;
            else cells.filter(([r, cc]) => isLand(r, cc)).forEach(cell => aDefendre.push(cell));
          }
          const dDefense = aDefendre.length
            ? plannerDistanceEquipe(playerId, aDefendre) : Infinity;
          valeur += menaceAdverse * PLAN_POIDS.contesteValidation * neutralises;
          // Rester à portée n'a de sens que s'il reste un village à couvrir.
          if (neutralises < total) {
            valeur += menaceAdverse * PLAN_POIDS.presenceDefensive * plannerProximite(dDefense);
          }
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

      const PLAN_CANDIDATS = {
        move: 8, push: 5, magic: 4, pose: 6,
        // Plafonds de la génération de candidats MAGIC, la seule qui simule
        // réellement chaque option pour la pré-classer (voir plus bas).
        magicRotationsMax: 36,
        magicMsMax: 25
      };

      /** Îles triées par intérêt tactique : celles qui portent un gardien ou
       *  une couronne, puis les plus proches du centre de l'action. Une
       *  rotation loin de tout ne change aucune distance utile. */
      function plannerIlesParInteret(playerId) {
        const points = [];
        state.characters.forEach(ch => points.push([ch.r, ch.c]));
        activeArtifacts().forEach(a => points.push([a.r, a.c]));
        if (!points.length) points.push([CENTER.r, CENTER.c]);
        return [...state.islands].sort((a, b) => plannerDistanceIle(a, points) - plannerDistanceIle(b, points));
      }

      function plannerDistanceIle(ile, points) {
        let meilleure = Infinity;
        for (const [cr, cc] of ile.cells) {
          for (const [pr, pc] of points) {
            const d = Math.abs(cr - pr) + Math.abs(cc - pc);
            if (d < meilleure) meilleure = d;
          }
        }
        return meilleure;
      }

      function plannerCandidatsMove(playerId) {
        const budget = availableActionCount("MOVE", state.players[playerId]);
        if (budget < 1) return [];
        const options = [];
        // Une seule fois pour toute la passe, et non par case examinée.
        const budgetAdverse = plannerBudgetAdverse(playerId);
        const porteesAdverses = plannerPorteesAdverses(playerId, budgetAdverse.move);
        const menaceCache = new Map();
        const menaceEn = (mr, mc) => {
          const k = key(mr, mc);
          if (!menaceCache.has(k)) {
            menaceCache.set(k, plannerMenaceExpulsion(playerId, mr, mc,
              { move: budgetAdverse.move, push: budgetAdverse.push, portees: porteesAdverses }));
          }
          return menaceCache.get(k);
        };

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
            /* Un repli doit pouvoir être PROPOSÉ, sinon l'anticipation
               adverse n'aura rien à départager : on ne peut pas choisir un
               coup qui n'a jamais été généré. La menace est ici la version
               élargie, qui voit venir une poussée préparée. */
            if (porte) {
              const menaceDepart = menaceEn(gardien.r, gardien.c);
              const menaceArrivee = menaceEn(r, c);
              if (menaceDepart && !menaceArrivee) indice += 140;
              else if (!menaceDepart && menaceArrivee) indice -= 140;
            }

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

            /* Règle V67 : aucune force n'est refusée, elle règle seulement la
               distance parcourue par le bloc. Toutes les forces ne produisent
               pas pour autant des positions différentes — une fois la cible
               jetée hors du plateau, pousser plus fort ne change rien qu'une
               carte dépensée en trop.

               On ne retient donc que la plus PETITE force menant à chaque
               résultat distinct. La recherche y gagne deux fois : moins de
               branches à explorer, et jamais de gaspillage de cartes. */
            const dr = r - pousseur.r;
            const dc = c - pousseur.c;
            const dejaVus = new Set();
            for (let force = 1; force <= budget; force++) {
              const plan = resoudrePousseeBloc(r, c, dr, dc, force);
              if (!plan) continue;
              const empreinte = plan.mouvements
                .map(mv => `${mv.kind}:${mv.id}:${mv.to}:${mv.chute ? 1 : 0}`)
                .join('|');
              if (dejaVus.has(empreinte)) continue;
              dejaVus.add(empreinte);

              // Indice grossier : viser un porteur, ou une couronne, compte plus.
              let indice = 10 - force;
              if (cible && characterCarriesCrown(cible.id)) indice += 70;
              if (couronne) indice += 40;
              // Une poussée qui retire réellement un gardien vaut mieux qu'un
              // simple décalage : c'est le résultat qui le dit, pas la position.
              if (plan.chutes) indice += 90;
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
        /* Borne DURE. Chaque rotation candidate est évaluée en clonant l'état
           et en la simulant : sans plafond, le coût est île × case × 3, et il
           explose dès que le plateau se remplit. Mesuré : une partie complète
           se figeait au tour 28, la génération de candidats dépassant à elle
           seule le budget de toute la recherche — le plafond de temps n'était
           vérifié qu'ENTRE les nœuds, jamais à l'intérieur.

           On limite donc le nombre de rotations examinées et on relit l'heure
           en cours de route. Les îles proches de l'action sont examinées
           d'abord : une rotation lointaine ne change presque jamais une
           distance utile. */
        const echeance = performance.now() + PLAN_CANDIDATS.magicMsMax;
        let examinees = 0;
        const ilesTriees = plannerIlesParInteret(playerId);

        for (const ile of ilesTriees) {
          if (examinees >= PLAN_CANDIDATS.magicRotationsMax || performance.now() > echeance) break;
          for (const [pr, pc] of ile.cells) {
            if (examinees >= PLAN_CANDIDATS.magicRotationsMax || performance.now() > echeance) break;
            for (const pas of [1, 2, 3]) {
              if (examinees >= PLAN_CANDIDATS.magicRotationsMax || performance.now() > echeance) break;
              examinees++;
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
        const placements = findAutomaticIslandPlacement(playerId, PLAN_CANDIDATS.pose, true);
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
        /* Tous les états terminaux rencontrés, pas seulement le meilleur :
           l'anticipation adverse a besoin de plusieurs finalistes à
           départager selon leur robustesse, et le meilleur avant riposte
           n'est pas forcément le meilleur après. */
        const terminaux = racine.terminal ? [racine] : [];
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
              if (enfant.terminal) {
                terminaux.push(enfant);
                if (!meilleur || enfant.note > meilleur.note) meilleur = enfant;
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
          empreinteAttendue: meilleur ? strategicStateFingerprint(meilleur.etat) : null,
          // Finalistes triés, prêts pour l'anticipation adverse (V3).
          finalistes: terminaux.sort((a, b) => b.note - a.note).slice(0, 8)
        };
        return plannerDernierRapport;
      }

      /* =====================================================================
         EXPERT V3 — ANTICIPATION ADVERSE TACTIQUE

         V2 répond « quel est mon meilleur plan ? ». V3 ajoute « et comment
         l'adversaire peut-il le punir ? ».

         Pas de minimax : la recherche principale reste celle de V2. Seuls les
         quelques MEILLEURS plans terminaux sont soumis à une réplique adverse
         courte, puis reclassés selon ce qu'ils valent APRÈS cette réplique. Le
         coût reste donc proportionnel au nombre de finalistes, pas à la taille
         de l'arbre.

         Aucune récursion : la réplique adverse utilise le planner V2 tel quel,
         lequel ne déclenche jamais d'anticipation de son côté.
         ===================================================================== */

      const PLAN_RIPOSTE = {
        finalistes: 4,
        largeurFaisceau: 5,
        decisionsMax: 3,
        etatsMax: 250,
        tempsMaxMs: 90,
        /* Une menace exécutable avec la seule RÉSERVE adverse est certaine.
           Une menace qui a besoin de cartes encore à piocher n'est que
           plausible et pèse moins — sans quoi l'IA se paralyserait devant des
           combinaisons hypothétiques. */
        poidsMenacePlausible: 0.65
      };

      /* Main plausible prêtée à l'adversaire pour la simulation. Ce n'est PAS
         sa vraie main future : `player.deck` est un tableau ordonné et
         mélangé, le consulter serait tricher. On part de la composition
         PUBLIQUE du paquet (CARD_BLUEPRINTS : 8 MOVE, 4 PUSH, 1 MAGIC sur 13),
         arrondie sur cinq cartes en gardant les trois types représentés — un
         adversaire dont on ne simulerait jamais la magie serait sous-estimé. */
      /* Espérance arrondie d'un tirage de cinq cartes : 8/13 MOVE, 4/13 PUSH,
         1/13 MAGIC donnent 3,1 / 1,5 / 0,4. D'où trois MOVE, deux PUSH, et
         AUCUNE magie.

         Ce dernier point a été mesuré. Prêter une magie garantie à chaque main
         simulée rendait l'IA paranoïaque : l'adversaire faisait tourner l'île
         sous les pieds du porteur, si bien qu'aucune case de validation ne
         paraissait jamais tenable et qu'Expert renonçait à marquer. Or la magie
         est UNE carte sur treize. Les menaces de magie restent modélisées quand
         l'adversaire en a réellement une en RÉSERVE — information connue — mais
         on ne lui suppose plus une pioche chanceuse. */
      const PLAN_MAIN_PLAUSIBLE = ["MOVE", "MOVE", "MOVE", "PUSH", "PUSH"];

      /** Transition de fin de tour réduite à ses effets de RÈGLE.
       *  Reproduit l'ordre réel du moteur — mise en réserve des cartes non
       *  jouées, passage au joueur suivant, validation des couronnes au DÉBUT
       *  du tour, entrée des couronnes en attente. C'est ce timing qui crée la
       *  fenêtre de punition : les couronnes d'un joueur ne se valident qu'au
       *  début de SON tour suivant, donc après un tour adverse complet. */
      function applyTurnTransitionCore() {
        const sortant = state.players[state.currentPlayer];
        if (!sortant) return null;

        sortant.stash = sortant.stash || { MOVE: 0, PUSH: 0, MAGIC: 0 };
        ["MOVE", "PUSH", "MAGIC"].forEach(type => {
          const fraiches = (sortant.hand || []).filter(c => !c.used && c.action === type).length;
          sortant.stash[type] = Math.min(5, (sortant.stash[type] || 0) + fraiches);
        });
        sortant.hand = [];

        state.currentPlayer = (state.currentPlayer + 1) % state.players.length;
        state.turn++;

        const entrant = state.players[state.currentPlayer];
        scoreCrownsAtTurnStart(entrant);
        if (state.winner !== null && state.winner !== undefined) {
          return { vainqueur: state.winner };
        }

        entrant.hand = PLAN_MAIN_PLAUSIBLE.map((action, i) => ({
          id: "plausible-" + state.turn + "-" + i, action, used: false
        }));
        state.islandPlacedThisTurn = islandLimitReachedForPlayer(entrant.id);
        state.centerCrownTakenThisTurn = false;
        faireEntrerCouronnesEnAttente();
        state.phase = "ACTION_SELECT";
        state.selectedActionType = null;
        state.selectedCharId = null;
        state.selectedIslandId = null;
        state.reachable = new Set();
        return { vainqueur: null };
      }

      /** Ce que vaut un plan APRÈS la meilleure réplique adverse courte. */
      function plannerEvaluerRobustesse(noeudFinal, playerId) {
        const apres = structuredClone(noeudFinal.etat);
        return withSimulatedState(apres, () => {
          const adverse = plannerAdversaire(playerId);
          if (!adverse) return { note: noeudFinal.note, riposte: [], menace: 0, garantie: true };

          const reserveGarantie = Object.assign({ MOVE: 0, PUSH: 0, MAGIC: 0 },
            state.players[adverse.id] && state.players[adverse.id].stash);

          const transition = applyTurnTransitionCore();
          if (transition && transition.vainqueur !== null && transition.vainqueur !== undefined) {
            return {
              note: evaluateStrategicState(playerId),
              riposte: ["FIN DE PARTIE"], menace: 0, garantie: true
            };
          }

          const avantRiposte = evaluateStrategicState(playerId);
          const ressourcesAvant = plannerRessources(adverse.id);

          const reponse = plannerChercherPlan(adverse.id, {
            largeurFaisceau: PLAN_RIPOSTE.largeurFaisceau,
            decisionsMax: PLAN_RIPOSTE.decisionsMax,
            etatsMax: PLAN_RIPOSTE.etatsMax,
            tempsMaxMs: PLAN_RIPOSTE.tempsMaxMs
          });
          for (const action of reponse.plan) plannerAppliquerAction(action);

          const apresRiposte = evaluateStrategicState(playerId);
          const degat = Math.max(0, avantRiposte - apresRiposte);

          const ressourcesApres = plannerRessources(adverse.id);
          const garantie = ["MOVE", "PUSH", "MAGIC"].every(type =>
            (ressourcesAvant[type] - ressourcesApres[type]) <= reserveGarantie[type]);
          const poids = garantie ? 1 : PLAN_RIPOSTE.poidsMenacePlausible;

          return {
            note: noeudFinal.note - degat * poids,
            riposte: reponse.plan.map(a => a.type),
            menace: Math.round(degat * poids),
            garantie: garantie
          };
        });
      }

      /** Point d'entrée d'Expert V3 : plan de tour V2, puis reclassement des
       *  meilleurs candidats selon leur résistance à la riposte adverse. */
      /* Joueurs pour lesquels l'anticipation est désactivée. Sert au self-play
         V3 contre V2 : V3 étant exactement V2 plus cette couche, il suffit de
         la couper pour un camp pour obtenir le comportement V2 — inutile de
         dupliquer l'ancien planner dans le bundle livré. Vide en jeu normal. */
      const plannerSansAnticipation = new Set();

      function plannerChercherPlanRobuste(playerId, options) {
        if (plannerSansAnticipation.has(playerId)) return plannerChercherPlan(playerId, options || {});
        const debutTotal = performance.now();
        const principal = plannerChercherPlan(playerId, options || {});
        const finalistes = (principal.finalistes || []).slice(0, PLAN_RIPOSTE.finalistes);

        if (finalistes.length < 2) {
          principal.anticipation = { examines: finalistes.length, dureeMs: 0, rejets: [] };
          principal.dureeTotaleMs = Math.round(performance.now() - debutTotal);
          return principal;
        }

        const debutRiposte = performance.now();
        const examines = finalistes.map(noeud => ({
          noeud: noeud,
          robustesse: plannerEvaluerRobustesse(noeud, playerId)
        }));
        examines.sort((a, b) => b.robustesse.note - a.robustesse.note);
        const dureeRiposte = performance.now() - debutRiposte;
        const retenu = examines[0];

        /* Sont consignés comme « rejetés » les plans qui notaient MIEUX que le
           retenu avant riposte : c'est précisément la décision qu'on veut
           pouvoir inspecter — un plan brillant abandonné parce qu'il se fait
           punir. */
        const rejets = examines.slice(1)
          .filter(e => e.noeud.note > retenu.noeud.note)
          .map(e => ({
            plan: e.noeud.plan.map(a => a.type),
            noteFinTour: Math.round(e.noeud.note),
            riposte: e.robustesse.riposte,
            menace: e.robustesse.menace,
            garantie: e.robustesse.garantie,
            noteRobuste: Math.round(e.robustesse.note)
          }));

        principal.plan = retenu.noeud.plan;
        principal.noteArrivee = retenu.noeud.note;
        principal.empreinteAttendue = strategicStateFingerprint(retenu.noeud.etat);
        principal.anticipation = {
          examines: examines.length,
          dureeMs: Math.round(dureeRiposte),
          noteFinTour: Math.round(retenu.noeud.note),
          noteRobuste: Math.round(retenu.robustesse.note),
          riposte: retenu.robustesse.riposte,
          menace: retenu.robustesse.menace,
          garantie: retenu.robustesse.garantie,
          rejets: rejets
        };
        principal.dureeTotaleMs = Math.round(performance.now() - debutTotal);
        plannerDernierRapport = principal;
        return principal;
      }
