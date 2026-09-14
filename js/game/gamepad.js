      /* ILYOS — Manette (Gamepad API native)

         Couche d'entree uniquement : aucune regle de jeu n'est redefinie ici.
         Chaque touche appelle exactement la fonction que la souris appelle.

         Pourquoi ce fragment vit DANS le bundle et non dans un script autonome
         comme js/mobile-input-v1.js : dispatchKayKitClick, handleCancelButton,
         executeUnifiedPushOption, rotateSelectedIsland et kaykit3D sont prives
         de la fermeture partagee par js/game/*.js. Un script charge separement
         ne peut que fabriquer de faux evenements DOM — c'est precisement ce que
         la couche tactile doit faire, et son en-tete documente le prix paye :
         le click natif arrive parfois avant que le moteur ait remis dragMoved a
         false, et une action se perdait en pleine poussee.

         Deux chemins distincts, choisis pour leur risque :
         - SURVOL : un vrai pointermove synthetique sur le canvas, aux
           coordonnees ecran de la case visee. Inoffensif (aucune action
           declenchee) et cela reutilise tel quel tout le systeme d'affordance
           existant — reticule, apercus de deplacement, anneaux de poussee, et
           l'apercu de pose d'ile, qui suit deja la case survolee.
         - ACTION : appel direct au moteur. On contourne ainsi le verrou
           dragMoved, et surtout dispatchKayKitClick sait deja resoudre les
           couronnes (".carrier-crown" / ".artifact"), ce qu'un simple
           cell.click() ne fait pas — la vue tactique s'y etait deja brulee.

         NAVIGATION EN DEUX TEMPS. Au repos, le stick gauche parcourt le HUD
         (gauche/droite) et les gardiens allies (haut/bas) : on ne demande pas
         au joueur de viser une case pour choisir une action. Des qu'une action
         ou un gardien est pris, le meme stick navigue sur le plateau. La croix
         directionnelle double le stick et n'est jamais obligatoire.
      */
      (function setupIlyosGamepad() {
        if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return;

        const DEADZONE = .35;
        const STEP_FIRST_MS = 260;   // delai avant repetition quand on maintient
        const STEP_REPEAT_MS = 120;  // cadence de repetition ensuite
        const ROTATE_SPEED = .035;   // radians par image a fond de course
        const ZOOM_COOLDOWN_MS = 90;
        const ROTATE_ISLAND_MS = 180; // anti-rebond des rotations d'ile

        // Disposition "standard" de la Gamepad API : c'est celle que Chrome
        // expose pour les manettes Xbox, PlayStation et la plupart des modeles
        // USB/Bluetooth. gamepad.mapping vaut alors "standard".
        const BUTTON = {
          A: 0, B: 1, X: 2, Y: 3,
          LB: 4, RB: 5, LT: 6, RT: 7,
          SELECT: 8, START: 9, L3: 10, R3: 11,
          UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15
        };

        // Ordre de parcours du dock, de gauche a droite comme a l'ecran.
        const HUD_ORDER = ["ov2Island", "ov2Move", "ov2Push", "ov2Magic", "ov2End", "ov2Undo"];

        const pad = {
          cursor: null,          // { r, c } de la case visee
          special: null,         // cible hors trame : destination de poussee ou chute
          crownMode: false,      // contexte COURONNE ouvert par Y
          panneauEl: null,       // bouton vise dans un panneau plein ecran
          bDepuis: 0,            // debut de l'appui sur B, pour l'appui long
          bTraite: false,        // l'appui long a deja agi : le relacher ne fait rien
          chaineUndo: false,     // remontee d'historique explicitement engagee
          undoConnus: 0,         // taille d'historique vue, pour desarmer la chaine
          tourConnu: null,
          hudEl: null,           // action du dock surlignee (etat neutre)
          choiceEl: null,        // choix contextuel surligne (tiroir, panneau)
          choiceIndex: -1,       // ... suivi par RANG, voir syncChoice()
          lastGuardianId: null,  // dernier gardien parcouru ou utilise
          lastGuardianCell: null,// ... et ou il se trouvait, pour le suivre
          previous: [],          // etat des boutons a l'image precedente
          wasNeutral: true,      // pour detecter l'entree dans une action
          lastScoreAnim: null,   // pour vibrer sur une couronne validee
          stepAt: 0,
          zoomAt: 0,
          rotateAt: 0
        };

        /* ---- Lecture de la situation ------------------------------------ */

        function boardCanvas() { return kaykit3D?.canvas || document.getElementById("kaykitCanvas"); }

        /* On cherche les boutons d'ile EUX-MEMES, pas le tiroir qui les contient.
           Se fier a #hudV2IslandDrawer etait fragile : reparentFunctionalPopovers()
           deplace #islandSelector d'un conteneur a l'autre, et il suffisait que le
           tiroir consulte ne soit pas celui reellement affiche pour que la liste
           ressorte vide — le stick n'avait alors rien a parcourir. Un bouton
           visible et actif est offert au joueur : cela suffit a le dire. */
        function islandChoices() {
          return [...document.querySelectorAll(".island-choice")].filter(button => {
            // L'ancien panneau gauche porte les memes boutons sous aria-hidden :
            // les compter rendrait le tiroir « ouvert » en permanence, et le stick
            // ne quitterait plus jamais la liste d'iles.
            if (button.closest('[aria-hidden="true"]')) return false;
            return usable(button);
          });
        }

        function drawerOpen() { return islandChoices().length > 0; }

        function placingIsland() {
          return state?.phase === "PLACE_ISLAND" && !!state.placementCells;
        }

        /* « Neutre » = rien n'est engage, donc le stick appartient au HUD.
           On le deduit de l'etat du jeu plutot que d'un drapeau interne : un
           drapeau se desynchronise des que le joueur agit a la souris, et les
           deux peripheriques doivent rester utilisables en meme temps. */
        function neutral() {
          if (!state) return true;
          /* PLACE_SPAWN ne coche aucune des cases ci-dessous — ni action, ni
             gardien selectionne — et passait donc pour « neutre » : le stick
             repartait vers le dock alors que le jeu attendait un clic sur une
             case, et le gardien devenait impossible a poser a la manette. */
          /* Seules les phases qui ATTENDENT un clic sur le plateau sortent de
             l'etat neutre. Tester « des cibles existent » etait trop large : une
             couronne reclamable au village suffit a en publier une des le premier
             tour, et le stick ne rejoignait alors plus jamais le dock. Les autres
             cas — deplacement, poussee, magie — sont deja couverts plus bas par
             l'action ou le gardien selectionne. */
          if (state.phase === "PLACE_SPAWN" || spawnChoices().length) return false;
          return !placingIsland()
            && !state.selectedActionType
            && !state.selectedCharId
            && !(state.pushOptions && state.pushOptions.length);
        }

        /* LES CIBLES VALIDES SONT CELLES QUE LE MOTEUR SURLIGNE DEJA.

           renderBoard marque chaque case offerte d'une classe — « reachable »
           pour un deplacement, « spawn-choice » pour une invocation,
           « crown-claimable » pour une couronne, « magic-valid » et
           « magic-pivot » pour la magie. Lire cette decision plutot que de la
           refaire evite de dupliquer la regle, couvre le tutoriel et les enigmes
           qui partagent le meme plateau, et fera vivre toute action ajoutee plus
           tard sans qu'on retouche cette couche. */
        const CLASSES_CIBLES = [
          "spawn-choice",      // invocation d'un gardien
          "crown-claimable",   // couronne a prendre, transmettre ou poser
          "magic-pivot",       // pivot d'une rotation magique
          "magic-valid",       // ile ou case concernee par la magie
          "reachable"          // destination de deplacement
        ];

        function classesDeLAction() {
          if (state?.phase === "PLACE_SPAWN") return ["spawn-choice"];
          switch (state?.selectedActionType) {
            case "MAGIC": return ["magic-pivot", "magic-valid"];
            case "MOVE": return ["reachable"];
            case "PUSH": return ["reachable"];
            default: return CLASSES_CIBLES;
          }
        }

        function cellulesMarquees(className) {
          return [...document.querySelectorAll(`.cell.${className}`)]
            .map(cell => ({ r: Number(cell.dataset.r), c: Number(cell.dataset.c) }))
            .filter(cell => Number.isFinite(cell.r) && Number.isFinite(cell.c));
        }

        function spawnChoices() { return cellulesMarquees("spawn-choice"); }

        /* Gardiens que le moteur declare choisissables : au repos, ce sont eux
           que haut/bas doit parcourir, et non tous les allies indistinctement. */
        function guardiansMarques() {
          return [...document.querySelectorAll(".cell .character.selectable")]
            .map(marque => marque.closest(".cell"))
            .filter(Boolean)
            .map(cell => ({ r: Number(cell.dataset.r), c: Number(cell.dataset.c) }))
            .filter(cell => Number.isFinite(cell.r) && Number.isFinite(cell.c));
        }

        function alliedGuardians() {
          return (state?.characters || [])
            .filter(char => char.player === state.currentPlayer && Number.isFinite(char.r) && Number.isFinite(char.c))
            .sort((a, b) => (a.r - b.r) || (a.c - b.c));
        }

        /* ---- Curseur de case -------------------------------------------- */

        function clampCell(value) { return Math.max(0, Math.min(GRID - 1, value)); }

        function cellToScreen(r, c) {
          const canvas = boardCanvas();
          if (!kaykit3D?.camera || !canvas || typeof kaykitCellPosition !== "function") return null;
          const position = kaykitCellPosition(r, c, kaykitCellSurfaceY(r, c));
          const projected = new THREE.Vector3(position.x, position.y, position.z).project(kaykit3D.camera);
          const rect = canvas.getBoundingClientRect();
          if (!rect.width || !rect.height) return null;
          return {
            x: rect.left + (projected.x * .5 + .5) * rect.width,
            y: rect.top + (-projected.y * .5 + .5) * rect.height
          };
        }

        function defaultCursor() {
          // Une case ouverte a l'action en cours vaut mieux que le centre du
          // plateau : le joueur n'a pas a aller chercher ce qui lui est offert.
          const interessantes = pointsOfInterest();
          if (interessantes && interessantes.length) return { r: interessantes[0].r, c: interessantes[0].c };
          const selected = (state?.characters || []).find(char => char.id === state.selectedCharId);
          if (selected && Number.isFinite(selected.r)) return { r: selected.r, c: selected.c };
          const remembered = (state?.characters || []).find(char => char.id === pad.lastGuardianId);
          if (remembered && Number.isFinite(remembered.r)) return { r: remembered.r, c: remembered.c };
          const middle = Math.floor(GRID / 2);
          return { r: middle, c: middle };
        }

        /* Les cibles d'une poussee ne sont pas des cases : ce sont les anneaux
           de destination et le marqueur de chute, ce dernier flottant hors de la
           trame du plateau. Naviguer par case ne pouvait donc pas les atteindre.
           On les parcourt comme ce qu'elles sont — des objets de la scene. */
        function pushTargets() {
          if (!state?.pushOptions?.length || !kaykit3D?.interactiveMeshes) return [];
          return kaykit3D.interactiveMeshes
            .filter(mesh => {
              const kind = mesh?.userData?.ilyosInteraction;
              return kind === "push-destination" || kind === "push-death-destination";
            })
            .map(mesh => ({ mesh, id: mesh.userData.pushOptionId }));
        }

        function screenOfMesh(mesh) {
          const canvas = boardCanvas();
          if (!kaykit3D?.camera || !canvas || !mesh) return null;
          const monde = mesh.getWorldPosition(new THREE.Vector3());
          const projected = monde.project(kaykit3D.camera);
          const rect = canvas.getBoundingClientRect();
          if (!rect.width || !rect.height) return null;
          return {
            x: rect.left + (projected.x * .5 + .5) * rect.width,
            y: rect.top + (-projected.y * .5 + .5) * rect.height
          };
        }

        /* Cases qui meritent vraiment qu'on s'y arrete, dans l'ordre de
           priorite de la situation. Sans cela, atteindre une destination de
           poussee a l'autre bout du plateau demandait une dizaine de crans sur
           des cases sans le moindre interet. La pose d'ile est volontairement
           exclue : l'ile doit pouvoir aller partout, y compris sur des cases
           que rien ne distingue. */
        function pointsOfInterest() {
          if (!state || placingIsland()) return null;
          if (state.pushOptions && state.pushOptions.length) {
            const cells = state.pushOptions
              .filter(option => Number.isFinite(option.r) && Number.isFinite(option.c))
              .map(option => ({ r: option.r, c: option.c }));
            if (cells.length) return cells;
          }
          /* LES CIBLES DEPENDENT DE L'ACTION, PAS D'UN ORDRE FIXE.

             Une liste de priorites figee laissait la premiere classe non vide
             tout rafler : « crown-claimable » existe des le premier tour a cause
             du village, et passait devant « magic-pivot ». Le pivot d'une
             rotation magique devenait donc impossible a viser. On demande
             desormais a l'action en cours quelles classes la concernent, et on
             prend leur union — un pivot et ses cases valides comptent ensemble. */
          const retenues = [];
          for (const className of classesDeLAction()) {
            for (const cell of cellulesMarquees(className)) {
              if (!retenues.some(vue => vue.r === cell.r && vue.c === cell.c)) retenues.push(cell);
            }
          }
          if (retenues.length) return retenues;
          /* Aucune cible publiee : on rend la navigation libre, case par case.
             La pose d'ile en depend — une ile doit pouvoir aller partout, y
             compris sur des cases que rien ne distingue. */
          return null;
        }

        /* L'ecran tourne avec la camera : pousser le stick « vers le haut » doit
           deplacer le curseur vers le haut DE L'ECRAN, pas vers la rangee 0 du
           plateau. Tout se decide donc en coordonnees ecran — pour les quatre
           voisines comme pour les cibles pertinentes. */
        /* Le seuil d'alignement est volontairement bas, et la separation minimale
           minuscule : vue de face, le plateau est presque de profil et l'axe de
           profondeur ne se projette plus que sur quelques pixels. Un seuil severe
           ecartait alors les cases situees derriere — elles devenaient
           inatteignables sans tourner la camera. */
        function bestInDirection(candidates, dx, dy, origin) {
          let best = null, bestScore = 0;
          for (const candidate of candidates) {
            const point = cellToScreen(candidate.r, candidate.c);
            if (!point) continue;
            const vx = point.x - origin.x, vy = point.y - origin.y;
            const length = Math.hypot(vx, vy);
            if (length < .5) continue;
            // Cap d'abord, distance ensuite : a cap egal, la plus proche gagne.
            const alignment = ((vx / length) * dx + (vy / length) * dy);
            if (alignment < .25) continue;
            const score = alignment / (1 + length / 240);
            if (score > bestScore) { bestScore = score; best = candidate; }
          }
          return best;
        }

        /* FILET DE SECURITE : aucune cible valide ne doit dependre de l'angle de
           camera. Deux cases distinctes peuvent se projeter au meme point — un
           gardien devant, un plateau vu de face — et aucun geometrie ne les
           departagera jamais. On garde donc un parcours par ordre de plateau,
           independant de la vue : il traverse toutes les cibles, toujours. */
        function orderedTargets() {
          const cibles = pointsOfInterest();
          if (!cibles || !cibles.length) return null;
          return [...cibles].sort((a, b) => (a.r - b.r) || (a.c - b.c));
        }

        function cycleTargets(direction) {
          const cibles = orderedTargets();
          if (!cibles) return false;
          const rang = pad.cursor
            ? cibles.findIndex(cell => cell.r === pad.cursor.r && cell.c === pad.cursor.c)
            : -1;
          const suivant = rang < 0
            ? (direction > 0 ? 0 : cibles.length - 1)
            : (rang + direction + cibles.length) % cibles.length;
          const cible = cibles[suivant];
          if (pad.cursor && cible.r === pad.cursor.r && cible.c === pad.cursor.c) return false;
          pad.cursor = { r: cible.r, c: cible.c };
          pad.special = null;
          return true;
        }

        function stepCursor(dx, dy) {
          const targets = pushTargets();
          if (targets.length) {
            const points = targets
              .map(target => ({ target, point: screenOfMesh(target.mesh) }))
              .filter(entry => entry.point);
            if (points.length) {
              const current = pad.special && points.find(entry => entry.target.id === pad.special.id);
              if (!current) { pad.special = points[0].target; return true; }
              const others = points.filter(entry => entry.target.id !== pad.special.id);
              let best = null, bestScore = 0;
              for (const entry of others) {
                const vx = entry.point.x - current.point.x, vy = entry.point.y - current.point.y;
                const length = Math.hypot(vx, vy);
                if (length < 1) continue;
                const alignment = (vx / length) * dx + (vy / length) * dy;
                if (alignment < .25) continue;
                const score = alignment / (1 + length / 240);
                if (score > bestScore) { bestScore = score; best = entry.target; }
              }
              if (!best) return false;
              pad.special = best;
              return true;
            }
          }
          pad.special = null;
          if (!pad.cursor) { pad.cursor = defaultCursor(); return true; }
          const { r, c } = pad.cursor;
          const origin = cellToScreen(r, c);
          let best = null;

          if (origin) {
            const interesting = pointsOfInterest();
            if (interesting) {
              best = bestInDirection(
                interesting.filter(cell => cell.r !== r || cell.c !== c),
                dx, dy, origin
              );
              /* TANT QUE DES CIBLES EXISTENT, LE CURSEUR N'EN SORT PAS.

                 Rien dans cette direction ne veut pas dire qu'il faut partir
                 ailleurs : pendant un deplacement, viser une case inatteignable
                 ne sert a rien, et obligeait a retraverser le vide pour revenir
                 dans la zone. Quand la geometrie ne tranche pas — vue de face,
                 cibles superposees — on avance dans l'ordre du plateau ; s'il n'y
                 a qu'une cible, on y reste. Le parcours libre reprend seulement
                 quand le moteur ne propose plus rien, la pose d'ile par exemple. */
              if (!best) return cycleTargets(dx + dy >= 0 ? 1 : -1);
              pad.cursor = { r: best.r, c: best.c };
              pad.special = null;
              return true;
            }
            if (!best) {
              const neighbours = [{ r: r - 1, c }, { r: r + 1, c }, { r, c: c - 1 }, { r, c: c + 1 }]
                .filter(cell => cell.r >= 0 && cell.c >= 0 && cell.r < GRID && cell.c < GRID);
              best = bestInDirection(neighbours, dx, dy, origin);
            }
          }
          // Repli sans camera exploitable : axes bruts du plateau.
          if (!best) best = { r: clampCell(r + Math.round(dy)), c: clampCell(c + Math.round(dx)) };
          if (best.r === r && best.c === c) return false;
          pad.cursor = { r: best.r, c: best.c };
          return true;
        }

        /* Survol : on laisse le moteur faire son propre lancer de rayon depuis
           ces coordonnees. pointerType "mouse" est volontaire — mobile-input
           ne traite que les pointeurs non-souris, il ne doit pas s'en saisir. */
        function refreshHover() {
          const canvas = boardCanvas();
          const point = pad.special
            ? screenOfMesh(pad.special.mesh)
            : (pad.cursor && cellToScreen(pad.cursor.r, pad.cursor.c));
          if (!canvas || !point) return;
          canvas.dispatchEvent(new PointerEvent("pointermove", {
            bubbles: true, cancelable: true, view: window,
            pointerId: 1, pointerType: "mouse", isPrimary: true,
            clientX: point.x, clientY: point.y
          }));
        }

        function moveCursorTo(r, c) {
          pad.cursor = { r, c };
          setHud(null);
          clearChoice();
          refreshHover();
        }

        /* ---- Actions sur le plateau -------------------------------------- */

        function interactionAtCursor() {
          if (!pad.cursor || !kaykit3D?.interactiveMeshes) return null;
          const { r, c } = pad.cursor;
          // Une destination de poussee n'est pas une case : elle porte son
          // propre identifiant d'option, comme dans le handler de clic 3D.
          for (const mesh of kaykit3D.interactiveMeshes) {
            const data = mesh?.userData || {};
            if (data.ilyosInteraction !== "push-destination" && data.ilyosInteraction !== "push-death-destination") continue;
            const option = state?.pushOptions?.find(item => item.id === data.pushOptionId);
            if (option && option.r === r && option.c === c) return { pushOptionId: data.pushOptionId };
          }
          /* UN GARDIEN ALLIE RESTE UN GARDIEN.

             Les couronnes etaient examinees avant la case, donc A sur son propre
             porteur declenchait l'action de couronne au lieu de le selectionner :
             on ne pouvait plus le deplacer sans passer par le dock. La couronne
             appartient desormais entierement a Y ; A ne fait que selectionner ce
             qu'il vise. Priorite : gardien allie selectionnable, puis couronne. */
          const gardienSelectionnable = document.querySelector(
            `.cell[data-r="${r}"][data-c="${c}"] .character.selectable`
          );
          if (gardienSelectionnable) return {};

          // Couronne portee ou posee sur la case : dispatchKayKitClick vise
          // alors le bon noeud enfant, pas la case elle-meme.
          for (const mesh of kaykit3D.interactiveMeshes) {
            const data = mesh?.userData || {};
            if (data.r !== r || data.c !== c) continue;
            if (data.kaykitAction === "crown-carried" || data.kaykitAction === "crown-loose") {
              return { kaykitAction: data.kaykitAction };
            }
          }
          return {};
        }

        function actOnCursor() {
          if (typeof canLocalPlayerAct !== "function" || !canLocalPlayerAct()) return;
          if (pad.special) {
            executeUnifiedPushOption(pad.special.id);
            pad.special = null;
            vibrate(170, .75);
            return;
          }
          if (!pad.cursor) return;
          const found = interactionAtCursor();
          if (!found) return;
          const guardian = (state?.characters || []).find(
            char => char.r === pad.cursor.r && char.c === pad.cursor.c && char.player === state.currentPlayer
          );
          if (guardian) pad.lastGuardianId = guardian.id;
          if (found.pushOptionId) {
            executeUnifiedPushOption(found.pushOptionId);
            vibrate(170, .75);
            return;
          }
          const point = cellToScreen(pad.cursor.r, pad.cursor.c) || { x: 0, y: 0 };
          dispatchKayKitClick(
            { userData: { r: pad.cursor.r, c: pad.cursor.c, kaykitAction: found.kaykitAction } },
            { clientX: point.x, clientY: point.y, button: 0, buttons: 0 }
          );
          vibrate(45, .22);
        }

        function clickDock(id) {
          const button = document.getElementById(id);
          if (button && usable(button)) { button.click(); vibrate(45, .22); }
          else showToast("Action indisponible pour le moment.");
        }

        /* Y : la couronne. Prendre, transmettre ou poser passent tous par un
           clic sur le noeud de la couronne lui-meme (".carrier-crown" pour une
           couronne portee, ".artifact" pour une couronne au sol) — jamais sur la
           case. dispatchKayKitClick sait viser ce noeud ; on lui donne donc la
           couronne visee, puis le joueur designe le gardien voisin au curseur.
           Priorite a la couronne sous le curseur, sinon celle du porteur allie. */
        /* Y DESIGNE une couronne, il n'en actionne aucune : c'est A qui agit.

           Y choisissait auparavant lui-meme — couronne sous le curseur, sinon
           celle du porteur allie, sinon la premiere venue — et validait dans la
           foulee. Quand deux couronnes etaient en jeu, la seconde etait donc
           inatteignable : le joueur n'avait aucun moyen de dire laquelle il
           visait. Y parcourt desormais toutes les couronnes a portee, dans un
           ordre stable, et laisse la decision au joueur.

           Prendre, transmettre et poser passent tous par un clic sur le noeud de
           la couronne (".carrier-crown" pour une couronne portee, ".artifact"
           pour une couronne au sol) et jamais sur la case : c'est pourquoi la
           couronne sous le curseur est retrouvee au moment d'agir. */
        function crownTargets() {
          if (!kaykit3D?.interactiveMeshes) return [];
          const vues = new Set();
          return kaykit3D.interactiveMeshes
            .filter(mesh => {
              const action = mesh?.userData?.kaykitAction;
              if (action !== "crown-carried" && action !== "crown-loose") return false;
              // Un modele 3D compte plusieurs meshes par couronne : une seule
              // entree par case, sinon Y semblerait ne pas avancer.
              const clef = `${mesh.userData.r},${mesh.userData.c}`;
              if (vues.has(clef)) return false;
              vues.add(clef);
              return true;
            })
            .map(mesh => ({ r: mesh.userData.r, c: mesh.userData.c, action: mesh.userData.kaykitAction }))
            .concat(
              /* Le moteur marque aussi les cases ou une interaction de couronne
                 est offerte sans qu'un objet 3D ne s'y trouve — un gardien qui
                 peut recuperer, transmettre ou valider. Les ignorer aurait rendu
                 ces interactions invisibles a Y. */
              cellulesMarquees("crown-claimable")
                .filter(cell => !vues.has(`${cell.r},${cell.c}`))
                .map(cell => ({ r: cell.r, c: cell.c, action: undefined }))
            )
            .sort((a, b) => (a.r - b.r) || (a.c - b.c));
        }

        /* Y : TOUTES les interactions de couronne legales, et elles seules.

           Les cibles viennent du moteur — maillages de couronne pour les objets,
           cases « crown-claimable » pour les gardiens habilites a agir — jamais
           d'une regle recopiee ici.

           Une seule possibilite : Y l'execute. Plusieurs : Y ouvre un contexte
           COURONNE ou LB/RB changent d'objet et A confirme. Aucun choix
           arbitraire : quand il y a un choix, il revient au joueur. */
        function crownAction() {
          const couronnes = crownTargets();
          if (!couronnes.length) { showToast("Aucune couronne a portee."); return; }

          if (couronnes.length === 1) {
            const seule = couronnes[0];
            pad.crownMode = false;
            moveCursorTo(seule.r, seule.c);
            actOnCrown(seule);
            return;
          }

          if (!pad.crownMode) {
            pad.crownMode = true;
            const depart = couronnes[0];
            moveCursorTo(depart.r, depart.c);
            showToast(`Couronne 1 sur ${couronnes.length} — LB/RB pour changer, A pour agir.`);
            vibrate(40, .2);
            return;
          }
          // Deja dans le contexte : Y fait defiler comme LB/RB.
          cycleCrowns(1);
        }

        function actOnCrown(cible) {
          const point = cellToScreen(cible.r, cible.c) || { x: 0, y: 0 };
          dispatchKayKitClick(
            { userData: { r: cible.r, c: cible.c, kaykitAction: cible.action } },
            { clientX: point.x, clientY: point.y, button: 0, buttons: 0 }
          );
          vibrate(60, .3);
        }

        function cycleCrowns(direction) {
          const couronnes = crownTargets();
          if (!couronnes.length) { pad.crownMode = false; return false; }
          const rang = couronnes.findIndex(
            couronne => pad.cursor && couronne.r === pad.cursor.r && couronne.c === pad.cursor.c
          );
          const suivant = rang < 0
            ? 0
            : (rang + direction + couronnes.length) % couronnes.length;
          const cible = couronnes[suivant];
          moveCursorTo(cible.r, cible.c);
          showToast(`Couronne ${suivant + 1} sur ${couronnes.length} — A pour agir.`);
          return true;
        }

        /* B : meme arbitrage que la touche Echap (voir diagnostics.js) —
           refermer une fenetre ouverte d'abord, sinon annuler. handleCancelButton
           sait deja remonter d'un cran a la fois : desselectionner ce qui est en
           cours, puis seulement annuler la derniere action. On ne redecrit donc
           pas cette echelle ici, on l'emprunte. */
        function cancel() {
          if (els.rulesModal && !els.rulesModal.classList.contains("hidden")) {
            els.rulesModal.classList.add("hidden");
            return;
          }
          if (els.soundMenu && !els.soundMenu.classList.contains("hidden")) { closeSoundMenu(); return; }
          if (drawerOpen()) { closeHudV2Drawer(); return; }
          handleCancelButton();
        }

        /* ---- Surlignage ------------------------------------------------- */

        /* Ne PAS tester offsetParent ici : il vaut null pour tout element en
           position:fixed, ce qu'est justement le HUD organique. La liste des
           controles etait alors systematiquement vide et la navigation ne
           faisait rien. On mesure la boite et on lit le style calcule. */
        function visible(element) {
          if (!element) return false;
          const rect = element.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return false;
          const style = getComputedStyle(element);
          return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) !== 0;
        }

        function usable(button) {
          return visible(button) && !button.disabled
            && button.getAttribute("aria-disabled") !== "true"
            && !button.classList.contains("disabled");
        }

        function highlight(previous, next) {
          if (previous && previous !== next) previous.classList.remove("ilyos-gamepad-focus");
          if (next) {
            next.classList.add("ilyos-gamepad-focus");
            next.scrollIntoView?.({ block: "nearest", inline: "nearest" });
          }
          return next || null;
        }

        function setHud(element) {
          pad.hudEl = highlight(pad.hudEl, element);
          // Un seul anneau a la fois : laisser le dock allume pendant qu'on
          // choisit une ile donnait deux surlignages concurrents a l'ecran, sans
          // dire lequel A validerait.
          if (element) clearChoice();
        }

        function clearChoice() {
          pad.choiceEl = highlight(pad.choiceEl, null);
          pad.choiceIndex = -1;
        }

        /* Le choix contextuel est suivi par RANG, pas par reference.
           renderIslandSelector() vide #islandSelector et reconstruit ses neuf
           boutons a chaque rendu — et un rendu survient a chaque changement de
           survol, donc a chaque mouvement du curseur. Une reference gardee d'une
           image sur l'autre designait donc un noeud detache : le menage l'ecartait
           et le surlignage retombait sur la premiere ile. Impossible, dans ces
           conditions, d'en choisir une autre a la manette. Le rang, lui, survit a
           la reconstruction. */
        function syncChoice() {
          const list = contextChoices();
          if (!list.length) { clearChoice(); return null; }
          if (pad.choiceIndex < 0) pad.choiceIndex = 0;
          if (pad.choiceIndex >= list.length) pad.choiceIndex = list.length - 1;
          const element = list[pad.choiceIndex];
          pad.choiceEl = highlight(pad.choiceEl, element);
          pad.hudEl = highlight(pad.hudEl, null);
          return element;
        }

        function moveChoice(direction) {
          const list = contextChoices();
          if (!list.length) { clearChoice(); return; }
          pad.choiceIndex = pad.choiceIndex < 0
            ? (direction > 0 ? 0 : list.length - 1)
            : (pad.choiceIndex + direction + list.length) % list.length;
          syncChoice();
        }

        function hudActions() {
          return HUD_ORDER.map(id => document.getElementById(id)).filter(button => button && usable(button));
        }

        /* Choix contextuels, par ordre de priorite. LB/RB leur sont reserves :
           les faire parcourir tout le HUD en jeu normal noyait le seul usage
           ou ils sont vraiment utiles. */
        function contextChoices() {
          const islands = islandChoices();
          if (islands.length) return islands;
          const hand = document.getElementById("hand");
          if (hand && visible(hand)) {
            const choices = [...hand.querySelectorAll("button")].filter(usable);
            if (choices.length > 1) return choices;
          }
          return [];
        }

        function cycle(list, current, direction) {
          if (!list.length) return null;
          const index = list.indexOf(current);
          if (index < 0) return list[direction > 0 ? 0 : list.length - 1];
          return list[(index + direction + list.length) % list.length];
        }

        /* Un element surligne peut disparaitre entre deux images (fin de la
           phase de pose, action epuisee) : sans ce menage, A cliquerait un
           bouton devenu invisible. */
        function prune() {
          if (pad.hudEl && !hudActions().includes(pad.hudEl)) setHud(null);
          // Rien a faire pour le choix contextuel : syncChoice() le rattache a
          // chaque image au bouton de meme rang, reconstruit ou non.
          if (pad.choiceIndex >= 0 && !contextChoices().length) clearChoice();
        }

        /* ---- Panneaux plein ecran ----------------------------------------- */

        /* Le cabinet d'enigmes, les fenetres de fin et les modales vivent
           au-dessus du plateau et n'ont rien a voir avec le dock : le stick n'y
           trouvait donc rien a parcourir, et « LES VOIES D'ILYOS » etait
           injouable a la manette. On les traite comme ce qu'ils sont — un
           panneau dont les boutons visibles sont les seules cibles — et on
           navigue dedans geometriquement, avec le socle partage. */
        const PANNEAUX = ["puzzleMenu", "puzzleLayer", "rulesModal", "victoryModal", "soundMenu"];

        function panneauActif() {
          for (const id of PANNEAUX) {
            const panneau = document.getElementById(id);
            if (!panneau || !visible(panneau)) continue;
            const boutons = [...panneau.querySelectorAll("button, [role=\"button\"], a[href]")].filter(usable);
            if (boutons.length) return { panneau, boutons };
          }
          return null;
        }

        function naviguerPanneau(actif, dx, dy) {
          const NAV = window.ILYOS_PAD_NAV;
          const courant = actif.boutons.includes(pad.panneauEl) ? pad.panneauEl : null;
          if (!courant || !NAV) { designerPanneau(actif.boutons[0]); return; }
          const suivant = NAV.choisirElementDansDirection(courant, actif.boutons, dx, dy);
          if (suivant) designerPanneau(suivant);
        }

        function designerPanneau(element) {
          if (pad.panneauEl && pad.panneauEl !== element) pad.panneauEl.classList.remove("ilyos-gamepad-focus");
          pad.panneauEl = element || null;
          if (!pad.panneauEl) return;
          pad.panneauEl.classList.add("ilyos-gamepad-focus");
          pad.panneauEl.scrollIntoView?.({ block: "nearest", inline: "nearest" });
        }

        /* ---- Camera ------------------------------------------------------ */

        function rotateCamera(amount) {
          if (!kaykit3D || !amount) return;
          kaykit3D.userRotated = true;
          kaykit3D.cameraTween = null;
          kaykit3D.autoFit = false;
          kaykit3D.cameraHint?.classList.add("hidden");
          if (kaykit3D.orbit) {
            const target = kaykit3D.orbit.target;
            const camera = kaykit3D.orbit.object;
            const offset = new THREE.Vector3().subVectors(camera.position, target);
            const spherical = new THREE.Spherical().setFromVector3(offset);
            spherical.theta -= amount;
            offset.setFromSpherical(spherical);
            camera.position.copy(target).add(offset);
            kaykit3D.orbit.update();
          } else {
            kaykit3D.manualOrbit.azimuth -= amount;
            updateKayKitCamera(false);
          }
        }

        /* ---- Haptique ---------------------------------------------------- */

        /* Strictement decoratif : aucune information de jeu ne transite par la
           vibration, et une manette qui n'en a pas se comporte normalement. */
        let activePad = null;
        function vibrate(duration, strength) {
          const actuator = activePad?.vibrationActuator;
          if (!actuator?.playEffect) return;
          try {
            actuator.playEffect("dual-rumble", {
              duration, strongMagnitude: strength, weakMagnitude: strength * .6
            });
          } catch (_) { /* manette sans retour de force : sans consequence */ }
        }

        /* ---- Rotations d'ile --------------------------------------------- */

        // Memes conditions que handleRotateKey (core.js) : pose d'ile en cours,
        // ou rotation magique d'une ile deja choisie avec son pivot.
        function canRotateIsland() {
          if (!state) return false;
          if (placingIsland()) return true;
          return state.phase === "ACTION"
            && state.selectedActionType === "MAGIC"
            && !!state.selectedIslandId
            && !!state.selectedMagicPivot;
        }

        function rotateIsland(direction, now) {
          if (!canRotateIsland() || now - pad.rotateAt < ROTATE_ISLAND_MS) return;
          pad.rotateAt = now;
          rotateSelectedIsland(direction);
          vibrate(35, .18);
        }

        /* ---- Reprise du dernier gardien ----------------------------------- */

        /* Une action liee a un gardien en reclame un : le joueur ne doit pas
           avoir a le rechercher alors qu'il vient de jouer avec lui. On reprend
           donc le dernier utilise, sinon le premier que le moteur declare
           selectionnable.

           La selection passe par le MEME chemin que le clic souris — un clic sur
           la case du gardien — et non par un appel direct a la selection interne :
           c'est ce qui garantit que les regles decidant qui peut agir restent au
           seul endroit ou elles sont ecrites. */
        function attendUnGardien() {
          return state?.phase === "ACTION"
            && !!state.selectedActionType
            && !state.selectedCharId
            && guardiansMarques().length > 0;
        }

        function selectGuardianCell(cell) {
          pad.cursor = { r: cell.r, c: cell.c };
          pad.special = null;
          const point = cellToScreen(cell.r, cell.c) || { x: 0, y: 0 };
          dispatchKayKitClick(
            { userData: { r: cell.r, c: cell.c } },
            { clientX: point.x, clientY: point.y, button: 0, buttons: 0 }
          );
          const gardien = (state?.characters || []).find(char => char.r === cell.r && char.c === cell.c);
          if (gardien) pad.lastGuardianId = gardien.id;
        }

        function reprendreGardien() {
          const offerts = guardiansMarques();
          if (!offerts.length) return false;
          const retenu = (state?.characters || []).find(char => char.id === pad.lastGuardianId);
          const cible = (retenu && offerts.find(cell => cell.r === retenu.r && cell.c === retenu.c))
            || offerts[0];
          selectGuardianCell(cible);
          return true;
        }

        /* LB/RB pendant une action liee a un gardien : changer DE GARDIEN, ce
           qui republie ses propres destinations. On repasse par le moteur pour
           deselectionner puis reselectionner, sans rien recalculer ici. */
        function cycleGuardians(direction) {
          const offerts = guardiansMarques();
          const encoursId = state?.selectedCharId;
          const encours = (state?.characters || []).find(char => char.id === encoursId);
          if (encours && offerts.length <= 1) return false;

          if (encours) {
            // Revenir au choix du gardien sans toucher a l'action engagee.
            handleCancelButton();
            const apres = guardiansMarques();
            const rang = apres.findIndex(cell => cell.r === encours.r && cell.c === encours.c);
            if (!apres.length) return false;
            const suivant = apres[(Math.max(0, rang) + direction + apres.length) % apres.length];
            selectGuardianCell(suivant);
            return true;
          }

          if (!offerts.length) return false;
          const rang = pad.cursor
            ? offerts.findIndex(cell => cell.r === pad.cursor.r && cell.c === pad.cursor.c)
            : -1;
          const suivant = offerts[(Math.max(0, rang) + direction + offerts.length) % offerts.length];
          selectGuardianCell(suivant);
          return true;
        }

        /* ---- Camera sur le gardien ---------------------------------------- */

        function recentrerSurGardien() {
          const actif = (state?.characters || []).find(
            char => char.id === (state.selectedCharId || pad.lastGuardianId)
          );
          if (!actif || !Number.isFinite(actif.r)) { showToast("Aucun gardien a recentrer."); return; }
          pad.cursor = { r: actif.r, c: actif.c };
          pad.special = null;
          kaykitFollowCell(actif.r, actif.c, { force: true, priorite: 3 });
          refreshHover();
        }

        /* ---- B : quitter, ou revenir sur ce qui est joue ------------------- */

        /* DEUX INTENTIONS QUE TOUT OPPOSE, ET UNE SEULE TOUCHE.

           « Je ne veux plus faire ce que je prepare » et « je veux revenir sur
           ce que j'ai deja joue » n'ont pas la meme consequence : la premiere ne
           coute rien, la seconde defait un coup. Les confondre, c'est annuler un
           deplacement en croyant fermer un panneau.

           Appui court : quitter ce qui est engage, jamais l'historique.
           Appui long : entrer dans l'historique, volontairement.
           Appuis courts suivants : continuer a remonter, la chaine etant armee.

           handleCancelButton() arbitre deja entre desselectionner et annuler
           pour de bon — on ne redecrit pas cette echelle, on decide seulement
           quand il a le droit de toucher a l'historique. */
        const APPUI_LONG_MS = 500;

        function fenetreOuverteManette() {
          const visible = element => !!element && !element.classList.contains("hidden");
          return visible(els.rulesModal) || visible(els.soundMenu) || visible(els.victoryModal);
        }

        /* Ce que handleCancelButton() QUITTE, par opposition a ce qu'il ANNULE.

           Sa derniere branche appelle restoreUndoSnapshot() : quand plus rien
           n'est engage, « annuler » defait un coup deja joue. Un appui court ne
           doit jamais tomber la — c'est precisement la confusion qu'on cherche a
           supprimer. On lit donc les phases ou il se contente de desselectionner,
           telles que le moteur les traite (voir turns.js). Ce n'est pas une regle
           recopiee mais la liste des etats « en cours ». */
        const PHASES_ENGAGEES = ["PLACE_ISLAND", "DROP_TREASURE", "PICKUP_CROWN", "SMART_CHAR"];

        function quitterSansAnnuler() {
          if (state?.phase === "ACTION" && state.selectedActionType) return true;
          return PHASES_ENGAGEES.includes(state?.phase);
        }

        function gesteEnCours() {
          if (fenetreOuverteManette() || pad.crownMode) return true;
          if (pad.choiceIndex >= 0 || drawerOpen()) return true;
          if (state?.pushOptions?.length) return true;
          return quitterSansAnnuler();
        }

        function annulerUnCran() {
          handleCancelButton();
          marquerChaine(true);
        }

        function marquerChaine(active) {
          pad.chaineUndo = active;
          pad.undoConnus = state?.undoHistory?.length ?? 0;
          const bouton = document.getElementById("ov2Undo");
          bouton?.classList.toggle("ilyos-undo-chaine", !!active);
        }

        /* La chaine ne s'eteint pas toute seule apres un delai : un mode
           invisible qui expire est impossible a apprendre. Elle s'arrete quand
           le joueur rejoue vraiment, ou quand le tour change. */
        function surveillerChaine() {
          const taille = state?.undoHistory?.length ?? 0;
          const tour = `${state?.turn}-${state?.currentPlayer}`;
          if (pad.tourConnu !== tour) { pad.tourConnu = tour; if (pad.chaineUndo) marquerChaine(false); }
          if (pad.chaineUndo && taille > pad.undoConnus) marquerChaine(false);
          else if (pad.chaineUndo) pad.undoConnus = taille;
        }

        function bouttonB(gamepad, now) {
          const appuye = pressed(gamepad, BUTTON.B);

          if (appuye && !pad.bDepuis) { pad.bDepuis = now; pad.bTraite = false; }

          // Appui long : il agit pendant qu'on maintient, pas au relachement —
          // le joueur doit sentir a quel moment il franchit le seuil.
          if (appuye && !pad.bTraite && now - pad.bDepuis >= APPUI_LONG_MS) {
            pad.bTraite = true;
            if (gesteEnCours()) return;               // rien a annuler : B court a deja fait son office
            if (!(state?.undoHistory?.length)) { showToast("Rien a annuler dans ce tour."); return; }
            annulerUnCran();
            showToast("Annulation engagee — B pour continuer a remonter.");
            vibrate(220, .85);
            return;
          }

          if (!appuye && pad.bDepuis) {
            const duree = now - pad.bDepuis;
            pad.bDepuis = 0;
            if (pad.bTraite) { pad.bTraite = false; return; }
            if (duree >= APPUI_LONG_MS) return;

            // APPUI COURT.
            setHud(null);
            clearChoice();
            if (pad.crownMode) { pad.crownMode = false; showToast("Couronne : sortie."); return; }
            if (fenetreOuverteManette()) { cancel(); return; }
            if (drawerOpen() && !placingIsland()) { closeHudV2Drawer(); return; }
            // Seulement ici handleCancelButton() se contente de quitter.
            if (quitterSansAnnuler() || state?.pushOptions?.length) { handleCancelButton(); return; }
            if (pad.chaineUndo) {
              if (!(state?.undoHistory?.length)) { marquerChaine(false); return; }
              annulerUnCran();
              vibrate(70, .35);
              return;
            }
            showToast("Maintenez B pour annuler la derniere action.");
          }
        }

        /* ---- Fin de tour -------------------------------------------------- */

        /* Une fin de tour accidentelle coute un tour entier et ne s'annule pas
           toujours : on refuse tant qu'un geste est engage, plutot que de la
           laisser passer en silence. */
        function endTurnFromPad() {
          if (placingIsland() || (state?.pushOptions && state.pushOptions.length)) {
            showToast("Terminez ou annulez le geste en cours avant de finir le tour.");
            return;
          }
          const button = document.getElementById("ov2End");
          if (button && usable(button)) button.click();
        }

        /* ---- Boucle ------------------------------------------------------- */

        function pressed(gamepad, index) { return !!gamepad.buttons[index]?.pressed; }
        function justPressed(gamepad, index) { return pressed(gamepad, index) && !pad.previous[index]; }
        function axis(gamepad, index) {
          const value = gamepad.axes[index] || 0;
          return Math.abs(value) < DEADZONE ? 0 : value;
        }

        /* Haut/bas au repos : d'abord les gardiens que le moteur declare
           choisissables — lui seul sait lesquels ont encore quelque chose a
           faire. A defaut, tous les allies. Le parcours reprend au dernier
           gardien utilise, pas au premier de la liste. */
        function navigateGuardians(direction) {
          const marques = guardiansMarques();
          const guardians = marques.length
            ? marques.map(cell => (state?.characters || []).find(char => char.r === cell.r && char.c === cell.c)).filter(Boolean)
            : alliedGuardians();
          if (!guardians.length) return;
          const current = guardians.findIndex(char => char.id === pad.lastGuardianId);
          const next = guardians[(Math.max(0, current) + direction + guardians.length) % guardians.length];
          pad.lastGuardianId = next.id;
          /* Un seul gardien allie : le parcours revient sur lui-meme. Renvoyer
             malgre tout un survol a chaque poussee de stick relancait les
             affordances du moteur, ce qui se lit comme une selection qu'on
             n'a pas demandee. */
          if (pad.cursor && pad.cursor.r === next.r && pad.cursor.c === next.c) return;
          moveCursorTo(next.r, next.c);
        }

        function poll() {
          requestAnimationFrame(poll);
          const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
          let gamepad = null;
          for (const candidate of gamepads) if (candidate?.connected) { gamepad = candidate; break; }
          activePad = gamepad;
          if (!gamepad) { pad.previous = []; return; }
          if (typeof kaykit3D === "undefined" || !kaykit3D?.camera) return;

          /* Tour de l'adversaire : plus aucune navigation de jeu. Sans cela le
             stick promenait un curseur sur des cibles perimees, et A tombait
             dans le vide. La camera, elle, reste libre — regarder le plateau
             pendant que l'autre joue est precisement un moment ou on le veut. */
          const aLaMain = typeof canLocalPlayerAct !== "function" || canLocalPlayerAct();

          const now = performance.now();
          let hoverDirty = false;
          const isNeutral = neutral();
          /* Le tiroir ne prend le stick QUE s'il a vraiment quelque chose a
             offrir, et jamais pendant une pose.

             Il reste ouvert apres le choix de la forme : la branche « tiroir »
             passant avant toutes les autres, elle accaparait alors le stick et
             le curseur du plateau ne bougeait plus — l'ile devenait impossible a
             poser a la manette, y compris apres un choix fait a la souris. Et
             quand aucun choix n'etait jugé utilisable, la meme branche avalait
             le stick sans rien faire : plus de navigation du tout. */
          const choix = contextChoices();
          const drawer = drawerOpen() && !placingIsland() && choix.length > 0;

          /* Et le surlignage doit etre RELACHE des que le tiroir cesse d'etre
             actif. Il survivait au choix de la forme, or la boucle saute le
             survol du plateau tant qu'un choix est designe : plus d'apercu de
             pose, donc plus rien a poser — exactement le symptome « je ne peux
             plus placer l'ile a la manette apres l'avoir choisie a la souris ». */
          if (!drawer && (placingIsland() || !choix.length)) clearChoice();

          /* Tiroir d'iles : designer d'office la premiere forme disponible.
             Auparavant, rien n'etait surligne tant que le joueur n'avait pas
             devine qu'il fallait d'abord parcourir la liste — A ne faisait donc
             rien a l'ouverture, et le tiroir semblait mort a la manette. */
          if (drawer) syncChoice();

          /* Entree dans une action : poser le curseur la ou le joueur regarde
             deja, plutot que de le laisser chercher le gardien concerne. */
          if (pad.wasNeutral && !isNeutral) {
            pad.cursor = defaultCursor();
            setHud(null);
            hoverDirty = true;
          }
          pad.wasNeutral = isNeutral;

          /* Le gardien qui vient d'agir garde le curseur. Apres un deplacement ou
             une poussee, il n'est plus sur la case visee un instant plus tot :
             sans ce suivi, la selection restait en arriere et il fallait aller
             le rechercher pour enchainer une seconde action. */
          const suivi = (state?.characters || []).find(char => char.id === pad.lastGuardianId);
          if (suivi && Number.isFinite(suivi.r)) {
            const avant = pad.lastGuardianCell;
            if (!avant || avant.r !== suivi.r || avant.c !== suivi.c) {
              if (avant) { pad.cursor = { r: suivi.r, c: suivi.c }; pad.special = null; hoverDirty = true; }
              pad.lastGuardianCell = { r: suivi.r, c: suivi.c };
            }
          } else pad.lastGuardianCell = null;

          // Couronne validee : le moteur pose deja cet identifiant le temps de
          // son animation de score. On s'y raccroche plutot que d'inventer un
          // signal parallele.
          if (state?.scoreAnimationPlayerId !== pad.lastScoreAnim) {
            if (state?.scoreAnimationPlayerId) vibrate(240, .9);
            pad.lastScoreAnim = state?.scoreAnimationPlayerId ?? null;
          }

          /* Un panneau ouvert possede l'ecran : tant qu'il est la, le stick lui
             appartient entierement, et rien du plateau ne doit repondre. */
          const panneau = panneauActif();
          if (panneau) {
            if (!panneau.boutons.includes(pad.panneauEl)) designerPanneau(panneau.boutons[0]);
            let px = axis(gamepad, 0), py = axis(gamepad, 1);
            if (pressed(gamepad, BUTTON.LEFT)) px = -1;
            if (pressed(gamepad, BUTTON.RIGHT)) px = 1;
            if (pressed(gamepad, BUTTON.UP)) py = -1;
            if (pressed(gamepad, BUTTON.DOWN)) py = 1;
            if (px || py) {
              const premier = !pad.stepAt;
              if (premier || now >= pad.stepAt) {
                const horizontal = Math.abs(px) >= Math.abs(py);
                naviguerPanneau(panneau, horizontal ? Math.sign(px) : 0, horizontal ? 0 : Math.sign(py));
                pad.stepAt = now + (premier ? STEP_FIRST_MS : STEP_REPEAT_MS);
              }
            } else pad.stepAt = 0;

            if (justPressed(gamepad, BUTTON.LB)) naviguerPanneau(panneau, -1, 0);
            if (justPressed(gamepad, BUTTON.RB)) naviguerPanneau(panneau, 1, 0);
            if (justPressed(gamepad, BUTTON.A) && pad.panneauEl) { pad.panneauEl.click(); vibrate(45, .22); }
            if (justPressed(gamepad, BUTTON.B)) {
              const retour = panneau.panneau.querySelector(".pz-back, [data-close], .menu-modal-close");
              if (retour && usable(retour)) retour.click();
              else cancel();
            }
            pad.previous = gamepad.buttons.map(button => !!button.pressed);
            return;
          }
          designerPanneau(null);

          // Stick gauche et croix directionnelle : strictement equivalents.
          let dx = axis(gamepad, 0), dy = axis(gamepad, 1);
          if (pressed(gamepad, BUTTON.LEFT)) dx = -1;
          if (pressed(gamepad, BUTTON.RIGHT)) dx = 1;
          if (pressed(gamepad, BUTTON.UP)) dy = -1;
          if (pressed(gamepad, BUTTON.DOWN)) dy = 1;

          if ((dx || dy) && aLaMain) {
            const fresh = !pad.stepAt;
            if (fresh || now >= pad.stepAt) {
              // Un seul axe a la fois : les diagonales n'existent pas ici.
              const horizontal = Math.abs(dx) >= Math.abs(dy);
              const direction = horizontal ? Math.sign(dx) : Math.sign(dy);
              if (drawer) {
                /* Le tiroir ouvert accapare le stick : LB/RB font la meme chose,
                   mais rien ne doit exiger de les connaitre. Les deux axes
                   avancent dans la meme liste — le tiroir est une grille, et
                   n'obeir qu'a la horizontale y paraissait casse. */
                moveChoice(direction);
              } else if (isNeutral) {
                if (horizontal) { clearChoice(); setHud(cycle(hudActions(), pad.hudEl, direction)); }
                else navigateGuardians(direction);
              } else {
                setHud(null);
                clearChoice();
                if (stepCursor(horizontal ? direction : 0, horizontal ? 0 : direction)) hoverDirty = true;
              }
              pad.stepAt = now + (fresh ? STEP_FIRST_MS : STEP_REPEAT_MS);
            }
          } else pad.stepAt = 0;

          // Stick droit : rotation horizontale, zoom vertical.
          const rx = axis(gamepad, 2), ry = axis(gamepad, 3);
          if (rx) { rotateCamera(rx * ROTATE_SPEED); hoverDirty = true; }
          if (ry && now - pad.zoomAt > ZOOM_COOLDOWN_MS) {
            zoomKayKitCamera(ry > 0 ? 1 : -1);
            pad.zoomAt = now;
            hoverDirty = true;
          }

          /* GACHETTES : rotation quand une rotation est en cours, verbe direct
             sinon. Le changement de sens est sans ambiguite parce que le
             changement de mode, lui, est visible a l'ecran — une ile en cours de
             pose ou de rotation magique ne ressemble a rien d'autre. */
          if (canRotateIsland()) {
            if (pressed(gamepad, BUTTON.LT)) rotateIsland(-1, now);
            if (pressed(gamepad, BUTTON.RT)) rotateIsland(1, now);
          } else {
            if (justPressed(gamepad, BUTTON.LT)) clickDock("ov2Island");
            if (justPressed(gamepad, BUTTON.RT)) clickDock("ov2Magic");
          }

          if (!aLaMain) {
            setHud(null);
            clearChoice();
            pad.previous = gamepad.buttons.map(button => !!button.pressed);
            return;
          }

          /* Une action vient d'etre lancee et reclame un gardien : le reprendre
             aussitot. Sans cela il fallait le rechercher a chaque fois, alors
             qu'on venait souvent de jouer avec lui. */
          if (attendUnGardien() && reprendreGardien()) hoverDirty = true;

          /* LB/RB REPONDENT TOUJOURS A LA MEME QUESTION : avec QUI, ou avec QUOI,
             suis-je en train de jouer ? Le stick gauche repond a l'autre : OU.
             Cette separation vaut mieux qu'une fonction qui changeait d'ecran en
             ecran — c'est elle qui rend les touches apprenables. */
          const changerQui = direction => {
            if (contextChoices().length) { moveChoice(direction); return; }
            if (pad.crownMode) { cycleCrowns(direction); return; }
            if (state?.selectedActionType || attendUnGardien()) {
              if (cycleGuardians(direction)) { setHud(null); refreshHover(); }
              return;
            }
            navigateGuardians(direction);
          };
          if (justPressed(gamepad, BUTTON.LB)) changerQui(-1);
          if (justPressed(gamepad, BUTTON.RB)) changerQui(1);

          if (justPressed(gamepad, BUTTON.A)) {
            const choix = pad.choiceIndex >= 0 ? syncChoice() : null;
            if (choix) { choix.click(); vibrate(45, .22); }
            else if (pad.hudEl) { pad.hudEl.click(); vibrate(45, .22); }
            else actOnCursor();
          }
          surveillerChaine();
          bouttonB(gamepad, now);
          /* X : miroir pendant une pose d'ile — c'est la seule chose a faire a
             ce moment-la — et action POUSSER partout ailleurs. */
          if (justPressed(gamepad, BUTTON.X)) {
            if (placingIsland()) flipSelectedIsland();
            else clickDock("ov2Push");
          }
          if (justPressed(gamepad, BUTTON.Y)) crownAction();
          if (justPressed(gamepad, BUTTON.SELECT)) endTurnFromPad();
          if (justPressed(gamepad, BUTTON.START)) document.getElementById("ov2Gear")?.click();
          if (justPressed(gamepad, BUTTON.R3)) reprendreKayKitVueDeFace();
          /* L3 ramene la camera sur son gardien. Il ouvrait les regles faute de
             panneau « objectif » dans ce HUD — un raccourci de manette gaspille
             pour une fenetre qui vit tres bien dans le menu. */
          if (justPressed(gamepad, BUTTON.L3)) recentrerSurGardien();

          if (pad.crownMode && crownTargets().length < 2) pad.crownMode = false;
          prune();
          if (hoverDirty && !pad.hudEl && !pad.choiceEl) refreshHover();
          pad.previous = gamepad.buttons.map(button => !!button.pressed);
        }

        function injectFocusStyle() {
          if (document.getElementById("ilyosGamepadStyle")) return;
          const style = document.createElement("style");
          style.id = "ilyosGamepadStyle";
          // Anneau de focus manette : seul ajout visuel de cette couche. Tout le
          // reste — anneau du gardien, affordances de cases — existe deja.
          style.textContent =
            /* Un liere anneau de 3 px passait inapercu sur un dock deja tres
               contraste, a un metre de l'ecran. On l'epaissit, on l'appuie d'un
               fond ambre et d'une legere echelle, et on le fait respirer : ce
               qui est vise doit se reperer sans le chercher. */
            ".ilyos-gamepad-focus{outline:4px solid #ffd879;outline-offset:-4px;"
            + "border-radius:12px;background-color:rgba(255,216,121,.18);"
            + "box-shadow:0 0 0 2px rgba(0,0,0,.45),0 0 26px rgba(255,216,121,.75);"
            + "transform:scale(1.05);position:relative;z-index:5;"
            + "animation:ilyosPadPouls 1.6s ease-in-out infinite;}"
            + "@keyframes ilyosPadPouls{50%{box-shadow:0 0 0 2px rgba(0,0,0,.45),"
            + "0 0 34px rgba(255,216,121,1);}}"
            /* Vignettes d'ile : petites, serrees, dans un conteneur qui rogne.
               Un anneau pose A L'EXTERIEUR du bouton y etait tout simplement
               invisible — on croyait ne pas pouvoir changer d'ile alors que le
               parcours fonctionnait, faute de voir laquelle etait visee. On le
               rentre donc a l'interieur, et on l'appuie d'un fond et d'une
               legere echelle pour qu'il se distingue au premier coup d'oeil. */
            /* La remontee d'historique doit SE VOIR : le HUD a deja son bouton
               d'annulation avec son compte, on l'allume plutot que d'inventer un
               indicateur de plus. */
            + ".ilyos-undo-chaine{outline:3px solid #ff9d5c;outline-offset:-3px;"
            + "box-shadow:0 0 22px rgba(255,157,92,.7);}"
            + ".island-choice.ilyos-gamepad-focus{outline-offset:-3px;"
            + "background:rgba(255,216,121,.22);transform:scale(1.06);"
            + "position:relative;z-index:2;}";
          document.head.appendChild(style);
        }

        injectFocusStyle();
        window.addEventListener("gamepadconnected", () => {
          if (typeof showToast === "function") showToast("Manette connectee.");
        });
        requestAnimationFrame(poll);
      })();
