      /* =====================================================================
         MODE ROTATION — couche CRÉATURES ET ŒUFS.

         Règles (une ligne chacune) :
         — Dès la mise en place, 4 œufs sont posés sur la croix centrale, à
           2 cases du sanctuaire, chacun avec le nombre de manches avant son
           éclosion. Ils éclosent à tour de rôle entre les deux joueurs.
         — L'œuf éclot toujours au tour annoncé : sur sa case si elle est
           une île libre, sinon sur la case d'île libre la plus proche.
         — Un gardien qui finit son tour sur un œuf l'écrase (avec le
           deckbuilding : il exile un Déplacer).
         — Une seule espèce par partie :
             Loup : à chaque fin de manche, il avance d'une case vers le
             gardien le plus proche ; s'il le touche déjà, il le pousse.
             Vase : immobile ; un gardien qui finit son tour à côté d'elle
             met une carte Boue (qui ne fait rien) dans la défausse de son
             joueur.
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
        loup: { nom: "Loup", modele: "heroSkeletonRogue" },
        vase: { nom: "Vase", modele: "heroSkeletonMage" }
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

      /** Manches restantes avant l'éclosion (chiffre affiché sur l'œuf). */
      function oeufManches(oeuf) {
        return Math.max(0, Math.ceil((oeuf.eclosion - (state?.turn || 1)) / 2));
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
      function creaturesEcraserOeufs(precedentId) {
        const etat = state.rotation.creatures;
        etat.oeufs = etat.oeufs.filter(oeuf => {
          const g = characterAt(oeuf.r, oeuf.c);
          if (!g || g.creature || g.player !== precedentId) return true;
          const joueur = state.players[precedentId];
          const exile = paquetActif() && joueur ? creaturesExiler(joueur, 1) : 0;
          showToast(`${joueur?.name || "Un gardien"} écrase un œuf${exile ? " et exile une carte" : ""}.`);
          animateCellPulse(oeuf.r, oeuf.c, "crown-burst");
          return false;
        });
      }

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

      /* Case de naissance : l'œuf lui-même s'il est sur une île libre,
         sinon la case d'île libre la plus proche (au plus près du centre à
         égalité). L'éclosion a toujours lieu au tour annoncé. */
      function creaturesCaseNaissance(oeuf) {
        if (islandAt(oeuf.r, oeuf.c) && !characterAt(oeuf.r, oeuf.c)) return [oeuf.r, oeuf.c];
        let meilleure = null, note = Infinity;
        for (let r = 0; r < GRID; r++) {
          for (let c = 0; c < GRID; c++) {
            if (!islandAt(r, c) || characterAt(r, c)) continue;
            const n = (Math.abs(r - oeuf.r) + Math.abs(c - oeuf.c)) * 100 + Math.abs(r - CENTER.r) + Math.abs(c - CENTER.c);
            if (n < note) { note = n; meilleure = [r, c]; }
          }
        }
        return meilleure;
      }

      function creaturesEclore() {
        const etat = state.rotation.creatures;
        etat.oeufs = etat.oeufs.filter(oeuf => {
          if (state.turn < oeuf.eclosion) return true;
          const naissance = creaturesCaseNaissance(oeuf);
          if (!naissance) return true; // aucune case d'île libre : il attend
          const [r, c] = naissance;
          state.characters.push({ id: `creature-${etat.prochainId++}`, player: -1, creature: etat.espece, r, c });
          animateCellPulse(r, c, "crown-burst");
          showToast(`Un œuf éclot : ${etat.espece === "vase" ? "une Vase" : "un " + CREATURES[etat.espece].nom} apparaît !`);
          return false;
        });
      }

      const creaturesBeginTurnBase = beginTurn;
      beginTurn = function beginTurnCreatures() {
        if (state && creaturesActives() && !ilyosSimulationActive) {
          creaturesInstaller();
          if (state.turn > 1 && state.winner === null && state.rotation.creatures.dernierTour !== state.turn) {
            state.rotation.creatures.dernierTour = state.turn;
            const n = state.players.length;
            const precedentId = state.players[(state.currentPlayer - 1 + n) % n]?.id;
            creaturesEcraserOeufs(precedentId);
            creaturesVase(precedentId);
            // Fin de manche : la créature agit quand le premier joueur reprend la main.
            if (state.currentPlayer === 0) creaturesLoups();
            creaturesEclore();
          }
        }
        const resultat = creaturesBeginTurnBase();
        // Premier tour : state.rotation vient d'être posé par l'enveloppe de base.
        if (state && creaturesActives() && !state.rotation.creatures) {
          creaturesInstaller();
          if (!ilyosSimulationActive) {
            setTimeout(() => showToast("Œufs sur la croix : le chiffre donne les manches avant l’éclosion."), 5200);
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

      function creaturesConstruireOeuf() {
        const groupe = new THREE.Group();
        const coquille = new THREE.Mesh(
          kaykitGeometry("rotation-oeuf-v1", () => new THREE.SphereGeometry(.17, 18, 14)),
          new THREE.MeshStandardMaterial({ color: 0xf3e3c0, roughness: .55, metalness: 0, emissive: 0x3a2a10, emissiveIntensity: .25 })
        );
        coquille.scale.set(1, 1.32, 1);
        coquille.position.y = .22;
        const taches = new THREE.Mesh(
          kaykitGeometry("rotation-oeuf-taches-v1", () => new THREE.SphereGeometry(.172, 9, 7)),
          new THREE.MeshBasicMaterial({ color: 0x6a8f5a, wireframe: true, transparent: true, opacity: .35 })
        );
        taches.scale.copy(coquille.scale);
        taches.position.copy(coquille.position);
        const chiffre = new THREE.Sprite(new THREE.SpriteMaterial({ map: creaturesTextureChiffre(0), depthTest: false, transparent: true }));
        chiffre.scale.set(.3, .3, 1);
        chiffre.position.y = .23; // au centre de la coquille
        chiffre.renderOrder = 20;
        groupe.add(coquille, taches, chiffre);
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
          visuel.children[0].material.opacity = surIle ? 1 : .7;
          visuel.children[0].material.transparent = !surIle;
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
        butin: choix => creaturesPrendreButin(choix)
      };
