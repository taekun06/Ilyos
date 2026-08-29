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

      /* BARÈME. Hiérarchie voulue : gagner ou empêcher de perdre, puis la
         POSITION des couronnes, puis ce que les gardiens permettent vraiment,
         et le terrain en dernier comme support et non comme objectif.

         Les bonus forfaitaires ont disparu : porter une couronne, exister en
         tant que gardien, conserver une carte ne valent plus rien en soi. */
      /* BARÈME V1.

         Hiérarchie voulue : position des deux couronnes, double pression,
         relais, gardiens réellement utiles, défense ou attaque décisive,
         terrain en dernier, réserve contextuelle.

         Le principe qui change tout : une couronne est un OBJET COMMUN jugé par
         sa position, pas par qui la porte ; et un gardien vaut ce qu'il fait,
         pas d'exister. Les bonus forfaitaires ont donc quasiment disparu. */
      const PLAN_POIDS = {
        victoire: 1e6,
        pointValide: 4000,

        /* Position physique d'une couronne, par distance au village. Non
           linéaire à dessein : deux cases valent bien plus que le double de
           quatre. C'est ce que la proximité linéaire d'avant ne savait pas
           dire. */
        couronneParDistance: [2600, 2100, 1700, 1150, 700, 400, 200],
        couronnePortee: 75,
        /* Une couronne encore en attente entrera au sanctuaire au prochain
           tour : elle vaut déjà sa position future, à moitié prix. */
        couronneEnAttenteFacteur: 0.5,

        /* Double pression : on prend le MEILLEUR bonus applicable, jamais la
           somme. Deux couronnes à deux cases (1700+1700+1200) passent devant
           une seule dans la zone (2600) et devant un point non terminal
           (4000) — c'est voulu. */
        doubleDeuxCases: 1200,
        doubleZoneEtDeux: 1000,
        doubleTroisCases: 650,

        // Relais : environ 300 par action réellement économisée.
        relaisParAction: 300,
        relaisMaxParCouronne: 1000,

        /* Exposition du porteur, jugée par la position où la couronne
           RESTERAIT. Les règles la font tomber sur la dernière case valide. */
        exposeCouronneSure: 400,
        exposeCouronneContestee: 900,
        exposeCouronneFavorableAdverse: 1600,
        exposeCatastrophe: 2400,

        // Gardien : présence faible, utilité positionnelle décisive.
        gardien: 200,
        utiliteGardienMax: 1800,
        utiliteRamassage: 300,
        utiliteRelais: 400,
        utiliteDefense: 500,
        utiliteInterception: 600,
        utiliteMenace: 450,
        utiliteMenaceMultiple: 900,
        blocageValidation: 900,

        /* Urgence à deux points. Grands nombres, mais jamais terminaux : une
           menace n'est pas une défaite. */
        urgenceDefaitePresqueForcee: 20000,
        urgenceDefaiteForte: 12000,
        urgenceVictoirePresquePrete: 15000,
        urgenceVictoireForte: 8000,

        /* TERRAIN FONCTIONNEL. Les anciens critères — route abstraite,
             contrôle de surface, bordure de vide — sont abandonnés : ils ne
             décrivaient pas la stratégie réelle du jeu. Une bordure de vide
             n'est ni bonne ni mauvaise en soi, tout dépend de qui peut y être
             poussé.

             Ce terme ne mesure que des conséquences concrètes : mes gardiens
             atteignent-ils mieux les couronnes, et bougent-ils plus librement
             que les siens. Il reste secondaire quand la pose fait apparaître un
             gardien — l'utilité de ce gardien domine — mais devient le critère
             principal quand le plafond de gardiens est atteint, et c'est lui
             qui empêche alors le retour des égalités massives entre poses. */
        terrainFonctionnel: 600,
        accesCouronne: 400,

        /* Réserve : valeur intrinsèque faible, et UNIQUEMENT pour les cartes
           réellement conservables après le plafond de 5 par type. Une carte
           qui sera défaussée en fin de tour ne vaut rien à garder — voir
           plannerRessourcesConservables. */
        carteConservee: 5,
        potentielReserveMax: 400,
        formeConsommee: 90,

        // Passer son tour n'est presque plus pénalisé : ce peut être un bon
        // choix. On garde un départage négligeable contre la passivité pure.
        tempoPerdu: 20
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

      /** Ce que le joueur peut JOUER maintenant : main et réserve confondues.
       *  Sert à savoir ce qui est faisable ce tour-ci — jamais à estimer ce
       *  qu'il aura ensuite. */
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

      /** Ce que le joueur CONSERVERA après la fin du tour : plafonné à 5 par
       *  type, projeté par le noyau de règle lui-même. Seules ces cartes-là
       *  ont une valeur pour la suite. */
      function plannerRessourcesConservables(playerId) {
        return projeterReserveFinDeTour(state.players[playerId]);
      }

      function plannerTotalConservable(playerId) {
        const r = plannerRessourcesConservables(playerId);
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
        /* La clé retient TOUTE l'occupation, pas seulement les gardiens
           adverses : mes propres gardiens bloquent aussi leurs déplacements.
           Sans cela, une case que je viens de libérer restait « occupée » dans
           le cache, et la menace qui en venait devenait invisible — A8, où le
           porteur fuit vers une case tout aussi expulsable, échouait pour
           cette seule raison. */
        const cle = plannerEmpreinteTerrain() + ':' + budgetMove + ':'
          + (state.characters || []).map(c => c.r + ',' + c.c).sort().join('|');
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
            const dMoi = champMoi.get(key(r, c));
            const dAdv = champAdverse.get(key(r, c));
            /* Une case qu'AUCUN camp ne peut rejoindre est neutre : elle ne
               compte ni pour moi ni pour lui. La compter dans le total revenait
               à la créditer à l'adversaire — et donc à faire BAISSER ma note
               chaque fois que je posais une île isolée. L'IA s'interdisait
               ainsi la pose dans le vide, pourtant parfaitement légale et
               souvent décisive près du village adverse. */
            const joignableMoi = Number.isFinite(dMoi);
            const joignableAdverse = Number.isFinite(dAdv);
            if (!joignableMoi && !joignableAdverse) continue;
            terrainTotal++;
            const mienne = joignableMoi && (!joignableAdverse || dMoi < dAdv);
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

      /* =====================================================================
         ÉVALUATEUR — ce qui fait une bonne position dans ILYOS

         Réécrit autour de trois idées qui manquaient, et que l'ancien barème
         contredisait :

         1. UNE COURONNE EST UN OBJET COMMUN. Il n'y a pas « ma couronne » et
            « la sienne » : il y a une couronne quelque part, plus ou moins
            proche de chaque village, plus ou moins accessible à chaque camp.
            La porter n'est qu'un moyen. Une couronne libre posée dans ma zone
            de validation vaut souvent mieux qu'une couronne portée au milieu
            du plateau — l'adversaire devra dépenser pour l'atteindre, puis
            encore pour l'éloigner.

         2. LES DEUX COURONNES SE JUGENT ENSEMBLE. Deux menaces à deux cases
            valent plus que leur somme : l'adversaire ne peut pas défendre les
            deux, et défendre l'une laisse avancer l'autre.

         3. UN GARDIEN VAUT CE QU'IL FAIT, pas d'être là. Bloquer un village,
            pouvoir ramasser une couronne, servir de relais, menacer une
            expulsion — c'est cela qui compte. Un gardien isolé et inutile ne
            vaut presque rien, et le perdre n'est pas un drame.

         Corollaire sur le danger : une expulsion se juge par sa CONSÉQUENCE.
         Les règles font tomber la couronne sur la dernière case valide du
         porteur : si cette case est dans ma zone, je perds un gardien mais la
         couronne reste excellente. Le malus forfaitaire d'avant ignorait cela.
         ===================================================================== */

      /* Urgence : à deux points, le prochain termine la partie. Tout ce qui
         empêche ou produit un point pèse alors bien plus lourd. */
      function plannerUrgence(moi, adverse) {
        const monScore = (moi && moi.score) || 0;
        const sonScore = (adverse && adverse.score) || 0;
        return {
          attaque: monScore >= 2 ? 2 : 1,
          defense: sonScore >= 2 ? 3 : (sonScore >= 1 ? 1.4 : 1)
        };
      }

      /** Coût, pour un camp, d'aller agir sur une case — 0 si un gardien y est
       *  déjà adjacent, ce qui vaut ramassage ou poussée GRATUITE. */
      function plannerCoutInterventionEquipe(playerId, r, c) {
        let meilleur = Infinity;
        for (const g of plannerGardiensDe(playerId)) {
          const d = Math.abs(g.r - r) + Math.abs(g.c - c);
          if (d <= 1) return 0;
          const cout = aiLandDistanceToTargets(g.r, g.c, [[r, c]]);
          if (cout < meilleur) meilleur = cout;
        }
        return meilleur;
      }

      /** Valeur d'une couronne selon sa distance au village. */
      function valeurCouronneADistance(d) {
        const table = PLAN_POIDS.couronneParDistance;
        if (!Number.isFinite(d) || d < 0) return 0;
        const rang = Math.round(d);
        return rang < table.length ? table[rang] : 0;
      }

      /* Urgence de fin de partie. Une menace n'est pas une défaite : ces
         valeurs sont grandes mais restent très loin de victoire. */
      function plannerUrgenceScore(playerId, moi, adverse, positions) {
        let bonus = 0;
        const noteMoi = (moi && moi.score) || 0;
        const noteLui = (adverse && adverse.score) || 0;

        if (noteLui >= 2) {
          if (positions.dansSaZone) bonus -= PLAN_POIDS.urgenceDefaitePresqueForcee;
          else if (positions.prochesDeLui) bonus -= PLAN_POIDS.urgenceDefaiteForte;
        }
        if (noteMoi >= 2) {
          if (positions.dansMaZone) bonus += PLAN_POIDS.urgenceVictoirePresquePrete;
          else if (positions.prochesDeMoi) bonus += PLAN_POIDS.urgenceVictoireForte;
        }
        return bonus;
      }

      /* Un gardien peut-il agir sur cette case sans dépenser de carte ?
         L'adjacence orthogonale suffit : ramassage, dépôt et poussée y sont
         gratuits, et c'est le coeur du jeu de relais. */
      function plannerGardienAdjacent(playerId, r, c, filtre) {
        return plannerGardiensDe(playerId).find(g =>
          Math.abs(g.r - r) + Math.abs(g.c - c) === 1 && (!filtre || filtre(g))) || null;
      }

      function evaluateStrategicState(playerId) {
        const moi = state.players[playerId];
        if (!moi) return 0;
        const adverse = plannerAdversaire(playerId);

        let valeur = 0;
        const trace = plannerTraceEval;
        const ajouter = (terme, montant, note) => {
          if (!montant) return;
          valeur += montant;
          if (trace) trace.push({ terme, montant, note: note || null });
        };

        if (state.winner !== null && state.winner !== undefined) {
          if (state.winner === MATCH_NUL) {
            if (trace) trace.push({ terme: "matchNul", montant: 0, note: null });
            return 0;
          }
          const terminal = state.winner === playerId ? PLAN_POIDS.victoire : -PLAN_POIDS.victoire;
          if (trace) trace.push({ terme: "victoire", montant: terminal, note: null });
          return terminal;
        }

        ajouter("pointsMarques", (moi.score || 0) * PLAN_POIDS.pointValide, `score ${moi.score || 0}`);
        if (adverse) ajouter("pointsAdverses", -(adverse.score || 0) * PLAN_POIDS.pointValide, `score ${adverse.score || 0}`);

        const terrain = plannerTerrain(playerId);
        /* Une case non reliée aux villages n'a pas d'entrée dans le champ. Lui
           donner une valeur plate supprimerait tout DÉGRADÉ : deux cases
           également injoignables se vaudraient, et l'IA n'aurait plus de raison
           d'avancer vers l'une plutôt que l'autre. */
        const casesMoi = crownValidationCellsForPlayer(moi).filter(([r, c]) => isLand(r, c));
        const casesLui = adverse
          ? crownValidationCellsForPlayer(adverse).filter(([r, c]) => isLand(r, c)) : [];
        const distMoi = (r, c) => plannerLireChamp(terrain.champMoi, casesMoi, r, c);
        const distLui = (r, c) => plannerLireChamp(terrain.champAdverse, casesLui, r, c);

        const dMoiParCouronne = [];
        const dLuiParCouronne = [];
        let exploitablesMoi = 0, exploitablesLui = 0;

        for (const couronne of activeArtifacts()) {
          const porteur = couronne.carrierId ? characterById(couronne.carrierId) : null;
          const r = porteur ? porteur.r : couronne.r;
          const c = porteur ? porteur.c : couronne.c;
          if (!Number.isFinite(r) || !Number.isFinite(c)) continue;

          const dm = distMoi(r, c);
          const dl = distLui(r, c);
          dMoiParCouronne.push(dm);
          dLuiParCouronne.push(dl);

          /* POSITION : ce qui compte d'abord. Qui la porte n'entre pas ici —
             une couronne est un objet commun. */
          ajouter("positionCouronne",
            valeurCouronneADistance(dm) - valeurCouronneADistance(dl),
            `(${r},${c}) — moi ${dm}, lui ${dl}`);

          // Porter n'est plus qu'un petit avantage pratique.
          if (porteur) {
            ajouter("couronnePortee",
              porteur.player === playerId ? PLAN_POIDS.couronnePortee : -PLAN_POIDS.couronnePortee,
              porteur.id);
          }

          /* RELAIS : ce qu'on économise réellement pour améliorer la position.
             Un gardien adjacent agit GRATUITEMENT ; s'il est mieux placé que le
             porteur actuel, la couronne progresse sans dépenser de carte. */
          const aidant = plannerGardienAdjacent(playerId, r, c,
            g => !porteur || g.id !== porteur.id);
          if (aidant) {
            exploitablesMoi++;
            const gain = dm - distMoi(aidant.r, aidant.c);
            if (gain > 0) {
              ajouter("relaisUtile",
                Math.min(gain * PLAN_POIDS.relaisParAction, PLAN_POIDS.relaisMaxParCouronne),
                `gardien en (${aidant.r},${aidant.c}) gagne ${gain}`);
            }
          }
          if (adverse && plannerGardienAdjacent(adverse.id, r, c)) exploitablesLui++;

          /* ACCÈS : à quel prix chaque camp peut agir sur cette couronne.
             Sans ce dégradé, seule l'adjacence comptait — un gardien n'avait
             donc aucune raison de MARCHER vers une couronne encore hors de
             portée, et l'IA restait sur place. */
          const accesMoi = plannerDistanceEquipe(playerId, [[r, c]]);
          const accesLui = adverse ? plannerDistanceEquipe(adverse.id, [[r, c]]) : Infinity;
          ajouter("accesCouronne",
            PLAN_POIDS.accesCouronne * (plannerProximite(accesMoi) - plannerProximite(accesLui)),
            `accès moi ${accesMoi}, lui ${accesLui}`);

          /* EXPOSITION DU PORTEUR, jugée par la position où la couronne
             RESTERAIT : les règles la font tomber sur sa case actuelle. */
          if (porteur && porteur.player === playerId && plannerMenaceExpulsion(playerId, r, c)) {
            let cout;
            if (isCrownValidationCell(moi, r, c) || dm <= 1) cout = PLAN_POIDS.exposeCouronneSure;
            else if (dm <= dl) cout = PLAN_POIDS.exposeCouronneContestee;
            else if (dl <= 2) cout = PLAN_POIDS.exposeCatastrophe;
            else cout = PLAN_POIDS.exposeCouronneFavorableAdverse;
            ajouter("porteurExpose", -cout, `(${r},${c}) — resterait à ${dm} de moi, ${dl} de lui`);
          }
        }

        /* COURONNES EN ATTENTE : elles entreront au sanctuaire au prochain
           tour. Être déjà placé pour les prendre a une valeur réelle — sans ce
           terme, l'IA ne peut au mieux que dériver vers le centre par hasard. */
        for (const _ of (state.couronnesEnAttente || [])) {
          const dm = distMoi(CENTER.r, CENTER.c);
          const dl = distLui(CENTER.r, CENTER.c);
          const acces = plannerDistanceEquipe(playerId, [[CENTER.r, CENTER.c]]);
          const accesLui = adverse ? plannerDistanceEquipe(adverse.id, [[CENTER.r, CENTER.c]]) : Infinity;
          ajouter("couronneEnAttente",
            PLAN_POIDS.couronneEnAttenteFacteur
              * ((valeurCouronneADistance(dm) - valeurCouronneADistance(dl))
                 + PLAN_POIDS.accesCouronne * (plannerProximite(acces) - plannerProximite(accesLui))),
            `sanctuaire — accès moi ${acces}, lui ${accesLui}`);
        }

        /* DOUBLE PRESSION : le MEILLEUR bonus applicable, jamais la somme.
           Réduit de moitié si la proximité est purement géométrique et
           qu'aucun gardien ne peut exploiter les couronnes. */
        const pression = (distances, exploitables, signe, terme) => {
          if (distances.length < 2) return;
          const tri = [...distances].sort((a, b) => a - b);
          /* ORDRE IMPORTANT. « Une couronne en zone de validation + une seconde
             à deux cases » est un SOUS-CAS de « deux couronnes à deux cases » :
             placée en second, sa branche ne pouvait jamais être atteinte. Elle
             passe donc d'abord, et vaut moins — la couronne déjà en zone est
             largement comptée par positionCouronne, la re-payer ici serait un
             double comptage. */
          let bonus = 0;
          if (tri[0] === 0 && tri[1] <= 2) bonus = PLAN_POIDS.doubleZoneEtDeux;
          else if (tri[1] <= 2) bonus = PLAN_POIDS.doubleDeuxCases;
          else if (tri[1] <= 3) bonus = PLAN_POIDS.doubleTroisCases;
          if (!bonus) return;
          if (exploitables === 0) bonus *= 0.5;
          ajouter(terme, signe * bonus, `couronnes à ${tri[0]} et ${tri[1]}`);
        };
        pression(dMoiParCouronne, exploitablesMoi, 1, "doublePression");
        if (adverse) pression(dLuiParCouronne, exploitablesLui, -1, "doublePressionAdverse");

        /* URGENCE quand un camp est à deux points. */
        const minMoi = dMoiParCouronne.length ? Math.min(...dMoiParCouronne) : 99;
        const minLui = dLuiParCouronne.length ? Math.min(...dLuiParCouronne) : 99;
        const urgence = plannerUrgenceScore(playerId, moi, adverse, {
          dansMaZone: minMoi === 0, prochesDeMoi: minMoi <= 2,
          dansSaZone: minLui === 0, prochesDeLui: minLui <= 2
        });
        ajouter("urgenceScore", urgence, `${moi.score || 0}-${adverse ? adverse.score || 0 : 0}`);

        /* GARDIENS : présence faible, utilité positionnelle décisive, le tout
           pondéré par la capacité à SURVIVRE là où ils sont. */
        const miens = plannerGardiensDe(playerId);
        const siens = adverse ? plannerGardiensDe(adverse.id) : [];
        ajouter("gardiensPresents", (miens.length - siens.length) * PLAN_POIDS.gardien,
          `${miens.length} contre ${siens.length}`);

        const couronnesLibres = activeArtifacts().filter(a => !a.carrierId && Number.isFinite(a.r));
        const porteursAmis = miens.filter(g => characterCarriesCrown(g.id));
        const menaceReelle = minLui <= 2 ? (minLui === 0 ? 1.5 : 1) : (minLui <= 4 ? 0.6 : 0.3);

        let utiliteTotale = 0;
        let blocageTotal = 0;
        for (const g of miens) {
          let u = 0;
          /* Le blocage est tenu HORS de la pondération par survivabilité qui
             suit. Occuper une case de validation interdit le point dès
             maintenant, même si l adversaire éjecte ensuite le gardien — et
             l en chasser lui coûte une action. Pondérer ce terme par la
             fragilité revenait à renoncer au blocage précisément là où il est
             le plus utile : seul, en zone adverse. */
          if (adverse && isCrownValidationCell(adverse, g.r, g.c)) {
            blocageTotal += PLAN_POIDS.blocageValidation * menaceReelle;
          }
          if (couronnesLibres.some(a => Math.abs(a.r - g.r) + Math.abs(a.c - g.c) <= 1)) {
            u += PLAN_POIDS.utiliteRamassage;
          }
          if (!characterCarriesCrown(g.id)
            && porteursAmis.some(pg => Math.abs(pg.r - g.r) + Math.abs(pg.c - g.c) === 1)) {
            u += PLAN_POIDS.utiliteRelais;
          }
          let menaces = 0;
          for (const e of siens) {
            if (Math.abs(e.r - g.r) + Math.abs(e.c - g.c) !== 1) continue;
            const derriere = [e.r + (e.r - g.r), e.c + (e.c - g.c)];
            if (!isLand(derriere[0], derriere[1])) menaces++;
            if (characterCarriesCrown(e.id)) u += PLAN_POIDS.utiliteInterception;
          }
          if (menaces === 1) u += PLAN_POIDS.utiliteMenace;
          else if (menaces > 1) u += PLAN_POIDS.utiliteMenaceMultiple;

          u = Math.min(u, PLAN_POIDS.utiliteGardienMax);
          /* SURVIVABILITÉ : elle ne pondère que l'utilité, jamais la présence.
             Un infiltré qui tient vraiment vaut bien plus qu'un infiltré qu'une
             poussée renvoie aussitôt. */
          u *= plannerMenaceExpulsion(playerId, g.r, g.c) ? 0.35 : 1;
          utiliteTotale += u;
        }
        ajouter("utiliteGardiens", utiliteTotale, `${miens.length} gardien(s)`);
        ajouter("blocageValidation", blocageTotal, `menace ${menaceReelle}`);

        /* Défense de repli : être à portée du village menacé quand on ne le
           tient pas encore. */
        if (adverse && minLui <= 4 && !miens.some(g => isCrownValidationCell(adverse, g.r, g.c))) {
          const aTenir = crownValidationCellsForPlayer(adverse).filter(([r, c]) => isLand(r, c));
          if (aTenir.length) {
            const d = plannerDistanceEquipe(playerId, aTenir);
            ajouter("presenceDefensive",
              menaceReelle * PLAN_POIDS.utiliteDefense * plannerProximite(d), `distance ${d}`);
          }
        }

        /* RESSOURCES : faibles, et à potentiel plafonné. Une carte doit être
           dépensée dès qu'elle crée plus de valeur que ce potentiel.

           On ne compte QUE les cartes réellement conservables après le
           plafond de 5 par type. Une sixième MOVE ne verra jamais le tour
           suivant : lui donner une valeur de conservation revenait à payer
           l'IA pour garder une carte qui allait être défaussée de toute
           façon, et la dissuadait donc de s'en servir alors qu'elle ne
           coûtait rien. Cela ne l'oblige pas à la dépenser : si le seul
           usage possible abîme la position, la recherche préférera toujours
           terminer le tour et la perdre. */
        const cartes = plannerTotalConservable(playerId);
        const jouables = plannerTotalRessources(playerId);
        ajouter("reserve", cartes * PLAN_POIDS.carteConservee,
          cartes === jouables
            ? `${cartes} carte(s) conservable(s)`
            : `${cartes} conservable(s) sur ${jouables} jouable(s)`);
        /* Pas de bonus de potentiel proportionnel au NOMBRE de cartes : ce
           serait le bonus forfaitaire que le barème dénonce, et il récompense
           la thésaurisation. Le potentiel d une réserve, c est le plan qu elle
           permet — la recherche le trouve d elle-même en simulant les tours où
           ces cartes sont dépensées. Mesuré : avec ce bonus, l IA refusait de
           dépenser une grosse réserve pour aller valider. */
        ajouter("formesConsommees", -plannerCoutFormes(playerId));

        /* TERRAIN FONCTIONNEL : uniquement l'impact tactique de la géométrie,
           jamais la quantité de terrain. Deux conséquences concrètes suffisent
           — mes gardiens bougent-ils plus librement que les siens, et le
           plateau les rapproche-t-il des couronnes. */
        const mobilite = equipe => equipe.reduce((total, g) => {
          let libres = 0;
          for (const e of movementEdges(g.r, g.c)) {
            if (isLand(e.r, e.c) && !characterAt(e.r, e.c)) libres++;
          }
          return total + Math.min(libres, 4);
        }, 0);
        const mienne = miens.length ? mobilite(miens) / (miens.length * 4) : 0;
        const sienne = siens.length ? mobilite(siens) / (siens.length * 4) : 0;
        const fonctionnel = Math.max(-1, Math.min(1, mienne - sienne));
        ajouter("terrainFonctionnel", PLAN_POIDS.terrainFonctionnel * fonctionnel,
          `mobilité ${mienne.toFixed(2)} contre ${sienne.toFixed(2)}`);

        return valeur;
      }

      /* AUTOPSIE — candidats écartés par les plafonds de génération.

         Ce sont les coups que la recherche n a JAMAIS vus : ils meurent dans
         le pré-filtre, avant tout évaluateur. C est là que se joue une part des
         mauvaises décisions, pas dans la profondeur du faisceau. Renseigné
         uniquement sous autopsie. */
      let plannerCandidatsEcartes = null;

      /** Applique le plafond d un générateur en relevant ce quil sacrifie. */
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
        racine: { move: 16, moveParIntention: 3, push: 8, magic: 8, pose: 10, poseSpawns: 3,
          poseTotal: 20, poseParIntention: 2 },
        /* En profondeur on resserre, mais jamais en dessous de ce que le
           planner avait avant l'ouverture de la racine : les enchaînements
           utiles — se placer puis transmettre, préparer puis pousser — se
           construisent au deuxième et au troisième niveau. Trop serrer ici
           coûte plus que ce que l'ouverture de la racine rapporte. */
        profond: { move: 10, moveParIntention: 2, push: 5, magic: 4, pose: 4, poseSpawns: 1,
          poseTotal: 8, poseParIntention: 1 },
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

      /* INTENTIONS D'UNE POSE.

         Une pose n'est pas l'extension du territoire déjà construit : la
         règle autorise une forme n'importe où sur le plateau, entièrement
         isolée au milieu du vide. Tant qu'on est sous le plafond de gardiens,
         la vraie question n'est donc pas « où agrandir » mais « quel gardien
         puis-je créer, où, et que pourra-t-il faire ? ».

         Le pré-classement historique répond à une question unique — la
         distance à UNE cible automatique, plus la distance à mes propres
         gardiens. Ses dix meilleures poses se regroupent donc autour du même
         point, tout près de là où je suis déjà. Une pose isolée à l'autre
         bout du plateau, fût-elle décisive, mourait avant d'atteindre
         l'évaluateur.

         On garde ce classement — il reste une famille parmi d'autres — et on
         lui adjoint une famille par capacité que la position rend
         pertinente, chacune avec ses propres places. */
      function plannerIntentionsPose(playerId) {
        const intentions = [];
        const moi = state.players[playerId];
        const adverse = plannerAdversaire(playerId);
        const ajouter = (but, cibles, contact) => {
          const utiles = (cibles || []).filter(([r, c]) => Number.isFinite(r) && Number.isFinite(c));
          if (utiles.length) intentions.push({ but, cibles: utiles, contact: contact || 0 });
        };

        /* `contact` = distance IDÉALE entre la case d'apparition et la cible.
           Ramasser une couronne veut un gardien À CÔTÉ d'elle (1) ; bloquer
           un village veut un gardien DESSUS (0). */
        const libres = activeArtifacts().filter(a => a.carrierId === null).map(a => [a.r, a.c]);
        ajouter("couronne", libres, 1);
        if ((state.couronnesEnAttente || []).length) ajouter("sanctuaire", [[CENTER.r, CENTER.c]], 1);

        if (adverse) {
          ajouter("blocage", crownValidationCellsForPlayer(adverse), 0);
          const porteurAdverse = activeArtifacts()
            .map(a => a.carrierId ? characterById(a.carrierId) : null)
            .find(pt => pt && pt.player !== playerId);
          if (porteurAdverse) ajouter("interception", [[porteurAdverse.r, porteurAdverse.c]], 1);

          /* PRÉPARER UNE POUSSÉE : faire apparaître un gardien du côté opposé
             au vide, face à un gardien adverse adossé au bord. */
          const postes = [];
          for (const ennemi of plannerGardiensDe(adverse.id)) {
            for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
              if (isLand(ennemi.r + dr, ennemi.c + dc)) continue;
              postes.push([ennemi.r - dr, ennemi.c - dc]);
            }
          }
          ajouter("poussee", postes, 0);
        }

        /* RELAIS et DÉFENSE de mon propre porteur : un gardien qui surgit à
           côté de lui reprend la couronne gratuitement, ou la relaie. */
        const porteurAmi = plannerGardiensDe(playerId).find(g => characterCarriesCrown(g.id));
        if (porteurAmi) {
          ajouter("relais", [[porteurAmi.r, porteurAmi.c]], 1);
          ajouter("defense", crownValidationCellsForPlayer(moi), 0);
        }

        return intentions;
      }

      /* Toutes les poses légales, sans coupe. findAutomaticIslandPlacement les
         énumère et les trie DÉJÀ intégralement à chaque appel : demander la
         liste entière ne coûte donc rien de plus que d'en demander dix. */
      const PLAN_POSE_ENUM_MAX = 100000;

      function plannerCandidatsPose(playerId) {
        if (state.islandPlacedThisTurn) return [];
        /* Le biais vers la zone adverse ne s'active que sous menace réelle.
           Permanent, il détournait la pose de l'action : l'IA allait camper au
           village adverse pendant qu'une couronne libre attendait ailleurs. */
        const biais = plannerMenaceValidationAdverse(playerId);
        const toutes = findAutomaticIslandPlacement(playerId, PLAN_POSE_ENUM_MAX, biais);
        if (!Array.isArray(toutes) || !toutes.length) return [];

        const options = [];
        const vues = new Set();
        const empreinte = (pose, spawn) =>
          `${pose.shapeKey}|${pose.anchor.r},${pose.anchor.c}|${pose.cells.length}|${spawn[0]},${spawn[1]}`;
        const proposer = (pose, spawn, but, indice) => {
          const k = empreinte(pose, spawn);
          if (vues.has(k)) return false;
          vues.add(k);
          options.push({
            type: "POSE",
            shapeKey: pose.shapeKey,
            cells: pose.cells,
            relCells: pose.relCells,
            anchor: pose.anchor,
            owner: playerId,
            spawn,
            but,
            indice
          });
          return true;
        };

        /* UNE FAMILLE PAR INTENTION, chacune avec ses propres places.

           La case d'apparition fait partie de la décision : on retient, pour
           chaque pose, celle qui sert le mieux l'intention examinée. Une même
           pose peut servir deux familles — elle n'est alors proposée qu'une
           fois, avec la première justification trouvée. */
        for (const intention of plannerIntentionsPose(playerId)) {
          const notees = [];
          for (const pose of toutes) {
            let meilleurSpawn = null;
            let meilleurEcart = Infinity;
            for (const cellule of pose.cells) {
              if (characterAt(cellule[0], cellule[1])) continue;
              let d = Infinity;
              for (const [tr, tc] of intention.cibles) {
                const m = Math.abs(cellule[0] - tr) + Math.abs(cellule[1] - tc);
                if (m < d) d = m;
              }
              const ecart = Math.abs(d - intention.contact);
              if (ecart < meilleurEcart) { meilleurEcart = ecart; meilleurSpawn = cellule; }
            }
            if (!meilleurSpawn || meilleurEcart > 3) continue;
            notees.push({ pose, spawn: meilleurSpawn, indice: 100 - meilleurEcart * 25 });
          }
          notees.sort((a, b) => b.indice - a.indice);
          let places = 0;
          for (const n of notees) {
            if (places >= plafonds().poseParIntention) break;
            if (proposer(n.pose, n.spawn, intention.but, n.indice)) places++;
          }
        }

        /* FAMILLE « TERRAIN » : le classement historique, conservé tel quel.
           C'est lui qui répond quand le plafond de gardiens est atteint ou
           qu'aucune intention ne s'applique, et il garantit que le coup que le
           jeu choisirait seul reste toujours candidat. */
        const cible = automaticPlacementTarget(playerId);
        for (const pose of toutes.slice(0, plafonds().pose)) {
          const libres = pose.cells.filter(([r, c]) => !characterAt(r, c));
          libres.sort((a, b) =>
            (Math.abs(a[0] - cible[0]) + Math.abs(a[1] - cible[1])) -
            (Math.abs(b[0] - cible[0]) + Math.abs(b[1] - cible[1])));
          for (const spawn of libres.slice(0, plafonds().poseSpawns)) {
            proposer(pose, spawn, "terrain", 10);
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
      /* Faisceau DIVERSIFIÉ : le meilleur de chaque nature d'abord.

         Trier par note et couper au plafond laissait une seule idée occuper
         toutes les places — dix poses d'île presque identiques évinçaient la
         parade qui répondait à deux menaces (A8 échouait ainsi). On sert donc
         chaque type d'action à tour de rôle avant de compléter par les
         meilleurs restants : aucune nature de coup ne peut plus disparaître du
         faisceau tant qu'il y reste de la place. */
      function plannerFaisceauDiversifie(candidats, largeur) {
        if (candidats.length <= largeur) return candidats;
        const parNature = new Map();
        for (const noeud of candidats) {
          const derniere = noeud.plan[noeud.plan.length - 1];
          const nature = derniere ? derniere.type : "RIEN";
          if (!parNature.has(nature)) parNature.set(nature, []);
          parNature.get(nature).push(noeud);
        }
        const retenus = [];
        const vus = new Set();
        const files = [...parNature.values()];
        let rang = 0;
        // Tour de rôle : une place à chaque nature, puis on recommence.
        while (retenus.length < largeur && files.some(f => rang < f.length)) {
          for (const file of files) {
            if (retenus.length >= largeur) break;
            const noeud = file[rang];
            if (noeud && !vus.has(noeud)) { vus.add(noeud); retenus.push(noeud); }
          }
          rang++;
        }
        return retenus;
      }

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
        /* Le faisceau suit l'ouverture de la racine. Élargir les candidats sans
           élargir le faisceau est contre-productif : les variantes d'une même
           idée — dix poses d'île presque identiques — remplissent les places et
           évincent les lignes d'une autre nature. Mesuré : A8, qui demande une
           parade précise, échouait pour cette seule raison. */
        largeurFaisceau: 14,
        decisionsMax: 6,
        etatsMax: 1200,
        tempsMaxMs: 500
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
          faisceau = plannerFaisceauDiversifie(suivants, budget.largeurFaisceau);
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

        /* MÊME rangement que la vraie fin de tour et que le self-play.

           Ces six lignes recopiaient la règle sur le seul `stash`, qui n'est
           qu'un miroir : la réserve physique restait inchangée. Or c'est elle
           que lit availableActionCount. L'anticipation voyait donc, au tour
           suivant, une réserve différente de celle que la partie aurait
           réellement eue — et le surplus ne partait jamais à la défausse. */
        rangerEtDefausserFinDeTour(sortant);

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
        /* NE RIEN FAIRE COÛTE UN TOUR.

           Le classement par robustesse récompense ce qui ne risque rien — et
           rien ne risque moins que l'immobilité. L'IA renonçait ainsi à
           ramasser une couronne à sa portée parce que la porter l'exposait
           (P08 échouait : « aucune action »).

           Passer son tour n'est pourtant pas gratuit : c'est cinq cartes
           perdues et un tempo offert. Le plan vide se voit donc appliquer ce
           coût, comme n'importe quel autre coup a le sien. */
        const examines = finalistes.map(noeud => ({
          noeud: noeud,
          robustesse: plannerEvaluerRobustesse(noeud, playerId)
        }));
        examines.forEach(e => {
          if (!e.noeud.plan.length) e.robustesse.note -= PLAN_POIDS.tempoPerdu;
        });
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
