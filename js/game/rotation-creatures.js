      /* =====================================================================
         MODE ROTATION — couche CRÉATURES ET ŒUFS.

         Règles (une ligne chacune) :
         — Dès la mise en place, 4 œufs sont posés sur la croix centrale, à
           2 cases du sanctuaire, chacun avec le nombre de tours avant son
           éclosion. Chaque fin de tour retire 1 à TOUS les œufs.
         — Comptes de départ : 2, 3, 4 et 5, tirés au hasard.
         — À zéro, l'œuf est mûr (il change de couleur) et éclot dès qu'une
           île est sous lui : la créature naît sur la case de l'œuf.
         — Chaque éclosion fait apparaître un nouvel œuf (compte 2) au
           hasard sur une case libre de la croix du sanctuaire (ligne et
           colonne entières, hors balises).
         — Un œuf se pousse comme une couronne au sol, mais il flotte : il
           survole le vide sans tomber et s'arrête au bord du plateau.
         — Une poussée de force 3 ou plus tue la créature, même sans chute.
         — Un œuf bloque sa case : un gardien peut le traverser, jamais
           s'y arrêter en se déplaçant.
         — Une seule espèce par partie :
             Loup : à chaque fin de tour, il avance d'une case vers le
             gardien le plus proche (s'il n'en touche pas déjà un), puis
             pousse d'une case un gardien adjacent.
             (La Vase est retirée du jeu pour l'instant : Taekun, 2026-11-03.)
         — Une créature se fait tomber comme un gardien (poussée, magie).
           Celui qui l'a fait tomber est récompensé : avec le deckbuilding,
           un butin (carte du marché gratuite, ou exiler 2 cartes) ; sans,
           il pioche aussitôt une carte.

         Une créature est un gardien sans camp (char.creature, player -1) :
         poussées, files, blocages, rotations d'île et chutes s'appliquent
         d'office. joueurDuGardien() (core.js) lui donne un camp fictif.
         Modèle 3D provisoire (squelettes KayKit) en attendant le choix du
         pack de créatures.
         ===================================================================== */
      const CREATURES = {
        loup: { nom: "Loup", modele: "heroSkeletonRogue" }
        // vase: { nom: "Vase", modele: "heroSkeletonMage" } — retirée pour l'instant.
      };
      const CREATURES_DISTANCE_OEUFS = 2;
      /* Comptes à rebours de départ (un tour = le tour d'un joueur), tirés
         au hasard entre les 4 œufs : 2, 3, 4 et 5 (Taekun, 2026-11-03). */
      const CREATURES_COMPTES = [2, 3, 4, 5];
      /* Quand un œuf éclot, un nouvel œuf apparaît sur une case libre de la
         croix du sanctuaire, avec ce compte à rebours. */
      const CREATURES_COMPTE_RELEVE = 2;

      function creaturesActives(source = state) {
        return !!source?.rotation?.couches?.creatures;
      }

      function creaturesVivantes() {
        return (state?.characters || []).filter(c => c.creature);
      }

      function creaturesInstaller() {
        if (!creaturesActives() || state.rotation.creatures) return;
        const d = CREATURES_DISTANCE_OEUFS;
        const cases = [[CENTER.r - d, CENTER.c], [CENTER.r + d, CENTER.c], [CENTER.r, CENTER.c - d], [CENTER.r, CENTER.c + d]];
        const ordre = shuffle([0, 1, 2, 3]);
        const especes = Object.keys(CREATURES);
        state.rotation.creatures = {
          espece: especes[Math.floor(gameRandom() * especes.length)],
          oeufs: cases.map(([r, c], i) => ({ id: i + 1, r, c, eclosion: (state.turn || 1) + CREATURES_COMPTES[ordre[i]] })),
          prochainId: 1,
          prochainOeuf: cases.length + 1,
          butins: {}
        };
      }

      /** Tours restants avant l'éclosion (chiffre affiché sur l'œuf) : tous
       *  les œufs perdent 1 à chaque fin de tour. */
      function oeufManches(oeuf) {
        return Math.max(0, oeuf.eclosion - (state?.turn || 1));
      }

      function creatureNom(char) {
        return CREATURES[char?.creature]?.nom || "Créature";
      }

      /* ---------- Butin ------------------------------------------------- */
      function creaturesDonnerButin(playerId, nombre = 1) {
        const etat = state?.rotation?.creatures;
        if (!etat || playerId === undefined || playerId === null || playerId < 0) return;
        if (!paquetActif()) return;
        etat.butins[playerId] = (etat.butins[playerId] || 0) + nombre;
      }

      function creaturesButinEnAttente(playerId) {
        return state?.rotation?.creatures?.butins?.[playerId] || 0;
      }

      /* Exile la carte la plus faible : Boue d'abord, puis Déplacer. */
      function creaturesExiler(player, nombre) {
        let exiles = 0;
        for (const action of ["BOUE", "MOVE"]) {
          for (const zone of ["discard", "deck"]) {
            while (exiles < nombre && paquetTaille(player) > PAQUET_MINIMUM) {
              const i = (player[zone] || []).map(c => c.action).lastIndexOf(action);
              if (i < 0) break;
              player[zone].splice(i, 1);
              exiles++;
            }
          }
        }
        return exiles;
      }

      /** Prend le butin : `choix` = index d'une carte du marché, ou "exil". */
      function creaturesPrendreButin(choix) {
        const player = currentPlayer();
        const etat = state?.rotation?.creatures;
        const marche = state?.rotation?.marche;
        if (!player || !etat || !creaturesButinEnAttente(player.id)) return false;
        if (choix === "exil") {
          const n = creaturesExiler(player, 2);
          if (!ilyosSimulationActive) showToast(n ? `Butin : ${n} carte${n > 1 ? "s" : ""} exilée${n > 1 ? "s" : ""}.` : "Butin : rien à exiler (paquet minimum).");
        } else {
          const action = marche?.visibles?.[choix];
          if (!action) return false;
          const carte = { id: `P${player.id}-B${state.turn}-${gameRandom().toString(36).slice(2, 7)}`, action, used: false };
          if (carteForte(carte)) carte.restant = PAQUET_CARTES[action].valeur;
          player.discard.push(carte);
          marche.visibles.splice(choix, 1);
          if (marche.pile.length) marche.visibles.splice(choix, 0, marche.pile.shift());
          if (!ilyosSimulationActive) showToast(`Butin : ${PAQUET_CARTES[action].nom} rejoint ta défausse.`);
        }
        etat.butins[player.id] -= 1;
        if (!ilyosSimulationActive) renderAll();
        return true;
      }

      /* ---------- Récompense --------------------------------------------
         Le joueur au trait qui fait tomber une créature est toujours récompensé.
         Avec le deckbuilding : butin au marché (carte gratuite ou exil de 2).
         Sans : il pioche aussitôt une carte, jouable dans ce tour. */
      function creaturesRecompenser(char, dropR, dropC) {
        const joueur = currentPlayer();
        if (!joueur) return;
        const nom = creatureNom(char) === "Vase" ? "la Vase" : "le " + creatureNom(char);
        const r = Number.isInteger(dropR) ? dropR : char.r, c = Number.isInteger(dropC) ? dropC : char.c;
        if (inside(r, c)) animateCellPulse(r, c, "crown-burst");
        playSfx("crownTake", { c });
        if (paquetActif()) {
          creaturesDonnerButin(joueur.id);
          showToast(`${joueur.name} fait tomber ${nom} : BUTIN ! Une carte gratuite au marché, ou exile 2 cartes.`);
          creaturesBandeau("BUTIN", "Une carte gratuite au marché", joueur);
          return;
        }
        const avant = (joueur.hand || []).length;
        drawCards(joueur, avant + 1);
        const gagnee = (joueur.hand || []).length > avant ? joueur.hand[joueur.hand.length - 1] : null;
        const NOMS = { MOVE: "Déplacer", PUSH: "Pousser", MAGIC: "Magie" };
        showToast(gagnee
          ? `${joueur.name} fait tomber ${nom} : RÉCOMPENSE, +1 carte ${NOMS[gagnee.action] || ""} en main !`
          : `${joueur.name} fait tomber ${nom} !`);
        if (gagnee) creaturesBandeau("RÉCOMPENSE", `+1 carte ${NOMS[gagnee.action] || ""} en main`, joueur);
      }

      /* Bandeau doré bref au-dessus du plateau : une seule apparition en CSS,
         retiré ensuite (rien ne reste à animer). */
      function creaturesBandeau(titre, detail, joueur) {
        if (ilyosSimulationActive || !document.body) return;
        document.querySelectorAll(".rt-recompense").forEach(n => n.remove());
        const bandeau = document.createElement("div");
        bandeau.className = "rt-recompense";
        bandeau.setAttribute("role", "status");
        bandeau.style.setProperty("--rt-camp", joueur?.color || "#f4d28e");
        bandeau.innerHTML = `<b>${defaitesEchapper(titre)}</b><span>${defaitesEchapper(detail)}</span>`;
        document.body.appendChild(bandeau);
        setTimeout(() => bandeau.classList.add("sortie"), 2400);
        setTimeout(() => bandeau.remove(), 2900);
      }

      /* ---------- Chute d'une créature ---------------------------------- */
      const creaturesRemoveBase = removeCharacterFromGame;
      removeCharacterFromGame = function removeCharacterFromGameCreatures(char, dropR = null, dropC = null, fallDirection = null) {
        if (!char?.creature) return creaturesRemoveBase(char, dropR, dropC, fallDirection);
        queueKayKitCharacterFall(char.id, fallDirection);
        if (fallDirection) playSfx("fall", { c: char.c, delay: .08 });
        state.characters = state.characters.filter(ch => ch.id !== char.id);
        if (state.selectedCharId === char.id) state.selectedCharId = null;
        if (!ilyosSimulationActive) creaturesRecompenser(char, dropR, dropC);
      };

      /* Une créature ne ramasse jamais de couronne. */
      const creaturesResolveArtifactBase = resolveArtifactForCharacter;
      resolveArtifactForCharacter = function resolveArtifactForCharacterCreatures(char, ...args) {
        if (char?.creature) return null;
        return creaturesResolveArtifactBase(char, ...args);
      };

      /* ---------- Œufs portés par une île qui tourne ------------------- */
      /* Un œuf posé sur une île suit la magie comme une couronne au sol :
         rotation.absCells garde l'ordre de ile.cells, la case d'indice i va
         donc en absCells[i]. Hors simulation seulement : le clone du planner
         partage state.rotation avec la vraie partie. */
      const creaturesMagieBase = applyMagicRotationCore;
      applyMagicRotationCore = function applyMagicRotationCoreCreatures(islandId, rotation) {
        const oeufs = (!ilyosSimulationActive && creaturesActives() && rotation?.valid) ? (state.rotation.creatures?.oeufs || []) : [];
        const ile = oeufs.length ? state.islands.find(is => is.id === islandId) : null;
        const suivants = ile ? oeufs.map(oeuf => {
          const i = ile.cells.findIndex(([r, c]) => r === oeuf.r && c === oeuf.c);
          return i >= 0 && rotation.absCells[i] ? { oeuf, vers: rotation.absCells[i] } : null;
        }).filter(Boolean) : [];
        const resultat = creaturesMagieBase(islandId, rotation);
        if (resultat) suivants.forEach(({ oeuf, vers }) => { oeuf.r = vers[0]; oeuf.c = vers[1]; });
        return resultat;
      };

      /* ---------- Tour -------------------------------------------------- */
      /* Un œuf bloque sa case : on le traverse, on ne s'y arrête pas. Même
         idiome que le porteur et la couronne au sol (core.js) : la règle
         passe par porteurBloqueParCouronne (chemin, déplacement, clic) et
         par movementRange (cases proposées, IA). */
      /* Les œufs se poussent (règle unifiée, rules-core.js) : pièces
         flottantes, jamais vues par la simulation du planner (le clone
         partage state.rotation avec la vraie partie). */
      poussablesDuMode = function poussablesOeufs() {
        if (ilyosSimulationActive || !creaturesActives()) return [];
        return (state.rotation.creatures?.oeufs || []).map(o => ({ kind: "egg", id: `oeuf-${o.id}`, r: o.r, c: o.c, ref: o }));
      };

      function oeufSurCase(r, c) {
        return creaturesActives() && !!state.rotation.creatures?.oeufs?.some(o => o.r === r && o.c === c);
      }
      const creaturesBloqueBase = porteurBloqueParCouronne;
      porteurBloqueParCouronne = function porteurBloqueParCouronneOeufs(char, r, c) {
        return creaturesBloqueBase(char, r, c) || (!!char && !char.creature && oeufSurCase(r, c));
      };
      const creaturesPorteeBase = movementRange;
      movementRange = function movementRangeOeufs(char, maxCost) {
        const portee = creaturesPorteeBase(char, maxCost);
        if (char && !char.creature && creaturesActives()) {
          (state.rotation.creatures?.oeufs || []).forEach(o => portee.delete(key(o.r, o.c)));
        }
        return portee;
      };

      function creaturesVase(precedentId) {
        const joueur = state.players[precedentId];
        if (!joueur) return;
        let boues = 0;
        creaturesVivantes().filter(c => c.creature === "vase").forEach(vase => {
          (state.characters || []).forEach(g => {
            if (g.creature || g.player !== precedentId) return;
            if (Math.abs(g.r - vase.r) + Math.abs(g.c - vase.c) !== 1) return;
            joueur.discard = Array.isArray(joueur.discard) ? joueur.discard : [];
            joueur.discard.push({ id: `P${precedentId}-V${state.turn}-${boues}`, action: "BOUE", used: false });
            boues++;
          });
        });
        if (boues) showToast(`La Vase colle : ${boues} carte${boues > 1 ? "s" : ""} Boue dans la défausse de ${joueur.name}.`);
      }

      /** Loup, à chaque fin de tour : 1) il avance d'une case vers le
       *  gardien le plus proche (plus court chemin sur les îles, sans
       *  traverser gardiens ni œufs) ; 2) il pousse d'une case un gardien
       *  qui lui est adjacent (celui qui tomberait en priorité). Sans chemin,
       *  il prend le pas qui le rapproche le plus à vol d'oiseau. */
      const LOUP_PAS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      /* Un loup né dans le vide (œuf éclos hors du sol) agit quand même :
         tant qu'il n'a pas touché terre, il peut aussi passer par les cases
         vides pour rejoindre les îles (Taekun, 2026-11-05). */
      function loupCaseLibre(r, c, volant = false) {
        return inside(r, c) && (volant || isLand(r, c)) && !characterAt(r, c) && !oeufSurCase(r, c);
      }
      function loupAdjacents(loup) {
        return (state.characters || []).filter(g => !g.creature && Math.abs(g.r - loup.r) + Math.abs(g.c - loup.c) === 1);
      }
      function loupPas(loup) {
        const proies = (state.characters || []).filter(g => !g.creature);
        if (!proies.length) return null;
        const volant = !isLand(loup.r, loup.c);
        const libre = (r, c) => loupCaseLibre(r, c, volant);
        const but = new Set();
        proies.forEach(g => LOUP_PAS.forEach(([dr, dc]) => but.add(key(g.r + dr, g.c + dc))));
        // Parcours en largeur : le premier pas du plus court chemin.
        const vus = new Set([key(loup.r, loup.c)]);
        let front = LOUP_PAS.map(([dr, dc]) => [loup.r + dr, loup.c + dc])
          .filter(([r, c]) => libre(r, c))
          .map(([r, c]) => ({ r, c, premier: [r, c] }));
        front.forEach(n => vus.add(key(n.r, n.c)));
        while (front.length) {
          const atteint = front.find(n => but.has(key(n.r, n.c)));
          if (atteint) return atteint.premier;
          const suivant = [];
          front.forEach(n => LOUP_PAS.forEach(([dr, dc]) => {
            const r = n.r + dr, c = n.c + dc, k = key(r, c);
            if (vus.has(k) || !libre(r, c)) return;
            vus.add(k);
            suivant.push({ r, c, premier: n.premier });
          }));
          front = suivant;
        }
        // Aucun chemin : le pas qui rapproche le plus du gardien le plus proche.
        const dist = (g, r, c) => Math.abs(g.r - r) + Math.abs(g.c - c);
        const cible = proies.reduce((x, y) => (dist(y, loup.r, loup.c) < dist(x, loup.r, loup.c) ? y : x));
        const pas = LOUP_PAS.map(([dr, dc]) => [loup.r + dr, loup.c + dc])
          .filter(([r, c]) => libre(r, c))
          .sort((x, y) => dist(cible, x[0], x[1]) - dist(cible, y[0], y[1]));
        return pas.length && dist(cible, pas[0][0], pas[0][1]) < dist(cible, loup.r, loup.c) ? pas[0] : null;
      }
      /* La phase des loups se lit en deux temps (Taekun, 2026-11-04) :
         d'abord TOUS les loups avancent, ensuite chacun pousse à son tour. */
      function loupsVivants() {
        return creaturesVivantes().filter(c => c.creature === "loup" && characterById(c.id));
      }
      function loupsAvancer() {
        const pas = [];
        loupsVivants().forEach(loup => {
          if (loupAdjacents(loup).length) return;
          const vers = loupPas(loup);
          if (!vers) return;
          pas.push({ id: loup.id, de: [loup.r, loup.c], vers: [vers[0], vers[1]] });
          loup.r = vers[0]; loup.c = vers[1];
        });
        return pas;
      }
      function loupChoixPoussee(loup) {
        const plans = loupAdjacents(loup).map(g => {
          const dr = g.r - loup.r, dc = g.c - loup.c;
          return { g, dr, dc, plan: resoudrePousseeBloc(g.r, g.c, dr, dc, 1) };
        }).filter(x => x.plan);
        if (!plans.length) return null;
        plans.sort((x, y) => (y.plan.chutes || 0) - (x.plan.chutes || 0));
        return plans[0];
      }
      /** Applique la poussée d'un loup ; avec `anime`, le loup bondit, les
       *  pièces touchées encaissent et celles qui tombent chutent. Rend la
       *  même description qu'une poussée relevée par le rejeu du tour. */
      function loupPousser(loup, choix, anime) {
        const { g, dr, dc, plan } = choix;
        const chutes = plan.mouvements
          .filter(mv => mv.chute && mv.kind !== "crown" && mv.id != null)
          .map(mv => ({ id: mv.id, direction: [mv.to[0] - mv.from[0], mv.to[1] - mv.from[1]] }));
        const touches = plan.mouvements.filter(mv => mv.kind !== "crown" && mv.id != null && !mv.chute).map(mv => mv.id);
        const poussee = { pusherId: loup.id, cible: [g.r, g.c], de: [loup.r, loup.c], chutes, touches };
        if (anime) {
          queueKayKitActionAnimation(loup.id, "attack", 900, { r: g.r, c: g.c });
          touches.forEach(id => queueKayKitActionAnimation(id, "hurt", 850, { r: loup.r, c: loup.c }));
          chutes.forEach(ch => queueKayKitCharacterFall(ch.id, ch.direction));
        }
        const victime = joueurDuGardien(g);
        appliquerPousseeBloc(plan, dr, dc);
        playSfx("push", { c: loup.c });
        showToast(`Le Loup bondit sur un gardien de ${victime?.name || "?"}${plan.chutes ? " et le fait tomber" : ""} !`);
        return poussee;
      }
      // Version immédiate (pas de plateau 3D, partie en ligne) : même ordre.
      function creaturesLoups() {
        loupsAvancer();
        loupsVivants().forEach(loup => {
          const choix = loupChoixPoussee(loup);
          if (choix) loupPousser(loup, choix, false);
        });
      }
      /** Phase animée : avancées ensemble, puis une poussée par loup, chaque
       *  temps relevé pour le rejeu du tour adverse. Rend false si la partie
       *  a changé entre-temps. */
      async function creaturesLoupsAnimes(partie) {
        const anime = isKayKitBoardActive() && !kaykitReducedMotion();
        const avant = snapshotState();
        const pas = loupsAvancer();
        if (pas.length) {
          if (anime) pas.forEach(p => queueKayKitActionAnimation(p.id, "move", 700, { r: p.vers[0], c: p.vers[1] }, [p.vers], null, p.de));
          renderAll();
          tourAdverseFinDeTour({ type: "loups-pas", pas }, avant);
          await sleep(950);
          if (state !== partie) return false;
        }
        for (const loup of loupsVivants()) {
          if (state.winner !== null) break;
          const choix = loupChoixPoussee(loup);
          if (!choix) continue;
          const avantPoussee = snapshotState();
          const poussee = loupPousser(loup, choix, anime);
          renderAll();
          tourAdverseFinDeTour({ type: "push", ...poussee }, avantPoussee);
          await sleep(poussee.chutes.length ? 1300 : 1000);
          if (state !== partie) return false;
        }
        return true;
      }

      /* Un œuf éclot à la fin de son compte à rebours, qu'il soit sur une
         île ou dans le vide (Taekun, 2026-11-05) : la créature naît sur la
         case de l'œuf, jamais à côté, et agit à la fin du tour même hors
         du sol. Seule une case occupée le fait attendre. */
      function oeufMur(oeuf) {
        return (state?.turn || 1) >= oeuf.eclosion;
      }

      function creaturesCaseNaissance(oeuf) {
        return inside(oeuf.r, oeuf.c) && !characterAt(oeuf.r, oeuf.c) ? [oeuf.r, oeuf.c] : null;
      }

      /** Un nouvel œuf apparaît au hasard sur une case libre de TOUTE la
       *  croix du sanctuaire (sa ligne et sa colonne entières) : sans
       *  gardien, œuf ni couronne, et jamais sur une balise (Taekun,
       *  2026-11-04). */
      function creaturesNouveauxOeufs(etat, nombre) {
        const balises = new Set((state.rotation?.balises || []).map(([r, c]) => key(r, c)));
        const croix = [];
        for (let i = 0; i < GRID; i++) {
          croix.push([CENTER.r, i]);
          if (i !== CENTER.r) croix.push([i, CENTER.c]);
        }
        for (let n = 0; n < nombre; n++) {
          const libres = croix.filter(([r, c]) => !characterAt(r, c) && !looseArtifactAt(r, c) && !balises.has(key(r, c))
            && !etat.oeufs.some(o => o.r === r && o.c === c));
          if (!libres.length) return;
          const [r, c] = libres[Math.floor(gameRandom() * libres.length)];
          etat.prochainOeuf = etat.prochainOeuf || (Math.max(0, ...etat.oeufs.map(o => o.id)) + 1);
          etat.oeufs.push({ id: etat.prochainOeuf++, r, c, eclosion: (state.turn || 1) + CREATURES_COMPTE_RELEVE });
          animateCellPulse(r, c, "crown-burst");
        }
      }

      function creaturesEclore() {
        const etat = state?.rotation?.creatures;
        if (!etat) return false;
        let eclos = false;
        const avant = etat.oeufs.length;
        etat.oeufs = etat.oeufs.filter(oeuf => {
          if (!oeufMur(oeuf)) return true;
          const naissance = creaturesCaseNaissance(oeuf);
          if (!naissance) return true; // case occupée : il attend
          const [r, c] = naissance;
          state.characters.push({ id: `creature-${etat.prochainId++}`, player: -1, creature: etat.espece, r, c });
          animateCellPulse(r, c, "crown-burst");
          showToast(`Un œuf éclot : ${etat.espece === "vase" ? "une Vase" : "un " + CREATURES[etat.espece].nom} apparaît !`);
          eclos = true;
          return false;
        });
        if (eclos) creaturesNouveauxOeufs(etat, avant - etat.oeufs.length);
        return eclos;
      }

      /* Éclosion au rendu : un œuf mûr resté en attente (case occupée) éclot
         dès que sa case se libère. Hors simulation de l'IA. */
      const creaturesRenderBase = renderAll;
      // Phase des loups en cours (fin de tour animée) : l'éclosion attend la fin.
      let creaturesPhaseEnCours = false;
      renderAll = function renderAllCreatures(...args) {
        if (state && !ilyosSimulationActive && !creaturesPhaseEnCours && !tourAdverse.rejeu && creaturesActives() && state.winner === null
          && state.rotation.creatures?.oeufs?.some(oeufMur)) {
          if (creaturesEclore()) syncKayKitScene?.();
        }
        return creaturesRenderBase.apply(this, args);
      };

      /* ---------- Attaque à 3 poussées ----------------------------------
         Une poussée de force 3 ou plus tue toute créature de la file, même
         si elle ne tombe pas. Inscrit dans le plan (comme une chute) pour
         que l'IA et le planner la voient aussi. */
      const CREATURES_FORCE_FATALE = 3;
      const creaturesResoudrePousseeBase = resoudrePousseeBloc;
      resoudrePousseeBloc = function resoudrePousseeBlocCreatures(startR, startC, dr, dc, force) {
        const plan = creaturesResoudrePousseeBase(startR, startC, dr, dc, force);
        if (!plan || Math.floor(force || 1) < CREATURES_FORCE_FATALE || !creaturesActives()) return plan;
        let tues = 0;
        plan.mouvements.forEach(mv => {
          if (mv.kind !== "char" || mv.chute || !characterById(mv.id)?.creature) return;
          mv.chute = true;
          mv.tuee = true;
          tues++;
        });
        if (tues) { plan.chutes += tues; plan.deplaces -= tues; }
        return plan;
      };

      const creaturesAppliquerPousseeBase = appliquerPousseeBloc;
      appliquerPousseeBloc = function appliquerPousseeBlocCreatures(plan, dr, dc) {
        const tuees = (plan?.mouvements || []).filter(mv => mv.tuee);
        if (!tuees.length) return creaturesAppliquerPousseeBase(plan, dr, dc);
        // La base fait « tomber » les chutes : les créatures tuées avancent
        // d'abord normalement, puis sont retirées sur leur case d'arrivée.
        const resultat = creaturesAppliquerPousseeBase({ ...plan, mouvements: plan.mouvements.map(mv => mv.tuee ? { ...mv, chute: false } : mv) }, dr, dc);
        tuees.forEach(mv => {
          const creature = characterById(mv.id);
          if (creature) removeCharacterFromGame(creature, mv.to[0], mv.to[1], null);
        });
        return resultat;
      };

      const creaturesBeginTurnBase = beginTurn;
      beginTurn = function beginTurnCreatures() {
        if (state && creaturesActives() && !ilyosSimulationActive) {
          if (creaturesPhaseEnCours) return;
          creaturesInstaller();
          if (state.turn > 1 && state.winner === null && state.rotation.creatures.dernierTour !== state.turn) {
            state.rotation.creatures.dernierTour = state.turn;
            const n = state.players.length;
            const precedentId = state.players[(state.currentPlayer - 1 + n) % n]?.id;
            creaturesVase(precedentId);
            /* Fin de tour : les loups agissent sous les yeux des joueurs,
               et la pioche du joueur suivant n'arrive qu'après. */
            if (loupsVivants().length && !state.onlineMode) {
              const partie = state;
              state.inputLocked = true;
              creaturesPhaseEnCours = true;
              creaturesLoupsAnimes(partie).catch(erreur => console.warn("[ILYOS] loups", erreur)).then(suite => {
                creaturesPhaseEnCours = false;
                if (state !== partie || suite === false) return;
                const avant = snapshotState();
                if (creaturesEclore()) tourAdverseFinDeTour({ type: "eclosion" }, avant);
                beginTurn();
              });
              return;
            }
            creaturesLoups();
            const avant = snapshotState();
            if (creaturesEclore()) tourAdverseFinDeTour({ type: "eclosion" }, avant);
          }
        }
        const resultat = creaturesBeginTurnBase();
        // Premier tour : state.rotation vient d'être posé par l'enveloppe de base.
        if (state && creaturesActives() && !state.rotation.creatures) {
          creaturesInstaller();
          if (!ilyosSimulationActive) {
            setTimeout(() => showToast("Œufs sur la croix : le chiffre donne les tours avant l’éclosion."), 5200);
            syncKayKitScene?.();
          }
        }
        return resultat;
      };

      /* L'IA prend son butin avant de finir son tour : la meilleure carte
         du marché si elle vaut la peine, sinon l'exil de 2 cartes. */
      function plannerChoisirButin(playerId) {
        if (!creaturesButinEnAttente(playerId)) return null;
        const visibles = state.rotation.marche?.visibles || [];
        let meilleur = -1, note = -Infinity;
        visibles.forEach((action, i) => { const n = PAQUET_PRIORITE[action] ?? 0; if (n > note) { note = n; meilleur = i; } });
        return meilleur >= 0 && note >= 3 ? meilleur : "exil";
      }

      const creaturesEndTurnBase = endTurn;
      endTurn = async function endTurnCreatures(force = false) {
        const player = state && currentPlayer();
        if (player?.isAI && state.winner === null) {
          let garde = 4;
          while (garde-- > 0 && creaturesButinEnAttente(player.id) > 0) {
            if (!creaturesPrendreButin(plannerChoisirButin(player.id))) break;
          }
        }
        return creaturesEndTurnBase(force);
      };

      /* ---------- Rendu 3D des œufs -------------------------------------- */
      const creaturesTexturesChiffres = new Map();
      function creaturesTextureChiffre(n) {
        if (creaturesTexturesChiffres.has(n)) return creaturesTexturesChiffres.get(n);
        const toile = document.createElement("canvas");
        toile.width = toile.height = 64;
        const ctx = toile.getContext("2d");
        /* Peint sur la coquille : chiffre brun, liseré crème, sans pastille. */
        ctx.font = "bold 46px Georgia, serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(255,248,230,.9)"; ctx.lineWidth = 6;
        ctx.strokeText(String(n), 32, 35);
        ctx.fillStyle = "#3b1f08";
        ctx.fillText(String(n), 32, 35);
        const texture = new THREE.CanvasTexture(toile);
        creaturesTexturesChiffres.set(n, texture);
        return texture;
      }

      /* Œuf couché sur un nid ROND cerclé d'or : la forme
         ronde ne se confond pas avec une case de sol
         (Taekun, 2026-11-03). Tout est opaque : la transparence brouillait
         la case. */
      function creaturesConstruireOeuf() {
        const groupe = new THREE.Group();
        const nid = new THREE.Mesh(
          kaykitGeometry("rotation-oeuf-nid-rond", () => new THREE.CylinderGeometry(.36, .38, .06, 32)),
          new THREE.MeshStandardMaterial({ color: 0x2f241b, roughness: .95, metalness: 0 })
        );
        nid.position.y = .03;
        const bord = new THREE.Mesh(
          kaykitGeometry("rotation-oeuf-bord-rond", () => new THREE.TorusGeometry(.38, .035, 8, 40)),
          new THREE.MeshStandardMaterial({ color: 0xe9cf8e, roughness: .6, metalness: .1 })
        );
        bord.rotation.x = Math.PI / 2;
        bord.position.y = .06;
        const coquille = new THREE.Mesh(
          kaykitGeometry("rotation-oeuf-v1", () => new THREE.SphereGeometry(.17, 18, 14)),
          new THREE.MeshStandardMaterial({ color: 0xf3e3c0, roughness: .55, metalness: 0, emissive: 0x3a2a10, emissiveIntensity: .25 })
        );
        // Couché : le grand axe à plat, posé dans le nid.
        coquille.scale.set(1.75, 1.25, 1.3);
        coquille.position.y = .06 + .2;
        const taches = new THREE.Mesh(
          kaykitGeometry("rotation-oeuf-taches-v1", () => new THREE.SphereGeometry(.172, 9, 7)),
          new THREE.MeshBasicMaterial({ color: 0xc9b07c, wireframe: true })
        );
        taches.scale.copy(coquille.scale);
        taches.position.copy(coquille.position);
        const chiffre = new THREE.Sprite(new THREE.SpriteMaterial({ map: creaturesTextureChiffre(0), depthTest: false, transparent: true }));
        chiffre.scale.set(.3, .3, 1);
        chiffre.position.y = coquille.position.y + .02;
        chiffre.renderOrder = 20;
        groupe.add(coquille, taches, chiffre, nid, bord);
        groupe.userData.chiffre = chiffre;
        groupe.traverse(o => { o.raycast = () => {}; });
        return groupe;
      }

      /* Chiffre du compte à rebours ; mûr : coquille rouge braise qui luit,
         plus de chiffre. */
      function creaturesHabillerOeuf(visuel, oeuf) {
        const n = oeufManches(oeuf);
        if (visuel.userData.n !== n) {
          visuel.userData.n = n;
          visuel.userData.chiffre.material.map = creaturesTextureChiffre(n);
          visuel.userData.chiffre.material.needsUpdate = true;
        }
        const mur = oeufMur(oeuf);
        if (visuel.userData.mur !== mur) {
          visuel.userData.mur = mur;
          const coquille = visuel.children[0].material;
          coquille.color.setHex(mur ? 0xc8261a : 0xf3e3c0);
          coquille.emissive.setHex(mur ? 0xff3a10 : 0x3a2a10);
          coquille.emissiveIntensity = mur ? .85 : .25;
          visuel.children[1].material.color.setHex(mur ? 0xffd27a : 0xc9b07c);
          visuel.userData.chiffre.visible = !mur;
        }
      }

      function creaturesSyncOeufs3D() {
        if (!kaykit3D?.scene) return;
        const oeufs = creaturesActives() ? (state?.rotation?.creatures?.oeufs || []) : [];
        let groupe = kaykit3D.rotationOeufs;
        if (!oeufs.length) {
          if (groupe) groupe.visible = false;
          return;
        }
        if (!groupe) {
          groupe = new THREE.Group();
          groupe.name = "rotation-oeufs";
          kaykit3D.scene.add(groupe);
          kaykit3D.rotationOeufs = groupe;
        }
        groupe.visible = true;
        const vus = new Set();
        oeufs.forEach(oeuf => {
          vus.add(oeuf.id);
          let visuel = groupe.children.find(o => o.userData.oeufId === oeuf.id);
          if (!visuel) {
            visuel = creaturesConstruireOeuf();
            visuel.userData.oeufId = oeuf.id;
            groupe.add(visuel);
          }
          const y = isLand(oeuf.r, oeuf.c) ? kaykitCellSurfaceY(oeuf.r, oeuf.c) : KAYKIT_LEVELS.islandTop + .014; // case vide : posé sur la grille
          const p = kaykitCellPosition(oeuf.r, oeuf.c, y);
          visuel.position.set(p.x, p.y, p.z);
          creaturesHabillerOeuf(visuel, oeuf);
        });
        [...groupe.children].forEach(o => {
          if (vus.has(o.userData.oeufId)) return;
          groupe.remove(o);
          // Géométries (kaykitGeometry) et chiffres (cache) sont partagés :
          // seuls les matériaux propres à l'œuf sont libérés.
          o.traverse(m => { if (m.material) m.material.dispose(); });
        });
      }

      const creaturesSyncSceneBase = syncKayKitScene;
      syncKayKitScene = function syncKayKitSceneCreatures() {
        creaturesSyncSceneBase();
        try {
          creaturesSyncOeufs3D();
          creaturesTeinter();
        } catch (erreur) {
          console.warn("[ILYOS] œufs 3D", erreur);
        }
      };

      /* ---------- Fantômes (aperçus de poussée et de magie) -------------
         Un œuf poussé ou tourné montre son double à l'arrivée (même œuf,
         même chiffre) ; une créature montre son squelette vert, pas un
         gardien. Points d'extension de kaykit3d.js. */
      function creaturesRendreFantome(objet, opacite) {
        objet.traverse(o => {
          if (!o.material) return;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          const copies = mats.map(m => {
            const copie = m.clone();
            copie.transparent = true;
            copie.opacity = opacite * (m.opacity ?? 1);
            copie.depthWrite = false;
            copie.userData = { ...(copie.userData || {}), ilyosTransient: true };
            return copie;
          });
          o.material = Array.isArray(o.material) ? copies : copies[0];
          o.renderOrder = Math.max(o.renderOrder || 0, 21);
        });
        return objet;
      }
      function oeufParPieceId(id) {
        return (state?.rotation?.creatures?.oeufs || []).find(o => `oeuf-${o.id}` === String(id) || o.id === id) || null;
      }
      const creaturesSpritesFantomes = new Map();
      function creaturesFantomeOeuf(oeuf, r, c, surfaceY, opacite) {
        const visuel = creaturesConstruireOeuf();
        creaturesHabillerOeuf(visuel, oeuf);
        const y = surfaceY ?? (isLand(r, c) ? kaykitCellSurfaceY(r, c) : KAYKIT_LEVELS.islandTop + .014);
        const p = kaykitCellPosition(r, c, y);
        visuel.position.set(p.x, p.y, p.z);
        // Le chiffre (sprite, sans test de profondeur) reste plein. Son
        // matériau est partagé par chiffre : un sprite neuf à chaque survol
        // faisait grossir la mémoire des textures.
        const chiffre = visuel.userData.chiffre;
        visuel.remove(chiffre);
        creaturesRendreFantome(visuel, opacite);
        if (chiffre.visible) {
          const n = oeufManches(oeuf);
          if (!creaturesSpritesFantomes.has(n)) {
            creaturesSpritesFantomes.set(n, new THREE.SpriteMaterial({ map: creaturesTextureChiffre(n), depthTest: false, transparent: true }));
          }
          chiffre.material.dispose();
          chiffre.material = creaturesSpritesFantomes.get(n);
          visuel.add(chiffre);
        }
        return visuel;
      }
      function creaturesFantomeCreature(char, r, c, surfaceY, opacite) {
        const cle = creatureModele(char);
        ensureKayKitAsset(cle);
        const piece = cloneKayKitAsset(cle, { maxWidth: .63, maxHeight: 1.02, targetFloor: 0 });
        if (!piece) return null;
        const p = kaykitCellPosition(r, c, surfaceY ?? kaykitCellSurfaceY(r, c));
        piece.position.set(p.x, p.y, p.z);
        piece.rotation.y = kaykitFacingRotation(r, c, CENTER.r, CENTER.c);
        // Teinte vert de lichen des créatures, sur la copie éphémère.
        creaturesRendreFantome(piece, opacite);
        piece.traverse(o => {
          if (!o.isMesh || !o.material) return;
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
            if (m.color) m.color.multiply(new THREE.Color(0x9fe0a4));
            if (m.emissive) { m.emissive.setHex(0x163a1c); m.emissiveIntensity = .55; }
          });
        });
        return piece;
      }
      const creaturesFantomeBase = kaykitFantomeDuMode;
      kaykitFantomeDuMode = function kaykitFantomeDuModeCreatures(type, id, r, c, options = {}) {
        if (creaturesActives()) {
          const opacite = options.opacity ?? .6;
          if (type === "egg") {
            const oeuf = oeufParPieceId(id);
            if (oeuf) return creaturesFantomeOeuf(oeuf, r, c, options.surfaceY, opacite);
          }
          if (type === "character") {
            const char = characterById(id);
            if (char?.creature) return creaturesFantomeCreature(char, r, c, options.surfaceY, opacite);
          }
        }
        return creaturesFantomeBase(type, id, r, c, options);
      };
      const creaturesObjetsBase = kaykitObjetsDuMode;
      kaykitObjetsDuMode = function kaykitObjetsDuModeCreatures(type, id) {
        if (type === "egg") {
          const oeuf = oeufParPieceId(id);
          const visuel = oeuf && kaykit3D?.rotationOeufs?.children.find(o => o.userData.oeufId === oeuf.id);
          if (visuel) return [visuel];
        }
        return creaturesObjetsBase(type, id);
      };
      /* Magie : les œufs de l'île (hors pivot) partent avec elle. */
      const creaturesMagieDuModeBase = kaykitMagieDuMode;
      kaykitMagieDuMode = function kaykitMagieDuModeCreatures(island, rotation, sol) {
        const res = creaturesMagieDuModeBase(island, rotation, sol);
        if (!creaturesActives() || !island) return res;
        const pivot = Array.isArray(state.selectedMagicPivot) ? state.selectedMagicPivot : null;
        (state.rotation.creatures?.oeufs || []).forEach(oeuf => {
          const i = island.cells.findIndex(([r, c]) => r === oeuf.r && c === oeuf.c);
          if (i < 0 || (pivot && pivot[0] === oeuf.r && pivot[1] === oeuf.c)) return;
          if (!rotation) {
            const visuel = kaykit3D?.rotationOeufs?.children.find(o => o.userData.oeufId === oeuf.id);
            if (visuel) res.masquer.push(visuel);
            return;
          }
          const vers = rotation.absCells?.[i];
          if (!vers || (vers[0] === oeuf.r && vers[1] === oeuf.c)) return;
          res.fantomes.push(creaturesFantomeOeuf(oeuf, vers[0], vers[1], sol, .9));
        });
        return res;
      };

      /* Les créatures sont des squelettes KayKit (choix de Taekun, 01/11) :
         une teinte vert de lichen, faite une fois par modèle, les distingue
         des gardiens, même d'un gardien squelette de la Collection. */
      function creaturesTeinter() {
        creaturesVivantes().forEach(char => {
          const visuel = kaykit3D?.characterVisuals?.get(String(char.id));
          if (!visuel || visuel.teinteCreature) return;
          visuel.teinteCreature = true;
          visuel.wrapper.traverse(o => {
            if (!o.isMesh || !o.material) return;
            const teinter = m => {
              const copie = m.clone();
              if (copie.color) copie.color.multiply(new THREE.Color(0x9fe0a4));
              if (copie.emissive) { copie.emissive.setHex(0x163a1c); copie.emissiveIntensity = .55; }
              return copie;
            };
            o.material = Array.isArray(o.material) ? o.material.map(teinter) : teinter(o.material);
          });
        });
      }

      /* Modèle 3D d'une créature (kaykit3d.js, resolveHeroAssetKey). */
      function creatureModele(char) {
        return CREATURES[char?.creature]?.modele || "heroSkeletonWarrior";
      }

      window.ILYOS_ROTATION_CREATURES = {
        etat: () => (state?.rotation?.creatures ? JSON.parse(JSON.stringify(state.rotation.creatures)) : null),
        vivantes: () => creaturesVivantes().map(c => ({ id: c.id, espece: c.creature, r: c.r, c: c.c })),
        butin: choix => creaturesPrendreButin(choix),
        /* Banc : poser un gardien sur une case (tests de poussée d'œuf). */
        placer: (charId, r, c, joueur = null) => {
          let g = characterById(charId);
          if (!g && joueur !== null) { g = { id: charId, player: joueur, r, c }; state.characters.push(g); }
          if (!g) return false;
          g.r = r; g.c = c;
          renderAll(); syncKayKitScene?.();
          return true;
        },
        /* Banc : faire naître un loup sur une case (phase des loups). */
        loup: (r, c) => {
          const etat = state?.rotation?.creatures;
          if (!etat) return null;
          const id = `creature-${etat.prochainId++}`;
          state.characters.push({ id, player: -1, creature: "loup", r, c });
          renderAll(); syncKayKitScene?.();
          return id;
        },
        /* Banc : étapes que le rejeu du tour adverse montrerait. */
        rejeu: () => tourAdverse.aRevoir.map(e => `${e.type}${e.fin ? "*" : ""}:${e.joueur}`),
        revoir: () => tourAdverseRevoir(),
        pioche: () => (state?.players || []).map(j => (j.hand || []).length),
        main: (joueur, actions) => {
          const j = state?.players?.[joueur];
          if (!j) return false;
          j.hand = actions.map((action, i) => ({ id: `banc-${joueur}-${i}`, action, used: false }));
          renderAll();
          return true;
        },
        /* Banc : déplacer un œuf (aperçus de magie). */
        oeuf: (id, r, c, compte = null) => {
          const o = state?.rotation?.creatures?.oeufs?.find(x => x.id === id);
          if (!o) return false;
          o.r = r; o.c = c;
          if (compte !== null) o.eclosion = (state.turn || 1) + compte;
          renderAll(); syncKayKitScene?.();
          return true;
        },
        /* Banc : mémoire GPU et taille de la scène (recherche de fuites). */
        memoire: () => {
          const info = kaykit3D?.renderer?.info;
          let objets = 0;
          kaykit3D?.scene?.traverse(() => { objets++; });
          return info ? { geometries: info.memory.geometries, textures: info.memory.textures, programmes: info.programs?.length || 0, appels: info.render.calls, objets } : null;
        },
        /* Banc : position à l'écran d'une case (survols simulés). */
        ecran: (r, c) => {
          const canvas = kaykit3D?.renderer?.domElement;
          if (!kaykit3D?.camera || !canvas) return null;
          const p = kaykitCellPosition(r, c, kaykitCellSurfaceY(r, c));
          const v = new THREE.Vector3(p.x, p.y, p.z).project(kaykit3D.camera);
          const rect = canvas.getBoundingClientRect();
          return { x: rect.left + (v.x * .5 + .5) * rect.width, y: rect.top + (-v.y * .5 + .5) * rect.height };
        },
        /* Banc : poser des cartes sur le dessus de la pioche (prochaine pioche). */
        dessus: (joueur, actions) => {
          const j = state?.players?.[joueur];
          if (!j) return false;
          actions.forEach((action, i) => j.deck.push({ id: `banc-d${joueur}-${i}`, action, used: false }));
          return true;
        }
      };
