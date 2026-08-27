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
        formeConsommee: 90,

        /* TERRAIN. Poser une île est obligatoire à chaque tour — c'est la
           décision la plus fréquente du jeu — et rien ne la jugeait : une île
           n'entrait dans le calcul que si elle changeait une distance. Deux
           poses sans effet sur les distances étaient donc rigoureusement
           indiscernables, et l'IA en prenait une au hasard. Mesuré : 16
           décisions sur 31 avaient TOUS leurs finalistes à la même note.

           Ces trois termes donnent une valeur au plateau lui-même.

           Leur poids est délibérément MODESTE : ils servent à départager des
           coups par ailleurs équivalents, pas à décider de la partie. À 700,
           routeUtile pesait plus qu'une couronne portée — l'adversaire pouvant
           modifier le terrain dans sa riposte, l'IA préférait alors ne rien
           faire plutôt que de s'exposer à ce basculement, et refusait de
           ramasser une couronne à sa portée (P07 et P08 échouaient ainsi). */
        routeUtile: 240,       // route du sanctuaire vers MES cases de validation
        controleSpatial: 150,  // part du terrain plus proche de mon but que du sien
        routeFragile: 5       // case tenue mais bordée de vide : on en tombe
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
      /* Portées adverses : où l'adversaire pourrait aller. Un Dijkstra par
         gardien adverse — et l'adversaire NE BOUGE PAS pendant mon tour.

         Ce calcul était refait à chaque nœud de la recherche : avec six
         gardiens adverses et une centaine de nœuds, plusieurs centaines de
         recherches pour le même résultat. L'anticipation de la riposte y
         passait 46 SECONDES.

         Il ne dépend que du terrain, de la position des gardiens adverses et
         du budget supposé : la clé est faite de ces trois éléments, si bien
         qu'une pose ou une rotation l'invalide, mais rien d'autre. */
      const PLAN_CACHE_PORTEES_MAX = 64;
      const plannerCachePortees = new Map();

      function plannerPorteesAdverses(playerId, budgetMove) {
        const adverse = plannerAdversaire(playerId);
        if (!adverse) return [];
        const ennemis = plannerGardiensDe(adverse.id);
        const cle = plannerEmpreinteTerrain() + ':' + budgetMove + ':'
          + ennemis.map(e => e.r + ',' + e.c).sort().join('|');
        let portees = plannerCachePortees.get(cle);
        if (!portees) {
          portees = ennemis.map(ennemi => movementRange(ennemi, budgetMove));
          if (plannerCachePortees.size >= PLAN_CACHE_PORTEES_MAX) {
            plannerCachePortees.delete(plannerCachePortees.keys().next().value);
          }
          plannerCachePortees.set(cle, portees);
        }
        return portees;
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
      /* Interrupteur de l'autopsie. Le cerveau ne connaît que ce drapeau :
         la console d'analyse vit dans autopsie.js et se contente de le lever.
         Retirer l'outillage ne peut donc pas casser la décision. */
      let plannerAutopsie = false;
      function plannerAutopsieActive() { return plannerAutopsie; }
      function plannerActiverAutopsie(actif) {
        plannerAutopsie = actif !== false;
        return plannerAutopsie;
      }

      /* =====================================================================
         VALEUR DU TERRAIN, ET SON CACHE

         Deux champs de distance suffisent à tout : la distance de chaque case
         à MES cases de validation, et la même vers celles de l'adversaire. On
         en tire l'accès aux objectifs, le contrôle spatial et la fragilité des
         routes, sans heuristique particulière à telle ou telle position.

         Ces champs ne dépendent QUE du terrain. Ils sont donc calculés une fois
         par forme de plateau et réutilisés pour tous les nœuds de la recherche
         — sans quoi le coût serait rédhibitoire, l'évaluateur tournant à chaque
         nœud. L'empreinte ne change qu'à la POSE et à la MAGIE, exactement les
         deux actions qui modifient le terrain.
         ===================================================================== */
      /* Le cache retient PLUSIEURS formes de plateau, pas une seule.

         Avec une seule entrée, la recherche alternait entre nœuds avec et sans
         île posée, et vidait le cache à chaque alternance : l'analyse complète
         repartait à chaque nœud. Mesuré, l'anticipation adverse passait de
         360 ms à 40 SECONDES. */
      const PLAN_CACHE_TERRAIN_MAX = 48;
      const plannerCacheTerrain = new Map();

      function plannerEmpreinteTerrain() {
        let h = (state.islands || []).length * 1000003;
        for (const ile of state.islands || []) {
          for (const [r, c] of ile.cells) {
            h = (h * 31 + (r * GRID + c) + 1) % 2147483647;
          }
        }
        return h;
      }

      function plannerAnalyseTerrain(playerId) {
        const moi = state.players[playerId];
        const adverse = plannerAdversaire(playerId);
        const surTerre = cells => (cells || []).filter(([r, c]) => isLand(r, c));

        const champMoi = plannerChampDistance(surTerre(crownValidationCellsForPlayer(moi)));
        const champAdverse = adverse
          ? plannerChampDistance(surTerre(crownValidationCellsForPlayer(adverse)))
          : new Map();

        let terrainTotal = 0;
        let controle = 0;
        let fragiles = 0;

        for (let r = 0; r < GRID; r++) {
          for (let c = 0; c < GRID; c++) {
            if (!isLand(r, c)) continue;
            terrainTotal++;
            const dMoi = champMoi.get(key(r, c));
            const dAdv = champAdverse.get(key(r, c));
            const mienne = Number.isFinite(dMoi) && (!Number.isFinite(dAdv) || dMoi < dAdv);
            if (!mienne) continue;
            controle++;
            /* Une case bordée de vide est une case d'où l'on tombe : contrôler
               un couloir d'une case de large ne vaut pas contrôler une place. */
            let vide = 0;
            for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
              if (!isLand(r + dr, c + dc)) vide++;
            }
            if (vide >= 2) fragiles++;
          }
        }

        /* Longueur de la route depuis le sanctuaire — l'origine des couronnes
           — vers les cases de validation de chacun. Ne dépend que du terrain,
           donc calculée ici et mise en cache avec le reste. */
        const routeMoi = champMoi.get(key(CENTER.r, CENTER.c)) ?? 99;
        const routeAdverse = champAdverse.get(key(CENTER.r, CENTER.c)) ?? 99;

        return { champMoi, champAdverse, controle, fragiles, terrainTotal, routeMoi, routeAdverse };
      }

      function plannerTerrain(playerId) {
        const cle = plannerEmpreinteTerrain() + ':' + playerId;
        let analyse = plannerCacheTerrain.get(cle);
        if (!analyse) {
          analyse = plannerAnalyseTerrain(playerId);
          // Rotation simple : la forme la plus anciennement vue sort.
          if (plannerCacheTerrain.size >= PLAN_CACHE_TERRAIN_MAX) {
            plannerCacheTerrain.delete(plannerCacheTerrain.keys().next().value);
          }
          plannerCacheTerrain.set(cle, analyse);
        }
        return analyse;
      }

      /* AUTOPSIE — trace des termes d'évaluation.

         Renseignée, chaque terme y dépose sa contribution : c'est ce qui permet
         de répondre « pourquoi l'IA n'a-t-elle pas vu ce que j'ai vu ? » en
         lisant la décomposition plutôt qu'en la devinant.

         Hors autopsie, le surcoût se réduit à un test de nullité par terme. */
      let plannerTraceEval = null;

      /** Évalue une position en conservant le détail des termes. */
      function evaluerAvecDetail(playerId) {
        const trace = [];
        const memoire = plannerTraceEval;
        plannerTraceEval = trace;
        let note;
        try {
          note = evaluateStrategicState(playerId);
        } finally {
          plannerTraceEval = memoire;
        }
        // Regroupé par terme : un même terme peut être crédité plusieurs fois
        // (deux couronnes en jeu, plusieurs gardiens).
        const parTerme = new Map();
        for (const e of trace) {
          const cumul = parTerme.get(e.terme) || { terme: e.terme, montant: 0, fois: 0, notes: [] };
          cumul.montant += e.montant;
          cumul.fois++;
          if (e.note) cumul.notes.push(e.note);
          parTerme.set(e.terme, cumul);
        }
        const termes = [...parTerme.values()]
          .map(t => ({ terme: t.terme, montant: Math.round(t.montant), fois: t.fois, notes: t.notes }))
          .filter(t => t.montant !== 0)
          .sort((a, b) => Math.abs(b.montant) - Math.abs(a.montant));
        return { note: Math.round(note), termes };
      }

      function evaluateStrategicState(playerId) {
        const moi = state.players[playerId];
        if (!moi) return 0;
        const adverse = plannerAdversaire(playerId);

        let valeur = 0;
        const trace = plannerTraceEval;
        /* Toute contribution passe par ici : c'est la garantie que la
           décomposition affichée est bien celle qui a décidé, et non une
           reconstruction approchée faite après coup. */
        const ajouter = (terme, montant, note) => {
          if (!montant) return;
          valeur += montant;
          if (trace) trace.push({ terme, montant, note: note || null });
        };

        // A. Terminal : domine absolument.
        if (state.winner !== null && state.winner !== undefined) {
          const terminal = state.winner === playerId ? PLAN_POIDS.victoire : -PLAN_POIDS.victoire;
          if (trace) trace.push({ terme: "victoire", montant: terminal, note: null });
          return terminal;
        }

        // B. Points déjà marqués.
        ajouter("pointsMarques", (moi.score || 0) * PLAN_POIDS.pointValide, `score ${moi.score || 0}`);
        if (adverse) {
          ajouter("pointsAdverses", -(adverse.score || 0) * PLAN_POIDS.pointValide, `score ${adverse.score || 0}`);
        }

        let menaceAdverse = 0;
        const ciblesMoi = aiValidationTargetsForPlayer(moi);
        const ciblesAdverse = adverse ? aiValidationTargetsForPlayer(adverse) : [];

        // C. Couronnes actives : portées ou libres.
        for (const couronne of activeArtifacts()) {
          const porteur = couronne.carrierId ? characterById(couronne.carrierId) : null;

          if (porteur && porteur.player === playerId) {
            const d = aiLandDistanceToTargets(porteur.r, porteur.c, ciblesMoi);
            ajouter("couronnePortee", PLAN_POIDS.couronnePortee, `${porteur.id} en (${porteur.r},${porteur.c})`);
            ajouter("progressionPorteur", PLAN_POIDS.progressionPorteur * plannerProximite(d), `distance ${d}`);
            // Se tenir sur une case de validation ne vaut que si l'adversaire
            // n'occupe aucune des trois cases du village (blocage de zone V67).
            if (isCrownValidationCell(moi, porteur.r, porteur.c)
              && !validationBloqueeParAdversaire(moi, porteur.r, porteur.c)) {
              ajouter("surCaseValidation", PLAN_POIDS.surCaseValidation, `(${porteur.r},${porteur.c})`);
            }
            // Un porteur qu'une seule poussée jette dans le vide n'est pas un
            // porteur : la couronne est perdue dès le tour adverse.
            // Menace élargie aux combinaisons courtes (déplacement puis
            // poussée) : une case sûre à l'instant t peut être perdante au
            // tour suivant, et c'est là que se joue le sort d'une couronne.
            if (plannerMenaceExpulsion(playerId, porteur.r, porteur.c)) {
              ajouter("porteurExpose", -PLAN_POIDS.porteurExpose, `(${porteur.r},${porteur.c}) expulsable`);
            }

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
            ajouter("couronneAdverse", -PLAN_POIDS.couronnePortee, `${porteur.id} en (${porteur.r},${porteur.c})`);
            ajouter("progressionAdverse", -PLAN_POIDS.progressionPorteur * plannerProximite(d), `distance ${d}`);
            if (surCaseAdverse) {
              ajouter("adverseSurValidation", -PLAN_POIDS.surCaseValidation, `(${porteur.r},${porteur.c})`);
            }
            if (aiPushOffRisk(adverse.id, porteur.r, porteur.c)) {
              ajouter("adverseExpulsable", PLAN_POIDS.porteurExpose * 0.5, `(${porteur.r},${porteur.c})`);
            }

          } else {
            // Libre : elle revient à qui peut l'atteindre le plus vite.
            const cible = [[couronne.r, couronne.c]];
            const dMoi = plannerDistanceEquipe(playerId, cible);
            const dAdv = adverse ? plannerDistanceEquipe(adverse.id, cible) : Infinity;
            ajouter("couronneLibre",
              PLAN_POIDS.couronneLibre * (plannerProximite(dMoi) - plannerProximite(dAdv)),
              `(${couronne.r},${couronne.c}) — moi ${dMoi}, adverse ${dAdv}`);
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
          ajouter("couronneEnAttente",
            enAttente * PLAN_POIDS.couronneEnAttente * (plannerProximite(dMoi) - plannerProximite(dAdv)),
            `${enAttente} en attente — moi ${dMoi}, adverse ${dAdv}`);
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
          ajouter("villagesNeutralises",
            menaceAdverse * PLAN_POIDS.contesteValidation * neutralises,
            `${neutralises}/${total} village(s), menace ${menaceAdverse.toFixed(2)}`);
          // Rester à portée n'a de sens que s'il reste un village à couvrir.
          if (neutralises < total) {
            ajouter("presenceDefensive",
              menaceAdverse * PLAN_POIDS.presenceDefensive * plannerProximite(dDefense),
              `distance ${dDefense}, menace ${menaceAdverse.toFixed(2)}`);
          }
        }

        // E. Gardiens : nombre et capacité à agir.
        const miens = plannerGardiensDe(playerId);
        ajouter("gardiens", miens.length * PLAN_POIDS.gardien, `${miens.length}`);
        if (adverse) {
          const nb = plannerGardiensDe(adverse.id).length;
          ajouter("gardiensAdverses", -nb * PLAN_POIDS.gardien, `${nb}`);
        }
        // Un gardien qui ne peut aller nulle part ne vaut pas un gardien libre.
        let mobiles = 0;
        for (const g of miens) {
          if (movementEdges(g.r, g.c).some(e => isLand(e.r, e.c) && !characterAt(e.r, e.c))) mobiles++;
        }
        ajouter("gardiensMobiles", mobiles * PLAN_POIDS.gardienMobile, `${mobiles}/${miens.length}`);

        // F. Ressources conservées : voir PLAN_POIDS.carteConservee.
        const cartes = plannerTotalRessources(playerId);
        ajouter("cartesConservees", cartes * PLAN_POIDS.carteConservee, `${cartes} carte(s)`);

        /* G bis. TERRAIN. Ce que vaut le plateau, indépendamment des pièces
           qui s'y trouvent — donc ce que vaut la pose d'île qui vient de le
           modifier. Sans ces termes, poser ici ou là revenait au même. */
        const terrain = plannerTerrain(playerId);

        /* Accès aux objectifs : la longueur du chemin de terrain entre le
           SANCTUAIRE — d'où les couronnes viennent — et mes cases de
           validation, comparée à celle de l'adversaire. Une pose qui raccourcit
           ma route compte ; une pose qui raccourcit la sienne est une offrande,
           et se paie du même terme.

           Volontairement mesuré depuis le sanctuaire et non depuis la couronne
           du moment : la position des couronnes est DÉJÀ comptée trois fois
           (couronnePortee, progressionPorteur, couronneLibre). L'y remettre
           faisait basculer 700 points de plus à chaque couronne perdue, et
           l'IA n'osait plus la ramasser — P08 échouait ainsi. Ce terme décrit
           le plateau, pas les pièces. */
        ajouter("routeUtile",
          PLAN_POIDS.routeUtile * (plannerProximite(terrain.routeMoi) - plannerProximite(terrain.routeAdverse)),
          `route ${terrain.routeMoi} contre ${terrain.routeAdverse}`);

        /* Contrôle spatial : la part du terrain plus proche de mon but que du
           sien. Normalisée, donc insensible à la taille du plateau. */
        if (terrain.terrainTotal > 0) {
          const part = (2 * terrain.controle - terrain.terrainTotal) / terrain.terrainTotal;
          ajouter("controleSpatial", PLAN_POIDS.controleSpatial * part,
            `${terrain.controle}/${terrain.terrainTotal} cases`);
        }

        // Sécurité des routes : ce que je tiens mais d'où l'on me pousse.
        ajouter("routesFragiles", -PLAN_POIDS.routeFragile * terrain.fragiles,
          `${terrain.fragiles} case(s) bordée(s) de vide`);

        // G. Formes consommées.
        ajouter("formesConsommees", -plannerCoutFormes(playerId));

        return valeur;
      }

      /* AUTOPSIE — candidats écartés par les plafonds de génération.

         Ce sont les coups que la recherche n'a JAMAIS vus : ils meurent dans
         le pré-filtre, avant tout évaluateur. P17 a montré que c'est là que se
         joue une part des mauvaises décisions, pas dans la profondeur du
         faisceau. Renseigné uniquement sous autopsie. */
      let plannerCandidatsEcartes = null;

      /** Applique le plafond d'un générateur en relevant ce qu'il sacrifie. */
      function plannerRetenir(options, plafond, categorie) {
        if (plannerCandidatsEcartes && options.length > plafond) {
          for (const rejete of options.slice(plafond)) {
            plannerCandidatsEcartes.push({ categorie, action: rejete });
          }
        }
        return options.slice(0, plafond);
      }

      const PLAN_CANDIDATS = {
        /* Larges À LA RACINE, serrés ensuite.

           La racine est la décision réelle : c'est là qu'une idée différente
           doit pouvoir entrer, et c'est à l'évaluateur de la départager, pas
           au pré-filtre. En profondeur, l'essentiel est déjà tranché et
           l'ouverture ne sert plus qu'à brûler du temps.

           move est le plafond TOTAL, moveParIntention celui de CHAQUE
           intention : c'est le second qui empêche dix variantes du même coup
           d'évincer une idée d'une autre nature. */
        racine: { move: 16, moveParIntention: 3, push: 8, magic: 8, pose: 6, poseSpawns: 2, poseTotal: 12 },
        /* En profondeur on resserre, mais jamais en dessous de ce que le
           planner avait avant l'ouverture de la racine : les enchaînements
           utiles — se placer puis transmettre, préparer puis pousser — se
           construisent au deuxième et au troisième niveau. Trop serrer ici
           coûte plus que ce que l'ouverture de la racine rapporte. */
        profond: { move: 10, moveParIntention: 2, push: 5, magic: 4, pose: 4, poseSpawns: 1, poseTotal: 6 },
        // Plafonds de la génération de candidats MAGIC, la seule qui simule
        // réellement chaque option pour la pré-classer (voir plus bas).
        magicRotationsMax: 36,
        magicMsMax: 25
      };

      /* Niveau courant de la recherche : 0 à la racine. Les générateurs y
         lisent quel jeu de plafonds appliquer. */
      let plannerNiveau = 0;
      function plafonds() {
        return plannerNiveau === 0 ? PLAN_CANDIDATS.racine : PLAN_CANDIDATS.profond;
      }

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

      /* CHAMP DE DISTANCE depuis un jeu de cibles.

         aiLandDistanceToTargets relance un Dijkstra COMPLET à chaque
         interrogation. L'interroger pour chaque case atteignable et chaque
         intention revenait à plusieurs centaines de recherches par tour :
         mesuré sur une partie réelle, la médiane de décision était passée de
         814 à 2345 ms, et 14 tours sur 40 partaient en repli.

         Une seule propagation, depuis toutes les cibles à la fois, donne la
         distance de TOUTES les cases. Le graphe étant non orienté et de coûts
         symétriques, la distance case → cibles est celle que l'on propage
         cibles → case. Cinq propagations par tour remplacent donc les
         centaines de recherches — c'est moins cher que le code d'origine, qui
         en faisait déjà une par case. */
      function plannerChampDistance(cibles) {
        const champ = new Map();
        const file = [];
        for (const [r, c] of cibles || []) {
          if (!inside(r, c) || !isLand(r, c)) continue;
          const k = key(r, c);
          if (champ.has(k)) continue;
          champ.set(k, 0);
          file.push({ r, c, cout: 0 });
        }

        while (file.length) {
          let min = 0;
          for (let i = 1; i < file.length; i++) {
            if (file[i].cout < file[min].cout) min = i;
          }
          const actuel = file.splice(min, 1)[0];
          if (actuel.cout > (champ.get(key(actuel.r, actuel.c)) ?? Infinity)) continue;

          for (const arete of movementEdges(actuel.r, actuel.c)) {
            if (!isLand(arete.r, arete.c)) continue;
            const k = key(arete.r, arete.c);
            const cout = actuel.cout + arete.cost;
            if (cout >= (champ.get(k) ?? Infinity)) continue;
            champ.set(k, cout);
            file.push({ r: arete.r, c: arete.c, cout });
          }
        }
        return champ;
      }

      /** Lecture d'un champ, avec le même repli qu'aiLandDistanceToTargets pour
       *  une case injoignable — sans quoi les indices ne seraient plus
       *  comparables entre intentions. */
      function plannerLireChamp(champ, cibles, r, c) {
        const valeur = champ.get(key(r, c));
        if (valeur !== undefined) return valeur;
        if (!cibles.length) return 99;
        return 30 + Math.min(...cibles.map(([tr, tc]) => Math.abs(r - tr) + Math.abs(c - tc)));
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
        // Deux gardiens partagent souvent une intention : le champ est calculé
        // une fois par jeu de cibles, pas une fois par gardien.
        const champs = new Map();
        const champPour = intention => {
          const signature = intention.cibles.map(([r, c]) => key(r, c)).sort().join("|");
          if (!champs.has(signature)) champs.set(signature, plannerChampDistance(intention.cibles));
          return champs.get(signature);
        };

        for (const gardien of plannerGardiensDe(playerId)) {
          const porte = characterCarriesCrown(gardien.id);
          const intentions = plannerIntentionsGardien(playerId, gardien);

          /* Les chemins ne dépendent pas de l'intention : ils sont calculés une
             seule fois, puis notés autant de fois qu'il y a d'intentions. */
          /* movementRange fait DÉJÀ un Dijkstra et accroche le coût de chaque
             case à son résultat. Rappeler shortestMovementPath case par case
             relançait donc un Dijkstra COMPLET — avec un tri dans sa boucle —
             pour un coût déjà connu : plusieurs centaines de recherches par
             génération, mesurées à 360 ms quand le budget entier vaut 350.

             Le planner n'a besoin que du coût, jamais du tracé : le chemin est
             recalculé à l'exécution, une seule fois, par aiPerformMove. */
          const portee = movementRange(gardien, budget);
          const couts = portee.costs || new Map();
          const atteignables = [];
          for (const cle of portee) {
            const cout = couts.get(cle);
            if (!Number.isFinite(cout) || cout <= 0) continue;
            const [r, c] = cle.split(',').map(Number);
            atteignables.push({ r, c, cout });
          }
          if (!atteignables.length) continue;

          /* Un seul tri global gardait les huit meilleurs coups toutes
             intentions confondues : ils partaient donc tous au même endroit, et
             92 % des déplacements mouraient là — mesuré sur une partie réelle.

             Chaque intention garde désormais ses propres places. La recherche
             se voit ainsi toujours proposer au moins un coup pour chaque
             capacité que la position offre, et c'est l'évaluateur qui tranche
             — ce qu'il ne pouvait pas faire sur un coup jamais généré. */
          for (const intention of intentions) {
            const champ = champPour(intention);
            const depart = plannerLireChamp(champ, intention.cibles, gardien.r, gardien.c);
            const parIntention = [];

            for (const { r, c, cout } of atteignables) {
              /* Indice de pré-tri seulement : progression vers l'intention,
                 capture immédiate, mise en sécurité. Volontairement grossier —
                 il ne fait que décider quels coups méritent d'être simulés. */
              const arrivee = plannerLireChamp(champ, intention.cibles, r, c);
              let indice = (depart - arrivee) * 10 - cout;
              if (looseArtifactAt(r, c) && !porte) indice += 60;
              if (porte && isCrownValidationCell(state.players[playerId], r, c)) indice += 120;
              // Atteindre la case visée, et pas seulement s'en rapprocher.
              if (arrivee === 0) indice += 80;
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

              parIntention.push({ type: "MOVE", charId: gardien.id, r, c, cost: cout, indice, but: intention.but });
            }

            parIntention.sort((a, b) => b.indice - a.indice);
            options.push(...plannerRetenir(parIntention, plafonds().moveParIntention, "MOVE"));
          }
        }

        /* Un même coup peut servir deux intentions : on ne le simule qu'une
           fois, en lui laissant sa meilleure justification. */
        const parCase = new Map();
        for (const o of options) {
          const k = `${o.charId}:${o.r},${o.c}`;
          const connu = parCase.get(k);
          if (!connu || o.indice > connu.indice) parCase.set(k, o);
        }
        const uniques = [...parCase.values()];
        uniques.sort((a, b) => b.indice - a.indice);
        return plannerRetenir(uniques, plafonds().move, "MOVE");
      }


      /* INTENTIONS D'UN GARDIEN.

         Cette fonction décidait auparavant d'un objectif UNIQUE par cascade de
         retours : dès qu'une couronne libre traînait quelque part, elle était
         la seule destination de tous les gardiens. Les cases de validation
         adverses n'y figuraient dans aucune branche, et se poster à côté de son
         propre porteur non plus.

         Conséquence mesurée sur une partie réelle : le blocage d'un village
         adverse n'a jamais été proposé une seule fois, et une seule passe a été
         jouée en vingt-deux tours. Ce n'était pas l'évaluateur qui refusait ces
         coups — il ne les voyait jamais, faute d'être générés.

         On renvoie donc l'UNION des intentions que la position rend
         pertinentes. Chacune recevra ses propres candidats, si bien qu'aucune
         ne peut plus étouffer les autres. */
      function plannerIntentionsGardien(playerId, gardien) {
        const intentions = [];
        const moi = state.players[playerId];
        const adverse = plannerAdversaire(playerId);
        const porte = characterCarriesCrown(gardien.id);
        const ajouter = (but, cibles) => {
          const utiles = (cibles || []).filter(([r, c]) => Number.isFinite(r) && Number.isFinite(c));
          if (utiles.length) intentions.push({ but, cibles: utiles });
        };

        if (porte) {
          // Porter, c'est aller marquer.
          ajouter("validation", aiValidationTargetsForPlayer(moi));
        } else {
          const libres = activeArtifacts().filter(a => a.carrierId === null).map(a => [a.r, a.c]);
          ajouter("couronne", libres);
          if ((state.couronnesEnAttente || []).length) ajouter("sanctuaire", [[CENTER.r, CENTER.c]]);
        }

        const porteurAdverse = adverse && activeArtifacts()
          .map(a => a.carrierId ? characterById(a.carrierId) : null)
          .find(pt => pt && pt.player !== playerId);

        if (porteurAdverse) {
          // Intercepter : se mettre en position de pousser le porteur adverse.
          ajouter("interception", orthogonalNeighbors(porteurAdverse.r, porteurAdverse.c)
            .filter(([r, c]) => isLand(r, c)));
          /* BLOQUER : occuper une des trois cases du village adverse y interdit
             toute validation (règle V67). C'est le coup défensif le plus fort
             du jeu, et il n'était jamais généré. */
          ajouter("blocage", crownValidationCellsForPlayer(adverse).filter(([r, c]) => isLand(r, c)));
        }

        /* RELAIS : se porter à côté d'un allié pour que la couronne passe de
           main en main — gratuitement. Sans cette intention, la configuration
           ne se formait que par accident. */
        const allies = plannerGardiensDe(playerId).filter(g => g.id !== gardien.id);
        const partenaires = porte
          ? allies.filter(g => !characterCarriesCrown(g.id))
          : allies.filter(g => characterCarriesCrown(g.id));
        const casesRelais = [];
        partenaires.forEach(g => orthogonalNeighbors(g.r, g.c)
          .filter(([r, c]) => isLand(r, c))
          .forEach(cell => casesRelais.push(cell)));
        ajouter("relais", casesRelais);

        /* PRÉPARER UNE POUSSÉE : se poster face à un gardien adverse adossé
           au vide. Sans cette intention, l'IA ne se met en position d'éjecter
           que par hasard, en poursuivant un autre but. */
        if (adverse) {
          const postes = [];
          for (const ennemi of plannerGardiensDe(adverse.id)) {
            for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
              // Se placer du côté opposé au vide : c'est de là qu'on pousse.
              if (isLand(ennemi.r + dr, ennemi.c + dc)) continue;
              const poste = [ennemi.r - dr, ennemi.c - dc];
              if (isLand(poste[0], poste[1])) postes.push(poste);
            }
          }
          ajouter("poussee", postes);
        }

        /* SÉCURISER LE PORTEUR : s'éloigner de toute portée adverse. Le bonus
           de repli existant ne joue qu'à l'intérieur d'une autre intention, et
           pouvait donc ne jamais entrer dans ses places. */
        if (porte && adverse) {
          const ennemis = plannerGardiensDe(adverse.id);
          const sures = [];
          for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
              if (!isLand(r, c) || characterAt(r, c)) continue;
              if (ennemis.some(e => Math.abs(e.r - r) + Math.abs(e.c - c) <= 2)) continue;
              sures.push([r, c]);
            }
          }
          ajouter("securite", sures);
        }

        // Filet : un gardien sans intention dérive vers le centre.
        if (!intentions.length) ajouter("centre", [[CENTER.r, CENTER.c]]);
        return intentions;
      }

      /* Repère de DISTANCE pour classer les rotations de magie — pas une
         décision. Volontairement bon marché et en cascade : mesurer() est
         rappelé à chaque rotation simulée, et il ne s'agit ici que de savoir si
         une rotation rapproche l'équipe de ce qui compte, non de choisir un
         coup. Les intentions, elles, servent à générer des coups.  */
      function plannerCiblesReference(playerId) {
        const libres = activeArtifacts().filter(a => a.carrierId === null).map(a => [a.r, a.c]);
        if (libres.length) return libres;
        if ((state.couronnesEnAttente || []).length) return [[CENTER.r, CENTER.c]];
        const adverse = plannerAdversaire(playerId);
        const porteurAdverse = adverse && activeArtifacts()
          .map(a => a.carrierId ? characterById(a.carrierId) : null)
          .find(pt => pt && pt.player !== playerId);
        if (porteurAdverse) {
          const autour = orthogonalNeighbors(porteurAdverse.r, porteurAdverse.c).filter(([r, c]) => isLand(r, c));
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
        return plannerRetenir(options, plafonds().push, "PUSH");
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
          const objectifs = plannerCiblesReference(playerId);
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
        return plannerRetenir(options, plafonds().magic, "MAGIC");
      }

      /* L'adversaire est-il assez près de marquer pour que se poser sur son
         village vaille mieux que suivre l'action ? Même signal que celui qui
         pondère la défense dans l'évaluateur : sans porteur adverse proche de
         SES cases de validation, il n'y a rien à contester. */
      function plannerMenaceValidationAdverse(playerId) {
        const adverse = plannerAdversaire(playerId);
        if (!adverse) return false;
        return (state.characters || []).some(char =>
          char.player === adverse.id
          && characterCarriesCrown(char.id)
          && aiValidationDistanceForPlayer(adverse, char.r, char.c) <= 3
        );
      }

      function plannerCandidatsPose(playerId) {
        if (state.islandPlacedThisTurn) return [];
        /* Le biais vers la zone adverse ne s'active que sous menace réelle.
           Permanent, il détournait la pose de l'action : l'IA allait camper au
           village adverse pendant qu'une couronne libre attendait ailleurs. */
        const placements = findAutomaticIslandPlacement(
          playerId, plafonds().pose, plannerMenaceValidationAdverse(playerId)
        );
        if (!Array.isArray(placements)) return [];

        /* La case d'apparition fait partie de la décision, comme pour un joueur
           humain. Les cases sont classées par proximité de la cible automatique,
           si bien que la première reste EXACTEMENT celle que le jeu choisirait
           seul : l'ancien comportement demeure candidat, on lui ajoute des
           alternatives. */
        const cible = automaticPlacementTarget(playerId);
        const parPose = placements.map(p => {
          const libres = p.cells.filter(([r, c]) => !characterAt(r, c));
          libres.sort((a, b) =>
            (Math.abs(a[0] - cible[0]) + Math.abs(a[1] - cible[1])) -
            (Math.abs(b[0] - cible[0]) + Math.abs(b[1] - cible[1])));
          return { pose: p, spawns: libres.slice(0, plafonds().poseSpawns) };
        });

        /* Entrelacé : le premier choix de CHAQUE pose avant le deuxième choix
           de la première. Sans cela le plafond ne retiendrait que les variantes
           d'une ou deux poses, et la diversité des emplacements — le point
           vraiment décisif — serait perdue. */
        const options = [];
        for (let rang = 0; rang < plafonds().poseSpawns; rang++) {
          for (const { pose, spawns } of parPose) {
            if (rang >= spawns.length) continue;
            options.push({
              type: "POSE",
              shapeKey: pose.shapeKey,
              cells: pose.cells,
              relCells: pose.relCells,
              anchor: pose.anchor,
              owner: playerId,
              spawn: spawns[rang]
            });
          }
        }
        return plannerRetenir(options, plafonds().poseTotal, "POSE");
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

      /* AUTOPSIE — relevé exhaustif des candidats depuis la position de départ.

         Chaque candidat est évalué à un coup de profondeur : c'est la réponse
         directe à « pourquoi l'IA n'a-t-elle pas vu ce que j'ai vu ? ». Si le
         bon coup figure ici avec une note faible, le défaut est dans
         l'évaluateur ; s'il figure parmi les écartés, il est dans le
         pré-filtre ; s'il n'y figure pas du tout, il est dans les générateurs.

         Exécuté hors de la boucle de recherche : coût nul hors autopsie. */
      function plannerReleverCandidats(playerId) {
        const ecartesMemoire = plannerCandidatsEcartes;
        const ecartes = [];
        plannerCandidatsEcartes = ecartes;
        const chronos = {};
        const chronometrer = (nom, fn) => {
          const t0 = performance.now();
          const r = fn();
          chronos[nom] = Math.round(performance.now() - t0);
          return r;
        };
        let retenus;
        try {
          retenus = [
            ...chronometrer("gratuites", () => plannerTransitionsGratuites(playerId)),
            ...chronometrer("move", () => plannerCandidatsMove(playerId)),
            ...chronometrer("push", () => plannerCandidatsPush(playerId)),
            ...chronometrer("magic", () => plannerCandidatsMagic(playerId)),
            ...chronometrer("pose", () => plannerCandidatsPose(playerId))
          ];
        } finally {
          plannerCandidatsEcartes = ecartesMemoire;
        }

        const noter = action => {
          const clone = cloneStateForSimulation();
          return withSimulatedState(clone, () => {
            if (!plannerAppliquerAction(action)) return null;
            return evaluateStrategicState(playerId);
          });
        };

        const decrire = (action, retenu) => {
          const note = noter(action);
          return {
            retenu,
            type: action.type,
            note: note === null ? null : Math.round(note),
            legal: note !== null,
            action
          };
        };

        const tous = [
          ...retenus.map(a => decrire(a, true)),
          ...ecartes.map(e => decrire(e.action, false))
        ];
        tous.sort((a, b) => (b.note ?? -Infinity) - (a.note ?? -Infinity));
        // Le coût de génération est porté par le relevé : sans lui, une
        // recherche qui n'explore rien reste inexplicable.
        tous.chronos = chronos;
        return tous;
      }

      function plannerChercherPlan(playerId, options = {}) {
        const budget = Object.assign({}, PLAN_BUDGET, options);
        let debut = performance.now();
        let etatsExplores = 0;
        let candidatsGeneres = 0;

        const racine = {
          etat: cloneStateForSimulation(),
          plan: [],
          decisions: 0
        };
        racine.note = withSimulatedState(racine.etat, () => evaluateStrategicState(playerId));
        racine.terminal = racine.etat.islandPlacedThisTurn;

        /* Sous autopsie, on relève AVANT la recherche : la position de départ
           est alors intacte, et le relevé décrit exactement ce que la
           recherche s'apprêtait à explorer.

           SON COÛT EST RENDU AU BUDGET. Le relevé clone et évalue chaque
           candidat : il dépasse à lui seul les 350 ms de la recherche sur un
           plateau développé. Sans cette restitution, lever l'autopsie suffisait
           à faire échouer la décision qu'elle observait — la recherche partait
           hors budget avant sa première itération, ne générait aucun candidat,
           et rendait la main à la logique historique. Observé sur une vraie
           partie : 7 tours sur 23 en repli, dont 5 sans un seul état exploré.

           Un instrument qui change ce qu'il mesure ne mesure rien. */
        let releveCandidats = null;
        let coutObservation = 0;
        if (plannerAutopsieActive()) {
          plannerNiveau = 0;
          const debutReleve = performance.now();
          releveCandidats = withSimulatedState(racine.etat, () => plannerReleverCandidats(playerId));
          coutObservation = performance.now() - debutReleve;
          debut += coutObservation;
        }

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
          // Les générateurs s'ouvrent à la racine et se resserrent ensuite.
          plannerNiveau = niveau;
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
          // Temps passé à observer, exclu du budget de décision ci-dessus.
          coutObservationMs: Math.round(coutObservation),
          // Empreinte attendue après exécution : sert au contrôle de fidélité
          // entre l'état prévu et l'état réellement obtenu.
          empreinteAttendue: meilleur ? strategicStateFingerprint(meilleur.etat) : null,
          // Finalistes triés, prêts pour l'anticipation adverse (V3).
          finalistes: terminaux.sort((a, b) => b.note - a.note).slice(0, 8),
          releveCandidats,
          /* Conservés pour la décomposition de score de l'autopsie. Hors
             autopsie ils restent nuls : garder des clones d'état complets à
             chaque décision coûterait de la mémoire pour rien. */
          etatDepart: releveCandidats ? racine.etat : null,
          etatRetenu: releveCandidats && meilleur ? meilleur.etat : null
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
        // La riposte peut changer le plan retenu : la décomposition doit
        // décrire l'état RÉELLEMENT choisi, pas le meilleur avant riposte.
        if (principal.etatDepart) principal.etatRetenu = retenu.noeud.etat;
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
