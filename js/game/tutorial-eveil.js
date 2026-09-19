      /* =====================================================================
         TUTORIEL — « L'ÉVEIL »

         On se réveille seul sur un caillou, au-dessus du vide, sans rien savoir.
         Pas un mot, pas une consigne, pas un panneau : le joueur apprend par le
         cadrage de la caméra, un compagnon de lumière, la lumière posée sur ce
         qui compte, et la conséquence immédiate de son geste.

         Conception complète : docs/TUTORIEL-EVEIL.md. Quatre actes —
         I LE CORPS, II LE MONDE, III L'AUTRE, IV LE TEMPS. Ce fragment livre
         l'ACTE I ; les suivants s'ajoutent au même tableau EVEIL_ETAPES.

         LA LOI QUI COMMANDE L'ORDRE : chaque découverte doit créer le manque
         qui appelle la suivante. On n'enseigne pas « la pose d'île » — on est
         prisonnier d'un caillou trop petit, et on découvre qu'on peut bâtir.

         Ce fragment vit dans le même IIFE que tutorial.js et réutilise son
         overlay, ses balises et ses helpers de plateau. Il ne redéfinit AUCUNE
         règle du jeu. Il ne touche ni à la campagne, ni aux Sanctuaires, ni aux
         affordances du jeu normal, qu'il se contente de lire.

         PARITÉ MANETTE. Rien de spécial à faire : gamepad.js passe par
         dispatchKayKitClick (vrai clic DOM sur la case) et active les verbes du
         HUD par button.click(). Les étapes se jugent malgré tout sur l'ÉTAT du
         moteur plutôt que sur le geste — un clic dit qu'on a cliqué, pas que le
         geste a abouti.
         ===================================================================== */

      const EVEIL_STORAGE_KEY = "ilyos.tutorial.eveil.etape";

      const EVEIL = {
        active: false,
        etape: 0,
        etapeDepuis: 0,
        pret: false,            // le sas d'ouverture a rendu la caméra
        souffle: false,         // un plan de caméra est en cours
        cameraNotre: false,     // un recadrage à nous, pas un geste du joueur
        aide: 0,
        aideMax: 0,
        trace: [],
        timer: null,
        unsubs: [],
        compagnon: null,
        fantome: null,
        derniereCase: null,     // dernière case désignée (souris OU manette)
        couronne: null,         // où la Couronne s'est posée (acte II)
        porteurInitial: null,
        refusAt: 0,
        styleReady: false
      };

      /* L'aide monte sur l'IMMOBILITÉ, jamais sur l'horloge seule. Faire tourner
         le monde, survoler, ouvrir un verbe : tout ça est de l'activité et remet
         le compteur à zéro. Quelqu'un qui regarde n'est pas quelqu'un qui bloque.

           1  le compagnon se pose sur ce qui compte
           2  l'Appel s'allume, la caméra recadre
           3  la Promesse s'offre
           4  le Fantôme joue le geste, une fois, puis s'efface

         Il n'y a pas de cinquième palier : le jeu ne joue jamais à la place du
         joueur. */
      const EVEIL_AIDE = [8000, 16000, 26000, 38000];

      // Les verbes du HUD, révélés un par un. L'ordre est celui de l'écran.
      const EVEIL_VERBES = {
        ile: "#ov2Island", move: "#ov2Move", push: "#ov2Push",
        magic: "#ov2Magic", end: "#ov2End", undo: "#ov2Undo"
      };

      /* ==================================================================
         FEUILLE DE STYLE
         Tout est préfixé eveil- et ne vise que des classes à nous. Aucun
         accent grave ici : ce littéral de gabarit casserait le build.
         ================================================================== */
      function eveilInjectStyle() {
        if (EVEIL.styleReady || document.getElementById("ilyos-eveil-style")) return;
        const style = document.createElement("style");
        style.id = "ilyos-eveil-style";
        style.textContent = `
          /* Le parcours est MUET : la bulle de narration, le portrait, le
             bandeau d'objectif et le bouton de voix de tutorial.js n'ont pas
             cours ici. */
          #tutorialLayer.eveil .tuto-speech,
          #tutorialLayer.eveil .tuto-portrait,
          #tutorialLayer.eveil .tuto-objective,
          #tutorialLayer.eveil .tuto-voice{display:none!important;}
          #tutorialLayer.eveil .tuto-quit{bottom:72px;opacity:.5;
            transition:opacity .3s, bottom .5s;}
          #tutorialLayer.eveil .tuto-quit:hover{opacity:1;}

          /* Un verbe pas encore acquis n'existe pas : il est retiré, pas
             grise. On ne montre jamais un pouvoir qu'on n'a pas. */
          #gameScreen.tutorial-eveil .eveil-cache{display:none!important;}

          /* LA NUDITE. A l'acte I on ne sait RIEN : ni qu'on a un score, ni
             qu'il y a un adversaire, ni qu'il existe des tours, ni qu'on a une
             pioche. Tout ce chrome raconte un jeu qu'on n'a pas encore
             rencontre, et il vole la vedette au seul etre du monde.

             Ces regles vivent sur BODY et non sur #gameScreen : le badge de
             vue tactique est pose a la racine du document.

             CASCADE. Les piles de cartes sont tenues en display:grid par DEUX
             feuilles (hud-polish-targeted-v1-final.css et
             hud-card-piles-discard-v11.css), toutes deux en !important et avec
             DEUX identifiants dans le selecteur
             (body[data-visual-mode] #gameScreen #ov2DeckHud). Une classe sur
             body ne pesait pas assez lourd. On passe donc par trois
             identifiants : #gameScreen, #ilyosHudOrganicV2, puis la cible.
             Toute modification ici se verifie par empreintes avant/apres
             (voir tests/README.md). */
          body.eveil-nu #gameScreen #ilyosHudOrganicV2 .ov2-top,
          body.eveil-nu #gameScreen #ilyosHudOrganicV2 .ov2-pile-hud,
          body.eveil-nu #gameScreen #ilyosHudOrganicV2 .ov2-instruction,
          body.eveil-nu #gameScreen #ilyosHudOrganicV2 #ov2Toast,
          body.eveil-nu #gameScreen #ov2DeckHud,
          body.eveil-nu #gameScreen #ov2DiscardHud,
          body.eveil-nu #gameScreen #hudV2Top,
          body.eveil-nu #plateauTactiqueBtn{display:none!important;}

          /* Le compte de cartes sous un verbe (« x8 ») raconte deja l'economie
             du jeu, qui n'arrive qu'a l'acte IV. Un nombre qu'on ne sait pas
             lire n'est pas une information, c'est du bruit. */
          body.eveil-nu #gameScreen #ov2MoveCount,
          body.eveil-nu #gameScreen #ov2PushCount,
          body.eveil-nu #gameScreen #ov2MagicCount{visibility:hidden!important;}

          /* LE JEU PARLE, LUI. handleCrownClick affiche un toast d'instruction
             des qu'on saisit une couronne portee (« Choisissez l'allie adjacent
             qui recoit la couronne »). Dans un parcours muet, ces phrases
             ruinent tout : on les coupe pour toute la duree de L'Eveil, et non
             seulement pendant la nudite de l'acte I. */
          body.tutorial-eveil-en-cours #gameScreen #ilyosHudOrganicV2 #ov2Toast,
          body.tutorial-eveil-en-cours #gameScreen #hudV2Toast,
          body.tutorial-eveil-en-cours #toast{display:none!important;}

          /* Le tiroir des formes est un catalogue d'images : les noms et les
             compteurs « 0/3 » sont du texte de jeu qu'on ne sait pas encore
             lire. Les apercus, eux, se comprennent seuls. */
          body.tutorial-eveil-en-cours #islandSelector .island-choice-name,
          body.tutorial-eveil-en-cours #islandSelector .island-choice-limit{display:none!important;}

          /* CEREMONIE : un verbe qui vient d'etre acquis se leve une fois. */
          #gameScreen.tutorial-eveil .eveil-sacre{animation:eveil-sacre-k 1.5s cubic-bezier(.2,.8,.2,1) both;}
          @keyframes eveil-sacre-k{
            0%{transform:scale(.4);opacity:0;filter:brightness(2.4)}
            45%{transform:scale(1.18);opacity:1;filter:brightness(1.8)}
            100%{transform:scale(1);opacity:1;filter:none}}

          /* L'APPEL, palier 2 : la balise de tutorial.js, mais assumee. Au
             palier 1 c'est le compagnon seul qui parle. */
          #tutorialLayer.eveil.appel-doux .tuto-beacon{opacity:.7;}
          #tutorialLayer.eveil.appel-doux .tuto-beacon::before{animation-duration:3.2s;}
          #tutorialLayer.eveil.appel-doux .tuto-beacon::after{animation-duration:3.2s;}

          /* LA PROMESSE : un fil tendu de la case de depart vers l'arrivee.
             Double trait, sombre dessous, pour tenir sur un ciel clair. */
          #tutorialLayer .eveil-promesse{position:absolute;left:0;top:0;width:100%;height:100%;
            pointer-events:none;z-index:6;overflow:visible;}
          #tutorialLayer .eveil-promesse .fil-ombre{stroke:rgba(20,14,4,.55);stroke-width:9;
            stroke-linecap:round;}
          #tutorialLayer .eveil-promesse .fil{stroke:rgba(255,244,206,.98);stroke-width:4;
            stroke-linecap:round;stroke-dasharray:10 12;
            filter:drop-shadow(0 0 8px rgba(255,214,120,1));
            animation:eveil-fil 1.4s linear infinite;}
          @keyframes eveil-fil{to{stroke-dashoffset:-44;}}
          #tutorialLayer .eveil-promesse .bout{fill:none;stroke:rgba(255,246,214,.98);stroke-width:3;
            filter:drop-shadow(0 0 10px rgba(255,196,90,.95));
            transform-box:fill-box;transform-origin:center;
            animation:eveil-bout 1.9s ease-out infinite;}
          @keyframes eveil-bout{0%{transform:scale(.55);opacity:1}
            75%{transform:scale(1.25);opacity:0}100%{opacity:0}}

          /* LE REFUS : le monde se retracte un quart de seconde, et revient.
             Rien n'est bloque — le geste a simplement ete sans effet. */
          #gameScreen.tutorial-eveil.eveil-refus .board-wrap{animation:eveil-refus-k .36s ease-out;}
          @keyframes eveil-refus-k{0%,100%{filter:none}45%{filter:brightness(.8) saturate(.55)}}
        `;
        document.head.appendChild(style);
        EVEIL.styleReady = true;
      }

      /* ==================================================================
         LE COMPAGNON

         Une lueur vivante, nee du Gardien, qui vole jusqu'a ce qui compte et
         s'y pose. Elle ne parle jamais. C'est le premier signe que le joueur
         apprend, et celui qui porte toute la chaleur du parcours.

         Elle vit dans la scene 3D (fxGroup) et non dans le DOM : elle doit
         etre DANS le monde, derriere une ile quand elle passe derriere, pas
         un curseur colle sur la vitre.
         ================================================================== */
      function eveilCompagnonNaitre(r, c) {
        if (EVEIL.compagnon || typeof THREE === "undefined") return null;
        if (!kaykit3D?.fxGroup) return null;
        let map = null;
        try { map = kaykitGlowTexture(); } catch (_) { }
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
          map, transparent: true, depthWrite: false, opacity: 0,
          color: new THREE.Color(0xfff2c8),
          blending: THREE.AdditiveBlending, toneMapped: false
        }));
        sprite.scale.setScalar(.42);
        const p = kaykitCellPosition(r, c, .9);
        sprite.position.set(p.x, p.y, p.z);
        kaykit3D.fxGroup.add(sprite);

        EVEIL.compagnon = {
          sprite,
          cible: new THREE.Vector3(p.x, p.y, p.z),
          humeur: "calme",     // calme | impatient | joyeux
          depuis: performance.now(),
          orbite: 0
        };
        eveilCompagnonBoucle();
        return EVEIL.compagnon;
      }

      /* Elle suit sa cible en douceur — jamais de teleportation, c'est ce qui
         la rend vivante — avec un flottement propre et une humeur. */
      function eveilCompagnonBoucle() {
        const co = EVEIL.compagnon;
        if (!co || !EVEIL.active) return;
        const t = performance.now();
        const dt = Math.min(64, t - co.depuis);
        co.depuis = t;

        const s = co.sprite;
        // Approche exponentielle : rapide de loin, posee de pres.
        const k = 1 - Math.pow(.0022, dt / 1000);
        s.position.lerp(co.cible, k);

        const respire = Math.sin(t / 620) * .085;
        s.position.y += respire * (dt / 260);

        if (co.humeur === "impatient") {
          // Elle tourne sur place, plus vive, plus brillante.
          co.orbite += dt / 160;
          s.position.x += Math.cos(co.orbite) * .1;
          s.position.z += Math.sin(co.orbite) * .1;
          s.material.opacity = Math.min(1, s.material.opacity + dt / 420);
          s.scale.setScalar(.46 + Math.sin(t / 150) * .07);
        } else if (co.humeur === "joyeux") {
          co.orbite += dt / 90;
          s.position.y += Math.sin(co.orbite) * .16;
          s.material.opacity = Math.min(1, s.material.opacity + dt / 260);
          s.scale.setScalar(.58 + Math.sin(t / 90) * .12);
        } else {
          s.material.opacity = Math.min(.92, s.material.opacity + dt / 900);
          s.scale.setScalar(.42 + Math.sin(t / 700) * .04);
        }

        EVEIL.compagnonFrame = requestAnimationFrame(eveilCompagnonBoucle);
      }

      // L'envoyer sur une case. hauteur : au-dessus du sol, en cases.
      function eveilCompagnonVers(r, c, hauteur = .95) {
        const co = EVEIL.compagnon;
        if (!co) return;
        try {
          const p = kaykitCellPosition(r, c, hauteur);
          co.cible.set(p.x, p.y, p.z);
        } catch (_) { }
      }

      function eveilCompagnonHumeur(humeur) {
        if (EVEIL.compagnon) EVEIL.compagnon.humeur = humeur || "calme";
      }

      function eveilCompagnonDisparaitre() {
        cancelAnimationFrame(EVEIL.compagnonFrame);
        EVEIL.compagnonFrame = 0;
        const co = EVEIL.compagnon;
        if (co?.sprite) {
          co.sprite.parent?.remove(co.sprite);
          co.sprite.material?.dispose?.();
        }
        EVEIL.compagnon = null;
      }

      /* ==================================================================
         LA GRAMMAIRE

         Un signe = un sens, partout, pour toujours.
         ================================================================== */

      /* L'APPEL. Balise de lumiere sur la case, respiration du verbe au HUD.
         Deux intensites seulement : douce (palier 2) et pleine (palier 3+). */
      function eveilAppel(spec, doux) {
        const layer = TUTO.dom?.layer;
        if (!layer || !spec) return;
        layer.classList.toggle("appel-doux", !!doux);
        try { tutoGuideStart(spec); } catch (_) { }
      }

      function eveilAppelStop() {
        TUTO.dom?.layer?.classList.remove("appel-doux");
        tutoGuideStop();
      }

      /* LA PROMESSE. Un fil tendu de `de` vers `vers`, reprojete a chaque image
         depuis les positions 3D, donc il tient quand la camera bouge. */
      /* `par` est optionnel : quand il est donne, le fil passe PAR cette case
         au lieu d'aller tout droit. C'est ce qui raconte le relais en
         diagonale — la Couronne ne saute pas d'un Gardien a l'autre, elle se
         pose sur la case commune, puis repart. */
      function eveilPromesse(de, vers, par) {
        eveilPromesseStop();
        const layer = TUTO.dom?.layer;
        if (!layer || !de || !vers) return;
        const NS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(NS, "svg");
        svg.setAttribute("class", "eveil-promesse");
        // Un segment par etape du trajet : un seul en direct, deux via `par`.
        const etapes = par ? [[de, par], [par, vers]] : [[de, vers]];
        const traits = etapes.map(() => {
          const ombre = document.createElementNS(NS, "line");
          ombre.setAttribute("class", "fil-ombre");
          const fil = document.createElementNS(NS, "line");
          fil.setAttribute("class", "fil");
          svg.append(ombre, fil);
          return { ombre, fil };
        });
        // Un anneau sur la case commune, un autre sur l'arrivee : les deux
        // temps du geste sont marques.
        const anneaux = (par ? [par, vers] : [vers]).map(() => {
          const rond = document.createElementNS(NS, "circle");
          rond.setAttribute("class", "bout");
          rond.setAttribute("r", "17");
          svg.appendChild(rond);
          return rond;
        });
        layer.appendChild(svg);
        EVEIL.promesseNode = svg;

        const suivre = () => {
          if (!EVEIL.active || EVEIL.promesseNode !== svg) return;
          const points = etapes.map(([p, q]) =>
            [tutoCellToScreen(p[0], p[1]), tutoCellToScreen(q[0], q[1])]);
          if (points.some(([a, b]) => !a || !b)) svg.style.display = "none";
          else {
            svg.style.display = "block";
            points.forEach(([a, b], i) => {
              [traits[i].ombre, traits[i].fil].forEach(el => {
                el.setAttribute("x1", a.x); el.setAttribute("y1", a.y);
                el.setAttribute("x2", b.x); el.setAttribute("y2", b.y);
              });
            });
            (par ? [par, vers] : [vers]).forEach((cellule, i) => {
              const p = tutoCellToScreen(cellule[0], cellule[1]);
              if (!p) return;
              anneaux[i].setAttribute("cx", p.x);
              anneaux[i].setAttribute("cy", p.y);
            });
          }
          EVEIL.promesseFrame = requestAnimationFrame(suivre);
        };
        suivre();
      }

      function eveilPromesseStop() {
        cancelAnimationFrame(EVEIL.promesseFrame);
        EVEIL.promesseFrame = 0;
        EVEIL.promesseNode?.remove();
        EVEIL.promesseNode = null;
      }

      /* LE FANTOME. Dernier recours : une silhouette translucide du Gardien
         execute le geste attendu, puis s'efface. Elle ne change RIEN a l'etat
         du jeu — elle montre, elle ne fait pas a la place.

         On clone le visuel deja charge du Gardien (characterVisuals) : la
         silhouette est donc exactement lui, pas un symbole approximatif. */
      function eveilFantomeMarche(charId, de, vers) {
        eveilFantomeStop();
        const visual = kaykit3D?.characterVisuals?.get(String(charId));
        if (!visual?.wrapper || !kaykit3D?.fxGroup || typeof THREE === "undefined") return;

        let clone = null;
        try { clone = visual.wrapper.clone(true); } catch (_) { return; }
        clone.traverse(obj => {
          if (!obj.isMesh) return;
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          obj.material = mats.map(m => {
            const copie = m.clone();
            copie.transparent = true;
            copie.opacity = .34;
            copie.depthWrite = false;
            if (copie.emissive) copie.emissive = new THREE.Color(0x88b4ff);
            return copie;
          });
          if (obj.material.length === 1) obj.material = obj.material[0];
        });
        kaykit3D.fxGroup.add(clone);

        const a = kaykitCellPosition(de[0], de[1], 0);
        const b = kaykitCellPosition(vers[0], vers[1], 0);
        const depart = performance.now();
        const DUREE = 1500, PAUSE = 420;
        EVEIL.fantome = clone;

        const jouer = () => {
          if (!EVEIL.active || EVEIL.fantome !== clone) return;
          const t = performance.now() - depart;
          if (t < PAUSE) {
            clone.position.set(a.x, a.y, a.z);
          } else if (t < PAUSE + DUREE) {
            const u = (t - PAUSE) / DUREE;
            const e = u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
            clone.position.set(
              a.x + (b.x - a.x) * e,
              a.y + Math.sin(e * Math.PI) * .22,
              a.z + (b.z - a.z) * e
            );
          } else if (t < PAUSE + DUREE + 600) {
            const u = (t - PAUSE - DUREE) / 600;
            clone.traverse(obj => {
              if (!obj.isMesh) return;
              const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
              mats.forEach(m => { m.opacity = .34 * (1 - u); });
            });
          } else {
            eveilFantomeStop();
            return;
          }
          EVEIL.fantomeFrame = requestAnimationFrame(jouer);
        };
        jouer();
      }

      /* Variante du FANTOME pour le relais. Montrer « clique la couronne, puis
         ton allie » avec une silhouette de Gardien ne dirait rien : ce n'est
         pas lui qui se deplace. C'est la COURONNE qui voyage — on la fait donc
         voler, translucide, d'un porteur a l'autre. Le geste attendu et la
         consequence sont la meme image. */
      function eveilFantomeCouronne(de, vers, par) {
        eveilFantomeStop();
        if (!kaykit3D?.fxGroup || typeof THREE === "undefined") return;
        let couronne = null;
        try { couronne = makeCrown(); } catch (_) { return; }
        couronne.scale.setScalar(.6);
        couronne.traverse(obj => {
          if (!obj.isMesh) return;
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          obj.material = mats.map(m => {
            const copie = m.clone();
            copie.transparent = true; copie.opacity = .45; copie.depthWrite = false;
            return copie;
          });
          if (obj.material.length === 1) obj.material = obj.material[0];
        });
        kaykit3D.fxGroup.add(couronne);
        EVEIL.fantome = couronne;

        /* Le trajet : direct, ou en deux temps par la case commune — avec une
           vraie pause posee dessus, parce que c'est exactement ce que le
           joueur devra faire (poser, puis reprendre). */
        const hauteur = (r, c, y) => kaykitCellPosition(r, c, y);
        const etapes = par
          ? [[hauteur(de[0], de[1], 1.05), hauteur(par[0], par[1], .35)],
          [hauteur(par[0], par[1], .35), hauteur(vers[0], vers[1], 1.05)]]
          : [[hauteur(de[0], de[1], 1.05), hauteur(vers[0], vers[1], 1.05)]];
        const depart = performance.now();
        const PAUSE = 380, DUREE = par ? 850 : 1300, REPOS = par ? 600 : 0, FONDU = 500;
        const TOTAL = PAUSE + DUREE + (par ? REPOS + DUREE : 0);

        const jouer = () => {
          if (!EVEIL.active || EVEIL.fantome !== couronne) return;
          const t = performance.now() - depart;
          const opacite = o => couronne.traverse(obj => {
            if (!obj.isMesh) return;
            (Array.isArray(obj.material) ? obj.material : [obj.material])
              .forEach(m => { m.opacity = o; });
          });
          // Un arc par segment : la couronne passe PAR-DESSUS, elle ne glisse
          // jamais au sol.
          const arc = ([a, b], u) => couronne.position.set(
            a.x + (b.x - a.x) * u,
            a.y + (b.y - a.y) * u + Math.sin(u * Math.PI) * .45,
            a.z + (b.z - a.z) * u
          );
          if (t < PAUSE) {
            arc(etapes[0], 0);
          } else if (t < PAUSE + DUREE) {
            arc(etapes[0], (t - PAUSE) / DUREE);
            couronne.rotation.y += .05;
          } else if (par && t < PAUSE + DUREE + REPOS) {
            arc(etapes[0], 1);                       // posee sur la case commune
          } else if (par && t < TOTAL) {
            arc(etapes[1], (t - PAUSE - DUREE - REPOS) / DUREE);
            couronne.rotation.y += .05;
          } else if (t < TOTAL + FONDU) {
            opacite(.45 * (1 - (t - TOTAL) / FONDU));
          } else {
            eveilFantomeStop();
            return;
          }
          EVEIL.fantomeFrame = requestAnimationFrame(jouer);
        };
        jouer();
      }

      function eveilFantomeStop() {
        cancelAnimationFrame(EVEIL.fantomeFrame);
        EVEIL.fantomeFrame = 0;
        const f = EVEIL.fantome;
        if (f) {
          f.traverse(obj => {
            if (!obj.isMesh) return;
            (Array.isArray(obj.material) ? obj.material : [obj.material])
              .forEach(m => m.dispose?.());
          });
          f.parent?.remove(f);
        }
        EVEIL.fantome = null;
      }

      /* LE REFUS. Jamais une phrase : le monde se ternit, un son mat, et le
         compagnon sursaute. Aucun geste n'est bloque pour autant. */
      function eveilRefus() {
        const g = els.gameScreen;
        if (!g) return;
        const now = Date.now();
        if (now - EVEIL.refusAt < 700) return;
        EVEIL.refusAt = now;
        g.classList.remove("eveil-refus");
        void g.offsetWidth;
        g.classList.add("eveil-refus");
        setTimeout(() => g.classList.remove("eveil-refus"), 430);
        try { if (typeof playSfx === "function") playSfx("fall"); } catch (_) { }
      }

      /* L'ASSENTIMENT. Un eclat, un son, et surtout une consequence visible.
         Le compagnon exulte : c'est lui qui porte la joie. */
      function eveilAssentiment(son) {
        try { if (typeof playSfx === "function") playSfx(son || "crown"); } catch (_) { }
        try { tutoBloom(); } catch (_) { }
        eveilCompagnonHumeur("joyeux");
        setTimeout(() => { if (EVEIL.active) eveilCompagnonHumeur("calme"); }, 1400);
      }

      /* ==================================================================
         CAMERA
         ================================================================== */

      /* tutoTravel appelle tutoLockCamera, qui coupe la rotation a la souris.
         Sans cette restitution, le premier plan confisquerait le monde. */
      function eveilTravel(r, c, duree, zoom) {
        try { tutoTravel(r, c, duree, zoom || 0); } catch (_) { }
        clearTimeout(EVEIL.rendreTimer);
        EVEIL.rendreTimer = setTimeout(() => {
          if (EVEIL.active && !EVEIL.souffle) eveilCameraLibre();
        }, (duree || 0) + 120);
      }

      function eveilCameraLibre() {
        try {
          if (typeof kaykit3D === "undefined" || !kaykit3D) return;
          clearInterval(TUTO.lockTimer);
          TUTO.lockTimer = null;
          kaykit3D.autoFit = false;
          kaykit3D.cameraTween = null;
          kaykit3D.cameraMode = "free";
          kaykit3D.userRotated = false;
          kaykit3D.userInteracting = false;
          if (kaykit3D.orbit) {
            kaykit3D.orbit.enabled = true;
            kaykit3D.orbit.enableRotate = true;
            kaykit3D.orbit.enablePan = true;
            kaykit3D.orbit.enableZoom = true;
          }
          if (kaykit3D.camera) {
            EVEIL.pose0 = kaykit3D.camera.position.clone();
            EVEIL.quat0 = kaykit3D.camera.quaternion.clone();
          }
        } catch (_) { }
      }

      /* Le joueur a-t-il tourne le monde LUI-MEME ? Un mouvement que nous avons
         declenche ne compte pas : sinon le tutoriel franchit l'etape tout seul. */
      function eveilCameraBougee() {
        try {
          if (EVEIL.cameraNotre || EVEIL.souffle) return false;
          if (!EVEIL.pose0 || !EVEIL.quat0 || !kaykit3D?.camera) return false;
          const dPos = kaykit3D.camera.position.distanceTo(EVEIL.pose0);
          const dot = Math.min(1, Math.abs(kaykit3D.camera.quaternion.dot(EVEIL.quat0)));
          return dPos > .35 || 2 * Math.acos(dot) > .08;
        } catch (_) { return false; }
      }

      /* LE SOUFFLE. La camera raconte : des plans joues d'affilee, letterbox
         posee, plateau intouchable. Court, et TOUJOURS rendu a la fin. */
      async function eveilSouffle(plans) {
        if (!plans?.length) return;
        EVEIL.souffle = true;
        TUTO.cinematic = true;
        tutoLetterbox(true);
        if (state) state.inputLocked = true;
        for (const [r, c, duree, zoom] of plans) {
          if (!EVEIL.active) break;
          try { tutoTravel(r, c, duree, zoom || 0); } catch (_) { }
          await tutoWait(duree);
        }
        if (state) state.inputLocked = false;
        tutoLetterbox(false);
        TUTO.cinematic = false;
        EVEIL.souffle = false;
        if (EVEIL.active) eveilCameraLibre();
      }

      /* ==================================================================
         LE HUD : des pouvoirs qu'on acquiert
         ================================================================== */
      function eveilVerbes(acquis = []) {
        const garde = new Set(acquis);
        Object.entries(EVEIL_VERBES).forEach(([nom, sel]) => {
          document.querySelectorAll(sel).forEach(el =>
            el.classList.toggle("eveil-cache", !garde.has(nom)));
        });
      }

      // La ceremonie : le verbe se leve une fois, avec son.
      function eveilSacrerVerbe(nom) {
        const el = document.querySelector(EVEIL_VERBES[nom]);
        if (!el) return;
        el.classList.remove("eveil-cache", "eveil-sacre");
        void el.offsetWidth;
        el.classList.add("eveil-sacre");
        try { if (typeof playSfx === "function") playSfx("card"); } catch (_) { }
        setTimeout(() => el.classList.remove("eveil-sacre"), 1600);
      }

      function eveilRendreHud() {
        document.querySelectorAll(".eveil-cache").forEach(el => el.classList.remove("eveil-cache"));
        document.body.classList.remove("eveil-nu");
      }

      /* Le chrome de partie reviendra acte par acte : le tour et l'adversaire
         a l'acte III, la pioche et le score a l'acte IV, quand ces notions
         auront enfin un sens. */
      function eveilNudite(nu) {
        document.body.classList.toggle("eveil-nu", !!nu);
      }

      /* ==================================================================
         LE MONDE DE L'ACTE I

         Un Gardien. Un caillou de quatre cases. Le vide tout autour. Le
         caillou est volontairement loin des villages : on n'est nulle part,
         et personne ne nous attend.
         ================================================================== */
      /* Le sanctuaire central occupe le coeur du plateau et brille en or : un
         caillou pose a cote lui volait le regard des la premiere seconde.
         On s'installe donc a l'ecart, entre le centre et le bord bas-gauche,
         loin des villages des coins. Le sanctuaire et les villages restent
         visibles au loin — ils ne distraient plus, ils promettent. */
      const EVEIL_CAILLOU = [[8, 2], [8, 3], [9, 2], [9, 3]];
      const EVEIL_DEPART = [9, 2];

      function eveilBatirMonde() {
        tutoBuildState();
        state.islands.length = 0;
        state.characters.length = 0;
        state.players[0].score = 0;
        state.players[1].score = 0;
        state.players[0].isAI = false;
        state.players[1].isAI = false;
        state.players[0].stash = { MOVE: 0, PUSH: 0, MAGIC: 0 };
        state.players[1].stash = { MOVE: 0, PUSH: 0, MAGIC: 0 };
        // Pas de couronne a l'acte I : rien au monde ne doit distraire du corps.
        state.artifact.active = false;
        state.artifact.carrierId = null;
        state.secondArtifact.active = false;
        state.rules.allowDissolve = false;
        state.rules.islandLimitPerPlayer = 0;
        state.rules.disableSecondCrown = true;
        state.islandPlacedThisTurn = true;   // l'acte I ne parle pas encore de batir

        tutoAddIsland(EVEIL_CAILLOU, 0);
        state.characters.push({
          id: `char-${state.nextCharId++}`, player: 0,
          r: EVEIL_DEPART[0], c: EVEIL_DEPART[1]
        });
        // Une main large : l'acte I ne parle pas encore du cout des gestes.
        tutoSetHand(["MOVE", "MOVE", "MOVE", "MOVE", "MOVE", "MOVE", "MOVE", "MOVE"]);
        eveilResetSelection();
        tutoRender();
      }

      function eveilResetSelection() {
        if (!state) return;
        state.phase = "ACTION_SELECT";
        state.selectedActionCardId = null;
        state.selectedActionType = null;
        state.selectedActionCount = 1;
        state.selectedCharId = null;
        state.selectedIslandId = null;
        state.selectedMagicPivot = null;
        state.pendingDirectMoveTarget = null;
        state.pushTargetId = null;
        state.pushOptions = [];
        state.reachable = new Set();
      }

      function eveilGardien() {
        return (state?.characters || []).find(ch => ch.player === 0) || null;
      }

      /* Les actes I a III se jouent avec une main qui ne s'epuise jamais :
         l'economie des cartes est le sujet de l'acte IV, et la decouvrir par
         accident (« je n'ai plus rien et je ne sais pas pourquoi ») serait la
         pire des introductions. On recharge donc a chaque etape. */
      function eveilMainConfortable() {
        const manque = 8 - (state?.players?.[0]?.hand || []).filter(c => !c.used).length;
        if (manque > 0) tutoSetHand(Array(8).fill("MOVE"));
      }

      // Une case de terre libre, voisine du Gardien : la destination evidente.
      function eveilCaseVoisineLibre() {
        const g = eveilGardien();
        if (!g) return null;
        const autour = [[g.r - 1, g.c], [g.r, g.c + 1], [g.r + 1, g.c], [g.r, g.c - 1]];
        return autour.find(([r, c]) => isLand(r, c) && !characterAt(r, c)) || null;
      }

      /* ---- Acte II : lire le monde que le joueur vient de fabriquer ---- */

      // L'ile posee par le joueur (les iles de depart portent fromSetup).
      function eveilNouvelleIle() {
        return (state?.islands || []).filter(i => !i.fromSetup).slice(-1)[0] || null;
      }

      function eveilGardiens() {
        return (state?.characters || []).filter(ch => ch.player === 0);
      }

      function eveilPorteur() {
        const id = state?.artifact?.carrierId;
        return id == null ? null : eveilGardiens().find(ch => String(ch.id) === String(id)) || null;
      }

      function eveilAutreGardien(id) {
        return eveilGardiens().find(ch => String(ch.id) !== String(id)) || null;
      }

      /* La case par laquelle une Couronne peut passer d'un Gardien a l'autre
         quand ils sont en diagonale : libre, en terre, et voisine orthogonale
         des DEUX. C'est elle que le fil de lumiere doit traverser. */
      function eveilCaseCommune(a, b) {
        if (!a || !b) return null;
        const ortho = g => [[g.r - 1, g.c], [g.r + 1, g.c], [g.r, g.c - 1], [g.r, g.c + 1]];
        const cles = new Set(ortho(b).map(([r, c]) => r + "," + c));
        return ortho(a).find(([r, c]) =>
          cles.has(r + "," + c) && isLand(r, c) && !characterAt(r, c)) || null;
      }

      /* Le relais est-il jouable en l'etat ? Deux routes, toutes deux legitimes :
         cote a cote (on donne la Couronne), ou en diagonale avec une case
         commune en terre (on la pose, l'autre la reprend). Sans l'une ni
         l'autre, handleCrownClick ne propose RIEN et le geste reste sans effet :
         l'etape serait un mur. */
      function eveilRelaisRoute(a, b) {
        if (!a || !b) return null;
        if (Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1) return { colle: true, commune: null };
        const commune = eveilCaseCommune(a, b);
        return commune ? { colle: false, commune } : null;
      }

      function eveilDistance(a, b) {
        return a && b ? Math.abs(a.r - b.r) + Math.abs(a.c - b.c) : Infinity;
      }

      /* Ou poser la Couronne : sur la terre NEUVE, la case la plus PROCHE d'un
         Gardien. Elle descend donc sur ce que le joueur a bati lui-meme — la
         recompense vient de son geste — et le trajet reste court.

         J'avais d'abord pris la case la plus eloignee, pour donner du poids au
         voyage. Mauvaise idee : le joueur pose son ile ou il veut, parfois a
         l'autre bout du ciel, et la Couronne devenait une randonnee. Le manque
         est deja installe ; ici la joie, c'est de l'atteindre, pas de marcher. */
      function eveilCaseCouronne() {
        const ile = eveilNouvelleIle();
        const gardiens = eveilGardiens();
        if (!ile || !gardiens.length) return null;
        const libres = ile.cells.filter(([r, c]) => !characterAt(r, c));
        if (!libres.length) return null;
        return libres.slice().sort((a, b) => {
          const da = Math.min(...gardiens.map(g => Math.abs(g.r - a[0]) + Math.abs(g.c - a[1])));
          const db = Math.min(...gardiens.map(g => Math.abs(g.r - b[0]) + Math.abs(g.c - b[1])));
          return da - db;
        })[0];
      }

      // Une case de VIDE voisine du caillou : la limite du monde.
      function eveilCaseVide() {
        const g = eveilGardien();
        if (!g) return null;
        const autour = [[g.r + 1, g.c], [g.r, g.c + 1], [g.r - 1, g.c], [g.r, g.c - 1]];
        return autour.find(([r, c]) => r >= 0 && c >= 0 && r < 11 && c < 11 && !isLand(r, c)) || null;
      }

      /* ==================================================================
         ACTE I — LE CORPS

         « Qu'est-ce que je suis ? »

         Chaque etape porte :
           souffle()  les plans de camera joues a l'entree
           appel()    les cases a eclairer et les verbes a faire respirer
           promesse() le fil montre au palier 3
           fantome()  le geste rejoue au palier 4
           compagnon()ou se pose la lueur au palier 1
           faite()    la condition de reussite, jugee sur l'ETAT
         Aucune ne porte de texte. C'est la regle du parcours.
         ================================================================== */
      const EVEIL_ETAPES = [

        /* ---- 1. L'EVEIL ----------------------------------------------
           Le Gardien seul. La camera tourne autour de lui et s'arrete ; le
           compagnon nait de lui et fait un tour d'orbite. C'est le compagnon
           qui mime le geste attendu : faire tourner le monde.

           Recompense : le monde repond au regard, et on decouvre qu'on n'est
           pas une image plate mais un lieu. */
        {
          id: "eveil",
          acte: 1,
          entrer() {
            eveilVerbes([]);                 // aucun pouvoir encore
            eveilResetSelection();
            tutoRender();
          },
          compagnon() {
            const g = eveilGardien();
            return g ? [g.r, g.c, 1.5] : null;
          },
          // Palier 2 : la camera derive d'elle-meme de quelques degres puis
          // s'arrete. Une invitation, pas le geste — et elle ne franchit pas
          // l'etape, puisque eveilCameraBougee ignore nos propres mouvements.
          inviter() {
            if (EVEIL.cameraNotre || EVEIL.souffle) return;
            const g = eveilGardien();
            if (!g) return;
            EVEIL.cameraNotre = true;
            eveilTravel(g.r, g.c + 1.9, 1700, -.2);
            clearTimeout(EVEIL.inviteTimer);
            EVEIL.inviteTimer = setTimeout(() => { EVEIL.cameraNotre = false; }, 2150);
          },
          faite: () => eveilCameraBougee()
        },

        /* ---- 2. LE NOM ------------------------------------------------
           Le compagnon se pose sur le Gardien et s'y accroche. On apprend que
           cet etre-la est a nous, et qu'on peut le designer.

           Le verbe DEPLACER apparait ici, avec ceremonie : le premier pouvoir
           dans les mains. Sans lui, designer le Gardien ne menerait nulle part
           et la decouverte serait creuse. */
        {
          id: "nom",
          acte: 1,
          entrer() {
            eveilSacrerVerbe("move");
            eveilVerbes(["move"]);
            eveilResetSelection();
            tutoRender();
          },
          souffle() {
            const g = eveilGardien();
            return g ? [[g.r, g.c, 1500, .9]] : [];
          },
          compagnon() {
            const g = eveilGardien();
            return g ? [g.r, g.c, .85] : null;
          },
          appel() {
            const g = eveilGardien();
            return { hud: [EVEIL_VERBES.move], cells: g ? [[g.r, g.c]] : [] };
          },
          // Juge sur l'ETAT : le Gardien est selectionne, quel que soit le
          // chemin (souris, manette, ou verbe ouvert en premier).
          faite() {
            const g = eveilGardien();
            return !!g && String(state?.selectedCharId || "") === String(g.id);
          }
        },

        /* ---- 3. LE PREMIER PAS ----------------------------------------
           Les cases atteignables s'allument — l'affordance du jeu, pas une
           invention du tutoriel. On marche.

           Recompense : le monde bouge sous les pieds, la camera suit, le son
           du pas. Le corps existe. */
        {
          id: "premier-pas",
          acte: 1,
          entrer() {
            eveilVerbes(["move"]);
            const g = eveilGardien();
            EVEIL.departPas = g ? { r: g.r, c: g.c } : null;
            eveilResetSelection();
            tutoRender();
          },
          souffle() {
            const g = eveilGardien();
            const cible = eveilCaseVoisineLibre();
            if (!g) return [];
            // Le regard glisse du Gardien vers la terre devant lui : le trajet
            // est raconte par un mouvement, pas par une phrase.
            return cible
              ? [[g.r, g.c, 800, .6], [(g.r + cible[0]) / 2, (g.c + cible[1]) / 2, 1400, .3]]
              : [[g.r, g.c, 1000, .6]];
          },
          compagnon() {
            const cible = eveilCaseVoisineLibre();
            return cible ? [cible[0], cible[1], .8] : null;
          },
          appel() {
            const g = eveilGardien();
            const cible = eveilCaseVoisineLibre();
            return {
              hud: [EVEIL_VERBES.move],
              cells: [...(g ? [[g.r, g.c]] : []), ...(cible ? [cible] : [])]
            };
          },
          promesse() {
            const g = eveilGardien();
            const cible = eveilCaseVoisineLibre();
            return g && cible ? { de: [g.r, g.c], vers: cible } : null;
          },
          fantome() {
            const g = eveilGardien();
            const cible = eveilCaseVoisineLibre();
            return g && cible ? { charId: g.id, de: [g.r, g.c], vers: cible } : null;
          },
          faite() {
            const g = eveilGardien();
            return !!(g && EVEIL.departPas
              && (g.r !== EVEIL.departPas.r || g.c !== EVEIL.departPas.c));
          }
        },

        /* ---- 4. LA LIMITE ---------------------------------------------
           On finit par viser le vide. REFUS : le monde se ternit, le son est
           mat, rien ne se passe. Le caillou est une prison.

           C'est la SEULE etape dont la reussite est un echec : elle n'apprend
           pas un geste, elle installe un manque. Sans elle, la pose d'ile de
           l'acte II serait une fonctionnalite ; grace a elle, c'est une
           delivrance. */
        {
          id: "limite",
          acte: 1,
          entrer() {
            eveilVerbes(["move"]);
            EVEIL.derniereCase = null;
            eveilResetSelection();
            tutoRender();
          },
          compagnon() {
            const vide = eveilCaseVide();
            return vide ? [vide[0], vide[1], .7] : null;
          },
          appel() {
            const vide = eveilCaseVide();
            return { cells: vide ? [vide] : [] };
          },
          promesse() {
            const g = eveilGardien();
            const vide = eveilCaseVide();
            return g && vide ? { de: [g.r, g.c], vers: vide } : null;
          },
          // Faite des que le joueur a DESIGNE une case de vide, d'ou qu'il
          // vienne (souris ou manette passent toutes deux par un clic DOM).
          faite() {
            const d = EVEIL.derniereCase;
            return !!d && !isLand(d.r, d.c);
          },
          // Ici l'assentiment serait un contresens : on ne felicite pas
          // quelqu'un d'avoir bute sur un mur. C'est le refus qui ferme l'acte.
          sortie: "refus"
        },

        /* ================================================================
           ACTE II — LE MONDE

           « Je peux le changer. »

           L'acte I s'est ferme sur un mur. Celui-ci l'ouvre : le vide devient
           terre, et tout ce qui suit decoule de ce premier pouvoir.
           ================================================================ */

        /* ---- 5. BATIR -------------------------------------------------
           Le verbe ILE apparait. Le vide qui vient de refuser le pas se
           laisse combler. PREMIERE JOIE : on fabrique le monde.

           On ne designe AUCUNE case en particulier : une ile se pose ou l'on
           veut, c'est la regle du jeu et le tutoriel n'a pas a la trahir. On
           eclaire seulement le bord du caillou, la ou le regard est deja. */
        {
          id: "batir",
          acte: 2,
          entrer() {
            eveilSacrerVerbe("ile");
            eveilVerbes(["move", "ile"]);
            // Le caillou de l'acte I bloquait la pose ; on rend le pouvoir.
            state.islandPlacedThisTurn = false;
            state.pendingSpawnIslandId = null;
            eveilMainConfortable();
            eveilResetSelection();
            tutoRender();
          },
          compagnon() {
            const vide = eveilCaseVide();
            return vide ? [vide[0], vide[1], .8] : null;
          },
          appel() {
            const vide = eveilCaseVide();
            return { hud: [EVEIL_VERBES.ile], cells: vide ? [vide] : [] };
          },
          promesse() {
            const g = eveilGardien();
            const vide = eveilCaseVide();
            return g && vide ? { de: [g.r, g.c], vers: vide } : null;
          },
          /* Dernier recours : pas de silhouette ici — ce n'est pas un
             deplacement. C'est le tiroir des formes qu'il faut ouvrir, donc
             c'est LUI qui respire. */
          dernierRecours() {
            // On passe par TUTO.pulsed : c'est lui que tutoGuideStop eteint.
            document.querySelectorAll("#islandSelector .island-choice:not([disabled])")
              .forEach(el => {
                el.classList.add("tuto-pulse");
                (TUTO.pulsed = TUTO.pulsed || []).push(el);
              });
          },
          faite() { return !!eveilNouvelleIle(); },
          son: "island"
        },

        /* ---- 6. LE SECOND ---------------------------------------------
           La pose d'ile enchaine d'elle-meme sur PLACE_SPAWN : le monde
           demande ou eveiller le nouveau Gardien. On n'est plus seul.

           ATTENTION : cette etape ne doit RIEN reinitialiser. Remettre la
           phase a ACTION_SELECT annulerait l'invocation en cours. */
        {
          id: "second",
          acte: 2,
          entrer() {
            eveilVerbes(["move", "ile"]);
            tutoRender();
          },
          compagnon() {
            const ile = eveilNouvelleIle();
            const c = ile?.cells?.[0];
            return c ? [c[0], c[1], .9] : null;
          },
          appel() {
            const ile = eveilNouvelleIle();
            return { cells: (ile?.cells || []).map(([r, c]) => [r, c]) };
          },
          faite() { return eveilGardiens().length >= 2; },
          son: "spawn"
        },

        /* ---- 7. LA LUEUR ----------------------------------------------
           Une Couronne descend du ciel et se pose sur la terre NEUVE.

           Ecart assume avec le document de conception, qui la faisait
           apparaitre « au loin » : la poser sur ce que le joueur vient de
           batir lie la recompense a son geste (« j'ai fait de la terre, et
           quelque chose est venu s'y poser »), et elle reste atteignable a
           pied sans qu'on fabrique un chemin sorti de nulle part. */
        {
          id: "lueur",
          acte: 2,
          entrer() {
            eveilVerbes(["move", "ile"]);
            const ou = eveilCaseCouronne();
            if (ou) {
              state.artifact.active = true;
              state.artifact.carrierId = null;
              state.artifact.r = ou[0];
              state.artifact.c = ou[1];
              state.secondArtifact.active = false;
              EVEIL.couronne = ou;
              try { spawnGroundBurst(kaykitCellPosition(ou[0], ou[1], 0), new THREE.Color(0xffcf52), { radius: .5, duration: 700 }); } catch (_) { }
              try { if (typeof playSfx === "function") playSfx("crown"); } catch (_) { }
            }
            state.islandPlacedThisTurn = true;   // l'ile de l'acte est posee
            eveilMainConfortable();
            eveilResetSelection();
            tutoRender();
          },
          // La camera va la voir, puis revient sur les Gardiens : le trajet a
          // parcourir est raconte, dans ce sens-la.
          souffle() {
            const ou = EVEIL.couronne;
            const g = eveilGardien();
            if (!ou) return [];
            return g
              ? [[ou[0], ou[1], 1500, .9], [(ou[0] + g.r) / 2, (ou[1] + g.c) / 2, 1200, .3]]
              : [[ou[0], ou[1], 1500, .9]];
          },
          compagnon() {
            const ou = EVEIL.couronne;
            return ou ? [ou[0], ou[1], 1] : null;
          },
          appel() {
            const ou = EVEIL.couronne;
            return { hud: [EVEIL_VERBES.move], cells: ou ? [ou] : [] };
          },
          promesse() {
            const ou = EVEIL.couronne;
            if (!ou) return null;
            // Depuis le Gardien le PLUS PROCHE : c'est lui qui doit y aller.
            const g = eveilGardiens().slice().sort((a, b) =>
              (Math.abs(a.r - ou[0]) + Math.abs(a.c - ou[1]))
              - (Math.abs(b.r - ou[0]) + Math.abs(b.c - ou[1])))[0];
            return g ? { de: [g.r, g.c], vers: ou } : null;
          },
          fantome() {
            const ou = EVEIL.couronne;
            if (!ou) return null;
            const g = eveilGardiens().slice().sort((a, b) =>
              (Math.abs(a.r - ou[0]) + Math.abs(a.c - ou[1]))
              - (Math.abs(b.r - ou[0]) + Math.abs(b.c - ou[1])))[0];
            return g ? { charId: g.id, de: [g.r, g.c], vers: ou } : null;
          },
          faite() { return !!eveilPorteur(); },
          son: "crown"
        },

        /* ---- 8. LE RELAIS ---------------------------------------------
           Deux Gardiens, une seule lumiere. On decouvre qu'elle passe de l'un
           a l'autre : ils sont une equipe, pas deux pions.

           C'est le geste le plus obscur du jeu — il faut cliquer la couronne
           PORTEE, puis l'allie. Aucun mot ne le dira : le compagnon se pose
           sur la couronne, le fil relie les deux Gardiens, et au dernier
           palier la couronne fantome fait le voyage toute seule. */
        {
          id: "relais",
          acte: 2,
          entrer() {
            eveilVerbes(["move", "ile"]);
            const porteur = eveilPorteur();
            const autre = porteur && eveilAutreGardien(porteur.id);
            /* On ne force RIEN. Saisir une Couronne portee ouvre DROP_TREASURE,
               qui propose deux issues (voir handleCrownClick dans ui.js) : la
               donner a un allie orthogonalement adjacent, OU la poser sur une
               case libre voisine. Deux Gardiens en diagonale se la passent donc
               par leur case commune — on pose, l'autre vient la reprendre.

               J'avais d'abord colle les deux Gardiens l'un a l'autre pour n'avoir
               qu'un seul geste a enseigner. C'etait une rustine sur une regle mal
               lue : la version diagonale enseigne DEUX verites d'un coup (la
               Couronne se pose, la Couronne se reprend) et c'est le fil de
               lumiere, passant par la case commune, qui le dit sans un mot.

               On n'intervient que si le relais est IMPOSSIBLE. Et ca arrive
               vraiment : les formes d'ile comprennent des DIAGONALES, si bien
               que les deux Gardiens peuvent se tenir sur les deux pointes d'une
               ile de deux cases, sans aucune case commune en terre. Vu en test :
               ile [[6,0],[7,1]], Gardiens sur chaque pointe, handleCrownClick ne
               propose rien — l'etape devenait un mur.

               Deux recours, dans cet ordre :
               1. rapprocher le non-porteur sur une terre existante, en
                  preferant la diagonale (elle enseigne deux verites) ;
               2. si le vide est partout, FAIRE SURGIR la case qui manque, a la
                  vue de tous et avec le son de la pose. On ne rafistole pas en
                  cachette : le monde donne le pont, et c'est exactement le
                  sujet de l'acte II. */
            if (porteur && autre && !eveilRelaisRoute(porteur, autre)) {
              const libre = ([r, c]) => isLand(r, c) && !characterAt(r, c);
              const diagonales = g => [[g.r - 1, g.c - 1], [g.r - 1, g.c + 1],
              [g.r + 1, g.c - 1], [g.r + 1, g.c + 1]];
              const orthos = g => [[g.r - 1, g.c], [g.r + 1, g.c], [g.r, g.c - 1], [g.r, g.c + 1]];

              const place =
                diagonales(porteur).find(d => libre(d) && eveilCaseCommune(porteur, { r: d[0], c: d[1] }))
                || orthos(porteur).find(libre)
                || null;
              if (place) { autre.r = place[0]; autre.c = place[1]; }

              if (!eveilRelaisRoute(porteur, autre)) {
                // La case commune GEOMETRIQUE, terre ou pas : c'est elle qu'on
                // materialise. On ne cherche que si les deux sont en diagonale.
                const cles = new Set(orthos(autre).map(([r, c]) => r + "," + c));
                const pont = orthos(porteur).find(([r, c]) =>
                  cles.has(r + "," + c) && r >= 0 && c >= 0 && r < GRID && c < GRID
                  && !characterAt(r, c));
                if (pont) {
                  const id = tutoAddIsland([pont]);
                  const ile = (state.islands || []).find(i => i.id === id);
                  try { if (ile && typeof animateIslandArrival === "function") animateIslandArrival(ile); } catch (_) { }
                  try { if (typeof playSfx === "function") playSfx("island"); } catch (_) { }
                }
              }
            }
            EVEIL.porteurInitial = eveilPorteur()?.id || null;
            eveilMainConfortable();
            eveilResetSelection();
            tutoRender();
          },
          souffle() {
            const porteur = eveilPorteur();
            const autre = porteur && eveilAutreGardien(porteur.id);
            if (!porteur || !autre) return [];
            return [[porteur.r, porteur.c, 900, .8], [autre.r, autre.c, 1300, .6]];
          },
          // La lueur se pose sur la couronne portee : c'est ELLE, l'objet du
          // geste, pas le Gardien.
          compagnon() {
            const porteur = eveilPorteur();
            return porteur ? [porteur.r, porteur.c, 1.15] : null;
          },
          appel() {
            const porteur = eveilPorteur();
            const autre = porteur && eveilAutreGardien(porteur.id);
            return { cells: [porteur, autre].filter(Boolean).map(g => [g.r, g.c]) };
          },
          /* Cote a cote : un trait droit, la Couronne se donne. En diagonale :
             le fil passe par la case commune, et c'est lui qui dit « pose-la
             ici, il viendra la reprendre ». La meme image sert les deux
             regles du jeu, sans un mot pour les distinguer. */
          promesse() {
            const porteur = eveilPorteur();
            const autre = porteur && eveilAutreGardien(porteur.id);
            if (!porteur || !autre) return null;
            const commune = eveilDistance(porteur, autre) === 1
              ? null : eveilCaseCommune(porteur, autre);
            return {
              de: [porteur.r, porteur.c],
              vers: [autre.r, autre.c],
              par: commune
            };
          },
          dernierRecours() {
            const porteur = eveilPorteur();
            const autre = porteur && eveilAutreGardien(porteur.id);
            if (!porteur || !autre) return;
            const commune = eveilDistance(porteur, autre) === 1
              ? null : eveilCaseCommune(porteur, autre);
            eveilFantomeCouronne([porteur.r, porteur.c], [autre.r, autre.c], commune);
          },
          faite() {
            const porteur = eveilPorteur();
            return !!(porteur && EVEIL.porteurInitial
              && String(porteur.id) !== String(EVEIL.porteurInitial));
          },
          son: "crown"
        }
      ];

      /* ==================================================================
         MOTEUR
         ================================================================== */

      function eveilAller(index) {
        const etape = EVEIL_ETAPES[index];
        if (!etape) return eveilFinir();
        eveilDesarmer();
        EVEIL.etape = index;
        EVEIL.etapeDepuis = Date.now();
        EVEIL.franchie = false;
        EVEIL.aide = 0;
        EVEIL.aideMax = 0;
        try { localStorage.setItem(EVEIL_STORAGE_KEY, String(index)); } catch (_) { }

        try { etape.entrer?.(); } catch (err) { console.warn("[eveil] entrer", etape.id, err); }

        // Le SOUFFLE se joue APRES l'entree : les plans se calculent sur le
        // monde tel qu'il vient d'etre prepare.
        const plans = (typeof etape.souffle === "function") ? (etape.souffle() || []) : [];
        if (plans.length) {
          eveilSouffle(plans).then(() => { if (EVEIL.active) EVEIL.touche = Date.now(); });
        }
        eveilArmer(etape);
      }

      /* Monte l'aide d'un cran. Chaque palier AJOUTE au precedent, il ne le
         remplace pas : la lueur, puis la lumiere, puis le fil, puis le geste. */
      function eveilMonterAide(etape, niveau) {
        EVEIL.aide = niveau;
        EVEIL.aideMax = Math.max(EVEIL.aideMax, niveau);
        try {
          if (niveau >= 1) {
            const ou = etape.compagnon?.();
            if (ou) eveilCompagnonVers(ou[0], ou[1], ou[2]);
            eveilCompagnonHumeur("impatient");
          }
          if (niveau >= 2) {
            const spec = etape.appel?.();
            if (spec) eveilAppel(spec, niveau === 2);
            if (typeof etape.inviter === "function") etape.inviter();
            else if (!EVEIL.souffle) {
              const cible = spec?.cells?.[0] || (() => { const g = eveilGardien(); return g && [g.r, g.c]; })();
              if (cible) eveilTravel(cible[0], cible[1], 1100, .3);
            }
          }
          if (niveau >= 3) {
            const p = etape.promesse?.();
            if (p) eveilPromesse(p.de, p.vers, p.par);
          }
          if (niveau >= 4) {
            const f = etape.fantome?.();
            if (f) eveilFantomeMarche(f.charId, f.de, f.vers);
            // Toutes les etapes ne s'expliquent pas par une silhouette qui
            // marche : certaines ont leur propre dernier recours.
            else if (typeof etape.dernierRecours === "function") etape.dernierRecours();
          }
        } catch (err) { console.warn("[eveil] aide", etape.id, err); }
      }

      function eveilAideStop() {
        EVEIL.aide = 0;
        eveilAppelStop();
        eveilPromesseStop();
        eveilFantomeStop();
        eveilCompagnonHumeur("calme");
      }

      function eveilArmer(etape) {
        EVEIL.touche = Date.now();
        const verifier = () => {
          if (!EVEIL.active || EVEIL_ETAPES[EVEIL.etape] !== etape) return;
          try { etape.tick?.(); } catch (_) { }

          // Pendant un plan, le joueur n'a pas la main : le compteur
          // d'immobilite n'a aucun sens, on le tient a zero.
          if (EVEIL.souffle) EVEIL.touche = Date.now();
          else {
            const immobile = Date.now() - EVEIL.touche;
            let vise = 0;
            for (let i = 0; i < EVEIL_AIDE.length; i++) {
              if (immobile > EVEIL_AIDE[i]) vise = i + 1;
            }
            if (vise > EVEIL.aide) eveilMonterAide(etape, vise);
          }

          let ok = false;
          try { ok = !!etape.faite(); } catch (_) { ok = false; }
          if (!ok) return;
          eveilDesarmer();
          eveilAideStop();
          eveilEtapeFranchie(etape);
        };
        EVEIL.timer = setInterval(verifier, 250);

        const bus = window.ILYOS_VISUAL_EVENTS;
        if (bus && typeof bus.on === "function") {
          ["islandPlaced", "characterSpawned", "crownPicked", "characterMoveEnded",
            "characterPushed", "characterFell", "islandRotated", "crownScored"]
            .forEach(nom => EVEIL.unsubs.push(bus.on(nom, () => setTimeout(verifier, 40))));
        }
      }

      function eveilDesarmer() {
        clearInterval(EVEIL.timer);
        EVEIL.timer = null;
        EVEIL.unsubs.forEach(u => { try { u?.(); } catch (_) { } });
        EVEIL.unsubs = [];
      }

      function eveilEtapeFranchie(etape) {
        /* Les evenements visuels relancent la verification par un setTimeout :
           un appel deja programme survit au desarmement et refranchissait
           l'etape une seconde fois — trace en double, assentiment en double,
           et surtout l'entree de l'etape suivante rejouee (donc, au relais,
           deux ponts au lieu d'un). */
        if (EVEIL.franchie) return;
        EVEIL.franchie = true;
        EVEIL.trace.push({
          id: etape.id,
          secondes: Math.round((Date.now() - EVEIL.etapeDepuis) / 100) / 10,
          aide: EVEIL.aideMax
        });

        // Une etape qui installe un manque ne se felicite pas.
        if (etape.sortie === "refus") eveilRefus();
        else eveilAssentiment(etape.son);

        const suivante = EVEIL.etape + 1;
        clearTimeout(EVEIL.suiteTimer);
        EVEIL.suiteTimer = setTimeout(() => {
          if (EVEIL.active) eveilAller(suivante);
        }, etape.sortie === "refus" ? 1800 : 1100);
      }

      /* ---------- Observation ----------------------------------------
         On n'intercepte rien : on regarde. Le clic DOM sur une case est le
         seul point de passage commun a la souris et a la manette (gamepad.js
         appelle dispatchKayKitClick, qui emet un vrai clic). */
      function eveilCaseDesignee(event) {
        if (!EVEIL.active) return;
        const cell = event.target?.closest?.(".cell");
        if (!cell) return;
        const r = Number(cell.dataset.r);
        const c = Number(cell.dataset.c);
        EVEIL.derniereCase = { r, c, at: Date.now() };

        // Viser le vide ne fait rien — sauf a l'etape « limite », ou c'est
        // justement la lecon et ou le geste doit aboutir.
        const etape = EVEIL_ETAPES[EVEIL.etape];
        if (etape && etape.id !== "limite" && Number.isInteger(r) && Number.isInteger(c)
          && r >= 0 && c >= 0 && r < 11 && c < 11 && !isLand(r, c)) eveilRefus();
      }

      /* Tout geste du joueur redescend l'aide a zero : il a repris la main,
         on se tait. */
      function eveilTouche() {
        if (!EVEIL.active) return;
        EVEIL.touche = Date.now();
        if (EVEIL.aide > 0) eveilAideStop();
      }

      /* ---------- Fin de l'acte livre -------------------------------- */
      function eveilFinir() {
        eveilDesarmer();
        eveilAideStop();
        try { localStorage.setItem(TUTO_STORAGE_KEY, "1"); } catch (_) { }
        try { localStorage.removeItem(EVEIL_STORAGE_KEY); } catch (_) { }

        /* ACTE I LIVRE. Les actes II a IV s'ajoutent a EVEIL_ETAPES ; tant
           qu'ils manquent, on rend la main proprement plutot que de laisser
           le joueur dans un monde de quatre cases. Le manque installe par
           « la limite » reste donc sans reponse : c'est assume, et c'est
           exactement ce que l'acte II viendra combler. */
        TUTO.cinematic = true;
        tutoLetterbox(true);
        const g = eveilGardien();
        if (g) eveilTravel(g.r, g.c, 2600, -2.4);   // on s'eloigne du caillou
        setTimeout(() => { if (EVEIL.active) eveilCarteDeFin(); }, 2800);
      }

      function eveilCarteDeFin() {
        const d = TUTO.dom;
        if (!d || d.layer.querySelector(".tuto-end")) return;
        const fin = document.createElement("div");
        fin.className = "tuto-end";
        fin.innerHTML = `
          <h2>Le monde est trop petit.</h2>
          <p>La suite de l'Eveil arrive.</p>
          <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center">
            <button type="button" class="tuto-btn primary" data-tuto="play">Entrer dans une vraie partie</button>
            <button type="button" class="tuto-btn" data-tuto="menu">Retour au menu</button>
          </div>`;
        d.layer.appendChild(fin);
        fin.querySelector('[data-tuto="menu"]').addEventListener("click", () => tutoExit(true));
        fin.querySelector('[data-tuto="play"]').addEventListener("click", () => {
          tutoExit(false);
          try {
            els.gameScreen.classList.add("hidden");
            els.setupScreen.classList.remove("hidden");
          } catch (_) { }
        });
      }

      /* ==================================================================
         LE SAS D'OUVERTURE

         Noir. Puis le Gardien seul au milieu du vide, et la camera qui tourne
         lentement autour de lui avant de s'arreter. Le compagnon nait de lui.

         C'est la seule phrase du tutoriel, et c'est la camera qui la dit :
         « tu es la, tu es seul, et le monde tient sur ce caillou ».
         ================================================================== */
      async function eveilSasOuverture() {
        EVEIL.souffle = true;
        TUTO.cinematic = true;
        tutoLetterbox(true);
        tutoFadeBlack(true);
        await tutoWaitForScene();
        if (!EVEIL.active) return;

        const g = eveilGardien() || { r: EVEIL_DEPART[0], c: EVEIL_DEPART[1] };
        tutoTravel(g.r, g.c, 200, 1.4);           // serre sur lui, dans le noir
        await tutoWait(500);
        tutoTravel(g.r, g.c, 200, 1.4);           // second appel : le cadrage tient
        await tutoWait(400);
        tutoFadeBlack(false);                     // il apparait
        try { if (typeof playSfx === "function") playSfx("spawn"); } catch (_) { }
        await tutoWait(1900);                     // un temps de silence sur lui
        if (!EVEIL.active) return;

        // Le compagnon nait de lui, monte, et s'ecarte : le premier etre vivant
        // du monde apres nous.
        eveilCompagnonNaitre(g.r, g.c);
        eveilCompagnonVers(g.r, g.c, 1.7);
        eveilCompagnonHumeur("joyeux");
        await tutoWait(1200);
        eveilCompagnonHumeur("calme");

        // La camera s'ecarte : on decouvre que le monde s'arrete la.
        tutoTravel(g.r - .5, g.c + .5, 2600, -1.1);
        await tutoWait(2400);

        tutoLetterbox(false);
        TUTO.cinematic = false;
        EVEIL.souffle = false;
        if (!EVEIL.active) return;
        // La camera est rendue : c'est la pose de reference a partir de
        // laquelle l'etape « eveil » detectera un vrai mouvement du joueur.
        eveilCameraLibre();
        EVEIL.pret = true;

        let reprise = 0;
        try { reprise = Math.max(0, Number(localStorage.getItem(EVEIL_STORAGE_KEY)) || 0); } catch (_) { }
        eveilAller(Math.min(reprise, EVEIL_ETAPES.length - 1));
      }

      /* ==================================================================
         DEMARRAGE / SORTIE
         ================================================================== */
      function eveilDemarrer() {
        if (TUTO.active) return;
        EVEIL.active = true;
        EVEIL.etape = 0;
        EVEIL.pret = false;
        EVEIL.souffle = false;
        EVEIL.cameraNotre = false;
        EVEIL.aide = 0;
        EVEIL.aideMax = 0;
        EVEIL.trace = [];
        EVEIL.derniereCase = null;

        eveilInjectStyle();
        tutoInjectStyle();
        tutoBuildOverlay();
        tutoWatchCancelBtn();
        TUTO.dom?.layer?.classList.add("eveil");
        TUTO.active = true;
        TUTO.gateAllows = () => true;          // rien n'est jamais bloque

        try { if (typeof stopTurnTimer === "function") stopTurnTimer(); } catch (_) { }
        try { if (typeof aiRunToken !== "undefined") aiRunToken++; } catch (_) { }
        try { TUTO.prevRenderMode = boardRenderMode; } catch (_) { TUTO.prevRenderMode = "3d"; }
        try { boardRenderMode = "3d"; } catch (_) { }

        eveilBatirMonde();
        try { applyVisualMode("alternative"); } catch (_) { }
        try { if (typeof applyBoardRenderMode === "function") applyBoardRenderMode("3d", { persist: false }); } catch (_) { }
        try { els.setupScreen.classList.add("hidden"); } catch (_) { }
        try { els.gameScreen.classList.remove("hidden"); } catch (_) { }
        try { if (typeof startAmbient === "function") startAmbient(); } catch (_) { }
        els.gameScreen?.classList.add("tutorial-on", "tutorial-eveil");
        document.body.classList.add("tutorial-eveil-en-cours");

        state.turnDurationSeconds = 0;
        state.turnDeadline = null;
        state.turnTimeLeft = null;
        try { if (typeof stopTurnTimer === "function") stopTurnTimer(); } catch (_) { }

        // Observation seule : on n'intercepte aucun geste.
        els.board?.addEventListener("click", eveilCaseDesignee, true);
        els.gameScreen?.addEventListener("pointerdown", eveilTouche, true);
        window.addEventListener("keydown", tutoKeyGuard, true);

        const bus = window.ILYOS_VISUAL_EVENTS;
        if (bus && typeof bus.on === "function") {
          TUTO.fxUnsubs = [
            bus.on("characterFell", () => { if (EVEIL.active) { tutoShake(); tutoVoidPulse(); } })
          ];
        }

        eveilVerbes([]);
        eveilNudite(true);
        tutoRender();
        setTimeout(() => { if (EVEIL.active) eveilSasOuverture(); }, 450);
      }

      function eveilNettoyer() {
        clearTimeout(EVEIL.suiteTimer);
        clearTimeout(EVEIL.rendreTimer);
        clearTimeout(EVEIL.inviteTimer);
        EVEIL.active = false;
        EVEIL.pret = false;
        EVEIL.souffle = false;
        EVEIL.cameraNotre = false;
        eveilDesarmer();
        eveilAideStop();
        eveilCompagnonDisparaitre();
        eveilFantomeStop();
        eveilRendreHud();
        try { els.board?.removeEventListener("click", eveilCaseDesignee, true); } catch (_) { }
        try { els.gameScreen?.removeEventListener("pointerdown", eveilTouche, true); } catch (_) { }
        els.gameScreen?.classList.remove("tutorial-eveil", "eveil-refus");
        document.body.classList.remove("tutorial-eveil-en-cours");
        TUTO.dom?.layer?.classList.remove("eveil", "appel-doux");
      }

      // La sortie du moteur reste unique : on ajoute notre nettoyage devant
      // celui qui existe deja (decouverte, puis tutorial.js).
      {
        const sortieAvantEveil = tutoExit;
        tutoExit = function (versMenu) {
          eveilNettoyer();
          return sortieAvantEveil(versMenu);
        };
      }

      /* Le listener menu declare dans tutorial.js appelle tutoStart() au moment
         du clic. Reassigner ce binding suffit donc a faire de L'EVEIL l'entree
         officielle, sans toucher au bridge menu ni au fragment precedent. */
      tutoStart = eveilDemarrer;

      /* Les parcours precedents gardent leur point d'observation : sans ce
         relais, demarrer l'Ascension ou la Decouverte rendait un _debug vide
         et leurs harnais devenaient aveugles. */
      const eveilDebugPrecedent = window.ILYOS_TUTORIAL?._debug || (() => null);

      window.ILYOS_TUTORIAL = {
        ...window.ILYOS_TUTORIAL,
        start: eveilDemarrer,
        startEveil: eveilDemarrer,
        mode: () => EVEIL.active ? "eveil"
          : (typeof DISCOVERY !== "undefined" && DISCOVERY.active) ? "discovery"
            : (TUTO.active ? "ascension" : null),
        // Reprise : oublier la progression pour repartir du premier souffle.
        oublier: () => { try { localStorage.removeItem(EVEIL_STORAGE_KEY); } catch (_) { } },
        _debug: () => {
          if (!EVEIL.active) return eveilDebugPrecedent();
          const etape = EVEIL_ETAPES[EVEIL.etape];
          return {
            mode: "eveil",
            acte: etape?.acte || null,
            etape: EVEIL.etape,
            id: etape?.id || null,
            // `id` vaut la premiere etape des l'ouverture : il ne dit pas que
            // le parcours a commence. `pret` le dit.
            pret: EVEIL.pret,
            souffle: EVEIL.souffle,
            aide: EVEIL.aide,
            aideMax: EVEIL.aideMax,
            trace: EVEIL.trace.slice(),
            compagnon: !!EVEIL.compagnon,
            fantome: !!EVEIL.fantome,
            phase: state?.phase,
            inputLocked: !!state?.inputLocked,
            peutAgir: (() => { try { return !!canLocalPlayerAct(); } catch (e) { return String(e); } })(),
            currentPlayer: state?.currentPlayer,
            selectedCharId: state?.selectedCharId || null,
            selectedAction: state?.selectedActionType || null,
            chars: (state?.characters || []).map(ch => ({ id: ch.id, p: ch.player, r: ch.r, c: ch.c })),
            derniereCase: EVEIL.derniereCase,
            couronne: EVEIL.couronne,
            ilePosee: !!eveilNouvelleIle(),
            iles: (state?.islands || []).map(i => ({ neuve: !i.fromSetup, cells: i.cells })),
            porteur: state?.artifact?.carrierId || null,
            relais: (() => {
              const p = eveilPorteur();
              const a = p && eveilAutreGardien(p.id);
              return p && a ? eveilRelaisRoute(p, a) : null;
            })(),
            // Cases ou le nouveau Gardien peut s'eveiller (phase PLACE_SPAWN).
            spawnCells: (() => {
              if (state?.phase !== "PLACE_SPAWN") return null;
              const ile = (state.islands || []).find(i => i.id === state.pendingSpawnIslandId);
              return (ile?.cells || []).filter(([r, c]) => !characterAt(r, c));
            })(),
            verbesVisibles: Object.entries(EVEIL_VERBES)
              .filter(([, sel]) => {
                const el = document.querySelector(sel);
                return el && !el.classList.contains("eveil-cache");
              }).map(([nom]) => nom)
          };
        }
      };
