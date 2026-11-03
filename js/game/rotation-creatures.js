      /* =====================================================================
         MODE ROTATION — couche CRÉATURES ET ŒUFS.

         Règles (une ligne chacune) :
         — Dès la mise en place, 4 œufs sont posés sur la croix centrale, à
           2 cases du sanctuaire, chacun avec le nombre de tours avant son
           éclosion. Chaque fin de tour retire 1 à TOUS les œufs.
         — À zéro, l'œuf est mûr (il change de couleur) et éclot dès qu'une
           île est sous lui : la créature naît sur la case de l'œuf.
         — Un œuf se pousse comme une couronne au sol, mais il flotte : il
           survole le vide sans tomber et s'arrête au bord du plateau.
         — Une poussée de force 3 ou plus tue la créature, même sans chute.
         — Un œuf bloque sa case : un gardien peut le traverser, jamais
           s'y arrêter en se déplaçant.
         — Une seule espèce par partie :
             Loup : à chaque fin de tour, il avance d'une case vers le
             gardien le plus proche ; s'il le touche déjà, il le pousse.
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
      /* Tours d'éclosion (un tour = le tour d'un joueur) : alternés, pour que
         personne n'ait toujours la première action sur les créatures. */
      const CREATURES_ECLOSIONS = [5, 6, 11, 12];

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
          oeufs: cases.map(([r, c], i) => ({ id: i + 1, r, c, eclosion: CREATURES_ECLOSIONS[ordre[i]] })),
          prochainId: 1,
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

      /** Loup : un pas vers le gardien le plus proche, ou une poussée. */
      function creaturesLoups() {
        creaturesVivantes().filter(c => c.creature === "loup").forEach(loup => {
          if (!characterById(loup.id)) return;
          const proies = (state.characters || []).filter(g => !g.creature);
          if (!proies.length) return;
          const dist = (g, r = loup.r, c = loup.c) => Math.abs(g.r - r) + Math.abs(g.c - c);
          const cible = proies.reduce((a, b) => (dist(b) < dist(a) ? b : a));
          if (dist(cible) === 1) {
            const dr = cible.r - loup.r, dc = cible.c - loup.c;
            const plan = resoudrePousseeBloc(cible.r, cible.c, dr, dc, 1);
            if (plan) {
              const victime = joueurDuGardien(cible);
              appliquerPousseeBloc(plan, dr, dc);
              playSfx("push", { c: loup.c });
              showToast(`Le Loup bondit sur un gardien de ${victime?.name || "?"}${plan.chutes ? " et le fait tomber" : ""} !`);
            }
            return;
          }
          const pas = [[-1, 0], [1, 0], [0, -1], [0, 1]]
            .map(([dr, dc]) => [loup.r + dr, loup.c + dc])
            .filter(([r, c]) => inside(r, c) && islandAt(r, c) && !characterAt(r, c))
            .sort((a, b) => dist(cible, a[0], a[1]) - dist(cible, b[0], b[1]));
          if (pas.length && dist(cible, pas[0][0], pas[0][1]) < dist(cible)) {
            loup.r = pas[0][0];
            loup.c = pas[0][1];
          }
        });
      }

      /* Un œuf « mûr » (compte à zéro) change de couleur et éclot dès
         qu'une île est sous lui : la créature naît sur la case de l'œuf,
         jamais à côté. Sans île dessous (ou case occupée), il attend. */
      function oeufMur(oeuf) {
        return (state?.turn || 1) >= oeuf.eclosion;
      }

      function creaturesCaseNaissance(oeuf) {
        return islandAt(oeuf.r, oeuf.c) && !characterAt(oeuf.r, oeuf.c) ? [oeuf.r, oeuf.c] : null;
      }

      function creaturesEclore() {
        const etat = state?.rotation?.creatures;
        if (!etat) return false;
        let eclos = false;
        etat.oeufs = etat.oeufs.filter(oeuf => {
          if (!oeufMur(oeuf)) return true;
          const naissance = creaturesCaseNaissance(oeuf);
          if (!naissance) return true; // pas d'île dessous : il attend
          const [r, c] = naissance;
          state.characters.push({ id: `creature-${etat.prochainId++}`, player: -1, creature: etat.espece, r, c });
          animateCellPulse(r, c, "crown-burst");
          showToast(`Un œuf éclot : ${etat.espece === "vase" ? "une Vase" : "un " + CREATURES[etat.espece].nom} apparaît !`);
          eclos = true;
          return false;
        });
        return eclos;
      }

      /* Éclosion immédiate : après chaque action (île posée, île tournée),
         un œuf mûr qui touche désormais une île éclot sans attendre le tour
         suivant. Vérifié au rendu, hors simulation de l'IA. */
      const creaturesRenderBase = renderAll;
      renderAll = function renderAllCreatures(...args) {
        if (state && !ilyosSimulationActive && creaturesActives() && state.winner === null
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
          creaturesInstaller();
          if (state.turn > 1 && state.winner === null && state.rotation.creatures.dernierTour !== state.turn) {
            state.rotation.creatures.dernierTour = state.turn;
            const n = state.players.length;
            const precedentId = state.players[(state.currentPlayer - 1 + n) % n]?.id;
            creaturesVase(precedentId);
            // Fin de tour : la créature agit à chaque tour, pas seulement par manche.
            creaturesLoups();
            creaturesEclore();
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

      /* Œuf couché sur un nid carré qui remplit sa case : on lit d'un coup
         d'œil sur QUELLE case il se trouve, même au-dessus du vide. Tout est
         opaque (Taekun, 2026-11-03 : la transparence brouillait la case). */
      function creaturesConstruireOeuf() {
        const groupe = new THREE.Group();
        const nid = new THREE.Mesh(
          kaykitGeometry("rotation-oeuf-nid-v2", () => new THREE.BoxGeometry(.84, .05, .84)),
          new THREE.MeshStandardMaterial({ color: 0x2f241b, roughness: .95, metalness: 0 })
        );
        nid.position.y = .025;
        const bord = new THREE.Mesh(
          kaykitGeometry("rotation-oeuf-bord-v2", () => new THREE.BoxGeometry(.9, .03, .9)),
          new THREE.MeshStandardMaterial({ color: 0xe9cf8e, roughness: .6, metalness: .1 })
        );
        bord.position.y = .012;
        const coquille = new THREE.Mesh(
          kaykitGeometry("rotation-oeuf-v1", () => new THREE.SphereGeometry(.17, 18, 14)),
          new THREE.MeshStandardMaterial({ color: 0xf3e3c0, roughness: .55, metalness: 0, emissive: 0x3a2a10, emissiveIntensity: .25 })
        );
        // Couché : le grand axe à plat, posé dans le nid.
        coquille.scale.set(1.75, 1.25, 1.3);
        coquille.position.y = .05 + .2;
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
          const surIle = !!islandAt(oeuf.r, oeuf.c);
          const y = surIle ? kaykitCellSurfaceY(oeuf.r, oeuf.c) : KAYKIT_LEVELS.islandTop + .014; // case vide : posé sur la grille
          const p = kaykitCellPosition(oeuf.r, oeuf.c, y);
          visuel.position.set(p.x, p.y, p.z);
          const n = oeufManches(oeuf);
          if (visuel.userData.n !== n) {
            visuel.userData.n = n;
            visuel.userData.chiffre.material.map = creaturesTextureChiffre(n);
            visuel.userData.chiffre.material.needsUpdate = true;
          }
          /* Mûr : coquille rouge braise qui luit, plus de chiffre. */
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
        });
        [...groupe.children].forEach(o => { if (!vus.has(o.userData.oeufId)) groupe.remove(o); });
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
        main: (joueur, actions) => {
          const j = state?.players?.[joueur];
          if (!j) return false;
          j.hand = actions.map((action, i) => ({ id: `banc-${joueur}-${i}`, action, used: false }));
          renderAll();
          return true;
        },
        /* Banc : poser des cartes sur le dessus de la pioche (prochaine pioche). */
        dessus: (joueur, actions) => {
          const j = state?.players?.[joueur];
          if (!j) return false;
          actions.forEach((action, i) => j.deck.push({ id: `banc-d${joueur}-${i}`, action, used: false }));
          return true;
        }
      };
