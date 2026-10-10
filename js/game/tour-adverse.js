      /* =====================================================================
         TOUR ADVERSE : TRACES AU REPOS ET FRISE

         Quand l'ordinateur a joué pendant qu'on regardait ailleurs, il faut
         pouvoir lire son tour d'un coup d'œil, sans texte :
           - des traces fines (arc qui s'estompe vers son départ, pointe à
             l'arrivée) restent au repos au début de notre tour, un chiffre
             discret peint sur la case de départ ; elles s'effacent après
             notre premier coup (déplacement, poussée ou magie) ;
           - une frise horizontale, sous le portrait de l'adversaire, résume
             les étapes ; survoler une étape ne montre que sa trace.

         Les actions réelles passent par les noyaux de règle : on les
         enveloppe, comme defaites-vue.js, et on écarte les explorations du
         planner (état simulé). Seuls les tours d'IA d'une partie locale
         contre au moins un humain sont relevés.
         ===================================================================== */

      const tourAdverse = {
        etat: null,          // objet `state` de la partie relevée
        etapes: [],          // étapes relevées depuis la fin du dernier tour humain
        enregistre: false,   // un tour d'IA est en cours de relevé
        affiche: false,      // traces et frise montrées (tour humain)
        efface: false,       // traces estompées après le premier coup humain
        survol: null,        // étape survolée dans la frise
        groupe: null,
        alphas: new Map(),
        frise: null,
        dansDeplacement: false
      };
      const TOUR_ADVERSE_ORANGE = 0xffa047;
      const TOUR_ADVERSE_OR = 0xffc94a;

      function tourAdverseCouleur(joueur) {
        const brute = state?.players?.[joueur]?.color || PLAYER_COLORS[joueur] || "#a77bff";
        // Un peu éclaircie : la teinte d'équipe brute se perd sur l'herbe.
        return new THREE.Color(brute).lerp(new THREE.Color(0xffffff), .22).getHex();
      }

      function tourAdverseReleve() {
        if (!state || ilyosSimulationActive || !tourAdverse.enregistre || tourAdverse.etat !== state) return false;
        return !!currentPlayer()?.isAI;
      }

      function tourAdverseAjouter(etape) {
        etape.n = tourAdverse.etapes.length + 1;
        etape.joueur = state.currentPlayer;
        tourAdverse.etapes.push(etape);
        return etape;
      }

      /* Premier coup du joueur humain : les traces s'estompent, la frise reste. */
      function tourAdverseCoupHumain() {
        if (ilyosSimulationActive || !tourAdverse.affiche || tourAdverse.efface) return;
        if (currentPlayer()?.isAI) return;
        tourAdverse.efface = true;
      }

      (function tourAdverseEnvelopper() {
        const origine = {
          move: applyMoveCore, push: applyPushCore, magie: applyMagicRotationCore,
          pose: applyIslandPlacementCore, depot: applyFreeDropCore,
          couronne: giveArtifactToCharacter, debut: beginTurn, victoire: showVictory
        };
        applyMoveCore = function (charId, r, c, cost) {
          const releve = tourAdverseReleve();
          let chemin = null, gardien = null;
          if (releve) {
            gardien = characterById(charId);
            if (gardien) {
              try {
                chemin = [[gardien.r, gardien.c], ...(shortestMovementPath(gardien, r, c, Number.isFinite(cost) ? cost : 99) || [[r, c]])];
              } catch (erreur) { chemin = [[gardien.r, gardien.c], [r, c]]; }
            }
          }
          tourAdverse.dansDeplacement = true;
          let resultat;
          try { resultat = origine.move.apply(this, arguments); } finally { tourAdverse.dansDeplacement = false; }
          if (resultat && releve && chemin) {
            tourAdverseAjouter({ type: "move", charId, chemin, couronne: !!artifactCarriedBy(charId) });
          } else if (resultat) tourAdverseCoupHumain();
          return resultat;
        };
        applyPushCore = function (pusherId, r, c, force) {
          const releve = tourAdverseReleve();
          let plan = null;
          if (releve) {
            const p = characterById(pusherId);
            try { plan = p ? resoudrePousseeBloc(r, c, r - p.r, c - p.c, force) : null; } catch (erreur) { plan = null; }
          }
          const resultat = origine.push.apply(this, arguments);
          if (resultat && releve && plan) {
            const fleches = plan.mouvements
              .map(mv => ({ de: mv.from, vers: mv.chute && mv.vide ? mv.vide : mv.to, couronne: mv.kind === "crown" || !!artifactCarriedBy(mv.id) }))
              .filter(f => f.de[0] !== f.vers[0] || f.de[1] !== f.vers[1]);
            if (fleches.length) tourAdverseAjouter({ type: "push", depart: [r, c], fleches, couronne: fleches.some(f => f.couronne) });
          } else if (resultat) tourAdverseCoupHumain();
          return resultat;
        };
        applyMagicRotationCore = function (islandId) {
          const releve = tourAdverseReleve();
          const ile = releve ? (state.islands || []).find(i => i.id === islandId) : null;
          const avant = ile ? ile.cells.map(([r, c]) => [r, c]) : null;
          const resultat = origine.magie.apply(this, arguments);
          if (resultat && releve && ile) {
            tourAdverseAjouter({ type: "magie", avant, apres: ile.cells.map(([r, c]) => [r, c]) });
          } else if (resultat) tourAdverseCoupHumain();
          return resultat;
        };
        applyIslandPlacementCore = function (shapeKey, cells) {
          const releve = tourAdverseReleve();
          const resultat = origine.pose.apply(this, arguments);
          if (resultat && releve) {
            const ou = Array.isArray(resultat.gardienCase) ? resultat.gardienCase : (cells || [])[0];
            if (ou) tourAdverseAjouter({ type: "pose", depart: [ou[0], ou[1]] });
          }
          return resultat;
        };
        applyFreeDropCore = function (charId, r, c) {
          const releve = tourAdverseReleve();
          const g = releve ? characterById(charId) : null;
          const de = g ? [g.r, g.c] : null;
          const resultat = origine.depot.apply(this, arguments);
          if (resultat && releve && de) tourAdverseAjouter({ type: "couronne", de, vers: [r, c] });
          return resultat;
        };
        giveArtifactToCharacter = function (artifact, char) {
          const releve = tourAdverseReleve();
          const precedent = artifact && artifact.carrierId != null ? characterById(artifact.carrierId) : null;
          const de = precedent ? [precedent.r, precedent.c] : null;
          const resultat = origine.couronne.apply(this, arguments);
          if (resultat && releve && char && !tourAdverse.dansDeplacement) {
            if (de && precedent.id !== char.id) {
              tourAdverseAjouter({ type: "couronne", de, vers: [char.r, char.c] });
            } else {
              // Ramassage sur place : il couronne l'étape de ce gardien.
              const derniere = tourAdverse.etapes[tourAdverse.etapes.length - 1];
              if (derniere && derniere.charId === char.id) derniere.couronne = true;
            }
          }
          return resultat;
        };
        beginTurn = function () {
          const resultat = origine.debut.apply(this, arguments);
          try { tourAdverseDebutTour(); } catch (erreur) { console.warn("[ILYOS] tour adverse", erreur); }
          return resultat;
        };
        showVictory = function () {
          tourAdverseEffacer();
          return origine.victoire.apply(this, arguments);
        };
      })();

      function tourAdverseDebutTour() {
        if (!state || state.winner !== null || state.tutorial || state.puzzle || state.onlineMode
          || !(state.players || []).some(j => !j.isAI)) {
          tourAdverseEffacer();
          return;
        }
        if (tourAdverse.etat !== state) tourAdverseEffacer();
        tourAdverse.etat = state;
        if (currentPlayer()?.isAI) {
          // Premier tour d'IA après un tour humain : on repart d'une frise vide.
          if (!tourAdverse.enregistre) {
            tourAdverseEffacer();
            tourAdverse.etat = state;
            tourAdverse.enregistre = true;
          }
          return;
        }
        tourAdverse.enregistre = false;
        if (!tourAdverse.etapes.length) { tourAdverseEffacer(); return; }
        tourAdverse.affiche = true;
        tourAdverse.efface = false;
        tourAdverse.survol = null;
        tourAdverseTracer();
        tourAdverseFrise();
      }

      function tourAdverseEffacer() {
        tourAdverse.etapes = [];
        tourAdverse.enregistre = false;
        tourAdverse.affiche = false;
        tourAdverse.efface = false;
        tourAdverse.survol = null;
        tourAdverse.alphas.clear();
        if (tourAdverse.groupe) clearKayKitGroup(tourAdverse.groupe);
        tourAdverse.frise?.remove();
        tourAdverse.frise = null;
      }

      /* --- Traces 3D --------------------------------------------------------- */

      function tourAdverseGroupe() {
        if (!kaykit3D?.fxGroup || typeof THREE === "undefined") return null;
        let groupe = tourAdverse.groupe;
        if (!groupe || groupe.parent !== kaykit3D.fxGroup) {
          groupe = new THREE.Group();
          groupe.name = "ilyos-tour-adverse";
          kaykit3D.fxGroup.add(groupe);
          tourAdverse.groupe = groupe;
        }
        return groupe;
      }

      function tourAdverseTracer() {
        const racine = tourAdverseGroupe();
        if (!racine) return;
        clearKayKitGroup(racine);
        tourAdverse.alphas.clear();
        if (!isKayKitBoardActive()) return;
        const transitoire = objet => {
          objet.userData = { ...(objet.userData || {}), ilyosTransient: true };
          return objet;
        };
        const surface = (r, c) => {
          let y;
          try { y = kaykitCellSurfaceY(r, c); } catch (erreur) { y = KAYKIT_LEVELS.board + .014; }
          const p = kaykitCellPosition(r, c, y);
          return new THREE.Vector3(p.x, p.y, p.z);
        };
        /* Le dégradé le long de l'arc (uv.x) : invisible au départ, franc à
           l'arrivée. Un seul programme partagé par toutes les traces. Sans
           test de profondeur : une poussée courte vue de face se cachait
           derrière le bord de l'île (vérifié en capture). */
        const degrade = (couleur, alpha) => {
          const m = new THREE.ShaderMaterial({
            transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
            uniforms: { couleur: { value: new THREE.Color(couleur) }, alpha: { value: alpha } },
            vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
            fragmentShader: "uniform vec3 couleur; uniform float alpha; varying vec2 vUv; void main(){ float a = smoothstep(0.0, 0.3, vUv.x); gl_FragColor = vec4(couleur, a * alpha); }"
          });
          m.userData.ilyosBase = alpha;
          return transitoire(m);
        };
        const basique = (couleur, alpha, map = null) => {
          const m = new THREE.MeshBasicMaterial({
            color: map ? 0xffffff : couleur, map, transparent: true, opacity: alpha, depthWrite: false,
            // L'arc passe devant le relief et les gardiens ; le chiffre reste posé au sol.
            depthTest: !!map,
            toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2
          });
          m.userData.ilyosBase = alpha;
          return transitoire(m);
        };
        const clair = couleur => new THREE.Color(couleur).lerp(new THREE.Color(0xffffff), .5).getHex();
        const police = (getComputedStyle(document.documentElement).getPropertyValue("--font-ilyos-display") || "").trim() || "Georgia, serif";
        const hex = n => "#" + n.toString(16).padStart(6, "0");
        const marques = new Map();

        const arc = (groupe, cellules, couleur, hauteur) => {
          const v = cellules.map(([r, c]) => surface(r, c));
          if (v.length < 2) return;
          const total = v.length - 1;
          const cp = v.map((q, i) => q.clone().add(new THREE.Vector3(0, .08 + Math.sin(Math.PI * i / total) * hauteur, 0)));
          const courbe = cp.length > 2
            ? new THREE.CatmullRomCurve3(cp, false, "centripetal")
            : new THREE.QuadraticBezierCurve3(cp[0], cp[0].clone().lerp(cp[1], .5).add(new THREE.Vector3(0, hauteur, 0)), cp[1]);
          const L = courbe.getLength();
          if (L < .7) return;
          const debut = .3 / L, fin = 1 - .28 / L;
          const pts = [];
          for (let i = 0; i <= 64; i++) pts.push(courbe.getPointAt(debut + (fin - debut) * i / 64));
          const lisse = new THREE.CatmullRomCurve3(pts);
          const halo = new THREE.Mesh(transitoire(new THREE.TubeGeometry(lisse, 96, .05, 10)), degrade(couleur, .38));
          const coeur = new THREE.Mesh(transitoire(new THREE.TubeGeometry(lisse, 96, .02, 8)), degrade(clair(couleur), 1));
          halo.renderOrder = 110; coeur.renderOrder = 111;
          const pointe = new THREE.Mesh(transitoire(new THREE.ConeGeometry(.06, .16, 14)), basique(clair(couleur), 1));
          pointe.position.copy(pts[64]);
          pointe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pts[64].clone().sub(pts[60]).normalize());
          pointe.renderOrder = 112;
          groupe.add(halo, coeur, pointe);
        };
        // Chiffre peint sur la case de départ, dans un cercle fin.
        const chiffre = (groupe, [r, c], n, couleur) => {
          const toile = document.createElement("canvas");
          toile.width = toile.height = 256;
          const g = toile.getContext("2d");
          const halo = g.createRadialGradient(128, 128, 20, 128, 128, 112);
          halo.addColorStop(0, hex(couleur) + "40"); halo.addColorStop(1, hex(couleur) + "00");
          g.fillStyle = halo; g.beginPath(); g.arc(128, 128, 112, 0, 7); g.fill();
          g.fillStyle = "rgba(24,14,46,.62)"; g.beginPath(); g.arc(128, 128, 78, 0, 7); g.fill();
          g.lineWidth = 11; g.strokeStyle = hex(couleur); g.beginPath(); g.arc(128, 128, 82, 0, 7); g.stroke();
          g.font = `600 100px ${police}`; g.textAlign = "center"; g.textBaseline = "middle";
          g.lineWidth = 10; g.strokeStyle = "rgba(25,14,48,.55)"; g.strokeText(String(n), 128, 136);
          g.fillStyle = "#fff"; g.fillText(String(n), 128, 136);
          const texture = transitoire(new THREE.CanvasTexture(toile));
          texture.anisotropy = 8;
          const cle = `${r},${c}`;
          const deja = marques.get(cle) || 0;
          marques.set(cle, deja + 1);
          const taille = deja ? .42 : .66;
          const decal = new THREE.Mesh(transitoire(new THREE.PlaneGeometry(taille, taille)), basique(0xffffff, 1, texture));
          decal.rotation.x = -Math.PI / 2;
          decal.position.copy(surface(r, c)).add(new THREE.Vector3(deja ? .24 : 0, .02, deja ? -.24 : 0));
          decal.renderOrder = 104;
          groupe.add(decal);
        };
        const centre = cellules => {
          const r = cellules.reduce((s, x) => s + x[0], 0) / cellules.length;
          const c = cellules.reduce((s, x) => s + x[1], 0) / cellules.length;
          return [Math.round(r), Math.round(c)];
        };

        for (const e of tourAdverse.etapes) {
          const groupe = new THREE.Group();
          groupe.userData.etape = e.n;
          const couleur = tourAdverseCouleur(e.joueur);
          if (e.type === "move") {
            arc(groupe, e.chemin, couleur, .5);
            chiffre(groupe, e.chemin[0], e.n, couleur);
          } else if (e.type === "push") {
            e.fleches.forEach(f => arc(groupe, [f.de, f.vers], TOUR_ADVERSE_ORANGE, .5));
            chiffre(groupe, e.depart, e.n, TOUR_ADVERSE_ORANGE);
          } else if (e.type === "magie") {
            const de = centre(e.avant), vers = centre(e.apres);
            if (de[0] !== vers[0] || de[1] !== vers[1]) arc(groupe, [de, vers], couleur, .7);
            chiffre(groupe, de, e.n, couleur);
          } else if (e.type === "pose") {
            chiffre(groupe, e.depart, e.n, couleur);
          } else if (e.type === "couronne") {
            arc(groupe, [e.de, e.vers], TOUR_ADVERSE_OR, .5);
            chiffre(groupe, e.de, e.n, TOUR_ADVERSE_OR);
          }
          groupe.visible = false;
          racine.add(groupe);
          tourAdverse.alphas.set(e.n, 0);
        }
      }

      /* Appelée par la boucle de rendu : fondu de chaque étape vers sa cible. */
      function animerTourAdverseKayKit(maintenant) {
        const racine = tourAdverse.groupe;
        if (!racine || !racine.children.length) return;
        const precedent = tourAdverse.dernierInstant || maintenant;
        tourAdverse.dernierInstant = maintenant;
        const pas = Math.min(.1, (maintenant - precedent) / 1000);
        for (const groupe of racine.children) {
          const n = groupe.userData.etape;
          const cible = !tourAdverse.affiche ? 0
            : tourAdverse.survol !== null ? (tourAdverse.survol === n ? 1 : 0)
              : tourAdverse.efface ? 0 : 1;
          const actuel = tourAdverse.alphas.get(n) || 0;
          if (actuel === cible) continue;
          // Apparition vive, effacement lent : on voit la trace partir.
          const vitesse = cible > actuel ? 4 : (tourAdverse.survol !== null ? 4 : .9);
          const suivant = cible > actuel ? Math.min(cible, actuel + pas * vitesse) : Math.max(cible, actuel - pas * vitesse);
          tourAdverse.alphas.set(n, suivant);
          groupe.visible = suivant > .005;
          groupe.traverse(objet => {
            const m = objet.material;
            if (!m || m.userData.ilyosBase === undefined) return;
            if (m.uniforms?.alpha) m.uniforms.alpha.value = m.userData.ilyosBase * suivant;
            else m.opacity = m.userData.ilyosBase * suivant;
          });
        }
      }

      /* --- Frise ------------------------------------------------------------ */

      const TOUR_ADVERSE_ICONES = {
        move: '<svg viewBox="0 0 128 128"><g fill="#fff"><ellipse cx="48" cy="50" rx="10" ry="17" transform="rotate(-20 48 50)"/><circle cx="56" cy="76" r="7"/><ellipse cx="80" cy="64" rx="10" ry="17" transform="rotate(20 80 64)"/><circle cx="72" cy="90" r="7"/></g></svg>',
        push: '<svg viewBox="0 0 128 128"><g stroke="#fff" stroke-linecap="round" fill="#fff"><line x1="34" y1="64" x2="80" y2="64" stroke-width="10"/><path d="M98 64 72 44v40z" stroke="none"/><line x1="38" y1="44" x2="26" y2="36" stroke-width="6"/><line x1="38" y1="84" x2="26" y2="92" stroke-width="6"/></g></svg>',
        magie: '<svg viewBox="0 0 128 128"><g fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round"><path d="M92 54a30 30 0 1 0 2 22"/></g><path d="M100 34v28H72z" fill="#fff"/></svg>',
        pose: '<svg viewBox="0 0 128 128"><g fill="#fff"><path d="M30 58h68l-10 20H40z"/><path d="M44 82h40l-20 22z" opacity=".75"/><circle cx="64" cy="42" r="10"/></g></svg>',
        couronne: '<svg viewBox="0 0 128 128"><path d="M34 88 30 44l18 16 16-24 16 24 18-16-4 44z" fill="#ffc94a"/></svg>'
      };

      function tourAdverseStyle() {
        if (document.getElementById("tourAdverseStyle")) return;
        const style = document.createElement("style");
        style.id = "tourAdverseStyle";
        style.textContent = `
          #tourAdverseFrise{position:fixed;right:12px;z-index:60;transform:scale(.6);transform-origin:right top;display:flex;align-items:center;gap:10px;padding:8px 14px;border-radius:999px;background:linear-gradient(180deg,rgba(40,30,70,.82),rgba(22,16,40,.86));box-shadow:0 6px 18px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.12);border:1px solid rgba(167,123,255,.45);opacity:0;transition:opacity .35s ease}
          #tourAdverseFrise.visible{opacity:1}
          #tourAdverseFrise .ta-etape{position:relative;width:44px;height:44px;border-radius:50%;background:#1b1430;border:3px solid var(--c);display:grid;place-items:center;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease}
          #tourAdverseFrise .ta-etape svg{width:30px;height:30px}
          #tourAdverseFrise .ta-etape b{position:absolute;right:-5px;bottom:-5px;width:19px;height:19px;border-radius:50%;background:var(--c);color:#1b1430;font:700 12px/19px Georgia,serif;text-align:center}
          #tourAdverseFrise .ta-etape i{position:absolute;left:-12px;top:-12px;width:28px;height:28px;border-radius:50%;background:#1b1430;border:2.5px solid #ffc94a;box-shadow:0 0 10px rgba(255,201,74,.7);display:grid;place-items:center}
          #tourAdverseFrise .ta-etape i svg{width:22px;height:22px}
          #tourAdverseFrise .ta-etape.on{transform:scale(1.18);box-shadow:0 0 0 4px rgba(167,123,255,.25),0 0 18px var(--c)}
          #tourAdverseFrise .ta-sep{width:10px;height:2px;background:rgba(255,255,255,.25);border-radius:2px}
        `;
        document.head.appendChild(style);
      }

      function tourAdversePlacerFrise() {
        const frise = tourAdverse.frise;
        if (!frise) return;
        // Sous le portrait de l'adversaire, collée au bord droit.
        const portrait = document.querySelector("#ilyosHudOrganicV2 .ov2-right .ov2-avatar")
          || document.getElementById("hudV2OpponentPortrait");
        const zone = portrait?.getBoundingClientRect();
        frise.style.top = `${zone && zone.height ? Math.round(zone.bottom + 6) : 84}px`;
      }

      function tourAdverseFrise() {
        tourAdverse.frise?.remove();
        tourAdverse.frise = null;
        if (!tourAdverse.etapes.length || !els.gameScreen) return;
        tourAdverseStyle();
        const hex = n => "#" + n.toString(16).padStart(6, "0");
        const frise = document.createElement("div");
        frise.id = "tourAdverseFrise";
        frise.setAttribute("aria-hidden", "true");
        frise.innerHTML = tourAdverse.etapes.map((e, i) => {
          const couleur = e.type === "push" ? TOUR_ADVERSE_ORANGE : e.type === "couronne" ? TOUR_ADVERSE_OR : tourAdverseCouleur(e.joueur);
          const icone = TOUR_ADVERSE_ICONES[e.type] || TOUR_ADVERSE_ICONES.move;
          const badge = e.couronne && e.type !== "couronne" ? `<i>${TOUR_ADVERSE_ICONES.couronne}</i>` : "";
          return (i ? '<span class="ta-sep"></span>' : "")
            + `<span class="ta-etape" data-n="${e.n}" style="--c:${hex(couleur)}">${icone}<b>${e.n}</b>${badge}</span>`;
        }).join("");
        const montrer = n => {
          tourAdverse.survol = n;
          frise.querySelectorAll(".ta-etape").forEach(el => el.classList.toggle("on", Number(el.dataset.n) === n));
        };
        frise.querySelectorAll(".ta-etape").forEach(el => {
          const n = Number(el.dataset.n);
          el.addEventListener("pointerenter", () => montrer(n));
          el.addEventListener("pointerleave", () => montrer(null));
          // Au doigt, un toucher montre l'étape, un second la cache.
          el.addEventListener("click", evenement => {
            evenement.stopPropagation();
            montrer(tourAdverse.survol === n ? null : n);
          });
        });
        els.gameScreen.appendChild(frise);
        tourAdverse.frise = frise;
        tourAdversePlacerFrise();
        requestAnimationFrame(() => frise.classList.add("visible"));
      }

      window.addEventListener("resize", tourAdversePlacerFrise);
