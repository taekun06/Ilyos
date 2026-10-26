      /* =====================================================================
         MENUS DE DÉPART — Duel symétrique et Personnalisé

         Un seul écran (#symmetricSetupOverlay, index.html) porte trois menus,
         nommés par data-menu sur la carte :
           • "duel"    : choix d'un setup du Duel symétrique, en grande photo
                         avec une bande de vignettes (vue « apercu ») ou en
                         grille (vue « grille »), rangés par nombre de gardiens ;
           • "perso"   : réglages du Personnalisé (formation, paquet, règles,
                         terrain de départ) ;
           • "terrain" : le menu du duel, ouvert depuis le Personnalisé pour
                         choisir le setup qui sert de terrain de départ.

         Les listes déroulantes cachées restent la source des valeurs : core.js
         (confirmSymmetricSetup, lireReglesPersonnalisees) et les tests les
         lisent. Ce fragment ne fait que construire les boutons qui les pilotent
         et montrer les bonnes sections.

         Photos des setups : assets/duels/<setup>-<taille>.webp, prises en jeu
         HUD masqué (voir docs/ASSETS.md). Une photo absente laisse place au
         plan du setup (renderSymmetricSetupPreview).
         ===================================================================== */
      const MENU_DUEL = {
        menu: "duel",
        vue: (() => {
          try { return localStorage.getItem("ilyos.menuDuel.vue") === "grille" ? "grille" : "apercu"; }
          catch (_) { return "apercu"; }
        })(),
        posture: "Tous",
        // Setup servant de terrain au Personnalisé (retenu même quand le
        // plateau vide est choisi, pour y revenir en un clic).
        terrain: null,
        terrainActif: false,
        // Dernier setup choisi, et setup à reprendre après un changement de taille.
        dernier: null,
        reprise: null,
        attente: false,
        branche: false
      };

      const menuDuelCarte = () => els.symmetricSetupOverlay?.querySelector(".symmetric-board-card");
      const photoDuel = id => `assets/duels/${id}-${GRID}.webp`;
      const gardiensDuel = id => symmetricSetup(id).characters.filter(g => g.player === 0).length;
      const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;

      function elementMenu(balise, classe, texte) {
        const noeud = document.createElement(balise);
        if (classe) noeud.className = classe;
        if (texte !== undefined) noeud.textContent = texte;
        return noeud;
      }

      /** Setups proposés, filtrés par famille, rangés par nombre de gardiens. */
      function menuDuelIds() {
        const ordre = symmetricSetupIds();
        return ordre
          .filter(id => MENU_DUEL.posture === "Tous" || SYMMETRIC_DUEL_SETUPS[id].posture === MENU_DUEL.posture)
          .sort((a, b) => gardiensDuel(a) - gardiensDuel(b) || ordre.indexOf(a) - ordre.indexOf(b));
      }

      /** Setup à présélectionner à l'ouverture : celui d'avant un changement
       *  de taille, sinon le dernier choisi, sinon celui demandé. */
      function menuDuelReprise(selectedId) {
        const disponible = id => !!id && symmetricSetupDisponible(SYMMETRIC_DUEL_SETUPS[id]);
        const id = [MENU_DUEL.reprise, MENU_DUEL.dernier].find(disponible);
        MENU_DUEL.reprise = null;
        return id || selectedId;
      }

      function vignetteDuel(id, detaillee) {
        const setup = symmetricSetup(id);
        const bouton = elementMenu("button", "v64-setup-card duel-vignette");
        bouton.type = "button";
        bouton.dataset.value = id;
        bouton.setAttribute("role", "option");
        const photo = elementMenu("img");
        photo.alt = "";
        photo.loading = "lazy";
        photo.decoding = "async";
        photo.addEventListener("error", () => bouton.classList.add("sans-photo"), { once: true });
        photo.src = photoDuel(id);
        bouton.append(photo, elementMenu("span", "duel-vignette-nom", setup.name));
        if (detaillee) {
          const ligne = elementMenu("span", "duel-vignette-ligne");
          const tag = elementMenu("span", "duel-tag", setup.posture);
          tag.dataset.posture = setup.posture;
          ligne.append(tag, elementMenu("small", null, pluriel(setup.islands.length, "île")));
          bouton.append(ligne);
        }
        bouton.addEventListener("click", () => choisirSetupDuel(id));
        bouton.addEventListener("dblclick", () => {
          choisirSetupDuel(id);
          if (!MENU_DUEL.attente) confirmSymmetricSetup();
        });
        return bouton;
      }

      function construireListesDuel() {
        const bande = document.getElementById("duelMenuBande");
        const grille = document.getElementById("duelMenuGrille");
        if (!bande || !grille) return;
        const groupes = new Map();
        menuDuelIds().forEach(id => {
          const n = gardiensDuel(id);
          if (!groupes.has(n)) groupes.set(n, []);
          groupes.get(n).push(id);
        });
        [[bande, false], [grille, true]].forEach(([conteneur, detaillee]) => {
          conteneur.replaceChildren();
          groupes.forEach((ids, n) => {
            const groupe = elementMenu("div", "duel-groupe");
            const liste = elementMenu("div", "duel-groupe-liste");
            ids.forEach(id => liste.append(vignetteDuel(id, detaillee)));
            groupe.append(elementMenu("div", "duel-groupe-titre", pluriel(n, "gardien")), liste);
            conteneur.append(groupe);
          });
        });
        majSelectionDuel();
      }

      function choisirSetupDuel(id) {
        if (!els.symmetricSetupSelect || MENU_DUEL.attente) return;
        els.symmetricSetupSelect.value = id;
        renderSymmetricSetupPreview(id);
      }

      /** Appelée par renderSymmetricSetupPreview à chaque changement de setup. */
      function majMenuDuel(setup) {
        if (!setup) return;
        if (MENU_DUEL.menu === "duel") MENU_DUEL.dernier = setup.id;
        const tag = document.getElementById("symmetricSetupStyle");
        if (tag) tag.dataset.posture = setup.posture;
        const photo = document.getElementById("duelGrandePhoto");
        const cadre = photo?.closest(".duel-grande");
        if (photo && photo.dataset.setup !== `${setup.id}@${GRID}`) {
          photo.dataset.setup = `${setup.id}@${GRID}`;
          cadre?.classList.remove("sans-photo");
          photo.onerror = () => cadre?.classList.add("sans-photo");
          photo.src = photoDuel(setup.id);
        }
        // Un setup tiré au sort hors du filtre courant : on rouvre tout.
        if (MENU_DUEL.posture !== "Tous" && setup.posture !== MENU_DUEL.posture
          && document.getElementById("duelMenuBande")?.childElementCount) {
          MENU_DUEL.posture = "Tous";
          majFiltresDuel();
          construireListesDuel();
          return;
        }
        majSelectionDuel();
      }

      function majSelectionDuel() {
        const id = els.symmetricSetupSelect?.value;
        els.symmetricSetupOverlay?.querySelectorAll(".duel-vignette").forEach(vignette => {
          const choisie = vignette.dataset.value === id;
          vignette.setAttribute("aria-pressed", String(choisie));
          vignette.setAttribute("aria-selected", String(choisie));
        });
        // La vignette choisie reste visible dans la bande, sans faire défiler
        // l'écran entier (scrollIntoView déplacerait aussi la carte).
        const bande = document.getElementById("duelMenuBande");
        const choisie = bande?.querySelector('.duel-vignette[aria-pressed="true"]');
        if (bande && choisie && MENU_DUEL.vue === "apercu") {
          const gauche = choisie.offsetLeft - bande.offsetLeft;
          if (gauche < bande.scrollLeft || gauche + choisie.offsetWidth > bande.scrollLeft + bande.clientWidth) {
            bande.scrollLeft = Math.max(0, gauche - (bande.clientWidth - choisie.offsetWidth) / 2);
          }
        }
        majResumeMenu();
      }

      function majFiltresDuel() {
        document.querySelectorAll("#duelPostures [data-posture]").forEach(bouton =>
          bouton.setAttribute("aria-pressed", String(bouton.dataset.posture === MENU_DUEL.posture)));
        document.querySelectorAll("#duelTailles [data-taille]").forEach(bouton => {
          bouton.setAttribute("aria-pressed", String(Number(bouton.dataset.taille) === GRID));
        });
        const carte = menuDuelCarte();
        carte?.querySelectorAll(".duel-vue [data-afficher]").forEach(bouton =>
          bouton.setAttribute("aria-pressed", String(bouton.dataset.afficher === MENU_DUEL.vue)));
      }

      /** Changer de taille relance la partie : la grille est fixée avant
       *  toute la construction (voir startLocalGame). Hors ligne seulement. */
      function changerTailleDuel(taille) {
        const select = document.getElementById("boardSizeSelect");
        if (!select || state?.onlineMode || MENU_DUEL.attente || normalizeBoardSize(taille) === GRID) return;
        MENU_DUEL.reprise = els.symmetricSetupSelect?.value || null;
        select.value = String(normalizeBoardSize(taille));
        // Le menu d'accueil ne laisse pas toujours « symmetric » dans ce
        // sélecteur : sans lui, la partie relancée partirait en classique.
        const plateau = document.getElementById("startingBoardSelect");
        if (plateau) plateau.value = "symmetric";
        startLocalGame();
      }

      function pasDuel(sens) {
        const ids = menuDuelIds();
        if (!ids.length) return;
        const i = ids.indexOf(els.symmetricSetupSelect?.value);
        choisirSetupDuel(ids[(Math.max(0, i) + sens + ids.length) % ids.length]);
      }

      /* ---- Personnalisé : boutons construits depuis les listes cachées ---- */

      function lierListeMenu(select) {
        if (!select || select.dataset.lie) return;
        select.dataset.lie = "1";
        select.classList.add("duel-select-cache");
        select.tabIndex = -1;
        const type = "seg" in select.dataset ? "seg" : "compteur" in select.dataset ? "compteur" : "pas";
        const boite = elementMenu("div", `perso-${type}`);
        if (type === "compteur") {
          const moins = elementMenu("button", null, "−");
          moins.dataset.sens = "-1";
          moins.setAttribute("aria-label", "Retirer une carte");
          const plus = elementMenu("button", null, "+");
          plus.dataset.sens = "1";
          plus.setAttribute("aria-label", "Ajouter une carte");
          boite.append(moins, elementMenu("b"), plus);
        } else {
          [...select.options].forEach(option => {
            const bouton = elementMenu("button", null, option.dataset.court || option.textContent);
            bouton.dataset.valeur = option.value;
            boite.append(bouton);
          });
        }
        boite.querySelectorAll("button").forEach(bouton => { bouton.type = "button"; });
        boite.addEventListener("click", event => {
          const bouton = event.target.closest("button");
          if (!bouton || select.disabled) return;
          if (bouton.dataset.sens) {
            const index = select.selectedIndex + Number(bouton.dataset.sens);
            if (index < 0 || index >= select.options.length || select.options[index].disabled) return;
            select.selectedIndex = index;
          } else {
            const option = [...select.options].find(o => o.value === bouton.dataset.valeur);
            if (!option || option.disabled) return;
            select.value = option.value;
          }
          select.dispatchEvent(new Event("change", { bubbles: true }));
        });
        select.addEventListener("change", majMenuPerso);
        select.after(boite);
      }

      function majListeMenu(select) {
        const boite = select?.nextElementSibling;
        if (!boite || !select.dataset.lie) return;
        if (boite.classList.contains("perso-compteur")) {
          const valeur = boite.querySelector("b");
          if (valeur) valeur.textContent = select.value;
          const [moins, plus] = boite.querySelectorAll("button");
          moins.disabled = select.disabled || select.selectedIndex <= 0;
          plus.disabled = select.disabled || select.selectedIndex >= select.options.length - 1;
          return;
        }
        boite.querySelectorAll("button").forEach(bouton => {
          const option = [...select.options].find(o => o.value === bouton.dataset.valeur);
          bouton.setAttribute("aria-pressed", String(bouton.dataset.valeur === select.value));
          bouton.disabled = select.disabled || !!option?.disabled;
        });
      }

      function customTerrainChoisi() {
        const id = MENU_DUEL.terrainActif ? MENU_DUEL.terrain : null;
        return id && state?.players?.length === 2 && symmetricSetupDisponible(SYMMETRIC_DUEL_SETUPS[id]) ? id : null;
      }

      function majMenuPerso() {
        const carte = menuDuelCarte();
        if (!carte || MENU_DUEL.menu !== "perso") return;
        const terrain = customTerrainChoisi();

        // Gardiens : le terrain en apporte déjà, le plafond par joueur tient compte d'eux.
        const dejaPlaces = terrain ? gardiensDuel(terrain) : 0;
        const plafond = Math.max(0, MAX_GUARDIANS_PER_PLAYER - dejaPlaces);
        const gardiens = els.customGuardianCountSelect;
        if (gardiens) {
          [...gardiens.options].forEach(option => { option.disabled = Number(option.value) > plafond; });
          if (Number(gardiens.value) > plafond) gardiens.value = String(plafond);
        }
        const indice = document.getElementById("customGuardianHint");
        if (indice) {
          indice.textContent = terrain
            ? `en plus des ${dejaPlaces} du terrain · ${MAX_GUARDIANS_PER_PLAYER} au total`
            : `${MAX_GUARDIANS_PER_PLAYER} au maximum`;
        }

        carte.querySelectorAll(".perso-reglage select, .perso-compteur select, .duel-regles-communes select")
          .forEach(majListeMenu);

        // Terrain de départ.
        const vide = document.getElementById("customTerrainVidePhoto");
        if (vide && !vide.dataset.taille?.startsWith(String(GRID))) {
          vide.dataset.taille = String(GRID);
          vide.src = `assets/duels/vide-${GRID}.webp`;
        }
        carte.querySelectorAll(".perso-terrain-choix").forEach(bouton => {
          bouton.setAttribute("aria-pressed", String((bouton.dataset.terrain === "setup") === !!terrain));
          bouton.disabled = MENU_DUEL.attente;
        });
        const memo = MENU_DUEL.terrain && symmetricSetupDisponible(SYMMETRIC_DUEL_SETUPS[MENU_DUEL.terrain])
          ? symmetricSetup(MENU_DUEL.terrain) : null;
        const photo = document.getElementById("customTerrainSetupPhoto");
        const bouton = photo?.closest(".perso-terrain-choix");
        bouton?.classList.toggle("sans-photo", !memo);
        if (photo && memo && photo.dataset.setup !== `${memo.id}@${GRID}`) {
          photo.dataset.setup = `${memo.id}@${GRID}`;
          photo.src = photoDuel(memo.id);
        }
        const nom = document.getElementById("customTerrainSetupName");
        const texte = document.getElementById("customTerrainSetupText");
        if (nom) nom.textContent = memo ? `Setup : ${memo.name}` : "Setup de duel";
        if (texte) {
          texte.textContent = memo
            ? `${memo.posture} · ${pluriel(memo.islands.length, "île")} · ${pluriel(gardiensDuel(memo.id), "gardien")} par joueur, déjà en place.`
            : "Partir d’un setup du duel symétrique, puis y ajouter vos îles et vos gardiens.";
        }
        const lien = bouton?.querySelector("em");
        if (lien) lien.textContent = memo ? "Changer de setup ›" : "Choisir un setup ›";

        const miroir = document.getElementById("customMirrorSelect")?.value === "miroir" && state?.players?.length === 2;
        if (els.setupOverlayIntro) {
          els.setupOverlayIntro.textContent = miroir
            ? "Créer son duel : vous posez vos îles puis vos gardiens, chaque pose se reflète aussitôt dans le camp adverse."
            : "Composez la formation de départ et les règles de la partie.";
        }
        majResumeMenu();
      }

      function majResumeMenu() {
        const resume = document.getElementById("duelMenuResume");
        const bouton = els.confirmSymmetricSetupBtn;
        if (!resume || !bouton) return;
        const menu = MENU_DUEL.menu;
        resume.replaceChildren();
        if (menu === "perso") {
          const terrain = customTerrainChoisi();
          const iles = Number(els.customIslandCountSelect?.value) || 0;
          const gardiens = Number(els.customGuardianCountSelect?.value) || 0;
          const libre = els.customGuardianPlacementSelect?.value === "libre";
          const paquet = compositionPaquet(lireReglesPersonnalisees()).length;
          if (terrain) resume.append(elementMenu("b", null, symmetricSetup(terrain).name), " + ");
          resume.append(
            elementMenu("b", null, `${pluriel(iles, "île")} · ${pluriel(gardiens, "gardien")}`),
            ` à poser par joueur${gardiens ? (libre ? ", placement libre" : ", sur ses îles") : ""} · paquet de ${paquet}`
          );
          if (!MENU_DUEL.attente) bouton.textContent = iles + gardiens > 0 ? "Commencer la mise en place" : "Lancer la partie";
        } else if (els.symmetricSetupSelect?.value && SYMMETRIC_DUEL_SETUPS[els.symmetricSetupSelect.value]) {
          resume.append("Sélection : ", elementMenu("b", null, symmetricSetup(els.symmetricSetupSelect.value).name));
          if (!MENU_DUEL.attente) bouton.textContent = menu === "terrain" ? "Choisir ce terrain" : "Lancer ce duel";
        }
        if (MENU_DUEL.attente) bouton.textContent = "En attente du créateur";
      }

      /** Le setup choisi devient le terrain du Personnalisé. Rend true si
       *  l'écran était bien le choix du terrain (confirmSymmetricSetup). */
      function menuDuelChoixTerrain() {
        if (MENU_DUEL.menu !== "terrain") return false;
        MENU_DUEL.terrain = els.symmetricSetupSelect?.value || MENU_DUEL.terrain;
        MENU_DUEL.terrainActif = true;
        afficherMenuDuel("perso");
        return true;
      }

      function reglagesClassiquesPerso() {
        if (MENU_DUEL.attente) return;
        els.symmetricSetupOverlay?.querySelectorAll("select").forEach(select => {
          if (select === els.symmetricSetupSelect) return;
          const defaut = [...select.options].find(option => option.defaultSelected) || select.options[0];
          if (defaut) select.value = defaut.value;
        });
        els.symmetricSetupOverlay?.querySelectorAll('input[type="checkbox"]').forEach(caseACocher => {
          caseACocher.checked = caseACocher.defaultChecked;
        });
        MENU_DUEL.terrainActif = false;
        majResumePaquetPersonnalise();
        majMenuPerso();
      }

      function brancherMenuDuel() {
        if (MENU_DUEL.branche || !els.symmetricSetupOverlay) return;
        MENU_DUEL.branche = true;
        const carte = menuDuelCarte();
        carte?.querySelectorAll("select[data-pas], select[data-seg], select[data-compteur]").forEach(lierListeMenu);
        [els.customPaidIslandsCheckbox, els.customScorerLeavesCheckbox, els.symmetricAllowDissolveCheckbox]
          .forEach(caseACocher => caseACocher?.addEventListener("change", majMenuPerso));

        document.getElementById("duelPostures")?.addEventListener("click", event => {
          const bouton = event.target.closest("[data-posture]");
          if (!bouton) return;
          MENU_DUEL.posture = bouton.dataset.posture;
          majFiltresDuel();
          construireListesDuel();
          const ids = menuDuelIds();
          if (ids.length && !ids.includes(els.symmetricSetupSelect?.value)) choisirSetupDuel(ids[0]);
        });
        document.getElementById("duelTailles")?.addEventListener("click", event => {
          const bouton = event.target.closest("[data-taille]");
          if (bouton) changerTailleDuel(bouton.dataset.taille);
        });
        carte?.querySelector(".duel-vue")?.addEventListener("click", event => {
          const bouton = event.target.closest("[data-afficher]");
          if (!bouton) return;
          MENU_DUEL.vue = bouton.dataset.afficher === "grille" ? "grille" : "apercu";
          try { localStorage.setItem("ilyos.menuDuel.vue", MENU_DUEL.vue); } catch (_) { }
          afficherMenuDuel(MENU_DUEL.menu);
        });
        carte?.querySelectorAll(".duel-fleche").forEach(fleche =>
          fleche.addEventListener("click", () => pasDuel(Number(fleche.dataset.pas))));
        document.getElementById("duelMenuRetour")?.addEventListener("click", () => afficherMenuDuel("perso"));
        // Molette n'importe où sur l'écran du choix (vue Aperçu) : elle fait
        // défiler la bande des setups du bas, et ne zoome pas le plateau.
        els.symmetricSetupOverlay.addEventListener("wheel", event => {
          const bande = document.getElementById("duelMenuBande");
          if (MENU_DUEL.menu === "perso" || MENU_DUEL.vue !== "apercu" || !bande) return;
          const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
          if (!delta) return;
          event.preventDefault();
          event.stopPropagation();
          bande.scrollBy({ left: delta * (event.deltaMode === 1 ? 40 : 1.6) });
        }, { passive: false });
        document.getElementById("customDefaultsBtn")?.addEventListener("click", reglagesClassiquesPerso);
        carte?.querySelectorAll(".perso-terrain-choix").forEach(bouton => bouton.addEventListener("click", () => {
          if (MENU_DUEL.attente) return;
          if (bouton.dataset.terrain === "vide") {
            MENU_DUEL.terrainActif = false;
            majMenuPerso();
            return;
          }
          // Premier choix, ou setup déjà actif : ouvrir la liste des setups.
          if (!MENU_DUEL.terrain || customTerrainChoisi()) {
            populateSymmetricSetupOverlay(MENU_DUEL.terrain || MENU_DUEL.dernier || "open");
            afficherMenuDuel("terrain");
          } else {
            MENU_DUEL.terrainActif = true;
            majMenuPerso();
          }
        }));
      }

      /** Montre l'un des trois menus de l'écran de départ. */
      function afficherMenuDuel(menu, { waiting } = {}) {
        const carte = menuDuelCarte();
        if (!carte) return;
        brancherMenuDuel();
        if (waiting !== undefined) MENU_DUEL.attente = !!waiting;
        MENU_DUEL.menu = menu;
        const deux = state?.players?.length === 2;
        carte.dataset.menu = menu;
        carte.dataset.vue = MENU_DUEL.vue;
        carte.dataset.terrainPossible = String(deux);
        carte.dataset.tailleFixe = String(!!state?.onlineMode);
        els.symmetricSetupOverlay.setAttribute("aria-label", menu === "perso"
          ? "Réglages du Personnalisé"
          : "Choix du setup Duel symétrique");

        const titres = {
          duel: ["DUEL SYMÉTRIQUE", "Choisissez votre duel",
            "Les deux camps partent des mêmes îles, et vos deux villages ont le même entourage."],
          perso: ["PERSONNALISÉ", "Composez la partie",
            "Composez la formation de départ et les règles de la partie."],
          terrain: ["PERSONNALISÉ · TERRAIN", "Choisissez le terrain de départ",
            "Le setup est posé tel quel ; vos îles et vos gardiens s’y ajoutent."]
        }[menu];
        if (els.setupOverlayKicker) els.setupOverlayKicker.textContent = titres[0];
        if (els.setupOverlayTitle) els.setupOverlayTitle.textContent = titres[1];
        if (els.setupOverlayIntro) els.setupOverlayIntro.textContent = titres[2];

        // Règles communes (dissolution, exemplaires) : sous la description
        // du duel, ou dans le bloc Règles du Personnalisé.
        const communes = document.getElementById("duelReglesCommunes");
        const place = document.getElementById(menu === "perso" ? "duelOptionsPerso" : "duelOptionsDuel");
        if (communes && place && communes.parentElement !== place) place.append(communes);

        // Un seul bouton de lancement : à côté de la grande photo en aperçu,
        // en bas de l'écran sinon.
        const bouton = els.confirmSymmetricSetupBtn;
        const cible = menu !== "perso" && MENU_DUEL.vue === "apercu"
          ? document.getElementById("duelBoutonApercu")
          : carte.querySelector(".symmetric-board-actions");
        if (bouton && cible && bouton.parentElement !== cible) cible.append(bouton);
        if (bouton) bouton.disabled = MENU_DUEL.attente;
        document.getElementById("duelTailles")?.querySelectorAll("button")
          .forEach(taille => { taille.disabled = MENU_DUEL.attente; });

        majFiltresDuel();
        communes?.querySelectorAll("select").forEach(majListeMenu);
        if (menu === "perso") {
          majMenuPerso();
        } else {
          construireListesDuel();
          if (els.symmetricSetupSelect?.value) majMenuDuel(symmetricSetup(els.symmetricSetupSelect.value));
        }
      }

