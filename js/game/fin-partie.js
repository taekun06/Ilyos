      /* =====================================================================
         FIN DE PARTIE ET COURONNE VALIDÉE

         Fin de partie en deux temps (choix de Taekun, 2026-11-09) :
         1. le TITRE plein écran — VICTOIRE, DÉFAITE ou MATCH NUL — pendant
            deux secondes, sur le plateau assombri ;
         2. le titre remonte en haut et le BANDEAU monte du bas : le plateau
            reste visible au milieu. Le bandeau a des onglets : Résumé,
            Statistiques, Progression, À découvrir et, après une victoire
            contre l'Expert, Analyse.
         Un clic ou une touche pendant le titre passe directement au bandeau.

         Couronne validée : la couronne part du village (ou du gardien) et
         rejoint sa place dans le HUD, qui éclate en lumière ; un bandeau
         « Couronne validée » se pose sous le portrait du joueur.

         Tout est en HTML/CSS, animé une seule fois puis retiré : aucune
         animation infinie, aucun objet 3D ni shader (machines faibles). La
         feuille : css/fin-partie.css.
         ===================================================================== */

      const FIN_TITRE_MS = 2000;
      let finMinuteur = null;

      function finEchapper(texte) {
        return String(texte == null ? "" : texte)
          .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      }

      function finCouronneSvg(classe = "") {
        return `<svg class="fin-couronne ${classe}" viewBox="0 0 36 25" aria-hidden="true"><path d="M3 18L6 6l9 7 4-10 6 10 7-7 1 12H3Z" fill="currentColor"/><path d="M5 20h27v3H5z" fill="currentColor"/></svg>`;
      }

      /* Portrait d'un joueur : le gardien choisi dans la collection, sinon
         l'illustration du HUD (chevalier pour les places paires, mage sinon). */
      function finPortrait(joueur) {
        let image = null;
        try { image = progressionPortraitDuJoueur(joueur); } catch (_) { }
        if (image) return `./${image}`;
        return joueur && joueur.id % 2 === 1 ? "./assets/hud/mage-portrait.png" : "./assets/hud/knight-portrait.png";
      }

      /* ---------- Ouverture ---------------------------------------------- */

      /* ton : "victoire" | "defaite" | "egalite". */
      function finPartieOuvrir({ ton, vainqueur = null, titre, kicker, texte }) {
        const modal = els.victoryModal;
        if (!modal) return;
        clearTimeout(finMinuteur);
        modal.classList.toggle("fin-defaite", ton === "defaite");
        modal.classList.toggle("fin-egalite", ton === "egalite");
        modal.classList.toggle("fin-victoire", ton === "victoire");
        modal.style.setProperty("--fin-couleur", vainqueur?.color || "#e8c26a");

        const kickerEl = modal.querySelector(".fin2-kicker");
        if (kickerEl) kickerEl.textContent = kicker;
        if (els.victoryTitle) els.victoryTitle.textContent = titre;
        if (els.victoryText) els.victoryText.textContent = texte;

        // Couronnes du vainqueur (aucune en Balises, où l'on compte des points).
        const couronnes = modal.querySelector(".fin2-couronnes");
        if (couronnes) {
          const balises = typeof butBalises === "function" && butBalises();
          const marquees = vainqueur ? Math.min(3, vainqueur.score || 0) : 0;
          couronnes.innerHTML = balises ? ""
            : [0, 1, 2].map(i => finCouronneSvg(i < marquees ? "pleine" : "vide")).join("");
        }

        finPartieRendreResume(vainqueur);
        finPartieRendreDecouvrir();
        finPartieOnglet("resume");
        // Analyse : rouverte par defaitesRendreVictoire si la partie y a droit.
        finPartieAnalyseDisponible(false);

        modal.classList.remove("hidden", "fin2-bandeau-visible");
        modal.classList.add("fin2-moment");
        void modal.offsetWidth;
        modal.classList.add("victory-visible");
        finMinuteur = setTimeout(finPartieMontrerBandeau, FIN_TITRE_MS);
      }

      function finPartieMontrerBandeau() {
        const modal = els.victoryModal;
        if (!modal || modal.classList.contains("hidden")) return;
        clearTimeout(finMinuteur);
        modal.classList.remove("fin2-moment");
        modal.classList.add("fin2-bandeau-visible");
      }

      function finPartieOnglet(nom) {
        const modal = els.victoryModal;
        if (!modal) return;
        modal.querySelectorAll("[data-fin-onglet]").forEach(bouton => {
          const actif = bouton.dataset.finOnglet === nom;
          bouton.classList.toggle("actif", actif);
          bouton.setAttribute("aria-selected", String(actif));
        });
        modal.querySelectorAll("[data-fin-page]").forEach(page => {
          page.hidden = page.dataset.finPage !== nom;
        });
      }

      function finPartiePage(nom) {
        return els.victoryModal?.querySelector(`[data-fin-page="${nom}"]`) || null;
      }

      function finPartieAnalyseDisponible(oui) {
        const modal = els.victoryModal;
        if (!modal) return;
        modal.querySelectorAll('[data-fin-onglet="analyse"], .fin2-analyse').forEach(n => { n.hidden = !oui; });
      }

      /* ---------- Résumé : le duel ---------------------------------------- */

      function finPartieRendreResume(vainqueur) {
        const zone = els.victoryModal?.querySelector(".fin2-duel");
        if (!zone || !state) return;
        const joueurs = state.players || [];
        const portrait = (j, petit) => `<span class="fin2-portrait${petit ? " petit" : ""}${vainqueur && !memeEquipe(j.id, vainqueur.id) ? " vaincu" : ""}"
          style="--c:${finEchapper(j.color || "#e8c26a")}"><img src="${finEchapper(finPortrait(j))}" alt=""></span>`;
        let face;
        if (joueurs.length === 2) {
          const [a, b] = joueurs;
          face = `<div class="fin2-face">
            <div class="fin2-camp">${portrait(a)}<b style="color:${finEchapper(a.color)}">${finEchapper(a.name)}</b></div>
            <div class="fin2-score">${a.score || 0}<span>–</span>${b.score || 0}</div>
            <div class="fin2-camp">${portrait(b)}<b style="color:${finEchapper(b.color)}">${finEchapper(b.name)}</b></div>
          </div>`;
        } else {
          face = `<div class="fin2-face fin2-face-equipe">${joueurs.map(j =>
            `<div class="fin2-camp">${portrait(j, true)}<b style="color:${finEchapper(j.color)}">${finEchapper(j.name)}</b><em>${j.score || 0}</em></div>`).join("")}</div>`;
        }
        // Les chiffres du joueur de l'appareil (ou du vainqueur, sans humain).
        let moi = null;
        try { moi = progressionJoueurDeLAppareil(); } catch (_) { }
        const sujet = moi || vainqueur || joueurs[0];
        const stats = sujet ? statistiquesDuJoueur(sujet.id) || {} : {};
        const iles = sujet && typeof ilesPoseesPar === "function" ? ilesPoseesPar(sujet.id) : 0;
        zone.innerHTML = `<div class="fin2-entete">${joueurs.length === 2 ? "Le duel" : "La partie"}</div>${face}
          <div class="fin2-chiffres">
            <span><b>${state.turn}</b> tours</span>
            <span><b>${stats.poussees || 0}</b> poussées</span>
            <span><b>${stats.chutes || 0}</b> chutes</span>
            <span><b>${iles}</b> îles</span>
          </div>`;
      }

      /* Colonne « Progression » du résumé : le niveau et le gain en bref ; le
         détail complet (saison, quêtes, déblocages) est dans son onglet. */
      function finPartieProgressionMini(gain) {
        const zone = els.victoryModal?.querySelector(".fin2-prog-mini");
        if (!zone) return;
        if (!gain) {
          zone.hidden = true;
          els.victoryModal.querySelector('[data-fin-onglet="progression"]')?.setAttribute("hidden", "");
          return;
        }
        zone.hidden = false;
        els.victoryModal.querySelector('[data-fin-onglet="progression"]')?.removeAttribute("hidden");
        const { apres, niveauxGagnes } = gain;
        const pct = Math.round(100 * apres.xpDansNiveau / apres.xpPourSuivant);
        // Les quêtes accomplies par CETTE partie sont des lignes du gain.
        const quete = (gain.lignes || []).find(ligne => ligne.quete) || null;
        const debloque = (gain.debloques || [])[0] || null;
        zone.innerHTML = `<div class="fin2-entete">Progression</div>
          <div class="fin2-niv">
            <span class="fin2-hex">${apres.niveau}</span>
            <div class="fin2-niv-corps">
              <div class="fin2-niv-tete"><b>${niveauxGagnes > 0 ? `Niveau ${apres.niveau} atteint&nbsp;!` : `Niveau ${apres.niveau}`}</b><span>+${gain.total} XP</span></div>
              <div class="fin2-barre"><i style="width:${pct}%"></i></div>
            </div>
          </div>
          ${quete ? `<div class="fin2-ligne-ok">✓ ${finEchapper(quete.libelle)} +${quete.xp}</div>` : ""}
          ${debloque ? `<div class="fin2-ligne-ok">✦ Débloqué : ${finEchapper(debloque.nom)}</div>` : ""}`;
      }

      /* ---------- À découvrir --------------------------------------------- */

      /* Tout ce que le jeu propose, fait ou non : le joueur voit l'étendue de
         ce qui lui reste. Lu sur l'appareil (journal des parties, énigmes,
         Boucles, tutoriels, collection). */
      function finPartieADecouvrir() {
        const liste = [];
        let journal = [];
        let profil = null;
        try { journal = progressionJournalCharger().filter(e => e.type === "partie"); } catch (_) { }
        try { profil = progressionCharger(); } catch (_) { }
        const lire = cle => { try { return localStorage.getItem(cle); } catch (_) { return null; } };
        const modes = new Set(journal.map(e => e.mode));
        const plateaux = new Set(journal.map(e => e.plateau).filter(Boolean));
        // La partie qui s'achève compte déjà.
        if (state) {
          try { modes.add(progressionModeDeLaPartie()); } catch (_) { }
          plateaux.add(state.startingBoardMode);
        }
        const rotationJouee = journal.some(e => e.rotation) || !!state?.rotation;

        liste.push({ ic: "⚡", nom: "Tutoriel", fait: lire("ilyos.quick.fait") === "1",
          texte: "Toutes les règles en quelques minutes" });
        liste.push({ ic: "▣", nom: "Immersion", fait: !!profil?.tutorielRecompense,
          texte: "Le récit de l’Éveil des îles" });

        let puzzles = 0;
        try { puzzles = progressionPuzzlesResolus(); } catch (_) { }
        const totalPuzzles = (typeof PUZZLES !== "undefined" && PUZZLES.length) || 0;
        if (totalPuzzles) liste.push({ ic: "◈", nom: "Puzzles", fait: puzzles >= totalPuzzles,
          texte: `${puzzles} sur ${totalPuzzles} résolus`, avance: puzzles / totalPuzzles });

        let boucles = 0;
        try { boucles = Object.keys(bouclesLireProgres()).length; } catch (_) { }
        const totalBoucles = (typeof BOUCLES_NIVEAUX !== "undefined" && BOUCLES_NIVEAUX.length) || 0;
        if (totalBoucles) liste.push({ ic: "↻", nom: "Boucles", fait: boucles >= totalBoucles,
          texte: boucles ? `${boucles} sanctuaire${boucles > 1 ? "s" : ""} sur ${totalBoucles}` : "Jamais essayé",
          avance: boucles / totalBoucles });

        // Le premier niveau de CPU pas encore battu.
        const battus = new Set(journal.filter(e => e.resultat === "victoire" && e.difficulte).map(e => e.difficulte));
        if (profil?.exploits?.expert) battus.add("expert");
        if (state && state.winner !== null && state.winner !== undefined) {
          try {
            const moi = progressionJoueurDeLAppareil();
            const gagnant = state.players[state.winner];
            if (moi && gagnant && memeEquipe(gagnant.id, moi.id)) {
              state.players.filter(j => j.isAI && j.aiDifficulty).forEach(j => battus.add(j.aiDifficulty));
            }
          } catch (_) { }
        }
        const niveaux = ["easy", "normal", "hard", "expert"];
        const prochain = niveaux.find(n => !battus.has(n));
        liste.push({ ic: "⚔", nom: prochain ? `CPU ${PROGRESSION_DIFFICULTE_NOM[prochain]}` : "CPU Expert",
          fait: !prochain, texte: prochain ? "Pas encore battu" : "Tous les niveaux battus",
          avance: niveaux.filter(n => battus.has(n)).length / niveaux.length });

        liste.push({ ic: "♙♙", nom: "Duel local", fait: modes.has("duel"), texte: "À deux sur le même écran" });
        liste.push({ ic: "♜", nom: "2 contre 2", fait: modes.has("team"), texte: "En équipes, gardiens partagés" });
        liste.push({ ic: "◎", nom: "En ligne", fait: modes.has("online"), texte: "Contre un ami à distance" });
        liste.push({ ic: "⚖", nom: "Duels symétriques", fait: plateaux.has("symmetric"), texte: "Des terrains en miroir" });
        liste.push({ ic: "✎", nom: "Personnalisé", fait: plateaux.has("custom"), texte: "Tes propres règles" });
        liste.push({ ic: "✦", nom: "Rotation", fait: rotationJouee, texte: "Balises, créatures, paquet à bâtir" });

        // Collection : les prochains objets à débloquer.
        try {
          if (profil) {
            const aVenir = [];
            progressionVueCollection(profil).forEach(categorie => categorie.objets.forEach(objet => {
              if (!objet.debloque && !objet.saison) aVenir.push({ ...objet, categorie: categorie.nom });
            }));
            aVenir.sort((a, b) => (a.cible || 0) - (b.cible || 0) || String(a.texte).localeCompare(String(b.texte)));
            aVenir.slice(0, 2).forEach(objet => {
              const source = progressionObjet(PROGRESSION_COLLECTION.find(c => c.nom === objet.categorie)?.cle, objet.id);
              liste.push({ ic: "✧", image: source?.portrait || source?.image || null, nom: objet.nom,
                fait: false, texte: `${objet.categorie} · ${objet.texte}`, collection: true });
            });
          }
        } catch (_) { }
        return liste;
      }

      function finTuile(t) {
        const icone = t.image
          ? `<span class="fin2-ic" style="background-image:url('./${finEchapper(t.image)}')"></span>`
          : `<span class="fin2-ic">${finEchapper(t.ic)}</span>`;
        return `<li class="fin2-tuile${t.fait ? " faite" : ""}">${icone}<span><b>${finEchapper(t.nom)}</b><small>${t.fait ? "✓ " : ""}${finEchapper(t.texte)}</small></span></li>`;
      }

      function finPartieRendreDecouvrir() {
        const liste = finPartieADecouvrir();
        const restants = liste.filter(t => !t.fait);
        const mini = els.victoryModal?.querySelector(".fin2-decouvrir-mini");
        if (mini) {
          mini.innerHTML = `<div class="fin2-entete">Encore à découvrir</div>
            <ul class="fin2-tuiles">${restants.slice(0, 4).map(finTuile).join("")}</ul>`;
          mini.hidden = !restants.length;
        }
        const page = finPartiePage("decouvrir");
        if (page) {
          const modes = liste.filter(t => !t.collection);
          const faits = modes.filter(t => t.fait).length;
          page.innerHTML = `<div class="fin2-explore">
              <b>Tu as exploré ${faits} sur ${modes.length}</b>
              <span class="fin2-barre"><i style="width:${Math.round(100 * faits / Math.max(1, modes.length))}%"></i></span>
            </div>
            <ul class="fin2-tuiles fin2-tuiles-toutes">${[...restants, ...liste.filter(t => t.fait)].map(finTuile).join("")}</ul>`;
        }
      }

      /* ---------- Couronne validée ----------------------------------------- */

      /* Appelée par scoreCrownForPlayer (ui.js) après le point. `char` peut
         manquer (sortie, banc) : la couronne part alors du village. */
      function couronneCelebrer(player, char) {
        if (ilyosSimulationActive || !player || !state) return false;
        if (typeof butBalises === "function" && butBalises()) return false;
        try {
          const score = Math.min(3, player.score || 0);
          const gagnante = score >= 3;
          const reduit = (() => { try { return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; } })();

          // Côté du HUD qui porte ce joueur (son nom à gauche ou à droite).
          const hud = document.getElementById("ilyosHudOrganicV2");
          const nomGauche = (document.getElementById("ov2LeftName")?.textContent || "").trim();
          const cote = nomGauche && nomGauche === String(player.name).trim() ? "gauche"
            : ((document.getElementById("ov2RightName")?.textContent || "").trim() === String(player.name).trim() ? "droite" : null);
          const rangee = cote ? document.getElementById(cote === "gauche" ? "ov2LeftScore" : "ov2RightScore") : null;
          const emplacement = rangee?.children?.[score - 1] || rangee || null;
          const cible = emplacement?.getBoundingClientRect?.();
          const arrivee = cible && cible.width
            ? { x: cible.left + cible.width / 2, y: cible.top + cible.height / 2 }
            : { x: innerWidth / 2, y: 60 };

          // Départ : le gardien, sinon la case du village, projetés à l'écran.
          let depart = { x: innerWidth / 2, y: innerHeight * .55 };
          const caseDepart = char || villagesForPlayer(player)?.[0] || player.village;
          if (caseDepart && kaykit3D?.camera && isKayKitBoardActive() && typeof kaykitCellPosition === "function") {
            const p = kaykitCellPosition(caseDepart.r, caseDepart.c, kaykitCellSurfaceY(caseDepart.r, caseDepart.c) + .6);
            const v = new THREE.Vector3(p.x, p.y, p.z).project(kaykit3D.camera);
            const rect = kaykit3D.renderer?.domElement?.getBoundingClientRect?.() || { left: 0, top: 0, width: innerWidth, height: innerHeight };
            if (Number.isFinite(v.x) && v.z < 1) {
              depart = { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height };
            }
          }

          document.querySelector(".cv-couche")?.remove();
          const couche = document.createElement("div");
          couche.className = `cv-couche${cote ? ` cv-${cote}` : ""}`;
          couche.setAttribute("aria-hidden", "true");
          couche.style.setProperty("--cv-couleur", player.color || "#e8c26a");
          const etincelles = reduit ? "" : Array.from({ length: 14 }, (_, i) =>
            `<i style="--a:${Math.round(i * 25.7) + (i % 2) * 9}deg;--d:${52 + (i % 3) * 22}px"></i>`).join("");
          couche.innerHTML = `
            <div class="cv-voile"></div>
            ${reduit ? "" : `<div class="cv-vol">${finCouronneSvg("pleine")}</div>`}
            <div class="cv-eclat" style="left:${arrivee.x}px;top:${arrivee.y}px">
              <span class="cv-rayons"></span><span class="cv-anneau"></span><span class="cv-etincelles">${etincelles}</span>
            </div>
            ${gagnante ? "" : `<div class="cv-bandeau">
              <div class="cv-rang">${[0, 1, 2].map(i => finCouronneSvg(i < score - 1 ? "pleine" : i === score - 1 ? "pleine neuve" : "vide")).join("")}</div>
              <div><b>Couronne validée</b><small>${finEchapper(player.name)} · ${score === 2 ? "balle de match" : `${score} / 3`}</small></div>
            </div>`}`;
          document.body.appendChild(couche);
          // Le bandeau se pose sous le côté du HUD de ce joueur.
          const bandeau = couche.querySelector(".cv-bandeau");
          if (bandeau) {
            const flanc = cote && hud?.querySelector(cote === "gauche" ? ".ov2-left" : ".ov2-right")?.getBoundingClientRect();
            if (flanc && flanc.height) {
              bandeau.style.top = `${Math.round(flanc.bottom + 12)}px`;
              if (cote === "gauche") bandeau.style.left = `${Math.round(Math.max(12, flanc.left + 96))}px`;
              else bandeau.style.right = `${Math.round(Math.max(12, innerWidth - flanc.right + 96))}px`;
            } else {
              bandeau.style.top = "96px";
              bandeau.classList.add("cv-centre");
            }
          }

          const vol = couche.querySelector(".cv-vol");
          const eclater = () => {
            couche.classList.add("cv-arrivee");
            emplacement?.classList?.add?.("cv-slot-allume");
            setTimeout(() => emplacement?.classList?.remove?.("cv-slot-allume"), 900);
          };
          if (vol && vol.animate) {
            const dx = arrivee.x - depart.x, dy = arrivee.y - depart.y;
            // Arc : la couronne monte d'abord, puis file vers le HUD.
            const milieu = { x: depart.x + dx * .35, y: Math.min(depart.y, arrivee.y) + dy * .1 - 120 };
            vol.style.left = "0px"; vol.style.top = "0px";
            const pos = (p, s, o) => ({ transform: `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(${s})`, opacity: o });
            const animation = vol.animate([
              { ...pos(depart, .3, 0), offset: 0 },
              { ...pos({ x: depart.x, y: depart.y - 40 }, 1.7, 1), offset: .22 },
              { ...pos(milieu, 1.4, 1), offset: .55 },
              { ...pos(arrivee, .7, 1), offset: 1 }
            ], { duration: 1050, easing: "cubic-bezier(.45,0,.3,1)", fill: "forwards" });
            animation.onfinish = () => { vol.remove(); eclater(); };
          } else {
            setTimeout(eclater, 200);
          }
          setTimeout(() => couche.classList.add("cv-sortie"), gagnante ? 1700 : 2900);
          setTimeout(() => couche.remove(), gagnante ? 2100 : 3400);
          // Le bandeau (ou, pour la couronne gagnante, l'écran de fin) dit
          // déjà tout : l'appelant peut taire sa notification.
          return true;
        } catch (erreur) {
          console.warn("[ILYOS] couronne validée", erreur);
        }
        return false;
      }

      /* ---------- Branchements --------------------------------------------- */

      (function finPartieBrancher() {
        const modal = els.victoryModal;
        if (!modal) return;
        /* Le HUD de jeu s'efface tant que l'écran de fin est ouvert. L'écran
           est fermé à plusieurs endroits (Rejouer, Menu, bibliothèque…) par
           la classe hidden : on suit cette classe plutôt que chaque appel. */
        const suivre = () => document.body.classList.toggle("fin2-ouverte", !modal.classList.contains("hidden"));
        new MutationObserver(suivre).observe(modal, { attributes: true, attributeFilter: ["class"] });
        suivre();
        modal.addEventListener("click", evenement => {
          const onglet = evenement.target.closest?.("[data-fin-onglet]");
          if (onglet) { finPartieOnglet(onglet.dataset.finOnglet); return; }
          if (modal.classList.contains("fin2-moment")) finPartieMontrerBandeau();
        });
        document.addEventListener("keydown", () => {
          if (modal.classList.contains("fin2-moment") && !modal.classList.contains("hidden")) finPartieMontrerBandeau();
        }, true);
      })();
