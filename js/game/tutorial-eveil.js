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

          /* RECOMMENCER. Pose a droite, la ou vivait le bouton de voix que le
             parcours muet n'utilise pas. Aussi discret que « Quitter » : on le
             trouve quand on le cherche, il ne quemande jamais l'attention. */
          #tutorialLayer .eveil-refaire{position:absolute;right:16px;bottom:72px;z-index:9;
            pointer-events:auto;cursor:pointer;font:inherit;font-size:12px;
            letter-spacing:.03em;padding:7px 14px;border-radius:999px;color:#c8d4ee;
            background:rgba(9,16,34,.92);border:1px solid rgba(120,150,210,.4);
            box-shadow:0 4px 18px rgba(0,0,0,.4);opacity:.5;
            transition:opacity .3s, background .2s;}
          #tutorialLayer .eveil-refaire:hover{opacity:1;background:rgba(18,28,52,.95);color:#eef3ff;}

          /* Un verbe pas encore acquis n'existe pas : il est retiré, pas
             grise. On ne montre jamais un pouvoir qu'on n'a pas. */
          #gameScreen.tutorial-eveil .eveil-cache{display:none!important;}

          /* POURQUOI L'EVEIL N'UTILISE PAS LA CLASSE tutorial-on
             La feuille de tutorial.js masque #ov2Undo et #ov2End en dur des
             que #gameScreen porte tutorial-on. C'etait juste pour l'Ascension,
             dont le recit ne rend jamais ces deux verbes. Ici l'annulation est
             un POUVOIR qui s'acquiert (acte III) et la fin de tour aussi
             (acte IV) : on ne peut pas les tenir caches par une regle qu'on ne
             controle pas, et surcharger sa specificite pour la defaire serait
             pire. On reprend donc a notre compte, ci-dessous, la seule partie
             utile de cette liste — sans End ni Undo, gouvernes par eveilVerbes
             et la classe .eveil-cache. */
          #gameScreen.tutorial-eveil #endTurnBtn,
          #gameScreen.tutorial-eveil #cancelCardBtn,
          #gameScreen.tutorial-eveil #ov2Gear,
          #gameScreen.tutorial-eveil #hudV2GearBtn,
          #gameScreen.tutorial-eveil #turnTimer,
          #gameScreen.tutorial-eveil #ov2Timer,
          #gameScreen.tutorial-eveil [data-hud="timer"],
          #gameScreen.tutorial-eveil .turn-timer,
          #gameScreen.tutorial-eveil [data-hud-render],
          #gameScreen.tutorial-eveil [data-hud-camera],
          #gameScreen.tutorial-eveil .kaykit-camera-hint,
          #gameScreen.tutorial-eveil .kaykit-camera-controls,
          #gameScreen.tutorial-eveil .kaykit-control-btn,
          #gameScreen.tutorial-eveil .kaykit-ui,
          #gameScreen.tutorial-eveil .kaykit-controls,
          #gameScreen.tutorial-eveil [data-hud-render-toggle],
          #gameScreen.tutorial-eveil .hud-v2-render-toggle,
          #gameScreen.tutorial-eveil #instruction,
          #gameScreen.tutorial-eveil .ov2-instruction,
          #gameScreen.tutorial-eveil #newGameBtn{display:none!important;}

          /* L'APPEL fait respirer un bouton du HUD. tutoGuideStart pose la
             classe .tuto-pulse, dont l'animation vit sous tutorial-on : on la
             redeclare ici, puisqu'on ne porte plus cette classe. */
          #gameScreen.tutorial-eveil .tuto-pulse{position:relative;
            animation:tuto-pulse-k 1.9s ease-in-out infinite;
            filter:drop-shadow(0 0 10px rgba(255,226,150,.9)) drop-shadow(0 0 24px rgba(255,206,110,.55));}

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
          /* La nudite se leve PAR MORCEAUX : le tour et le score reviennent
             quand le temps devient un sujet (acte IV), les piles de cartes
             quand les cartes deviennent reelles. Deux classes, donc, et non
             un interrupteur unique. */
          body.eveil-sans-tour #gameScreen #ilyosHudOrganicV2 .ov2-top,
          body.eveil-sans-tour #gameScreen #ilyosHudOrganicV2 .ov2-instruction,
          body.eveil-sans-tour #gameScreen #ilyosHudOrganicV2 #ov2Toast,
          body.eveil-sans-tour #gameScreen #hudV2Top,
          body.eveil-sans-tour #plateauTactiqueBtn{display:none!important;}

          body.eveil-sans-piles #gameScreen #ilyosHudOrganicV2 .ov2-pile-hud,
          body.eveil-sans-piles #gameScreen #ov2DeckHud,
          body.eveil-sans-piles #gameScreen #ov2DiscardHud{display:none!important;}

          /* Le compte de cartes sous un verbe (« x8 ») raconte deja l'economie
             du jeu, qui n'arrive qu'a l'acte IV. Un nombre qu'on ne sait pas
             lire n'est pas une information, c'est du bruit. */
          body.eveil-sans-piles #gameScreen #ov2MoveCount,
          body.eveil-sans-piles #gameScreen #ov2PushCount,
          body.eveil-sans-piles #gameScreen #ov2MagicCount{visibility:hidden!important;}

          /* LA NUIT. Les lumieres de la scene ne touchent pas le ciel : il est
             peint, pas eclaire, et il restait en plein jour pendant que le
             plateau sombrait. Ce voile l'assombrit avec le reste.

             Il est pose SOUS les signes du parcours (z-index 3 contre 6) :
             balise, fil, rune et compagnon restent donc a pleine intensite
             au-dessus d'un monde eteint. C'est tout l'interet de la penombre —
             ce qui parle devient la seule chose qui brille. */
          #tutorialLayer .eveil-nuit{position:absolute;inset:0;z-index:3;
            pointer-events:none;
            -webkit-backdrop-filter:brightness(var(--eveil-nuit,1));
            backdrop-filter:brightness(var(--eveil-nuit,1));
            transition:-webkit-backdrop-filter 1.2s ease, backdrop-filter 1.2s ease;}

          /* LE FOYER. Le ciel d'ILYOS est peuple : sanctuaire dore, villages,
             drapeaux, ruines. Rien de tout cela n'appartient a la lecon en
             cours, et tout a l'air de vouloir dire quelque chose — c'est la
             premiere cause d'incomprehension signalee par l'auteur.

             On ne peut pas les retirer : ils sont le monde. On les fait donc
             RECULER. Ce second voile s'assombrit vers les bords et s'ouvre la
             ou l'action se passe : la peripherie devient un decor, le centre
             reste un lieu. Le point clair suit la case qui compte. */
          #tutorialLayer .eveil-foyer{position:absolute;inset:0;z-index:4;
            pointer-events:none;opacity:var(--foyer-force,0);
            background:radial-gradient(circle at var(--foyer-x,50%) var(--foyer-y,46%),
              rgba(4,7,16,0) 0%, rgba(4,7,16,0) 24%,
              rgba(4,7,16,.34) 44%, rgba(4,7,16,.74) 72%, rgba(4,7,16,.88) 100%);
            transition:opacity 1.4s ease, background-position .9s ease;}

          /* LA RUNE : gravee dans l'air, au centre, au-dessus du plateau.
             Elle entre en se dessinant, tient quelques secondes, puis part. */
          /* La rune doit se LIRE : posee haut, hors du plateau, assez grande
             pour etre reconnue d'un coup d'oeil, et assez contrastee pour
             tenir aussi bien sur une ile verte que sur le ciel. Une premiere
             version, fine et pale au milieu de l'image, passait inapercue. */
          #tutorialLayer .eveil-rune{position:absolute;left:50%;top:25%;
            transform:translate(-50%,-50%);z-index:8;pointer-events:none;
            color:rgba(255,248,224,1);
            padding:18px 26px;border-radius:50%;
            background:radial-gradient(circle,rgba(8,12,24,.62) 0%,rgba(8,12,24,.34) 58%,rgba(8,12,24,0) 78%);
            filter:drop-shadow(0 0 18px rgba(255,214,120,1)) drop-shadow(0 3px 10px rgba(8,6,2,.9));
            animation:eveil-rune-in 1.1s cubic-bezier(.2,.8,.2,1) both;}
          #tutorialLayer .eveil-rune svg{width:clamp(104px,14vw,168px);height:auto;display:block;}
          #tutorialLayer .eveil-rune.part{animation:eveil-rune-out .9s ease both;}
          @keyframes eveil-rune-in{
            0%{opacity:0;transform:translate(-50%,-50%) scale(.6) rotate(-8deg)}
            60%{opacity:1;transform:translate(-50%,-50%) scale(1.08) rotate(2deg)}
            100%{opacity:.95;transform:translate(-50%,-50%) scale(1) rotate(0)}}
          @keyframes eveil-rune-out{
            0%{opacity:.95}100%{opacity:0;transform:translate(-50%,-62%) scale(1.15)}}

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

          /* LA BALISE NE DOIT PAS EFFACER CE QU'ELLE DESIGNE.

             La colonne de lumiere heritee de l'Ascension est dense a sa base :
             posee sur la case d'un Gardien, elle le recouvrait entierement —
             verifie a l'ecran, le personnage etait bien dans la scene, visible,
             opacite 1, et pourtant introuvable a l'image. Une balise qui cache
             son sujet ne designe plus rien.

             On l'allege et on la creuse : plus etroite, transparente au pied,
             elle devient un halo qui monte au lieu d'un mur de lumiere. C'est
             l'anneau au sol (::after) qui porte desormais la designation. */
          #tutorialLayer.eveil .tuto-beacon::before{
            left:-11px;width:22px;height:150px;opacity:.55;
            -webkit-mask-image:linear-gradient(to top,transparent 0%,#000 34%,#000 58%,transparent 100%);
            mask-image:linear-gradient(to top,transparent 0%,#000 34%,#000 58%,transparent 100%);}
          #tutorialLayer.eveil .tuto-beacon::after{border-width:3px;}

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
      /* Trois couleurs, trois humeurs. Le compagnon ne parle pas : il change
         de temperature. Chaud et bas quand tout va bien, blanc et vif quand il
         s'impatiente, eclatant quand il exulte. */
      const EVEIL_HUMEURS = {
        calme: { couleur: 0xffc879, taille: .30, opacite: .95, trainee: .35 },
        impatient: { couleur: 0xffe0a0, taille: .40, opacite: 1.2, trainee: .8 },
        joyeux: { couleur: 0xffd489, taille: .48, opacite: 1.4, trainee: 1 }
      };

      /* Au repos, il flotte A COTE du Gardien et non sur sa tete : centre sur
         lui, il l'avalait purement et simplement — un compagnon ne doit jamais
         cacher ce qu'il accompagne. Il derive lentement autour, ce qui suffit
         a le rendre vivant sans le rendre agite. */
      const EVEIL_REPOS_RAYON = .62;

      const EVEIL_TRAINEE = 7;   // nombre de perles derriere elle

      function eveilLueur(map, taille, opacite, couleur) {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
          map, transparent: true, depthWrite: false, opacity: opacite,
          color: new THREE.Color(couleur),
          blending: THREE.AdditiveBlending, toneMapped: false
        }));
        sprite.scale.setScalar(taille);
        return sprite;
      }

      /* LE COMPAGNON, en chair de lumiere.

         Un simple point blanc se lisait comme un curseur colle sur la vitre.
         Il est fait de trois choses : un COEUR dense, un HALO large et doux
         autour, et une TRAINEE de perles qui retiennent ses positions passees.
         C'est la trainee qui fait tout le travail — elle donne une direction,
         donc une intention, donc une presence. */
      function eveilCompagnonNaitre(r, c) {
        if (EVEIL.compagnon || typeof THREE === "undefined") return null;
        if (!kaykit3D?.fxGroup) return null;
        let map = null;
        try { map = kaykitGlowTexture(); } catch (_) { }

        const h = EVEIL_HUMEURS.calme;
        const halo = eveilLueur(map, h.taille * 3.4, 0, h.couleur);
        const coeur = eveilLueur(map, h.taille, 0, 0xfffaf0);
        const trainee = [];
        for (let i = 0; i < EVEIL_TRAINEE; i++) {
          trainee.push(eveilLueur(map, h.taille * (.7 - i * .07), 0, h.couleur));
        }

        const p = kaykitCellPosition(r, c, .9);
        [halo, coeur, ...trainee].forEach(sprite => {
          sprite.position.set(p.x, p.y, p.z);
          kaykit3D.fxGroup.add(sprite);
        });

        EVEIL.compagnon = {
          halo, coeur, trainee,
          // Les positions passees, la plus recente en tete.
          memoire: Array.from({ length: EVEIL_TRAINEE * 3 },
            () => new THREE.Vector3(p.x, p.y, p.z)),
          cible: new THREE.Vector3(p.x, p.y, p.z),
          humeur: "calme",
          depuis: performance.now(),
          orbite: 0,
          eclat: 0            // 0..1, monte avec l'humeur
        };
        eveilCompagnonBoucle();
        return EVEIL.compagnon;
      }

      /* Elle suit sa cible en douceur — jamais de teleportation, c'est ce qui
         la rend vivante — avec un flottement propre, une humeur, et une trainee
         qui s'etire quand elle se deplace vite. */
      function eveilCompagnonBoucle() {
        const co = EVEIL.compagnon;
        if (!co || !EVEIL.active) return;
        const t = performance.now();
        const dt = Math.min(64, t - co.depuis);
        co.depuis = t;

        const h = EVEIL_HUMEURS[co.humeur] || EVEIL_HUMEURS.calme;
        // L'humeur ne bascule pas d'un coup : elle se rejoint.
        co.eclat += ((co.humeur === "calme" ? 0 : co.humeur === "impatient" ? .6 : 1) - co.eclat)
          * Math.min(1, dt / 260);

        // Approche exponentielle : vive de loin, posee de pres.
        const vise = co.navette ? eveilNavetteCible(co) : co.cible;
        const k = 1 - Math.pow(co.navette ? .00002 : .0022, dt / 1000);
        co.coeur.position.lerp(vise, k);

        // Flottement propre, plus ample quand elle exulte.
        co.orbite += dt / (co.humeur === "joyeux" ? 90 : co.humeur === "impatient" ? 160 : 620);
        co.coeur.position.y += Math.sin(co.orbite) * (.02 + co.eclat * .05);
        if (co.humeur === "impatient" || co.humeur === "joyeux") {
          co.coeur.position.x += Math.cos(co.orbite) * .045 * co.eclat;
          co.coeur.position.z += Math.sin(co.orbite) * .045 * co.eclat;
        }

        // La memoire des positions : c'est elle qui dessine la trainee.
        co.memoire.pop();
        co.memoire.unshift(co.coeur.position.clone());

        const battement = 1 + Math.sin(t / (160 + (1 - co.eclat) * 540)) * (.05 + co.eclat * .1);
        co.coeur.scale.setScalar(h.taille * battement);
        co.coeur.material.opacity = Math.min(1, co.coeur.material.opacity + dt / 500);

        // Le halo est large et chaud : c'est LUI qui donne la couleur, le
        // coeur n'etant qu'un point blanc au centre. Sans ca, l'additif lavait
        // tout et il ne restait qu'une bille blanche.
        co.halo.position.copy(co.coeur.position);
        co.halo.scale.setScalar(h.taille * 3.4 * battement);
        co.halo.material.color.setHex(h.couleur);
        co.halo.material.opacity = Math.min(h.opacite * .5,
          co.halo.material.opacity + dt / 700);

        co.trainee.forEach((perle, i) => {
          const souvenir = co.memoire[(i + 1) * 2] || co.memoire[co.memoire.length - 1];
          perle.position.copy(souvenir);
          const fondu = 1 - (i + 1) / (EVEIL_TRAINEE + 1);
          perle.scale.setScalar(h.taille * .62 * fondu * battement);
          perle.material.color.setHex(h.couleur);
          perle.material.opacity = h.trainee * fondu * .5;
        });

        EVEIL.compagnonFrame = requestAnimationFrame(eveilCompagnonBoucle);
      }

      // L'envoyer sur une case. hauteur : au-dessus du sol, en cases.
      function eveilCompagnonVers(r, c, hauteur = .95) {
        const co = EVEIL.compagnon;
        if (!co) return;
        co.navette = null;
        try {
          const p = kaykitCellPosition(r, c, hauteur);
          co.cible.set(p.x, p.y, p.z);
        } catch (_) { }
      }

      /* LA NAVETTE — le geste qui manquait.

         Se poser sur une case dit « ici ». Beaucoup d'etapes demandent tout
         autre chose : « d'ici A LA ». Le compagnon fait donc l'aller-retour
         entre les deux, lentement, en marquant un temps a chaque bout. Sa
         trainee dessine le trajet derriere lui — c'est elle qui raconte la
         direction, et elle le fait mieux qu'un trait fixe.

         Ajoute apres un retour de l'auteur : le compagnon designait sans
         jamais rien montrer, et le parcours restait obscur. */
      function eveilCompagnonNavette(de, vers, hauteur = .95) {
        const co = EVEIL.compagnon;
        if (!co || !de || !vers) return;
        try {
          const a = kaykitCellPosition(de[0], de[1], hauteur);
          const b = kaykitCellPosition(vers[0], vers[1], hauteur);
          co.navette = {
            a: new THREE.Vector3(a.x, a.y, a.z),
            b: new THREE.Vector3(b.x, b.y, b.z),
            depuis: performance.now()
          };
        } catch (_) { }
      }

      /* Position voulue a cet instant : un bout, puis l'autre, avec une pause
         sur chacun. Le va-et-vient dure ~3,4 s et ne s'arrete jamais tant que
         l'etape dure — on peut donc le rattraper si on regardait ailleurs. */
      function eveilNavetteCible(co) {
        const n = co.navette;
        if (!n) return co.cible;
        const CYCLE = 3400, PAUSE = 700;
        const t = (performance.now() - n.depuis) % CYCLE;
        const moitie = CYCLE / 2;
        const aller = t < moitie;
        const local = aller ? t : t - moitie;
        const course = moitie - PAUSE;
        const u = Math.max(0, Math.min(1, (local - PAUSE) / course));
        const e = u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        return co.cible.copy(aller ? n.a : n.b).lerp(aller ? n.b : n.a, e);
      }

      function eveilCompagnonHumeur(humeur) {
        if (EVEIL.compagnon) EVEIL.compagnon.humeur = humeur || "calme";
      }

      /* CE QUE LE COMPAGNON DOIT MONTRER, pour une etape donnee.

         S'il existe un trajet (la Promesse en decrit un : d'ou, vers ou), on
         fait la navette — c'est le geste qui dit « de la a la ». Sinon on se
         pose sur la case qui compte. Une seule regle pour les seize etapes,
         plutot qu'une declaration par etape : impossible d'en oublier une. */
      function eveilCompagnonMontrer(etape) {
        if (!EVEIL.compagnon || !etape) return false;
        let trajet = null;
        try { trajet = etape.promesse?.(); } catch (_) { }
        if (trajet?.de && trajet?.vers) {
          eveilCompagnonNavette(trajet.de, trajet.vers);
          return true;
        }
        let ou = null;
        try { ou = etape.compagnon?.(); } catch (_) { }
        if (ou) { eveilCompagnonVers(ou[0], ou[1], ou[2]); return true; }
        return false;
      }

      /* A l'entree d'une etape, le compagnon montre TOUT DE SUITE, le temps de
         deux allers-retours, puis se retire. Attendre huit secondes
         d'immobilite avant de rien montrer supposait que le joueur sache deja
         quoi chercher — c'est precisement ce qu'il ne sait pas. */
      function eveilCompagnonPresenter(etape) {
        clearTimeout(EVEIL.montreTimer);
        if (!eveilCompagnonMontrer(etape)) return;
        eveilCompagnonHumeur("calme");
        EVEIL.montreTimer = setTimeout(() => {
          if (EVEIL.active && EVEIL.aide === 0 && EVEIL.compagnon) {
            EVEIL.compagnon.navette = null;
          }
        }, 7200);
      }

      /* Quand rien ne la reclame, elle ne reste pas plantee sur la derniere
         case eclairee : elle revient flotter au-dessus du Gardien. C'est ce
         qui la fait lire comme une compagne plutot que comme un marqueur. */
      function eveilCompagnonAuRepos() {
        const co = EVEIL.compagnon;
        if (!co || EVEIL.aide > 0 || EVEIL.souffle || co.navette) return;
        const g = eveilPorteur?.() || eveilGardien();
        if (!g) return;
        co.navette = null;
        try {
          const p = kaykitCellPosition(g.r, g.c, 1.1);
          const a = performance.now() / 2600;
          co.cible.set(
            p.x + Math.cos(a) * EVEIL_REPOS_RAYON,
            p.y,
            p.z + Math.sin(a) * EVEIL_REPOS_RAYON
          );
        } catch (_) { }
      }

      function eveilCompagnonDisparaitre() {
        cancelAnimationFrame(EVEIL.compagnonFrame);
        EVEIL.compagnonFrame = 0;
        const co = EVEIL.compagnon;
        if (co) {
          [co.halo, co.coeur, ...(co.trainee || [])].forEach(sprite => {
            sprite?.parent?.remove(sprite);
            sprite?.material?.dispose?.();
          });
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
      const EVEIL_FANTOME_OPACITE = .58;

      /* Fabrique une silhouette translucide a partir du visuel DEJA charge du
         Gardien : c'est exactement lui, pas un symbole approximatif. Teintee
         d'un bleu froid pour qu'on la distingue au premier coup d'oeil de
         l'original — une premiere version, simplement transparente, se
         confondait avec le Gardien qu'elle recouvrait. */
      function eveilSilhouette(charId) {
        const visual = kaykit3D?.characterVisuals?.get(String(charId));
        if (!visual?.wrapper || !kaykit3D?.fxGroup || typeof THREE === "undefined") return null;
        let clone = null;
        try { clone = visual.wrapper.clone(true); } catch (_) { return null; }
        clone.traverse(obj => {
          if (!obj.isMesh) return;
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          obj.material = mats.map(m => {
            const copie = m.clone();
            copie.transparent = true;
            copie.opacity = EVEIL_FANTOME_OPACITE;
            copie.depthWrite = false;
            copie.color = new THREE.Color(0x9ecbff);
            if (copie.emissive) {
              copie.emissive = new THREE.Color(0x3f6fb5);
              if (typeof copie.emissiveIntensity === "number") copie.emissiveIntensity = 1.1;
            }
            return copie;
          });
          if (obj.material.length === 1) obj.material = obj.material[0];
        });
        kaykit3D.fxGroup.add(clone);
        return clone;
      }

      function eveilFantomeOpacite(objet, valeur) {
        objet?.traverse(obj => {
          if (!obj.isMesh) return;
          (Array.isArray(obj.material) ? obj.material : [obj.material])
            .forEach(m => { m.opacity = valeur; });
        });
      }

      /* LE FANTOME QUI MARCHE. Dernier recours : la silhouette part de la case
         du Gardien, fait le geste attendu, et s'efface. Elle ne change RIEN a
         l'etat du jeu — elle montre, elle ne fait pas a la place.

         Elle passe DEUX fois : un seul aller est trop facile a manquer quand on
         regarde ailleurs, et c'est precisement parce qu'on regardait ailleurs
         qu'on en est arrive la. Un anneau se pose a l'arrivee, pour que la
         destination ne fasse aucun doute. */
      function eveilFantomeMarche(charId, de, vers, passages = 2) {
        eveilFantomeStop();
        const clone = eveilSilhouette(charId);
        if (!clone) return;
        EVEIL.fantome = clone;

        const a = kaykitCellPosition(de[0], de[1], 0);
        const b = kaykitCellPosition(vers[0], vers[1], 0);
        const PAUSE = 500, ALLER = 1700, TENIR = 600, FONDU = 700;
        const CYCLE = PAUSE + ALLER + TENIR;
        const TOTAL = CYCLE * passages;
        const depart = performance.now();
        let anneauxPoses = 0;

        const jouer = () => {
          if (!EVEIL.active || EVEIL.fantome !== clone) return;
          const t = performance.now() - depart;

          if (t < TOTAL) {
            const passage = Math.floor(t / CYCLE);
            const local = t - passage * CYCLE;
            if (local < PAUSE) {
              clone.position.set(a.x, a.y, a.z);
              eveilFantomeOpacite(clone, EVEIL_FANTOME_OPACITE * (local / PAUSE));
            } else if (local < PAUSE + ALLER) {
              const u = (local - PAUSE) / ALLER;
              const e = u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
              clone.position.set(
                a.x + (b.x - a.x) * e,
                a.y + Math.sin(e * Math.PI) * .22,
                a.z + (b.z - a.z) * e
              );
              eveilFantomeOpacite(clone, EVEIL_FANTOME_OPACITE);
            } else {
              clone.position.set(b.x, b.y, b.z);
              // Un anneau a l'arrivee, une fois par passage : la destination
              // ne doit faire aucun doute.
              if (anneauxPoses <= passage) {
                anneauxPoses = passage + 1;
                try { spawnGroundBurst(clone.position, new THREE.Color(0x9ecbff), { radius: .42, duration: 560 }); } catch (_) { }
              }
              eveilFantomeOpacite(clone,
                EVEIL_FANTOME_OPACITE * (1 - (local - PAUSE - ALLER) / TENIR));
            }
          } else if (t < TOTAL + FONDU) {
            eveilFantomeOpacite(clone, EVEIL_FANTOME_OPACITE * .3 * (1 - (t - TOTAL) / FONDU));
          } else {
            eveilFantomeStop();
            return;
          }
          EVEIL.fantomeFrame = requestAnimationFrame(jouer);
        };
        jouer();
      }

      /* LE FANTOME SUR PLACE. Certaines etapes n'attendent aucun deplacement :
         designer son Gardien, choisir ou le suivant s'eveille. Une silhouette
         qui marche n'y dirait rien. Celle-ci se leve et retombe, deux fois,
         sur la case qui compte — c'est le « moi, ici » d'un etre qui appelle. */
      function eveilFantomeSurPlace(charId, ou, passages = 3) {
        eveilFantomeStop();
        const clone = eveilSilhouette(charId);
        if (!clone) return;
        EVEIL.fantome = clone;

        const p = kaykitCellPosition(ou[0], ou[1], 0);
        const SAUT = 900, FONDU = 700;
        const TOTAL = SAUT * passages;
        const depart = performance.now();

        const jouer = () => {
          if (!EVEIL.active || EVEIL.fantome !== clone) return;
          const t = performance.now() - depart;
          if (t < TOTAL) {
            const u = (t % SAUT) / SAUT;
            clone.position.set(p.x, p.y + Math.abs(Math.sin(u * Math.PI)) * .45, p.z);
            eveilFantomeOpacite(clone, EVEIL_FANTOME_OPACITE);
          } else if (t < TOTAL + FONDU) {
            eveilFantomeOpacite(clone, EVEIL_FANTOME_OPACITE * (1 - (t - TOTAL) / FONDU));
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
            copie.transparent = true; copie.opacity = EVEIL_FANTOME_OPACITE; copie.depthWrite = false;
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
          const opacite = o => eveilFantomeOpacite(couronne, o);
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
            opacite(EVEIL_FANTOME_OPACITE * (1 - (t - TOTAL) / FONDU));
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

      /* LA RUNE.

         Le seul signe du parcours qui porte une NOTION plutot qu'un lieu.
         L'acte IV parle de choses qu'aucune lumiere posee sur une case ne peut
         dire : le tour qui passe, la carte qu'on garde. On grave alors un
         signe dans l'air — jamais plus d'un a la fois, jamais accompagne d'un
         mot, et toujours efface apres quelques secondes.

         Deux runes seulement, et c'est deja beaucoup :
           sablier  le temps doit passer avant que ca compte
           cercle   ce qui n'est pas depense n'est pas perdu           */
      const T = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
      const EVEIL_RUNES = {
        // --- ACTE I : le corps ---
        oeil: `<path d="M8 48c12-18 22-26 32-26s20 8 32 26c-12 18-22 26-32 26S20 66 8 48z" ${T} stroke-width="4"/>
               <circle cx="40" cy="48" r="10" fill="currentColor"/>`,
        main: `<path d="M40 74V34M40 34a7 7 0 0 1 14 0v22M54 44a7 7 0 0 1 14 0v18c0 12-9 20-22 20h-8c-8 0-13-4-17-11l-9-15a7 7 0 0 1 11-8l7 8" ${T} stroke-width="4"/>`,
        pas: `<path d="M26 74c0-14 4-20 4-30a10 10 0 0 1 20 0c0 10 4 16 4 30z" ${T} stroke-width="4"/>
              <path d="M30 22h20" ${T} stroke-width="4" opacity=".55"/>`,
        vide: `<circle cx="40" cy="48" r="26" ${T} stroke-width="4" stroke-dasharray="7 9"/>
               <path d="M24 32l32 32M56 32L24 64" ${T} stroke-width="5"/>`,
        // --- ACTE II : le monde ---
        batir: `<path d="M12 60l28-16 28 16-28 16z" ${T} stroke-width="4"/>
                <path d="M40 44V20M28 30l12-10 12 10" ${T} stroke-width="4"/>`,
        eveiller: `<path d="M40 76V44" ${T} stroke-width="4"/>
                   <circle cx="40" cy="32" r="11" ${T} stroke-width="4"/>
                   <path d="M40 10v8M18 26l6 4M62 26l-6 4" ${T} stroke-width="3" opacity=".7"/>`,
        couronne: `<path d="M16 66h48M16 66l-4-30 16 12 12-22 12 22 16-12-4 30z" ${T} stroke-width="4"/>`,
        relais: `<path d="M20 52a10 10 0 1 1 20 0 10 10 0 1 0 20 0" ${T} stroke-width="4"/>
                 <circle cx="20" cy="52" r="6" fill="currentColor"/>
                 <circle cx="60" cy="52" r="6" fill="currentColor"/>`,
        // --- ACTE III : l'autre ---
        rival: `<circle cx="40" cy="28" r="11" ${T} stroke-width="4"/>
                <path d="M20 76c0-13 9-22 20-22s20 9 20 22" ${T} stroke-width="4"/>
                <path d="M62 18L74 30M74 18L62 30" ${T} stroke-width="4"/>`,
        chute: `<path d="M40 14v44" ${T} stroke-width="5"/>
                <path d="M26 46l14 16 14-16" ${T} stroke-width="5"/>
                <path d="M14 78h52" ${T} stroke-width="4" stroke-dasharray="6 8" opacity=".6"/>`,
        repentir: `<path d="M22 44a22 22 0 1 1 8 20" ${T} stroke-width="4.5"/>
                   <path d="M10 30v16h16" ${T} stroke-width="4.5"/>`,
        pivot: `<path d="M40 16a32 32 0 1 1-28 17" ${T} stroke-width="4.5"/>
                <path d="M28 10l12 8-12 8" ${T} stroke-width="4.5"/>
                <rect x="30" y="38" width="20" height="20" rx="3" ${T} stroke-width="3.5" opacity=".75"/>`,
        // --- ACTE IV : le temps ---
        village: `<path d="M14 46L40 24l26 22" ${T} stroke-width="4.5"/>
                  <path d="M22 44v30h36V44" ${T} stroke-width="4.5"/>
                  <path d="M34 74V56h12v18" ${T} stroke-width="4"/>`,
        sablier: `<path d="M22 12h36M22 84h36M26 12c0 18 12 24 18 30-6 6-18 12-18 30M54 12c0 18-12 24-18 30 6 6 18 12 18 30" ${T} stroke-width="4"/>
                  <path d="M33 66c2-5 8-8 7-8s5 3 7 8z" fill="currentColor" opacity=".85"/>`,
        main_vide: `<rect x="14" y="26" width="30" height="42" rx="4" ${T} stroke-width="4"/>
                    <path d="M50 34l16 6-10 30-16-6" ${T} stroke-width="4" opacity=".6" stroke-dasharray="6 7"/>`,
        cercle: `<circle cx="40" cy="48" r="26" ${T} stroke-width="4"/>
                 <circle cx="40" cy="48" r="11" ${T} stroke-width="3" opacity=".7"/>
                 <path d="M40 22v-8M40 82v-8M14 48H6M74 48h-8" ${T} stroke-width="3"/>`
      };

      function eveilRune(nom, duree = 3200) {
        const layer = TUTO.dom?.layer;
        const glyphe = EVEIL_RUNES[nom];
        if (!layer || !glyphe) return;
        eveilRuneStop();
        const node = document.createElement("div");
        node.className = "eveil-rune";
        node.innerHTML = `<svg viewBox="0 0 80 96" aria-hidden="true">${glyphe}</svg>`;
        layer.appendChild(node);
        EVEIL.runeNode = node;
        clearTimeout(EVEIL.runeTimer);
        EVEIL.runeTimer = setTimeout(() => {
          node.classList.add("part");
          setTimeout(() => { if (EVEIL.runeNode === node) eveilRuneStop(); }, 900);
        }, duree);
      }

      function eveilRuneStop() {
        clearTimeout(EVEIL.runeTimer);
        EVEIL.runeNode?.remove();
        EVEIL.runeNode = null;
      }

      /* ==================================================================
         LA PENOMBRE

         « Quasiment plonge dans l'obscurite. » Le plateau d'ILYOS est baigne
         de soleil — magnifique en partie, mais il noie les seules choses que
         le parcours a le droit de dire : la balise, le fil, le compagnon, la
         rune. Tous sont des lumieres additives. Baisser le monde, c'est les
         faire exister.

         Deux leviers, et deux seulement :
           - l'intensite de chaque lumiere de la scene ;
           - l'exposition du rendu, qui assombrit TOUT d'un coup, ciel compris.
         On ne touche ni aux materiaux, ni au ciel, ni a la brume : ils sont
         partages avec le jeu normal et on ne laisserait aucune trace propre.

         ET LA NUIT SE LEVE. Chaque acte eclaircit un peu le monde. C'est la
         recompense choisie a la conception — « le monde s'agrandit et
         s'allume » — rendue litterale : on se reveille dans le noir, on finit
         en plein jour.
         ================================================================== */
      const EVEIL_LUMIERE_KEY = "ilyos.tutorial.eveil.lumiere";

      // Par acte : la part de lumiere du monde rendue au joueur.
      const EVEIL_LUMIERE_ACTES = { 1: .34, 2: .48, 3: .66, 4: .88 };

      function eveilReglageLumiere() {
        try {
          /* Le test de presence AVANT la conversion : localStorage rend null
             quand la cle n'existe pas, et Number(null) vaut 0 — qui passe tous
             les controles de plage. Le reglage par defaut etait donc le noir
             absolu au lieu de la penombre prevue. */
          const brut = localStorage.getItem(EVEIL_LUMIERE_KEY);
          if (brut !== null && brut !== "") {
            const v = Number(brut);
            if (Number.isFinite(v) && v >= 0 && v <= 2) return v;
          }
        } catch (_) { }
        return 1;              // 1 = la penombre telle qu'elle est concue
      }

      /* Memorise l'eclairage d'origine une seule fois. Sans cette reference,
         deux applications successives multiplieraient entre elles et le monde
         s'effondrerait dans le noir. */
      function eveilMemoriserLumiere() {
        if (EVEIL.lumiereBase || !kaykit3D?.scene) return EVEIL.lumiereBase;
        const lampes = [];
        kaykit3D.scene.traverse(objet => {
          if (objet.isLight && typeof objet.intensity === "number") {
            lampes.push({ lampe: objet, intensite: objet.intensity });
          }
        });
        EVEIL.lumiereBase = {
          lampes,
          exposition: kaykit3D.renderer?.toneMappingExposure ?? 1
        };
        return EVEIL.lumiereBase;
      }

      function eveilAppliquerLumiere() {
        const base = eveilMemoriserLumiere();
        if (!base) return;
        const etape = EVEIL_ETAPES[EVEIL.etape];
        const part = EVEIL_LUMIERE_ACTES[etape?.acte] ?? 1;
        const f = Math.max(0, Math.min(2, part * eveilReglageLumiere()));
        base.lampes.forEach(({ lampe, intensite }) => { lampe.intensity = intensite * f; });
        if (kaykit3D.renderer) {
          /* L'exposition ne descend pas aussi bas que les lampes : sous ~.35
             le ciel devient un aplat noir et on perd le sentiment d'altitude,
             qui est tout ce qui reste quand le reste est eteint. */
          kaykit3D.renderer.toneMappingExposure = base.exposition * (.35 + .65 * f);
        }
        eveilPoserVoileDeNuit(.3 + .7 * Math.min(1, f));
        // Le foyer se desserre a mesure que le monde s'allume : a l'acte IV,
        // le joueur doit deja voir la partie entiere.
        eveilPoserFoyer(Math.max(0, .88 - part));
      }

      /* Le voile de foyer, et le point qu'il epargne. */
      function eveilPoserFoyer(force) {
        const layer = TUTO.dom?.layer;
        if (!layer) return;
        let foyer = layer.querySelector(".eveil-foyer");
        if (!foyer) {
          foyer = document.createElement("div");
          foyer.className = "eveil-foyer";
          const nuit = layer.querySelector(".eveil-nuit");
          layer.insertBefore(foyer, nuit ? nuit.nextSibling : layer.firstChild);
          EVEIL.foyerNode = foyer;
        }
        foyer.style.setProperty("--foyer-force", String(Math.max(0, Math.min(1, force))));
      }

      /* Deplace le point clair sur une case. Appele a chaque battement pendant
         l'etape : le foyer suit ce que le parcours designe, il ne reste pas
         colle au centre de l'ecran. */
      function eveilFoyerSur(r, c) {
        const foyer = EVEIL.foyerNode;
        if (!foyer) return;
        const p = tutoCellToScreen(r, c);
        if (!p) return;
        foyer.style.setProperty("--foyer-x", Math.round(p.x) + "px");
        foyer.style.setProperty("--foyer-y", Math.round(p.y) + "px");
      }

      /* La case que le foyer doit epargner : celle que l'etape designe, a
         defaut le Gardien. */
      function eveilSuivreFoyer(etape) {
        if (!EVEIL.foyerNode || !etape) return;
        let ou = null;
        try {
          const t = etape.promesse?.();
          if (t?.vers && t?.de) ou = [(t.de[0] + t.vers[0]) / 2, (t.de[1] + t.vers[1]) / 2];
          else ou = etape.compagnon?.();
        } catch (_) { }
        if (!ou) {
          const g = eveilPorteur() || eveilGardien();
          if (g) ou = [g.r, g.c];
        }
        if (ou) eveilFoyerSur(ou[0], ou[1]);
      }

      /* Le voile qui eteint le ciel, cree a la demande et anime tout seul par
         sa transition CSS : la nuit se leve d'un acte a l'autre sans qu'on ait
         a piloter la moindre image. */
      function eveilPoserVoileDeNuit(clarte) {
        const layer = TUTO.dom?.layer;
        if (!layer) return;
        let voile = layer.querySelector(".eveil-nuit");
        if (!voile) {
          voile = document.createElement("div");
          voile.className = "eveil-nuit";
          // En premier enfant : sous tous les signes du parcours.
          layer.insertBefore(voile, layer.firstChild);
        }
        voile.style.setProperty("--eveil-nuit", String(Math.max(0, Math.min(1, clarte))));
      }

      function eveilRendreLumiere() {
        TUTO.dom?.layer?.querySelector(".eveil-nuit")?.remove();
        EVEIL.foyerNode?.remove();
        EVEIL.foyerNode = null;
        const base = EVEIL.lumiereBase;
        if (!base) return;
        base.lampes.forEach(({ lampe, intensite }) => { lampe.intensity = intensite; });
        if (kaykit3D?.renderer) kaykit3D.renderer.toneMappingExposure = base.exposition;
        EVEIL.lumiereBase = null;
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
        document.body.classList.remove("eveil-sans-tour", "eveil-sans-piles");
      }

      /* Le chrome de partie revient PAR MORCEAUX, chacun au moment ou la
         notion qu'il affiche prend enfin un sens. Montrer un score avant que
         le joueur sache ce qu'on marque, ou une pioche avant qu'il sache ce
         qu'est une carte, c'est du bruit — pas de l'information. */
      function eveilNudite(nu) {
        document.body.classList.toggle("eveil-sans-tour", !!nu);
        document.body.classList.toggle("eveil-sans-piles", !!nu);
      }

      // Rend une partie du chrome, avec un eclat pour qu'on la voie arriver.
      function eveilRendreChrome(quoi) {
        const classe = quoi === "piles" ? "eveil-sans-piles" : "eveil-sans-tour";
        if (!document.body.classList.contains(classe)) return;
        document.body.classList.remove(classe);
        try { if (typeof playSfx === "function") playSfx("card"); } catch (_) { }
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

      /* LA MAIN QUI NE S'EPUISE PAS — jusqu'a ce qu'on l'enseigne.

         L'economie des cartes est le sujet de l'acte IV. Avant lui, tomber a
         court de gestes serait la pire des introductions : on ne comprend pas
         pourquoi plus rien ne repond, et comme FIN DU TOUR n'est pas encore
         acquis, il n'y a AUCUNE sortie. Le parcours se fige.

         C'est arrive en jeu : rapporte par l'auteur, et de ma faute — je ne
         rechargeais la main qu'a l'ENTREE de chaque etape. Depuser tous ses
         deplacements au milieu d'une etape suffisait a bloquer. Le pivot etait
         pire encore : il ne distribuait que des cartes MAGIE, donc marcher
         etait impossible des le depart.

         La recharge est donc CONTINUE, verifiee a chaque battement du moteur,
         et porte sur les types dont l'etape a besoin. Les etapes qui
         enseignent justement la penurie portent `economie: true` et sont
         epargnees — sinon la lecon ne pourrait pas avoir lieu. */
      const EVEIL_MAIN_MINI = 2;    // jamais moins que ca, par type utile
      const EVEIL_MAIN_PLEIN = 5;   // ce qu'on redonne quand on recharge

      function eveilTypesUtiles(etape) {
        return (etape && etape.cartes) || ["MOVE"];
      }

      function eveilMainSansFin(etape) {
        if (!etape || etape.economie) return;
        const p = state?.players?.[0];
        if (!p) return;
        /* JAMAIS pendant qu'une action est engagee. tutoSetHand reconstruit la
           main de zero : appele au milieu d'un geste, il retire la carte que
           le joueur est en train de jouer (state.selectedActionCardId pointe
           alors dans le vide) et le coup ne se resout plus. Vu en test : plus
           aucun deplacement n'aboutissait. */
        if (state.phase !== "ACTION_SELECT") return;
        if (state.selectedActionType || state.selectedActionCardId) return;
        if (state.inputLocked || EVEIL.souffle) return;
        const types = eveilTypesUtiles(etape);
        const restant = type => (p.hand || [])
          .filter(carte => !carte.used && carte.action === type).length;
        if (!types.some(type => restant(type) < EVEIL_MAIN_MINI)) return;

        /* On reconstruit une main pleine pour CHAQUE type utile. Rien n'est
           perdu au passage : hors acte IV, la defausse et la reserve ne sont
           ni montrees ni enseignees. */
        tutoSetHand(types.flatMap(type => Array(EVEIL_MAIN_PLEIN).fill(type)));
        tutoRender();
      }

      // Conserve pour les entrees d'etape, qui veulent une main nette.
      function eveilMainConfortable(etape) {
        const types = eveilTypesUtiles(etape);
        tutoSetHand(types.flatMap(type => Array(EVEIL_MAIN_PLEIN).fill(type)));
      }

      // Une case de terre libre, voisine du Gardien : la destination evidente.
      function eveilCaseVoisineLibre() {
        const g = eveilGardien();
        if (!g) return null;
        const autour = [[g.r - 1, g.c], [g.r, g.c + 1], [g.r + 1, g.c], [g.r, g.c - 1]];
        return autour.find(([r, c]) => isLand(r, c) && !characterAt(r, c)) || null;
      }

      /* ---- Acte III : l'autre, la chute, le repentir, le pivot ---- */

      function eveilRivaux() {
        return (state?.characters || []).filter(ch => ch.player === 1);
      }

      /* Ou faire apparaitre le rival. Il ne surgit pas au hasard : il se
         plante CONTRE le porteur de la Couronne, parce que c'est sa position
         qui dit la menace et qu'aucun mot ne le fera.

         Mais surtout : la poussee doit etre JOUABLE. Une case voisine ne
         suffit pas — il faut que la case DERRIERE le rival, dans l'axe du
         pousseur, existe sur le plateau. Adosse au bord, le rival est
         impossible a pousser et l'etape devient un mur (vu en test : rival en
         (6,0), pousseur en (6,1), derriere = (6,-1)).

         `versLeVide` choisit la variante de la CHUTE : derriere lui, du vide. */
      function eveilCaseRival(pres, versLeVide) {
        if (!pres) return null;
        const dedans = (r, c) => r >= 0 && c >= 0 && r < GRID && c < GRID;
        const candidates = [[pres.r - 1, pres.c], [pres.r + 1, pres.c],
        [pres.r, pres.c - 1], [pres.r, pres.c + 1]]
          .filter(([r, c]) => dedans(r, c) && isLand(r, c) && !characterAt(r, c))
          .map(([r, c]) => ({
            case: [r, c],
            derriere: [r + (r - pres.r), c + (c - pres.c)]
          }))
          .filter(o => dedans(o.derriere[0], o.derriere[1]));

        if (!candidates.length) return null;
        const versVide = candidates.find(o => !isLand(o.derriere[0], o.derriere[1]));
        const versTerre = candidates.find(o =>
          isLand(o.derriere[0], o.derriere[1]) && !characterAt(o.derriere[0], o.derriere[1]));

        if (versLeVide) return versVide?.case || null;
        // Pour la simple mise a l'ecart, on prefere une terre derriere : le
        // rival recule, il ne tombe pas. La chute a son propre chapitre.
        return (versTerre || versVide || candidates[0]).case;
      }

      /* Faire surgir la terre qui manque pour que le rival soit poussable.

         Apres un acte II joue librement, le porteur se retrouve souvent sur une
         langue de terre d'une ou deux cases : aucune case voisine ne peut
         accueillir un rival ET avoir une case derriere lui. L'etape n'aurait
         alors AUCUN rival, ou un rival impossible a pousser.

         Le monde fournit donc le plateau, visiblement et avec le son de la
         pose — exactement comme le pont du relais. C'est le sujet de la piece
         depuis l'acte II : ici, la terre vient a nous.

         `versLeVide` reclame du vide derriere le rival (la chute) ; sinon on
         pose aussi la case de recul, pour qu'il soit ecarte sans tomber. */
      function eveilPreparerRival(pres, versLeVide) {
        const deja = eveilCaseRival(pres, versLeVide);
        if (deja) return deja;
        if (!pres) return null;

        const dedans = (r, c) => r >= 0 && c >= 0 && r < GRID && c < GRID;
        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        const nouvelles = [];
        let choisie = null;

        for (const [dr, dc] of directions) {
          const ici = [pres.r + dr, pres.c + dc];
          const derriere = [pres.r + dr * 2, pres.c + dc * 2];
          if (!dedans(ici[0], ici[1]) || !dedans(derriere[0], derriere[1])) continue;
          if (characterAt(ici[0], ici[1]) || characterAt(derriere[0], derriere[1])) continue;
          if (versLeVide && isLand(derriere[0], derriere[1])) continue;

          choisie = ici;
          if (!isLand(ici[0], ici[1])) nouvelles.push(ici);
          if (!versLeVide && !isLand(derriere[0], derriere[1])) nouvelles.push(derriere);
          break;
        }
        if (!choisie) return null;

        nouvelles.forEach(cellule => {
          const id = tutoAddIsland([cellule]);
          const ile = (state.islands || []).find(i => i.id === id);
          try { if (ile && typeof animateIslandArrival === "function") animateIslandArrival(ile); } catch (_) { }
        });
        if (nouvelles.length) {
          try { if (typeof playSfx === "function") playSfx("island"); } catch (_) { }
        }
        return choisie;
      }

      /* LA SCENE DE LA CHUTE, construite et non esperee.

         Pour que la poussee fasse tomber, il faut trois cases alignees : le
         pousseur, le rival, et du VIDE derriere. Apres un acte II joue
         librement, rien ne garantit cet alignement — et sans lui l'etape est
         injouable (vu en test : le rival reculait sur de la terre, indefiniment).

         On cherche donc d'abord depuis la position du porteur ; si son coin de
         ciel ne s'y prete pas, on le deplace sur une terre qui s'y prete. Le
         deplacer est moins grave que de lui donner une lecon impossible. */
      function eveilPreparerChute(porteur) {
        if (!porteur) return null;
        const dedans = (r, c) => r >= 0 && c >= 0 && r < GRID && c < GRID;
        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];

        const chercher = (r0, c0) => {
          for (const [dr, dc] of directions) {
            const ici = [r0 + dr, c0 + dc];
            const derriere = [r0 + dr * 2, c0 + dc * 2];
            if (!dedans(ici[0], ici[1]) || !dedans(derriere[0], derriere[1])) continue;
            if (characterAt(ici[0], ici[1]) || characterAt(derriere[0], derriere[1])) continue;
            if (isLand(derriere[0], derriere[1])) continue;   // il faut du vide
            return ici;
          }
          return null;
        };

        let ou = chercher(porteur.r, porteur.c);
        if (!ou) {
          // Le porteur est au milieu de sa terre : on le porte sur un bord qui
          // regarde le vide, et la lecon redevient possible.
          const bords = [];
          (state.islands || []).forEach(ile => ile.cells.forEach(([r, c]) => {
            if (characterAt(r, c)) return;
            if (chercher(r, c)) bords.push([r, c]);
          }));
          const bord = bords[0];
          if (bord) {
            porteur.r = bord[0]; porteur.c = bord[1];
            if (state.artifact && String(state.artifact.carrierId) === String(porteur.id)) {
              state.artifact.r = porteur.r; state.artifact.c = porteur.c;
            }
            ou = chercher(porteur.r, porteur.c);
          }
        }
        if (!ou) return null;

        if (!isLand(ou[0], ou[1])) {
          const id = tutoAddIsland([ou]);
          const ile = (state.islands || []).find(i => i.id === id);
          try { if (ile && typeof animateIslandArrival === "function") animateIslandArrival(ile); } catch (_) { }
          try { if (typeof playSfx === "function") playSfx("island"); } catch (_) { }
        }
        return ou;
      }

      // La case ou tombera le rival si on le pousse depuis `depuis`.
      function eveilCaseDerriere(depuis, cible) {
        if (!depuis || !cible) return null;
        return [cible[0] + (cible[0] - depuis.r), cible[1] + (cible[1] - depuis.c)];
      }

      /* LA CORNICHE DU PIVOT.

         Une barre verticale de trois cases, avec un GOUFFRE au-dela : le pas
         n'y suffit pas, et pivoter la barre autour de sa case HAUTE la couche
         par-dessus le vide en emportant qui se tient dessus.

         Elle se batit exclusivement sur du VIDE. Premiere version : je la
         posais a la colonne du Gardien sans verifier — elle se superposait aux
         iles existantes, deux iles occupaient les memes cases, et la rotation
         laissait de la terre fantome derriere elle. Le harnais ne voyait rien,
         puisque le Gardien franchissait quand meme.

         On cherche donc un emplacement entierement libre, le plus pres possible
         du Gardien, et on l'y porte. */
      function eveilBatirCorniche(g) {
        if (!g) return null;
        const dedans = (r, c) => r >= 0 && c >= 0 && r < GRID && c < GRID;
        const vide = (r, c) => dedans(r, c) && !isLand(r, c) && !characterAt(r, c);

        let meilleur = null;
        for (let c = 0; c < GRID; c++) {
          for (let bas = 4; bas < GRID; bas++) {
            const barre = [[bas, c], [bas - 1, c], [bas - 2, c]];
            if (!barre.every(([r, cc]) => vide(r, cc))) continue;
            // Le gouffre : les deux lignes au-dela doivent rester du vide,
            // sinon « franchir » ne veut plus rien dire.
            if (!vide(bas - 3, c) || !vide(bas - 4, c)) continue;
            /* Et surtout : la barre ne doit PAS deposer le Gardien dans la
               zone du village. Vu en test — le pivot l'y portait, l'etape
               « le village » se trouvait accomplie d'avance, et la lecon
               « ramene la Couronne chez toi » disparaissait sans avoir ete
               jouee. Le ciel se plie pour franchir un vide, pas pour rentrer. */
            try {
              if (typeof isCrownValidationCell === "function"
                && isCrownValidationCell(state.players[0], bas - 4, c)) continue;
            } catch (_) { }
            const d = Math.abs(bas - g.r) + Math.abs(c - g.c);
            if (!meilleur || d < meilleur.d) meilleur = { d, cells: barre, colonne: c, bas };
          }
        }
        if (!meilleur) return null;

        const id = tutoAddIsland(meilleur.cells, 0);
        const ile = (state.islands || []).find(i => i.id === id);
        try { if (ile && typeof animateIslandArrival === "function") animateIslandArrival(ile); } catch (_) { }
        try { if (typeof playSfx === "function") playSfx("island"); } catch (_) { }

        EVEIL.corniche = {
          id, cells: meilleur.cells, colonne: meilleur.colonne,
          bas: meilleur.bas, cible: meilleur.bas - 4
        };
        return EVEIL.corniche;
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
          rune: "oeil",
          cartes: ["MOVE"],
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
          rune: "main",
          fantome() {
            const g = eveilGardien();
            return g ? { charId: g.id, surPlace: [g.r, g.c] } : null;
          },
          cartes: ["MOVE"],
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
          rune: "pas",
          cartes: ["MOVE"],
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
          rune: "vide",
          fantome() {
            const g = eveilGardien();
            const vide = eveilCaseVide();
            return g && vide ? { charId: g.id, de: [g.r, g.c], vers: vide } : null;
          },
          cartes: ["MOVE"],
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
          rune: "batir",
          cartes: ["MOVE"],
          acte: 2,
          entrer() {
            eveilSacrerVerbe("ile");
            eveilVerbes(["move", "ile"]);
            // Le caillou de l'acte I bloquait la pose ; on rend le pouvoir.
            state.islandPlacedThisTurn = false;
            state.pendingSpawnIslandId = null;
            eveilMainConfortable(this);
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
          rune: "eveiller",
          fantome() {
            const g = eveilGardien();
            const cellule = eveilNouvelleIle()?.cells?.find(([r, c]) => !characterAt(r, c));
            return g && cellule ? { charId: g.id, surPlace: cellule } : null;
          },
          cartes: ["MOVE"],
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
          rune: "couronne",
          cartes: ["MOVE"],
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
            eveilMainConfortable(this);
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
          rune: "relais",
          cartes: ["MOVE"],
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

              const dedans = ([r, c]) => r >= 0 && c >= 0 && r < GRID && c < GRID;
              const faireTerre = cellule => {
                if (isLand(cellule[0], cellule[1])) return;
                const id = tutoAddIsland([cellule]);
                const ile = (state.islands || []).find(i => i.id === id);
                try { if (ile && typeof animateIslandArrival === "function") animateIslandArrival(ile); } catch (_) { }
                try { if (typeof playSfx === "function") playSfx("island"); } catch (_) { }
              };

              if (!eveilRelaisRoute(porteur, autre)) {
                // La case commune GEOMETRIQUE, terre ou pas : c'est elle qu'on
                // materialise. Ne marche que s'ils sont deja en diagonale.
                const cles = new Set(orthos(autre).map(([r, c]) => r + "," + c));
                const pont = orthos(porteur).find(cellule =>
                  cles.has(cellule[0] + "," + cellule[1]) && dedans(cellule)
                  && !characterAt(cellule[0], cellule[1]));
                if (pont) faireTerre(pont);
              }

              if (!eveilRelaisRoute(porteur, autre)) {
                /* DERNIER RECOURS, et il doit toujours aboutir. L'allie est
                   reste loin, faute de terre autour du porteur : on lui fabrique
                   sa place. Une diagonale du porteur, plus la case commune entre
                   les deux — deux cases de terre qui surgissent, et le relais
                   redevient jouable.

                   Sans ca, l'etape pouvait n'avoir AUCUNE route : vu en test
                   apres un acte II joue en zigzag. Une etape sans issue est le
                   pire defaut possible dans un parcours qui n'explique rien. */
                const coins = [[porteur.r - 1, porteur.c - 1], [porteur.r - 1, porteur.c + 1],
                [porteur.r + 1, porteur.c - 1], [porteur.r + 1, porteur.c + 1]];
                for (const coin of coins) {
                  if (!dedans(coin) || characterAt(coin[0], coin[1])) continue;
                  const commune = [porteur.r, coin[1]];
                  if (!dedans(commune) || characterAt(commune[0], commune[1])) continue;
                  faireTerre(coin);
                  faireTerre(commune);
                  autre.r = coin[0]; autre.c = coin[1];
                  break;
                }
              }
            }
            EVEIL.porteurInitial = eveilPorteur()?.id || null;
            eveilMainConfortable(this);
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
        },

        /* ================================================================
           ACTE III — L'AUTRE

           « Je ne suis plus seul a vouloir. »

           Jusqu'ici le monde etait vide et docile. Quelqu'un arrive, et il
           veut la meme chose que nous.
           ================================================================ */

        /* ---- 9. LE RIVAL ----------------------------------------------
           Une silhouette se materialise a cote de la Couronne. Le verbe
           POUSSER apparait. On apprend qu'on peut ecarter ce qui gene.

           Le rival ne surgit pas au hasard : il apparait CONTRE le porteur.
           C'est sa position qui dit la menace, aucun mot n'en parle. */
        {
          id: "rival",
          rune: "rival",
          fantome() {
            const r = eveilRivaux()[0];
            const pousseur = r && eveilGardiens().find(g =>
              Math.abs(g.r - r.r) + Math.abs(g.c - r.c) === 1);
            if (!r || !pousseur) return null;
            const derriere = eveilCaseDerriere(pousseur, [r.r, r.c]);
            return derriere ? { charId: r.id, de: [r.r, r.c], vers: derriere } : null;
          },
          cartes: ["PUSH", "MOVE"],
          acte: 3,
          entrer() {
            eveilSacrerVerbe("push");
            eveilVerbes(["move", "ile", "push"]);
            const porteur = eveilPorteur() || eveilGardien();
            const ou = eveilPreparerRival(porteur, false);
            if (ou) {
              tutoSetEnemies([ou]);
              try { spawnGroundBurst(kaykitCellPosition(ou[0], ou[1], 0), new THREE.Color(0x9a6bd8), { radius: .55, duration: 760 }); } catch (_) { }
              try { if (typeof playSfx === "function") playSfx("spawn"); } catch (_) { }
            }
            /* ICI ON ECARTE, ON NE FAIT PAS TOMBER. La chute a son propre
               chapitre, juste apres, et lui voler son effet ruinerait les deux.

               Le Gardien qui poussera n'est pas forcement le porteur : c'est
               celui qui se trouve a cote du rival. On regarde donc derriere le
               rival DANS SON AXE, et si c'est le vide, on y fait surgir une
               terre. Sans ca, la seule poussee possible etait une chute —
               constate en test, et l'etape devenait injouable telle qu'ecrite. */
            const rival = eveilRivaux()[0];
            const pousseur = rival && eveilGardiens().find(g =>
              Math.abs(g.r - rival.r) + Math.abs(g.c - rival.c) === 1);
            if (rival && pousseur) {
              const recul = eveilCaseDerriere(pousseur, [rival.r, rival.c]);
              const dedans = recul && recul[0] >= 0 && recul[1] >= 0
                && recul[0] < GRID && recul[1] < GRID;
              if (dedans && !isLand(recul[0], recul[1]) && !characterAt(recul[0], recul[1])) {
                const id = tutoAddIsland([recul]);
                const ile = (state.islands || []).find(i => i.id === id);
                try { if (ile && typeof animateIslandArrival === "function") animateIslandArrival(ile); } catch (_) { }
                try { if (typeof playSfx === "function") playSfx("island"); } catch (_) { }
              }
            }

            EVEIL.rivalDepart = ou;
            state.islandPlacedThisTurn = true;
            eveilMainConfortable(this);
            eveilResetSelection();
            tutoRender();
          },
          souffle() {
            const ou = EVEIL.rivalDepart;
            const porteur = eveilPorteur() || eveilGardien();
            if (!ou) return [];
            return porteur
              ? [[ou[0], ou[1], 1400, .9], [(ou[0] + porteur.r) / 2, (ou[1] + porteur.c) / 2, 1100, .4]]
              : [[ou[0], ou[1], 1400, .9]];
          },
          compagnon() {
            const r = eveilRivaux()[0];
            return r ? [r.r, r.c, 1] : null;
          },
          appel() {
            const r = eveilRivaux()[0];
            return { hud: [EVEIL_VERBES.push], cells: r ? [[r.r, r.c]] : [] };
          },
          promesse() {
            const r = eveilRivaux()[0];
            // Celui qui poussera est celui qui est A COTE, pas le porteur.
            const pousseur = r && eveilGardiens().find(g =>
              Math.abs(g.r - r.r) + Math.abs(g.c - r.c) === 1);
            if (!r || !pousseur) return null;
            const derriere = eveilCaseDerriere(pousseur, [r.r, r.c]);
            return derriere ? { de: [pousseur.r, pousseur.c], vers: derriere } : null;
          },
          // Faite des que le rival a bouge : ecarte, ou tombe.
          faite() {
            const r = eveilRivaux()[0];
            if (!r) return true;
            const d = EVEIL.rivalDepart;
            return !!d && (r.r !== d[0] || r.c !== d[1]);
          },
          son: "push"
        },

        /* ---- 10. LA CHUTE ---------------------------------------------
           Le rival revient, mais cette fois dos au vide. La poussee ne
           l'ecarte plus : elle le fait DISPARAITRE.

           MOMENT DE BRAVOURE : le vide, qui nous avait refuse le pas a
           l'acte I, travaille maintenant pour nous. C'est la meme regle,
           relue de l'autre cote — et c'est tout le plaisir de l'etape. */
        {
          id: "chute",
          rune: "chute",
          fantome() {
            const r = eveilRivaux()[0];
            const porteur = eveilPorteur() || eveilGardien();
            if (!r || !porteur) return null;
            const derriere = eveilCaseDerriere(porteur, [r.r, r.c]);
            return derriere ? { charId: r.id, de: [r.r, r.c], vers: derriere } : null;
          },
          cartes: ["PUSH", "MOVE"],
          acte: 3,
          entrer() {
            eveilVerbes(["move", "ile", "push"]);
            const porteur = eveilPorteur() || eveilGardien();
            const ou = eveilPreparerChute(porteur);
            if (ou) tutoSetEnemies([ou]); else tutoSetEnemies([]);
            EVEIL.rivalDepart = ou;
            state.islandPlacedThisTurn = true;
            eveilMainConfortable(this);
            eveilResetSelection();
            tutoRender();
          },
          souffle() {
            const ou = EVEIL.rivalDepart;
            const porteur = eveilPorteur() || eveilGardien();
            if (!ou || !porteur) return [];
            const derriere = eveilCaseDerriere(porteur, ou);
            // Le regard glisse du rival vers le vide qui l'attend : la
            // direction de la poussee est donnee par un mouvement de camera.
            return derriere
              ? [[ou[0], ou[1], 1000, .8], [derriere[0], derriere[1], 1200, .4]]
              : [[ou[0], ou[1], 1200, .8]];
          },
          compagnon() {
            const r = eveilRivaux()[0];
            const porteur = eveilPorteur() || eveilGardien();
            const derriere = r && porteur && eveilCaseDerriere(porteur, [r.r, r.c]);
            return derriere ? [derriere[0], derriere[1], .7] : (r ? [r.r, r.c, 1] : null);
          },
          appel() {
            const r = eveilRivaux()[0];
            return { hud: [EVEIL_VERBES.push], cells: r ? [[r.r, r.c]] : [] };
          },
          promesse() {
            const r = eveilRivaux()[0];
            const porteur = eveilPorteur() || eveilGardien();
            if (!r || !porteur) return null;
            const derriere = eveilCaseDerriere(porteur, [r.r, r.c]);
            return derriere ? { de: [r.r, r.c], vers: derriere } : null;
          },
          faite() { return eveilRivaux().length === 0; },
          son: "fall"
        },

        /* ---- 11. LE REPENTIR ------------------------------------------
           Le verbe ANNULER apparait. On fait un pas, et on le reprend : le
           monde revient exactement ou il etait.

           C'est la seule etape qui n'enseigne pas un pouvoir sur le monde
           mais un droit sur soi — celui de se tromper. Savoir ca change
           completement la facon dont un debutant OSE essayer la suite, et
           c'est pour ca qu'elle est placee juste avant la magie. */
        {
          id: "repentir",
          rune: "repentir",
          cartes: ["MOVE"],
          acte: 3,
          entrer() {
            eveilSacrerVerbe("undo");
            eveilVerbes(["move", "ile", "push", "undo"]);
            state.islandPlacedThisTurn = true;
            EVEIL.undoMax = (state.undoHistory || []).length;
            EVEIL.undoFait = false;
            eveilMainConfortable(this);
            eveilResetSelection();
            tutoRender();
          },
          /* On surveille la pile d'annulation : elle monte quand le joueur
             agit, elle redescend quand il annule. C'est cette redescente,
             et elle seule, qui est la lecon. */
          tick() {
            const n = (state?.undoHistory || []).length;
            if (n > EVEIL.undoMax) EVEIL.undoMax = n;
            if (EVEIL.undoMax > 0 && n < EVEIL.undoMax) EVEIL.undoFait = true;
          },
          compagnon() {
            const g = eveilPorteur() || eveilGardien();
            return g ? [g.r, g.c, 1.1] : null;
          },
          /* Tant qu'il n'a rien fait, on eclaire son Gardien : il faut un
             geste avant de pouvoir le reprendre. Des qu'il a joue, c'est
             ANNULER qui respire. */
          appel() {
            const g = eveilPorteur() || eveilGardien();
            const aJoue = (state?.undoHistory || []).length > 0;
            return aJoue
              ? { hud: [EVEIL_VERBES.undo], cells: [] }
              : { hud: [EVEIL_VERBES.move], cells: g ? [[g.r, g.c]] : [] };
          },
          dernierRecours() {
            document.querySelectorAll(EVEIL_VERBES.undo).forEach(el => {
              el.classList.add("tuto-pulse");
              (TUTO.pulsed = TUTO.pulsed || []).push(el);
            });
          },
          faite() { return !!EVEIL.undoFait; },
          son: "card"
        },

        /* ---- 12. LE CIEL SE PLIE --------------------------------------
           Une corniche de trois cases, un gouffre au-dela, et aucune facon
           de passer : ni le pas, ni meme une ile posee ne suffisent.

           Le verbe MAGIE apparait. On fait pivoter l'ile SUR LAQUELLE ON SE
           TIENT, et elle nous emporte de l'autre cote.

           MOMENT DE BRAVOURE, le plus beau du jeu, garde pour la fin de
           l'acte. On eclaire les TROIS cases de la barre, jamais une seule :
           le joueur doit trouver QUEL pivot l'emmene loin, sinon on lui donne
           la reponse et il n'a rien decouvert. Et c'est LUI qui valide la
           rotation, jamais le tutoriel. */
        {
          id: "pivot",
          rune: "pivot",
          cartes: ["MAGIC", "MOVE"],
          acte: 3,
          entrer() {
            eveilSacrerVerbe("magic");
            eveilVerbes(["move", "ile", "push", "undo", "magic"]);
            const g = eveilPorteur() || eveilGardien();
            const corniche = eveilBatirCorniche(g);
            // Le Gardien doit se tenir SUR la barre pour etre emporte par elle.
            if (g && corniche) {
              const bas = corniche.cells[0];
              g.r = bas[0]; g.c = bas[1];
              if (state.artifact && String(state.artifact.carrierId) === String(g.id)) {
                state.artifact.r = g.r; state.artifact.c = g.c;
              }
              // L'autre Gardien reste en arriere : la barre n'emporte que ce
              // qui est dessus, et un seul voyageur se lit mieux.
              const autre = eveilAutreGardien(g.id);
              if (autre && corniche.cells.some(([r, c]) => r === autre.r && c === autre.c)) {
                const ailleurs = eveilCaseVoisineLibre();
                if (ailleurs) { autre.r = ailleurs[0]; autre.c = ailleurs[1]; }
              }
            }
            state.islandPlacedThisTurn = true;
            /* MAGIE pour pivoter, et DEPLACER aussi : sans lui, le joueur qui
               veut d'abord marcher se retrouve sans aucune carte jouable. */
            eveilMainConfortable(this);
            eveilResetSelection();
            tutoRender();
          },
          souffle() {
            const co = EVEIL.corniche;
            if (!co) return [];
            // La camera longe la barre et bute sur le gouffre : elle s'arrete
            // net, comme un pas qui ne peut pas se faire.
            return [[co.bas, co.colonne, 900, .5],
            [co.bas - 2, co.colonne, 1200, .2],
            [co.cible, co.colonne, 1300, 0]];
          },
          compagnon() {
            const co = EVEIL.corniche;
            return co ? [co.cible, co.colonne, .9] : null;
          },
          appel() {
            const co = EVEIL.corniche;
            return {
              hud: [EVEIL_VERBES.magic],
              cells: (co?.cells || []).map(([r, c]) => [r, c])
            };
          },
          /* Pas de Promesse ici : le jeu affiche deja son ile fantome des
             qu'on tourne, et c'est la meilleure prevision qui soit. Le dernier
             recours fait respirer les boutons de rotation, l'etape vraiment
             obscure — mais la VALIDATION reste au joueur. */
          dernierRecours() {
            ["#hudV2MagicRotateLeft", "#hudV2MagicRotateRight"].forEach(sel => {
              document.querySelectorAll(sel).forEach(el => {
                el.classList.add("tuto-pulse");
                (TUTO.pulsed = TUTO.pulsed || []).push(el);
              });
            });
          },
          /* Reussi quand le Gardien a FRANCHI le gouffre, pas quand l'ile a
             bouge : une rotation qui n'avance a rien se voit, et le joueur en
             tire la lecon lui-meme. */
          faite() {
            const co = EVEIL.corniche;
            const g = eveilPorteur() || eveilGardien();
            return !!(co && g && g.r <= co.cible);
          },
          son: "magic"
        },

        /* ================================================================
           ACTE IV — LE TEMPS

           « Mes gestes sont comptes. »

           Tout ce qui precede a ete joue avec une main qui ne s'epuisait
           jamais. Ici, la verite : le tour, la pioche, la defausse, et cette
           regle que rien ne peut montrer autrement qu'en la faisant vivre —
           une Couronne ne s'ancre qu'au debut de ton PROCHAIN tour.
           ================================================================ */

        /* ---- 13. LE VILLAGE -------------------------------------------
           On ramene la Couronne chez soi. On la pose sur la zone du village.
           Et il ne se passe RIEN.

           C'est la seule incomprehension VOLONTAIRE du parcours, et c'est
           aussi le seul endroit ou le muet risque de se lire comme une panne.
           Elle ne dure donc qu'un instant : l'etape suivante s'enchaine
           d'elle-meme et repond avant que le doute s'installe. */
        {
          id: "village",
          rune: "village",
          fantome() {
            const porteur = eveilPorteur();
            const zone = EVEIL.zoneVillage;
            return porteur && zone?.length
              ? { charId: porteur.id, de: [porteur.r, porteur.c], vers: zone[0] } : null;
          },
          cartes: ["MOVE"],
          acte: 4,
          entrer() {
            eveilVerbes(["move", "ile", "push", "undo", "magic"]);
            const porteur = eveilPorteur() || eveilGardien();
            /* Un joueur possede PLUSIEURS villages : la fonction en rend
               toutes les cases de validation, y compris celles du coin oppose.
               Les materialiser toutes faisait pousser de la terre a l'autre
               bout du ciel, sans raison et sans que rien ne s'y passe. On ne
               garde que le village le plus proche du porteur — c'est celui-la,
               son chez-soi, dans cette histoire. */
            const toutes = (typeof crownValidationCellsForPlayer === "function")
              ? crownValidationCellsForPlayer(state.players[0]).map(([r, c]) => [r, c])
              : [[0, 0], [1, 0], [0, 1]];
            const ref = porteur || { r: 0, c: 0 };
            const distance = ([r, c]) => Math.abs(r - ref.r) + Math.abs(c - ref.c);
            const ancre = toutes.slice().sort((a, b) => distance(a) - distance(b))[0] || [0, 0];
            const zone = toutes.filter(([r, c]) =>
              Math.abs(r - ancre[0]) + Math.abs(c - ancre[1]) <= 2);
            /* Les trois cases de validation d'un village ne sont PAS de la
               terre d'office : isLand ne couvre que la case du coin. Sans ca
               le porteur se retrouve debout au-dessus du vide. */
            tutoEnsureLand(zone);
            if (porteur) tutoEnsurePathFrom(porteur.r, porteur.c, zone[0][0], zone[0][1]);
            EVEIL.zoneVillage = zone;
            state.islandPlacedThisTurn = true;
            eveilMainConfortable(this);
            eveilResetSelection();
            tutoRender();
          },
          souffle() {
            const zone = EVEIL.zoneVillage;
            const porteur = eveilPorteur() || eveilGardien();
            if (!zone?.length) return [];
            // On decouvre le village, puis on revient a mi-chemin : le trajet
            // est raconte dans ce sens-la, comme a chaque acte.
            return porteur
              ? [[zone[0][0], zone[0][1], 1600, .6],
              [(zone[0][0] + porteur.r) / 2, (zone[0][1] + porteur.c) / 2, 1200, .1]]
              : [[zone[0][0], zone[0][1], 1600, .6]];
          },
          compagnon() {
            const zone = EVEIL.zoneVillage;
            return zone?.length ? [zone[0][0], zone[0][1], .9] : null;
          },
          appel() {
            return {
              hud: [EVEIL_VERBES.move],
              cells: (EVEIL.zoneVillage || []).map(([r, c]) => [r, c])
            };
          },
          promesse() {
            const porteur = eveilPorteur();
            const zone = EVEIL.zoneVillage;
            return porteur && zone?.length
              ? { de: [porteur.r, porteur.c], vers: zone[0] } : null;
          },
          faite() {
            const porteur = eveilPorteur();
            const p = state?.players?.[0];
            if (!porteur || !p) return false;
            return typeof isCrownValidationCell === "function"
              ? !!isCrownValidationCell(p, porteur.r, porteur.c)
              : (EVEIL.zoneVillage || []).some(([r, c]) => porteur.r === r && porteur.c === c);
          },
          // Pas d'assentiment : rien ne s'est passe, et c'est le sujet.
          sortie: "muet"
        },

        /* ---- 14. LE SABLIER -------------------------------------------
           La rune du sablier. Le tour passe. Puis, au debut du NOTRE, la
           Couronne s'ancre dans un eclat et le village se rallume.

           Le joueur n'a rien a faire : c'est un plan, pas une epreuve. La
           regle la plus abstraite du jeu est JOUEE devant lui plutot
           qu'enoncee — c'est la seule facon de la dire sans un mot. */
        {
          id: "sablier",
          rune: "sablier",
          economie: true,   // ici, la main DOIT pouvoir s'epuiser
          acte: 4,
          entrer() {
            eveilRendreChrome("tour");          // le tour devient un sujet
            EVEIL.cycleLance = false;
            tutoRender();
          },
          tick() {
            if (EVEIL.cycleLance) return;
            EVEIL.cycleLance = true;
            eveilCycleDeTour();
          },
          compagnon() {
            const porteur = eveilPorteur();
            return porteur ? [porteur.r, porteur.c, 1.3] : null;
          },
          faite() { return (state?.players?.[0]?.score || 0) >= 1; },
          son: "victory"
        },

        /* ---- 15. LA MAIN QUI S'EPUISE ---------------------------------
           Les cartes deviennent reelles : la pioche et la defausse
           apparaissent, et la main se reduit a trois gestes. On les depense,
           on les voit partir a la defausse, et on n'en a plus.

           Jusqu'ici la main etait rechargee en douce a chaque etape. C'etait
           delibere : decouvrir la penurie par accident, sans savoir pourquoi,
           serait la pire des introductions. */
        {
          id: "main",
          rune: "main_vide",
          fantome() {
            const g = eveilPorteur() || eveilGardien();
            if (!g) return null;
            const cible = [[g.r - 1, g.c], [g.r, g.c + 1], [g.r + 1, g.c], [g.r, g.c - 1]]
              .find(([r, c]) => isLand(r, c) && !characterAt(r, c));
            return cible ? { charId: g.id, de: [g.r, g.c], vers: cible } : null;
          },
          economie: true,   // ici, la main DOIT pouvoir s'epuiser
          acte: 4,
          entrer() {
            eveilRendreChrome("piles");
            eveilVerbes(["move", "ile", "push", "undo", "magic"]);
            state.islandPlacedThisTurn = true;
            // Trois gestes, pas un de plus : la penurie doit se sentir.
            tutoSetHand(["MOVE", "MOVE", "MOVE"]);
            EVEIL.defausseDepart = (state.players[0].discard || []).length;
            eveilResetSelection();
            tutoRender();
          },
          compagnon() {
            const g = eveilPorteur() || eveilGardien();
            return g ? [g.r, g.c, 1.1] : null;
          },
          appel() {
            const g = eveilPorteur() || eveilGardien();
            return { hud: [EVEIL_VERBES.move], cells: g ? [[g.r, g.c]] : [] };
          },
          // Faite quand une carte a REELLEMENT ete depensee et rejoint la
          // defausse : c'est le cycle qu'on enseigne, pas le simple fait de
          // bouger.
          faite() {
            const p = state?.players?.[0];
            if (!p) return false;
            const jouees = (p.hand || []).filter(c => c.used).length;
            const defausse = (p.discard || []).length - (EVEIL.defausseDepart || 0);
            return jouees > 0 || defausse > 0;
          },
          son: "card"
        },

        /* ---- 16. LA RESERVE -------------------------------------------
           FIN DU TOUR apparait. On termine son tour avec une carte non
           jouee — et on la voit MISE DE COTE, pas perdue.

           TROISIEME JOIE : rien n'est gache. C'est le coeur tactique du jeu,
           et il etait jusqu'ici totalement invisible. La rune du cercle
           ferme le dit : ce qui ne sort pas du cercle y reste. */
        {
          id: "reserve",
          rune: "cercle",
          economie: true,   // ici, la main DOIT pouvoir s'epuiser
          acte: 4,
          entrer() {
            eveilSacrerVerbe("end");
            eveilVerbes(["move", "ile", "push", "undo", "magic", "end"]);
            state.islandPlacedThisTurn = true;
            // Une main volontairement genereuse : il RESTERA quelque chose.
            tutoSetHand(["MOVE", "MOVE", "PUSH", "MAGIC"]);
            EVEIL.reserveDepart = (state.players[0].reserveCards || []).length;
            eveilResetSelection();
            tutoRender();
          },
          compagnon: () => null,
          appel() { return { hud: [EVEIL_VERBES.end], cells: [] }; },
          dernierRecours() {
            document.querySelectorAll(EVEIL_VERBES.end).forEach(el => {
              el.classList.add("tuto-pulse");
              (TUTO.pulsed = TUTO.pulsed || []).push(el);
            });
          },
          faite() {
            const p = state?.players?.[0];
            return !!p && (p.reserveCards || []).length > (EVEIL.reserveDepart || 0);
          },
          son: "card"
        }
      ];

      /* LE CYCLE DE TOUR, joue et non enonce.

         « Une Couronne ne s'ancre qu'au debut de ton PROCHAIN tour » est la
         regle la plus abstraite du jeu. Aucune lumiere, aucun fil, aucune
         silhouette ne peut la dire. On la FAIT donc : le plan tient sur le
         porteur, les tours passent sous les yeux du joueur, et l'eclat arrive
         au moment exact ou elle s'ancre.

         C'est le seul endroit du parcours ou le joueur n'a pas la main, et
         c'est assume : il n'y a rien a jouer ici, il y a a comprendre. */
      async function eveilCycleDeTour() {
        const porteur = eveilPorteur();
        TUTO.cinematic = true;
        tutoLetterbox(true);
        if (state) state.inputLocked = true;
        if (porteur) tutoTravel(porteur.r, porteur.c, 1400, .9);
        await tutoWait(2200);
        if (!EVEIL.active) return;

        // Notre tour s'acheve : la Couronne est posee, rien n'a encore compte.
        if (state) state.inputLocked = false;
        try { await endTurn(true); } catch (_) { }
        if (!EVEIL.active) return;

        // Le tour de l'autre. Personne en face ici, mais le temps passe
        // quand meme — et c'est le temps, le sujet.
        if (state) state.inputLocked = true;
        try { if (typeof playSfx === "function") playSfx("turn"); } catch (_) { }
        await tutoWait(1600);
        if (!EVEIL.active) return;

        if (state) state.inputLocked = false;
        try { await endTurn(true); } catch (_) { }
        if (state) state.inputLocked = false;
        if (!EVEIL.active) return;

        /* Filet : si le cycle n'a pas suffi a declencher scoreCrownsAtTurnStart
           (tour courant differe, porteur deplace), on l'appelle explicitement.
           L'etape ne doit jamais rester suspendue sur une regle de comptage. */
        const p = state?.players?.[0];
        if (p && !(p.score > 0)) {
          try { if (typeof scoreCrownsAtTurnStart === "function") scoreCrownsAtTurnStart(p); } catch (_) { }
        }
        tutoRender();
        await tutoWait(700);
        tutoLetterbox(false);
        TUTO.cinematic = false;
        if (EVEIL.active) eveilCameraLibre();
      }

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
        eveilAppliquerLumiere();     // la nuit se leve d'un acte a l'autre

        /* LA RUNE DE L'ETAPE. Une par etape, jamais deux a l'ecran, montree
           pendant le Souffle — le moment ou le joueur n'a de toute facon pas
           la main, et ou son regard est disponible. Elle nomme la NOTION
           ( l'oeil : regarder · le pas : marcher · le sablier : le temps ),
           la ou la lumiere ne sait designer qu'un LIEU. C'est la difference
           entre « ici » et « ceci ».

           Ajoutee apres un retour de l'auteur : trop d'elements du parcours
           restaient incomprehensibles, faute d'un signe qui dise de quoi il
           s'agit. */
        if (etape.rune) eveilRune(etape.rune, 3000);
        eveilCompagnonPresenter(etape);

        /* Le SOUFFLE se joue APRES l'entree : les plans se calculent sur le
           monde tel qu'il vient d'etre prepare.

           Sous try/catch, et ce n'est pas de la prudence gratuite : une erreur
           ici sautait par-dessus eveilArmer, l'etape n'etait jamais armee, et
           le parcours se figeait SANS le moindre signe. Un plan de camera rate
           doit couter un plan de camera, pas le tutoriel. */
        let plans = [];
        try {
          if (typeof etape.souffle === "function") plans = etape.souffle() || [];
        } catch (err) { console.warn("[eveil] souffle", etape.id, err); }
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
            clearTimeout(EVEIL.montreTimer);
            eveilCompagnonMontrer(etape);   // et cette fois, sans s'arreter
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
            if (f?.surPlace) eveilFantomeSurPlace(f.charId, f.surPlace);
            else if (f) eveilFantomeMarche(f.charId, f.de, f.vers);
            /* Toutes les etapes ne s'expliquent pas par une silhouette : poser
               une ile, tourner une barre, annuler, finir son tour sont des
               gestes de HUD. Celles-la ont leur propre dernier recours. */
            if (typeof etape.dernierRecours === "function") etape.dernierRecours();
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
          // Avant toute chose : personne ne doit se retrouver sans un geste
          // jouable tant qu'on n'a pas enseigne la penurie.
          eveilMainSansFin(etape);
          eveilSuivreFoyer(etape);

          if (EVEIL.souffle) EVEIL.touche = Date.now();
          else {
            eveilCompagnonAuRepos();
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

        /* Trois sorties possibles. « refus » ferme sur un manque (buter sur
           le vide). « muet » ne ferme sur rien du tout : poser la Couronne au
           village ne DOIT produire aucun eclat, puisque l'incomprehension est
           precisement la lecon. Partout ailleurs, l'assentiment. */
        if (etape.sortie === "refus") eveilRefus();
        else if (etape.sortie !== "muet") eveilAssentiment(etape.son);

        const suivante = EVEIL.etape + 1;
        clearTimeout(EVEIL.suiteTimer);
        EVEIL.suiteTimer = setTimeout(() => {
          if (EVEIL.active) eveilAller(suivante);
        }, etape.sortie === "refus" ? 1800 : etape.sortie === "muet" ? 900 : 1100);
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

        /* LE SEUIL. Les quatre actes sont faits : le joueur sait tout ce
           qu'il faut pour jouer. Les lumieres du parcours s'eteignent une a
           une — le compagnon s'en va, le HUD complet revient — et la camera
           recule sur tout le chemin bati depuis le premier caillou. */
        eveilRendreHud();
        eveilRendreLumiere();        // le jour se leve tout a fait
        eveilCompagnonDisparaitre();
        TUTO.cinematic = true;
        tutoLetterbox(true);
        try { if (typeof playSfx === "function") playSfx("victory"); } catch (_) { }
        const g = eveilPorteur() || eveilGardien();
        if (g) eveilTravel(g.r, g.c, 1600, .4);
        setTimeout(() => { if (EVEIL.active) eveilTravel(4, 2, 2800, -3.2); }, 1700);
        setTimeout(() => { if (EVEIL.active) eveilCarteDeFin(); }, 4600);
      }

      function eveilCarteDeFin() {
        const d = TUTO.dom;
        if (!d || d.layer.querySelector(".tuto-end")) return;
        const fin = document.createElement("div");
        fin.className = "tuto-end";
        fin.innerHTML = `
          <h2>Tu sais.</h2>
          <p>Le reste du ciel t'attend.</p>
          <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center">
            <button type="button" class="tuto-btn primary" data-tuto="play">Entrer dans une vraie partie</button>
            <button type="button" class="tuto-btn" data-tuto="refaire">Recommencer</button>
            <button type="button" class="tuto-btn" data-tuto="menu">Retour au menu</button>
          </div>`;
        d.layer.appendChild(fin);
        fin.querySelector('[data-tuto="menu"]').addEventListener("click", () => tutoExit(true));
        fin.querySelector('[data-tuto="refaire"]').addEventListener("click", eveilRecommencer);
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
        eveilAppliquerLumiere();     // on ouvre les yeux dans le noir

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

      /* RECOMMENCER DEPUIS LE PREMIER SOUFFLE.

         Le parcours retient l'etape atteinte et y reprend : c'est ce qu'on
         veut quand on le quitte en cours de route, et c'est exactement ce
         qu'on ne veut pas quand on souhaite le revoir en entier. D'ou ce
         bouton — il oublie la progression, puis rejoue tout depuis le noir.

         Pas de demande de confirmation : le geste est explicite, son libelle
         le dit, et rien n'est perdu qu'on ne puisse refaire. */
      function eveilRecommencer() {
        if (!EVEIL.active) return;
        try { localStorage.removeItem(EVEIL_STORAGE_KEY); } catch (_) { }
        tutoExit(false);               // ferme proprement, sans repasser au menu
        setTimeout(() => {
          if (!TUTO.active) eveilDemarrer();
        }, 220);
      }

      function eveilPoserBoutonRefaire() {
        const layer = TUTO.dom?.layer;
        if (!layer || layer.querySelector(".eveil-refaire")) return;
        const bouton = document.createElement("button");
        bouton.type = "button";
        bouton.className = "eveil-refaire";
        bouton.textContent = "Recommencer";
        bouton.title = "Reprendre L'Eveil depuis le debut";
        bouton.addEventListener("click", eveilRecommencer);
        layer.appendChild(bouton);
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
        eveilPoserBoutonRefaire();
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
        els.gameScreen?.classList.add("tutorial-eveil");
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
        clearTimeout(EVEIL.montreTimer);
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
        eveilRuneStop();
        eveilRendreLumiere();
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

        /* LE REGLAGE DE LA LUMIERE, a la main et en direct.

             ILYOS_TUTORIAL.lumiere()      lit la valeur courante
             ILYOS_TUTORIAL.lumiere(.5)    deux fois plus sombre
             ILYOS_TUTORIAL.lumiere(1)     la penombre telle qu'elle est concue
             ILYOS_TUTORIAL.lumiere(0)     le noir a peu pres complet
             ILYOS_TUTORIAL.lumiere(1.6)   presque le plein jour du jeu normal

           Le changement se voit IMMEDIATEMENT, sans relancer le parcours, et
           il est retenu d'une session a l'autre. C'est un multiplicateur : la
           courbe par acte (I sombre, IV clair) continue de jouer par-dessus. */
        lumiere(valeur) {
          if (valeur === undefined) {
            const etape = EVEIL_ETAPES[EVEIL.etape];
            return {
              reglage: eveilReglageLumiere(),
              acte: etape?.acte || null,
              partDeLActe: EVEIL_LUMIERE_ACTES[etape?.acte] ?? null,
              exposition: kaykit3D?.renderer?.toneMappingExposure ?? null
            };
          }
          const v = Math.max(0, Math.min(2, Number(valeur) || 0));
          try { localStorage.setItem(EVEIL_LUMIERE_KEY, String(v)); } catch (_) { }
          if (EVEIL.active) eveilAppliquerLumiere();
          return v;
        },
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
            rivaux: (state?.characters || []).filter(ch => ch.player === 1).map(ch => ({ id: ch.id, r: ch.r, c: ch.c })),
            corniche: EVEIL.corniche || null,
            undo: (state?.undoHistory || []).length,
            score: state?.players?.[0]?.score || 0,
            main: (state?.players?.[0]?.hand || []).filter(c => !c.used).length,
            defausse: (state?.players?.[0]?.discard || []).length,
            reserve: (state?.players?.[0]?.reserveCards || []).length,
            zoneVillage: EVEIL.zoneVillage || null,
            rune: !!EVEIL.runeNode,
            magie: state ? {
              pivot: state.selectedMagicPivot, steps: state.magicPreviewSteps,
              ileId: state.selectedIslandId, action: state.selectedActionType
            } : null,
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
