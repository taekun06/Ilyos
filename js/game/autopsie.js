
      /* =====================================================================
         AUTOPSIE IA — enregistrement des décisions en partie réelle

         Ce module ne mesure pas la force de l'IA : il explique ses choix. Les
         bancs d'essai jugent des positions choisies d'avance, ce qui laisse
         échapper précisément ce qu'un adversaire humain repère en jouant.

         Pour chaque décision Expert d'une vraie partie, on conserve de quoi
         répondre à une seule question : « pourquoi l'IA n'a-t-elle pas vu ce
         que moi j'ai vu ? ». Trois réponses possibles, et le relevé permet de
         les distinguer sans deviner :

           — le bon coup ne figure NULLE PART        → défaut des générateurs ;
           — il figure parmi les candidats ÉCARTÉS   → défaut du pré-filtre ;
           — il figure, bien noté, mais n'est pas
             retenu                                  → défaut de la recherche
                                                        ou de la riposte ;
           — il figure, mal noté                      → défaut de l'évaluateur.

         L'enregistrement est INACTIF par défaut : hors autopsie, le surcoût se
         limite à un test de drapeau par décision. Il vit dans son propre
         fragment, et non dans diagnostics.js, parce qu'il doit fonctionner en
         partie réelle alors que l'outillage de banc a vocation à sortir du
         bundle en fin de chantier.
         ===================================================================== */

      const AUTOPSIE_MAX_DECISIONS = 60;

      const ILYOS_AUTOPSIE_JOURNAL = [];

      /* L'instantané pris AVANT la décision est ce qui rend une position
         rejouable : sans lui on ne pourrait que relire un verdict, jamais le
         remettre en question. */
      function autopsieInstantaneAvant() {
        if (!plannerAutopsieActive()) return null;
        try {
          return snapshotState();
        } catch (erreur) {
          console.warn("[ILYOS] autopsie : instantané impossible", erreur);
          return null;
        }
      }

      /* Décrit un plan en langage de jeu.

         Les identifiants internes (char-102) ne disent rien à qui regarde le
         plateau. On suit donc la position de chaque gardien au fil du plan, de
         façon à parler en CASES — comme on lirait la partie. */
      function autopsieDecrirePlan(plan, instantane) {
        if (!plan || !plan.length) return "aucune action";

        const ou = new Map();
        try {
          const depart = typeof instantane === "string" ? JSON.parse(instantane) : instantane;
          (depart && depart.characters || []).forEach(c => ou.set(c.id, [c.r, c.c]));
        } catch (erreur) { /* description dégradée, jamais bloquante */ }

        const casePlateau = cell => `(${cell[0]},${cell[1]})`;
        // Le gardien qui vient d'apparaître n'a pas encore d'identifiant connu :
        // c'est lui qu'on désigne quand un ordre porte sur un inconnu.
        let dernierApparu = null;
        const depuis = id => {
          if (ou.has(id)) return casePlateau(ou.get(id));
          if (dernierApparu) return casePlateau(dernierApparu) + " (nouveau)";
          return "?";
        };
        const noter = (id, cell) => { if (!ou.has(id) && dernierApparu) ou.set(id, dernierApparu); ou.set(id, cell); };

        const morceaux = plan.map(a => {
          switch (a.type) {
            case "POSE": {
              if (a.spawn) dernierApparu = a.spawn;
              return `pose une île de ${(a.cells || []).length} cases`
                + (a.spawn ? `, un gardien apparaît en ${casePlateau(a.spawn)}` : "");
            }
            case "MOVE": {
              const de = depuis(a.charId);
              noter(a.charId, [a.r, a.c]);
              return `déplace le gardien ${de} vers ${casePlateau([a.r, a.c])}`
                + ` (${a.cost} carte${a.cost > 1 ? "s" : ""})`;
            }
            case "PUSH":
              return `pousse ${casePlateau([a.r, a.c])} depuis ${depuis(a.pusherId)}, force ${a.force}`;
            case "MAGIC":
              return `fait pivoter une île autour de ${casePlateau(a.pivot)}`
                + ` (${a.turns} quart${a.turns > 1 ? "s" : ""} de tour)`;
            case "RAMASSAGE":
              return `ramasse la couronne avec le gardien ${depuis(a.charId)}`;
            case "TRANSMISSION":
              return `passe la couronne de ${depuis(a.deId)} à ${depuis(a.versId)}`;
            default:
              return a.type;
          }
        });
        return morceaux.join(" · ");
      }

      /* Enregistre une décision. `repli` est renseigné quand le cerveau Expert
         n'a PAS décidé — exception, plan vide, ou main rendue à la logique
         historique : ce sont les cas les plus instructifs, et ceux qu'un
         journal qui n'enregistre que les succès laisserait invisibles. */
      function autopsieConsigner(joueurId, instantaneAvant, rapport, repli = null) {
        if (!plannerAutopsieActive()) return null;

        const entree = {
          tour: state ? state.turn : null,
          joueur: joueurId,
          nomJoueur: state && state.players[joueurId] ? state.players[joueurId].name : null,
          horodatage: new Date().toISOString(),
          instantane: instantaneAvant,
          repli,
          plan: rapport && rapport.plan ? rapport.plan.map(a => ({ ...a })) : [],
          planLisible: rapport ? autopsieDecrirePlan(rapport.plan, instantaneAvant) : null,
          // Arrondies dès l enregistrement : une note au millionième de point
          // n a aucun sens de jeu et rend le journal illisible.
          noteDepart: rapport ? Math.round(rapport.noteDepart) : null,
          noteArrivee: rapport ? Math.round(rapport.noteArrivee) : null,
          etatsExplores: rapport ? rapport.etatsExplores : null,
          candidatsGeneres: rapport ? rapport.candidatsGeneres : null,
          profondeurAtteinte: rapport ? rapport.profondeurAtteinte : null,
          largeurFaisceau: rapport ? rapport.largeurFaisceau : null,
          dureeMs: rapport ? rapport.dureeMs : null,
          coutObservationMs: rapport ? rapport.coutObservationMs ?? 0 : null,
          dureeTotaleMs: rapport ? rapport.dureeTotaleMs : null,
          anticipation: rapport ? rapport.anticipation || null : null,
          finalistes: [],
          candidats: rapport ? rapport.releveCandidats || [] : [],
          // Coût de génération par générateur : la recherche peut échouer non
          // parce qu'elle cherche mal, mais parce que produire les candidats a
          // déjà épuisé son budget.
          chronosGeneration: rapport && rapport.releveCandidats
            ? rapport.releveCandidats.chronos || null : null,
          detailDepart: null,
          detailArrivee: null
        };

        /* Décompositions de score. Calculées ici et non pendant la recherche :
           elles ne doivent jamais peser sur le temps de décision. */
        try {
          if (rapport && rapport.etatDepart) {
            entree.detailDepart = withSimulatedState(rapport.etatDepart, () => evaluerAvecDetail(joueurId));
          }
          if (rapport && rapport.etatRetenu) {
            entree.detailArrivee = withSimulatedState(rapport.etatRetenu, () => evaluerAvecDetail(joueurId));
          }
          entree.finalistes = ((rapport && rapport.finalistes) || []).slice(0, 5).map(noeud => ({
            plan: noeud.plan.map(a => ({ ...a })),
            planLisible: autopsieDecrirePlan(noeud.plan, instantaneAvant),
            note: Math.round(noeud.note),
            detail: withSimulatedState(noeud.etat, () => evaluerAvecDetail(joueurId))
          }));
        } catch (erreur) {
          console.warn("[ILYOS] autopsie : décomposition impossible", erreur);
        }

        ILYOS_AUTOPSIE_JOURNAL.push(entree);
        // Le panneau suit la partie sans qu'on ait à le rafraîchir soi-même.
        try { revueRendre(); } catch (erreur) { /* jamais bloquer une décision */ }
        // Tampon circulaire : une longue partie ne doit pas gonfler sans fin.
        while (ILYOS_AUTOPSIE_JOURNAL.length > AUTOPSIE_MAX_DECISIONS) {
          ILYOS_AUTOPSIE_JOURNAL.shift();
        }
        return entree;
      }

      /* ---------------------------------------------------------------------
         Lecture. Tout est imprimé en termes de jeu — cases, gardiens, coups —
         pour qu'une décision puisse être contestée sans lire le code.
         ------------------------------------------------------------------- */

      function autopsieAbreger(texte, largeur) {
        const t = String(texte);
        return t.length <= largeur ? t.padEnd(largeur) : t.slice(0, largeur - 1) + "…";
      }

      function autopsieImprimerTermes(titre, detail) {
        if (!detail) return;
        console.log(`  ${titre} — note ${detail.note}`);
        detail.termes.forEach(t => {
          const signe = t.montant > 0 ? "+" : "";
          const note = t.notes && t.notes.length ? `   ${t.notes.join(" ; ")}` : "";
          console.log(`     ${autopsieAbreger(t.terme, 22)} ${(signe + t.montant).padStart(8)}${note}`);
        });
      }

      function autopsieDetailler(index) {
        const e = typeof index === "number"
          ? ILYOS_AUTOPSIE_JOURNAL[index < 0 ? ILYOS_AUTOPSIE_JOURNAL.length + index : index]
          : ILYOS_AUTOPSIE_JOURNAL[ILYOS_AUTOPSIE_JOURNAL.length - 1];
        if (!e) { console.log("Aucune décision enregistrée."); return null; }

        console.log("");
        console.log(`AUTOPSIE — tour ${e.tour}, ${e.nomJoueur} (joueur ${e.joueur})`);
        console.log("=".repeat(78));
        if (e.repli) console.log(`REPLI SUR LA LOGIQUE HISTORIQUE : ${e.repli}`);
        console.log(`Plan retenu : ${e.planLisible}`);
        console.log(`Note ${e.noteDepart} → ${e.noteArrivee}`
          + `   (${e.etatsExplores} états, ${e.candidatsGeneres} candidats, `
          + `profondeur ${e.profondeurAtteinte}, ${e.dureeMs} ms / ${e.dureeTotaleMs} ms)`);

        console.log("");
        autopsieImprimerTermes("Position de départ", e.detailDepart);
        console.log("");
        autopsieImprimerTermes("Après le plan retenu", e.detailArrivee);

        if (e.anticipation) {
          console.log("");
          console.log(`  Riposte adverse anticipée (${e.anticipation.examines} finalistes,`
            + ` ${e.anticipation.dureeMs} ms)`);
          if (e.anticipation.riposte) {
            console.log(`     menace : ${e.anticipation.menace}`
              + `${e.anticipation.garantie ? " (garantie)" : " (plausible)"}`);
            // La riposte est relevée sous forme de types d actions, pas d actions.
            console.log(`     riposte : ${e.anticipation.riposte.join(" · ") || "aucune"}`);
          }
          (e.anticipation.rejets || []).forEach(r => {
            console.log(`     plan écarté malgré une meilleure note (${r.noteFinTour} → ${r.noteRobuste})`
              + ` : ${r.plan.join(",")}`);
          });
        }

        if (e.finalistes.length) {
          console.log("");
          console.log("  Plans finalistes");
          e.finalistes.forEach((f, i) => {
            console.log(`     ${i + 1}. note ${String(f.note).padStart(7)}  ${f.planLisible}`);
          });
          const notes = new Set(e.finalistes.map(f => f.note));
          if (notes.size === 1 && e.finalistes.length > 1) {
            console.log("     ⚠ tous les finalistes portent la MÊME note : la décision");
            console.log("       s'est jouée avant l'évaluateur, dans le pré-filtre.");
          }
        }

        const retenus = e.candidats.filter(c => c.retenu);
        const ecartes = e.candidats.filter(c => !c.retenu);
        console.log("");
        console.log(`  Candidats à la racine : ${retenus.length} retenus, ${ecartes.length} écartés par les plafonds`);
        e.candidats.slice(0, 15).forEach(c => {
          console.log(`     ${c.retenu ? "  retenu" : "  ÉCARTÉ"}  ${String(c.note).padStart(7)}  `
            + `${autopsieDecrirePlan([c.action], e.instantane)}`);
        });
        if (e.candidats.length > 15) {
          console.log(`     … ${e.candidats.length - 15} autres (voir ILYOS_AUTOPSIE.candidats())`);
        }
        console.log("=".repeat(78));
        return e;
      }

      function autopsieResumer() {
        if (!ILYOS_AUTOPSIE_JOURNAL.length) { console.log("Aucune décision enregistrée."); return []; }
        console.log("");
        console.log("DÉCISIONS ENREGISTRÉES");
        console.log("=".repeat(78));
        ILYOS_AUTOPSIE_JOURNAL.forEach((e, i) => {
          const drapeau = e.repli ? " ⚠ REPLI" : "";
          console.log(`${String(i).padStart(3)}  tour ${String(e.tour).padStart(3)}  `
            + `${autopsieAbreger(e.nomJoueur || "?", 12)} `
            + `${String(e.noteDepart).padStart(7)} → ${String(e.noteArrivee).padStart(7)}  `
            + `${String(e.dureeTotaleMs).padStart(4)} ms  ${autopsieAbreger(e.planLisible || "—", 34)}${drapeau}`);
        });
        console.log("=".repeat(78));
        console.log("ILYOS_AUTOPSIE.detail(i) pour une décision · .rejouer(i) pour reposer la position");
        return ILYOS_AUTOPSIE_JOURNAL;
      }

      /* Repose la position telle qu'elle était AVANT la décision, pour pouvoir
         la rejouer soi-même, essayer le coup qu'on avait vu, ou relancer le
         planner dessus après une modification. */
      function autopsieRejouer(index) {
        const e = ILYOS_AUTOPSIE_JOURNAL[index < 0 ? ILYOS_AUTOPSIE_JOURNAL.length + index : index];
        if (!e || !e.instantane) { console.log("Position indisponible."); return false; }
        // snapshotState() rend une chaîne JSON : conservée telle quelle, elle
        // est naturellement immuable et directement exportable.
        applyStateSnapshot(JSON.parse(e.instantane));
        state.undoHistory = [];
        state.aiThinking = false;
        state.inputLocked = false;
        state.turnTransitioning = false;
        renderAll();
        console.log(`Position du tour ${e.tour} reposée. Le plan alors retenu était :`);
        console.log(`  ${e.planLisible}`);
        return true;
      }

      /* =====================================================================
         REVUE DE PARTIE — signaler les tours ratés

         Version délibérément MINIMALE, et c'est une leçon payée : une première
         version reposait le plateau pour rejouer une position, rendait la main
         au joueur, puis restaurait la partie. Elle marchait en théorie et
         cassait les animations en pratique — des animations restaient en vol
         sur des pièces qui n'existaient plus dans la position restaurée.

         Ici, RIEN ne modifie l'état du jeu. Le panneau ne fait que lire le
         journal et y attacher des notes. La pause se contente d'arrêter l'IA ;
         les flèches changent la décision affichée, pas le plateau.

         C'est moins spectaculaire, et ça fonctionne.
         ===================================================================== */

      let autopsieCurseur = -1;
      /* Suivi de la partie automatique mis de côté pendant la pause. Sans lui,
         la reprise repartait « du tour 1 » : le panneau affichait ARRÊTÉE et un
         compteur périmé pendant que la partie tournait. */
      let autopsieSuivi = null;

      /* Différence lisible entre deux positions, en termes de jeu : c est
         ainsi qu on relit un coup, pas en comparant des structures. */
      function autopsieDiffPositions(avant, apres) {
        const A = typeof avant === "string" ? JSON.parse(avant) : avant;
        const B = typeof apres === "string" ? JSON.parse(apres) : apres;
        const lignes = [];
        const posA = new Map((A.characters || []).map(c => [c.id, c]));
        const posB = new Map((B.characters || []).map(c => [c.id, c]));
        for (const [id, cb] of posB) {
          const ca = posA.get(id);
          if (!ca) { lignes.push(`un gardien apparaît en (${cb.r},${cb.c})`); continue; }
          if (ca.r !== cb.r || ca.c !== cb.c) {
            lignes.push(`gardien (${ca.r},${ca.c}) vers (${cb.r},${cb.c})`);
          }
        }
        for (const [id, ca] of posA) {
          if (!posB.has(id)) lignes.push(`gardien (${ca.r},${ca.c}) quitte le jeu`);
        }
        const ilesA = (A.islands || []).length;
        (B.islands || []).slice(ilesA).forEach(i =>
          lignes.push(`île de ${i.cells.length} cases posée en (${i.cells[0]})`));
        const ou = (etat, k) => {
          const art = k === 0 ? etat.artifact : etat.secondArtifact;
          if (!art || !art.active) return null;
          return art.carrierId ? `portée par ${art.carrierId}` : `au sol (${art.r},${art.c})`;
        };
        [0, 1].forEach(k => {
          const x = ou(A, k), y = ou(B, k);
          if (x !== y) lignes.push(`couronne ${k + 1} : ${x || "absente"} vers ${y || "absente"}`);
        });

        /* Cartes dépensées : un tour peut être excellent sans rien déplacer
           de visible — une rotation, une poussée bloquée, un dépôt. Sans ce
           relevé, la correction affichait « aucun changement » et perdait le
           sens du coup. */
        const compte = (etat, joueur) => {
          const j = (etat.players || [])[joueur] || {};
          return ((j.deck || []).length + (j.hand || []).length);
        };
        (A.players || []).forEach((_, k) => {
          const perdu = compte(A, k) - compte(B, k);
          if (perdu > 0) lignes.push(`${A.players[k].name} dépense ${perdu} carte(s)`);
        });
        // Rotation d'île : mêmes îles, cases différentes.
        const forme = etat => (etat.islands || [])
          .map(i => i.cells.map(c => c.join(",")).sort().join("|")).sort().join(" / ");
        if ((A.islands || []).length === (B.islands || []).length && forme(A) !== forme(B)) {
          lignes.push("une île a pivoté");
        }

        return lignes.length ? lignes : ["aucun changement"];
      }

      function autopsieIndexReel(index) {
        const n = ILYOS_AUTOPSIE_JOURNAL.length;
        if (!n) return -1;
        if (index === undefined || index === null) {
          return autopsieCurseur >= 0 && autopsieCurseur < n ? autopsieCurseur : n - 1;
        }
        return index < 0 ? n + index : index;
      }

      /* Arrête l'IA, rien de plus : aucun instantané, aucune restauration. */
      function autopsiePause() {
        /* La pause s'applique à la FIN DU TOUR EN COURS, jamais au milieu.

           Interrompre un tour laissait une position à moitié jouée — cartes
           déjà dépensées, pièces déjà déplacées. À la reprise, l'IA replanifiait
           depuis cet état bâtard et REJOUAIT le tour : le journal montrait deux
           décisions pour le même tour, et des gardiens tombaient sans raison
           apparente, poussés par un plan calculé sur une autre position.

           On laisse donc le tour se terminer. Les deux camps passant en manuel,
           beginTurn ne relance rien ensuite : l'arrêt tombe proprement entre
           deux tours. La pause n'est donc pas instantanée — sans commune mesure
           avec une partie faussée. */
        if (typeof ILYOS_AUTOPLAY === "object" && ILYOS_AUTOPLAY) {
          autopsieSuivi = {
            startedTurn: ILYOS_AUTOPLAY.startedTurn,
            maxTurns: ILYOS_AUTOPLAY.maxTurns,
            logs: ILYOS_AUTOPLAY.logs,
            difficulte: (state && state.aiDifficulty) || "expert"
          };
          // Ne pas rejournaliser une pause déjà en cours.
          if (ILYOS_AUTOPLAY.active && typeof stopIlyosAutoplay === "function") {
            stopIlyosAutoplay("Pause à la fin du tour");
          }
        } else if (typeof stopIlyosAutoplay === "function") {
          stopIlyosAutoplay("Pause à la fin du tour");
        }
        if (state) state.inputLocked = false;
        /* On ne fige PAS le curseur ici : le tour en cours va encore ajouter
           sa décision. Le laisser libre fait pointer l'affichage sur la
           dernière décision réellement enregistrée — sans quoi « Jouer ce
           coup » rejouait un tour de retard. */
        autopsieCurseur = -1;
        console.log(`Pause demandée. Le tour en cours se termine d'abord.`);
        return autopsieCurseur;
      }

      /* Rend la main aux IA sur la position ACTUELLE — laquelle n'a pas bougé,
         puisque la revue ne la touche pas. */
      /* Les animations en attente désignent des pièces et des cases telles
         qu'elles étaient au moment où elles ont été mises en file. Les laisser
         courir après une interruption les fait jouer sur une position qui a
         changé — c'est exactement ce qui produisait les gardiens fantômes. */
      function autopsieViderAnimations() {
        try {
          if (typeof kaykit3D === "object" && kaykit3D && kaykit3D.pendingActionAnimations) {
            kaykit3D.pendingActionAnimations.clear();
          }
        } catch (erreur) { /* le visuel ne doit jamais bloquer la revue */ }
      }

      function autopsieReprendre() {
        if (!state) { console.log("Aucune partie en cours."); return false; }
        if (state.winner !== null && state.winner !== undefined) {
          console.log("La partie est terminée.");
          return false;
        }
        // Repartir sur une file d'animations vide, sinon celles de l'ancien
        // tour se rejouent par-dessus le nouveau.
        autopsieViderAnimations();
        state.inputLocked = false;
        state.aiThinking = false;
        state.turnTransitioning = false;

        /* Relancer la partie automatique pour retrouver sa SURVEILLANCE : sans
           elle, plus rien ne détecte une victoire ni un tour figé, et le
           panneau reste bloqué sur « ARRÊTÉE ». On lui restitue ensuite son
           compteur de tours et son journal, faute de quoi elle repartirait du
           tour où l'on a repris — ce qui ferait mentir l'affichage. */
        if (typeof startIlyosAutoplay === "function") {
          startIlyosAutoplay({
            maxTurns: autopsieSuivi ? autopsieSuivi.maxTurns : 60,
            difficulty: autopsieSuivi ? autopsieSuivi.difficulte : "expert"
          });
          if (autopsieSuivi && typeof ILYOS_AUTOPLAY === "object" && ILYOS_AUTOPLAY) {
            ILYOS_AUTOPLAY.startedTurn = autopsieSuivi.startedTurn;
            ILYOS_AUTOPLAY.logs = autopsieSuivi.logs;
            // startIlyosAutoplay a déjà redessiné le panneau : il faut le
            // refaire APRÈS restitution, sinon il garde le compteur du moment
            // de la reprise et non celui de la partie.
            if (typeof renderIlyosAutoplayPanel === "function") renderIlyosAutoplayPanel();
          }
        } else {
          state.players.forEach(j => { j.isAI = true; });
        }
        autopsieSuivi = null;

        // Le visuel est resynchronisé sur l'état logique avant de repartir.
        if (typeof syncKayKitScene === "function") syncKayKitScene();
        renderAll();
        aiRunToken++;
        if (typeof runAITurn === "function") runAITurn(aiRunToken);
        console.log("Partie reprise.");
        return true;
      }

      /* Change la décision AFFICHÉE. Le plateau n'est pas touché. */
      function autopsieAller(index) {
        const i = autopsieIndexReel(index);
        if (i < 0 || i >= ILYOS_AUTOPSIE_JOURNAL.length) return null;
        autopsieCurseur = i;
        const e = ILYOS_AUTOPSIE_JOURNAL[i];
        console.log(`[${i}] tour ${e.tour} · ${e.nomJoueur} : ${e.planLisible}`);
        return e;
      }

      function autopsiePrecedent() { return autopsieAller(autopsieIndexReel() - 1); }
      function autopsieSuivant() { return autopsieAller(autopsieIndexReel() + 1); }

      /* Signale un tour raté. Le coup attendu est libre : « bloquer le
         village », « ne pas lâcher la couronne » — c'est le sens qui compte. */
      function autopsieNoter(coupAttendu, pourquoi = "", index = null) {
        const i = index === null || index < 0 ? autopsieIndexReel() : index;
        const e = ILYOS_AUTOPSIE_JOURNAL[i];
        if (!e) { console.log("Aucune décision à annoter."); return null; }
        if (!coupAttendu) { console.log('Précisez le coup attendu.'); return null; }
        e.annotation = {
          coupAttendu: String(coupAttendu),
          pourquoi: String(pourquoi || ""),
          horodatage: new Date().toISOString()
        };
        console.log(`[${i}] tour ${e.tour} annoté : ${e.annotation.coupAttendu}`);
        return e.annotation;
      }

      function autopsieOublier(index) {
        const e = ILYOS_AUTOPSIE_JOURNAL[autopsieIndexReel(index)];
        if (e) delete e.annotation;
        return !!e;
      }

      /* Repose le plateau à l instant d AVANT une décision. Action
         explicite, jamais un effet de bord de la navigation : parcourir le
         journal doit rester sans conséquence. */
      function autopsieRevenirIci(index) {
        const i = index === undefined ? autopsieIndexReel() : index;
        const e = ILYOS_AUTOPSIE_JOURNAL[i];
        if (!e || !e.instantane) { console.log("Position indisponible."); return false; }
        autopsiePause();
        autopsieViderAnimations();
        applyStateSnapshot(JSON.parse(e.instantane));
        state.undoHistory = [];
        state.inputLocked = false;
        state.aiThinking = false;
        state.turnTransitioning = false;
        autopsieCurseur = i;
        if (typeof syncKayKitScene === "function") syncKayKitScene();
        renderAll();
        console.log(`Plateau reposé au tour ${e.tour}.`);
        return true;
      }

      /* Vous rend la main sur cette position : les deux camps passent en
         manuel et vous jouez le tour à la souris, normalement. */
      /* Vrai tant que VOUS jouez votre variante à la main. Le harnais
         d'autoplay s'en sert pour ne pas prendre votre réflexion pour un
         tour figé et vous couper la parole. */
      function autopsieCorrectionEnCours() {
        return !!revueCorrection;
      }

      function autopsieJouerCoup(index) {
        const i = index === undefined ? autopsieIndexReel() : index;
        const e = ILYOS_AUTOPSIE_JOURNAL[i];
        if (!e || !autopsieRevenirIci(i)) return false;
        aiRunToken++;
        state.players.forEach(j => { j.isAI = false; });
        /* Couper le harnais AVANT de rendre la main : sa surveillance
           continuait sinon de tourner pendant que vous jouiez. */
        if (typeof stopIlyosAutoplay === "function") stopIlyosAutoplay("Correction manuelle");
        revueCorrection = { index: i, tour: e.tour, avant: e.instantane };
        autopsieEnregistrerActions(true);
        /* La classe « l'ordinateur joue » désactive le sélecteur de formes
           (pointer-events: none sur .island-choice). Restée en place, elle
           rendait la pose d'île impossible pendant la correction — le tour
           ne pouvait donc pas être joué du tout. */
        els.gameScreen?.classList.remove("ai-turn");
        renderAll();
        els.gameScreen?.classList.remove("ai-turn");
        // Le panneau doit basculer en mode correction même si l appel ne vient
        // pas d un bouton : sinon il propose encore « Jouer ce coup ».
        revueRendre();
        console.log(`À vous de jouer le tour ${e.tour}. « ✓ C est mon coup » quand vous avez fini.`);
        return true;
      }

      /* Enregistre le coup joué et RELANCE la partie depuis là. La suite de
         l ancienne partie n a plus eu lieu : le journal est tronqué, mais la
         correction, elle, est conservée à part. */
      /* verdict : VOTRE jugement, tenu à part de la note de l'évaluateur.

         Ces deux appréciations ne doivent surtout pas être confondues. Si
         vous jugez votre variante meilleure et que l'évaluateur la note plus
         bas, ce désaccord est le signal le plus intéressant de toute la
         revue : c'est là que le barème se trompe. Écraser votre avis par le
         score reviendrait à effacer la seule information que la machine ne
         sait pas produire. */
      function autopsieValiderCoup(note = "", verdict = "meilleur") {
        if (!revueCorrection) { console.log("Aucune correction en cours."); return null; }
        const e = ILYOS_AUTOPSIE_JOURNAL[revueCorrection.index];
        const correction = {
          tour: revueCorrection.tour,
          nomJoueur: e ? e.nomJoueur : null,
          planIA: e ? e.planLisible : null,
          noteIA: e ? `${e.noteDepart} → ${e.noteArrivee}` : null,
          termesIA: e && e.detailArrivee ? e.detailArrivee.termes.slice(0, 4) : [],
          candidatsEcartes: e ? (e.candidats || []).filter(c => !c.retenu).length : null,
          votreCoup: autopsieDiffPositions(revueCorrection.avant, snapshotState()),
          // Séquence exacte, et position rejouable après votre variante.
          /* Le dépôt d'une couronne et l'invocation d'un gardien sont du
             code EN LIGNE dans l'interface, pas des fonctions : impossible
             de les envelopper. On complète donc la séquence par ce que la
             comparaison des positions révèle, pour que rien ne manque. */
          vosActions: (() => {
            const captees = (revueActionsJouees || []).slice();
            const dejaDit = captees.map(x => x.type);
            autopsieDiffPositions(revueCorrection.avant, snapshotState()).forEach(ligne => {
              if (/apparaît/.test(ligne) && !dejaDit.includes("SPAWN")) {
                captees.push({ type: "SPAWN", texte: ligne, sourceDiff: true });
              } else if (/couronne/.test(ligne) && /au sol/.test(ligne)
                && !dejaDit.includes("DEPOT")) {
                captees.push({ type: "DEPOT", texte: ligne, sourceDiff: true });
              }
            });
            return captees;
          })(),
          etatAvant: revueCorrection.avant,
          etatApres: snapshotState(),
          /* Ce que VOTRE position vaut, mesuré par l'évaluateur de l'IA.

             C'est le coeur de l'exercice : sans cette comparaison, une
             correction dit « j'aurais joué autrement » et n'apprend rien.
             Avec elle, on voit terme à terme ce que l'IA a sur- ou
             sous-estimé — et si elle continue de préférer son propre coup,
             c'est précisément le défaut à corriger. */
          votreEvaluation: (() => {
            try { return evaluerAvecDetail(state.currentPlayer); }
            catch (erreur) { return null; }
          })(),
          verdictHumain: verdict,
          note: String(note || ""),
          horodatage: new Date().toISOString()
        };
        if (correction.votreEvaluation && e && e.detailArrivee) {
          const noms = new Set([
            ...correction.votreEvaluation.termes.map(t => t.terme),
            ...e.detailArrivee.termes.map(t => t.terme)
          ]);
          correction.ecart = [...noms].map(nom => {
            const vous = correction.votreEvaluation.termes.find(t => t.terme === nom)?.montant || 0;
            const ia = e.detailArrivee.termes.find(t => t.terme === nom)?.montant || 0;
            return { terme: nom, ia, vous, delta: vous - ia };
          }).filter(x => x.delta !== 0)
            .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
        }
        autopsieEnregistrerActions(false);
        revueActionsJouees = null;
        ILYOS_CORRECTIONS.push(correction);

        // Les tours suivants de l ancienne ligne n existent plus.
        ILYOS_AUTOPSIE_JOURNAL.length = revueCorrection.index;
        revueCorrection = null;
        autopsieCurseur = -1;

        console.log(`Correction enregistrée au tour ${correction.tour} :`);
        correction.votreCoup.forEach(l => console.log("   " + l));
        /* La partie repart de votre coup — en TERMINANT votre tour, sans
           lancer de tour d IA ici.

           Appeler reprendre() démarrait un tour pour le joueur dont on venait
           justement de jouer le tour, pendant que endTurn faisait passer au
           suivant. Ce tour fantôme continuait alors de s exécuter sur la
           position du joueur d après et y appliquait des poussées calculées
           ailleurs : des gardiens tombaient sans raison visible.

           endTurn suffit : beginTurn enchaînera de lui-même sur l IA, comme à
           chaque fin de tour ordinaire. */
        state.players.forEach(j => { j.isAI = true; });
        if (typeof ILYOS_AUTOPLAY === "object" && ILYOS_AUTOPLAY) ILYOS_AUTOPLAY.active = true;
        if (typeof startIlyosAutoplay === "function" && autopsieSuivi) {
          startIlyosAutoplay({ maxTurns: autopsieSuivi.maxTurns, difficulty: autopsieSuivi.difficulte });
          ILYOS_AUTOPLAY.startedTurn = autopsieSuivi.startedTurn;
          ILYOS_AUTOPLAY.logs = autopsieSuivi.logs;
          if (typeof renderIlyosAutoplayPanel === "function") renderIlyosAutoplayPanel();
        }
        if (typeof endTurn === "function") endTurn(true);
        revueRendre();
        return correction;
      }

      function autopsieAnnulerCoup() {
        autopsieEnregistrerActions(false);
        revueActionsJouees = null;
        revueCorrection = null;
        console.log("Correction abandonnée. La partie reste en pause sur cette position.");
        revueRendre();
        return true;
      }

      function autopsieRecap() {
        const notes = ILYOS_AUTOPSIE_JOURNAL.map((e, i) => ({ i, e })).filter(x => x.e.annotation);
        console.log("");
        console.log("REVUE DE PARTIE");
        console.log("=".repeat(78));
        if (!notes.length) {
          console.log("Aucun tour signalé.");
        } else {
          notes.forEach(({ i, e }) => {
            console.log(`[${i}] tour ${e.tour} · ${e.nomJoueur}`);
            console.log(`   l'IA a joué : ${e.planLisible}`);
            console.log(`   vous auriez : ${e.annotation.coupAttendu}`);
            if (e.annotation.pourquoi) console.log(`   parce que   : ${e.annotation.pourquoi}`);
          });
          console.log(`${notes.length} tour(s) signalé(s) sur ${ILYOS_AUTOPSIE_JOURNAL.length}.`);
        }
        console.log("=".repeat(78));
        return notes.map(x => x.i);
      }

      /* Résumé COMPACT, fait pour être collé dans une conversation. L'export
         complet embarque les positions et tous les candidats : précieux pour
         rejouer, illisible à transmettre. */
      function autopsieResumeRevue() {
        const notes = ILYOS_AUTOPSIE_JOURNAL.filter(e => e.annotation);
        if (!notes.length && !ILYOS_CORRECTIONS.length) return "Aucun tour signalé.";
        const lignes = [`REVUE ILYOS — ${ILYOS_CORRECTIONS.length} correction(s) jouée(s)`
          + `, ${notes.length} tour(s) signalé(s)`, ""];
        ILYOS_CORRECTIONS.forEach(c => {
          lignes.push(`=== CORRECTION · tour ${c.tour} · ${c.nomJoueur || ""}`);
          lignes.push(`votre avis : ${c.verdictHumain || "meilleur"}`);
          lignes.push(`IA a joué  : ${c.planIA || "—"}`);
          if ((c.vosActions || []).length) {
            lignes.push(`vous avez  : ${c.vosActions.map(x => x.texte).join(" · ")}`);
          } else {
            lignes.push(`vous avez  : ${c.votreCoup.join(" · ")}`);
          }
          if (c.note) lignes.push(`parce que  : ${c.note}`);
          if (c.votreEvaluation) {
            lignes.push(`votre note : ${c.votreEvaluation.note} — l'IA se donnait ${c.noteIA}`);
          }
          const ec = (c.ecart || []).slice(0, 6)
            .map(x => `${x.terme} ${x.delta > 0 ? "+" : ""}${x.delta} (IA ${x.ia}, vous ${x.vous})`);
          if (ec.length) lignes.push(`écart      : ${ec.join(" · ")}`);
          if (c.noteIA) lignes.push(`son calcul : note ${c.noteIA}, ${c.candidatsEcartes} candidats écartés`);
          const t = (c.termesIA || []).map(x => `${x.terme} ${x.montant > 0 ? "+" : ""}${x.montant}`).join(", ");
          if (t) lignes.push(`a pesé     : ${t}`);
          lignes.push("");
        });
        notes.forEach(e => {
          const ecartes = (e.candidats || []).filter(c => !c.retenu).length;
          const tetes = (e.finalistes || []).slice(0, 3).map(f => `${f.note} ${f.planLisible}`).join("  |  ");
          const termes = (e.detailArrivee?.termes || []).slice(0, 4)
            .map(t => `${t.terme} ${t.montant > 0 ? "+" : ""}${t.montant}`).join(", ");
          lignes.push(`--- tour ${e.tour} · ${e.nomJoueur}`);
          lignes.push(`IA a joué  : ${e.planLisible}`);
          lignes.push(`vous auriez: ${e.annotation.coupAttendu}`);
          if (e.annotation.pourquoi) lignes.push(`parce que  : ${e.annotation.pourquoi}`);
          lignes.push(`calcul     : note ${e.noteDepart} → ${e.noteArrivee}, ${e.etatsExplores} états, ${ecartes} candidats écartés${e.repli ? ", REPLI: " + e.repli : ""}`);
          if (termes) lignes.push(`a pesé     : ${termes}`);
          if (tetes) lignes.push(`finalistes : ${tetes}`);
          lignes.push("");
        });
        return lignes.join("\n");
      }

      /* Fichier de revue COMPLET : les positions y sont rejouables, ce qui
         vaut infiniment mieux qu'une capture d'écran. Chaque tour signalé ou
         corrigé y va avec son état d'avant décision, le plan de l'IA, son
         raisonnement, votre variante et son évaluation.

         C'est ce qui permet de recharger exactement la position, relancer le
         planner dessus, modifier un poids et rejouer le même tour. */
      function autopsieDossierRevue() {
        return {
          jeu: "ILYOS",
          /* Tout ce qu'il faut pour REPRODUIRE. Une archive sans sa version
             de règles ni son barème ne vaut rien : les mêmes coordonnées
             n'y décrivent plus la même partie. */
          schema: 1,
          version: window.ILYOS_BUILD || null,
          bundle: (document.querySelector('script[src*="game.js"]') || {}).src || null,
          horodatage: new Date().toISOString(),
          regles: {
            grille: typeof GRID === "number" ? GRID : null,
            formesParJoueur: typeof shapeLimitPerOwner === "function" ? shapeLimitPerOwner() : null,
            reserveParType: (window.ILYOS_REGLES_RESERVE || {}).parType ?? null,
            optionsPartie: state && state.rules ? { ...state.rules } : null
          },
          partie: state ? {
            tour: state.turn, manche: state.round,
            difficulte: state.aiDifficulty || null,
            joueurs: (state.players || []).map(j => ({ nom: j.name, score: j.score || 0 })),
            graine: typeof ilyosGraineActive !== "undefined" ? ilyosGraineActive : null
          } : null,
          budgetRecherche: typeof PLAN_BUDGET === "object" ? { ...PLAN_BUDGET } : null,
          poids: typeof PLAN_POIDS === "object" ? { ...PLAN_POIDS } : null,
          corrections: ILYOS_CORRECTIONS.map(c => ({ ...c })),
          toursSignales: ILYOS_AUTOPSIE_JOURNAL.filter(e => e.annotation).map(e => ({
            tour: e.tour, joueur: e.nomJoueur, annotation: e.annotation,
            planIA: e.planLisible, plan: e.plan,
            noteDepart: e.noteDepart, noteArrivee: e.noteArrivee,
            detailDepart: e.detailDepart, detailArrivee: e.detailArrivee,
            finalistes: e.finalistes, anticipation: e.anticipation,
            candidats: e.candidats, etatAvant: e.instantane
          }))
        };
      }

      /* Téléchargement : le fichier doit pouvoir quitter le navigateur. */
      function autopsieTelechargerRevue() {
        const dossier = autopsieDossierRevue();
        if (!dossier.corrections.length && !dossier.toursSignales.length) {
          console.log("Rien à exporter : signalez ou corrigez d'abord un tour.");
          return null;
        }
        const contenu = JSON.stringify(dossier, null, 1);
        const jour = new Date().toISOString().slice(0, 10);
        const lien = document.createElement("a");
        lien.href = URL.createObjectURL(new Blob([contenu], { type: "application/json" }));
        lien.download = `ilyos-revue-${jour}.json`;
        document.body.appendChild(lien);
        lien.click();
        setTimeout(() => { URL.revokeObjectURL(lien.href); lien.remove(); }, 1000);
        console.log(`Revue exportée : ${dossier.corrections.length} correction(s),`
          + ` ${dossier.toursSignales.length} tour(s) signalé(s), ${contenu.length} octets.`);
        return dossier;
      }

      function autopsieExporterRevue() {
        return JSON.stringify(ILYOS_AUTOPSIE_JOURNAL.filter(e => e.annotation), null, 1);
      }

      /* ---------------------------------------------------------------------
         Panneau. Cinq boutons, aucun effet sur la partie.
         ------------------------------------------------------------------- */

      let revueVueRecap = false;
      /* Saisie EN LIGNE plutôt que window.prompt().

         Les boîtes natives figent le rendu de la page : le jeu se bloquait
         le temps de la saisie, et il en fallait deux par annotation. Un champ
         dans le panneau ne bloque rien et laisse le plateau sous les yeux —
         justement au moment où l'on veut décrire le coup qu'on aurait joué.

         Un seul champ : la raison tient dans la même phrase, et deux champs
         doublaient la manipulation pour rien. */
      let revueSaisieOuverte = false;
      /* Décision VISÉE par la saisie, figée à l ouverture du champ. La partie
         continue pendant qu on tape : sans ce gel, l annotation atterrissait
         sur le tour courant et non sur celui qu on regardait. */
      let revueSaisieIndex = -1;
      // Résumé affiché en clair quand la copie automatique est refusée.
      let revueTexteBrut = null;
      /* Confirmation de copie. Écrire dans le bouton ne servait à rien : la
         partie continue, le panneau se redessine, et le bouton modifié est déjà
         détaché du document. Le message doit vivre dans l état du panneau. */
      let revueCopieFaite = false;

      /* CORRECTIONS — les coups que le joueur a joués À LA PLACE de l IA.

         Conservées à part du journal : corriger un tour efface la suite de
         la partie, puisque celle-ci repart de la correction. Une liste
         séparée survit à ces coupes, et le récapitulatif accumule donc
         toutes les erreurs relevées au fil de la session, même à travers
         plusieurs bifurcations. */
      const ILYOS_CORRECTIONS = [];
      // Correction en cours : { index, tour, avant }
      let revueCorrection = null;

      /* Séquence exacte des actions jouées pendant une correction.

         Comparer deux positions ne dit pas COMMENT on y est allé : une même
         arrivée peut venir d'un déplacement ou d'une poussée, et le sens du
         coup se perd. On enveloppe donc les noyaux de règle le temps de la
         correction — le même procédé que le module de réserve physique
         emploie pour endTurn — et chaque action se consigne d'elle-même.

         Le joueur n'a donc plus à décrire ses coups en toutes lettres : il
         lui reste seulement à dire POURQUOI ils sont meilleurs. */
      let revueActionsJouees = null;
      let revueNoyauxDorigine = null;

      function autopsieEnregistrerActions(actif) {
        if (actif) {
          if (revueNoyauxDorigine) return;
          revueActionsJouees = [];
          revueNoyauxDorigine = {
            move: applyMoveCore, push: applyPushCore,
            magic: applyMagicRotationCore, pose: applyIslandPlacementCore,
            // Le joueur humain ne passe PAS par applyIslandPlacementCore : la
            // pose à la souris a son propre chemin dans l interface.
            poseHumaine: placeIsland,
            // Ramassage gratuit ET transmission passent tous deux par là.
            couronne: giveArtifactToCharacter
          };
          /* Ne consigner QUE ce qui arrive pour de bon.

             Le planner explore ses candidats en appelant ces mêmes noyaux
             dans un état simulé : sans ce filtre, la variante humaine se
             retrouvait noyée sous les dizaines de poses que l'IA avait
             seulement imaginées. Une correction doit contenir vos coups,
             pas les brouillons de la machine. */
          const noter = (texte, details) => {
            if (typeof ilyosSimulationActive !== "undefined" && ilyosSimulationActive) return;
            if (revueActionsJouees) revueActionsJouees.push({ texte, ...details });
          };
          applyMoveCore = function (charId, r, c, cout) {
            const g = characterById(charId);
            const de = g ? `(${g.r},${g.c})` : "?";
            const resultat = revueNoyauxDorigine.move.apply(null, arguments);
            if (resultat) noter(`MOVE ${de} → (${r},${c})`, { type: "MOVE", de, vers: [r, c], cout });
            return resultat;
          };
          applyPushCore = function (pusherId, r, c, force) {
            const g = characterById(pusherId);
            const de = g ? `(${g.r},${g.c})` : "?";
            const resultat = revueNoyauxDorigine.push.apply(null, arguments);
            if (resultat) noter(`PUSH ${de} → (${r},${c}) force ${force}`,
              { type: "PUSH", de, vers: [r, c], force });
            return resultat;
          };
          applyMagicRotationCore = function (islandId, rotation) {
            const resultat = revueNoyauxDorigine.magic.apply(null, arguments);
            if (resultat) noter(`MAGIC île ${islandId}`, { type: "MAGIC", islandId });
            return resultat;
          };
          applyIslandPlacementCore = function (shapeKey, cells) {
            const resultat = revueNoyauxDorigine.pose.apply(null, arguments);
            if (resultat) {
              noter(`POSE ${shapeKey} en ${JSON.stringify(cells)}`
                + (resultat.gardienCase ? ` · gardien en (${resultat.gardienCase})` : ""),
                { type: "POSE", shapeKey, cells, spawn: resultat.gardienCase || null });
            }
            return resultat;
          };
          giveArtifactToCharacter = function (artifact, char) {
            const porteurAvant = artifact ? artifact.carrierId : null;
            const resultat = revueNoyauxDorigine.couronne.apply(null, arguments);
            if (resultat && char) {
              noter(porteurAvant
                ? `TRANSMISSION vers (${char.r},${char.c})`
                : `RAMASSAGE par (${char.r},${char.c})`,
                { type: porteurAvant ? "TRANSMISSION" : "RAMASSAGE", vers: [char.r, char.c] });
            }
            return resultat;
          };

          placeIsland = function (ancreR, ancreC) {
            const avant = (state.islands || []).length;
            const resultat = revueNoyauxDorigine.poseHumaine.apply(null, arguments);
            const ile = (state.islands || [])[avant];
            if (ile) {
              noter(`POSE ${ile.shapeKey} en ${JSON.stringify(ile.cells)}`,
                { type: "POSE", shapeKey: ile.shapeKey, cells: ile.cells });
            }
            return resultat;
          };
          return;
        }
        if (!revueNoyauxDorigine) return;
        placeIsland = revueNoyauxDorigine.poseHumaine;
        giveArtifactToCharacter = revueNoyauxDorigine.couronne;
        applyMoveCore = revueNoyauxDorigine.move;
        applyPushCore = revueNoyauxDorigine.push;
        applyMagicRotationCore = revueNoyauxDorigine.magic;
        applyIslandPlacementCore = revueNoyauxDorigine.pose;
        revueNoyauxDorigine = null;
      }

      function revueEchapper(texte) {
        return String(texte == null ? "" : texte)
          .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      }

      function revueBouton(libelle, action, actif = true) {
        return `<button data-revue="${action}" ${actif ? "" : "disabled"} style="
          background:${actif ? "#243055" : "#1a2033"};color:${actif ? "#e8ecf8" : "#5d6580"};
          border:1px solid #3a4568;border-radius:6px;padding:5px 9px;margin:2px 3px 2px 0;
          font:inherit;cursor:${actif ? "pointer" : "default"};">${libelle}</button>`;
      }

      function revuePanneau() {
        let panneau = document.querySelector(".ilyos-revue-panneau");
        if (!panneau) {
          panneau = document.createElement("aside");
          panneau.className = "ilyos-revue-panneau";
          panneau.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:9999;"
            + "width:340px;max-height:60vh;overflow:auto;background:rgba(14,18,32,.94);"
            + "color:#e8ecf8;border:1px solid #3a4568;border-radius:10px;padding:12px 14px;"
            + "font:12px/1.45 ui-monospace,Menlo,Consolas,monospace;"
            + "box-shadow:0 10px 30px rgba(0,0,0,.45)";
          document.body.appendChild(panneau);
        }
        return panneau;
      }

      function revueRendre() {
        if (!plannerAutopsieActive()) {
          document.querySelector(".ilyos-revue-panneau")?.remove();
          return;
        }
        const panneau = revuePanneau();
        const journal = ILYOS_AUTOPSIE_JOURNAL;
        const enPause = !(typeof ILYOS_AUTOPLAY === "object" && ILYOS_AUTOPLAY && ILYOS_AUTOPLAY.active);
        const i = revueSaisieOuverte && revueSaisieIndex >= 0 ? revueSaisieIndex : autopsieIndexReel();
        const e = journal[i];
        const annotees = journal.filter(x => x.annotation).length;

        let corps;
        if (revueTexteBrut) {
          corps = `<p style="margin:0 0 6px;color:#8f9ab8">Copie refusée par le navigateur.
              Sélectionnez le texte ci-dessous.</p>
            <textarea readonly style="width:100%;box-sizing:border-box;height:160px;
              background:#0e1220;color:#e8ecf8;border:1px solid #3a4568;border-radius:5px;
              padding:6px;font:11px/1.4 ui-monospace,Menlo,Consolas,monospace">${revueEchapper(revueTexteBrut)}</textarea>`;
        } else if (revueCorrection) {
          const d = ILYOS_AUTOPSIE_JOURNAL[revueCorrection.index];
          corps = `<p style="margin:6px 0;padding:8px;background:#2a2416;border-radius:6px">
              <b style="color:#e8c46a">À VOUS DE JOUER — tour ${revueCorrection.tour}</b><br>
              Jouez ce tour comme vous l'auriez joué, puis <b>✓ C'est mon coup</b>.<br>
              <span style="color:#8f9ab8">La partie repartira de votre coup.</span>
            </p>
            <p style="margin:0;color:#8f9ab8">l'IA avait joué : ${revueEchapper(d ? d.planLisible : "—")}</p>
            <input data-revue-coup type="text" placeholder="pourquoi votre coup est meilleur (facultatif)"
              style="width:100%;box-sizing:border-box;margin-top:6px;background:#0e1220;color:#e8ecf8;
                     border:1px solid #3a4568;border-radius:5px;padding:5px;font:inherit">`;
        } else if (revueVueRecap) {
          // En récapitulatif, revenir en arrière viserait la dernière décision
          // et non celle qu on lit : on masque ces boutons plus bas.
          const notes = journal.filter(x => x.annotation);
          const corrections = ILYOS_CORRECTIONS.map(c => `<div style="margin:0 0 8px;padding:8px;background:#1c2740;border-radius:6px">
                 <b>tour ${c.tour}</b> · ${revueEchapper(c.nomJoueur || "")}<br>
                 <span style="color:#8f9ab8">l'IA :</span> ${revueEchapper(c.planIA || "—")}<br>
                 <span style="color:#8ab6e8">vous (${revueEchapper(c.verdictHumain || "meilleur")}) :</span>
                 ${revueEchapper((c.vosActions || []).map(x => x.texte).join(" · ") || c.votreCoup.join(" · "))}
                 ${c.note ? `<br><span style="color:#8f9ab8">car :</span> ${revueEchapper(c.note)}` : ""}
                 ${c.votreEvaluation ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #2a3352">
                    <span style="color:#8f9ab8">évaluation :</span> vous ${c.votreEvaluation.note}
                    · l IA se donnait ${revueEchapper(c.noteIA || "—")}
                    ${(c.ecart || []).length ? `<br><span style="color:#8f9ab8">écart :</span> `
                      + c.ecart.slice(0, 4).map(x =>
                          `${revueEchapper(x.terme)} <b style="color:${x.delta > 0 ? "#7ee0a0" : "#e88a8a"}">${x.delta > 0 ? "+" : ""}${x.delta}</b>`
                        ).join(", ") : ""}
                  </div>` : ""}
               </div>`).join("");
          corps = corrections + (notes.length
            ? notes.map(x => `<div style="margin:0 0 8px;padding:8px;background:#1a2136;border-radius:6px">
                 <b>tour ${x.tour}</b> · ${revueEchapper(x.nomJoueur)}<br>
                 <span style="color:#8f9ab8">l'IA :</span> ${revueEchapper(x.planLisible)}<br>
                 <span style="color:#7ee0a0">vous :</span> ${revueEchapper(x.annotation.coupAttendu)}
                 ${x.annotation.pourquoi ? `<br><span style="color:#8f9ab8">car :</span> ${revueEchapper(x.annotation.pourquoi)}` : ""}
               </div>`).join("")
            : (corrections ? "" : `<p style="color:#8f9ab8">Aucun tour signalé.</p>`));
        } else if (!e) {
          corps = `<p style="color:#8f9ab8">Aucune décision enregistrée. Lancez une partie.</p>`;
        } else {
          corps = `<p style="margin:6px 0 4px;color:#8f9ab8">décision ${i + 1} / ${journal.length}
              · tour ${e.tour} · ${revueEchapper(e.nomJoueur)}</p>
            <p style="margin:0 0 6px">${revueEchapper(e.planLisible)}</p>
            ${e.annotation ? `<p style="margin:0 0 6px;padding:6px;background:#17301f;border-radius:6px">
                 <span style="color:#7ee0a0">vous auriez :</span> ${revueEchapper(e.annotation.coupAttendu)}
               </p>` : ""}
            ${revueSaisieOuverte ? `<div style="margin:6px 0;padding:8px;background:#1a2136;border-radius:6px">
                 <div style="color:#8f9ab8;margin-bottom:4px">Quel coup auriez-vous joué ?</div>
                 <input data-revue-coup type="text" placeholder="bloquer le village, il marquait au tour suivant"
                   value="${revueEchapper(e.annotation ? e.annotation.coupAttendu : '')}"
                   style="width:100%;box-sizing:border-box;background:#0e1220;color:#e8ecf8;
                          border:1px solid #3a4568;border-radius:5px;padding:5px;font:inherit">
               </div>` : ""}`;
        }

        panneau.innerHTML =
          `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
             <b style="letter-spacing:.06em">REVUE IA</b>
             <span style="color:#8f9ab8">${annotees} signalé(s) · ${ILYOS_CORRECTIONS.length} corrigé(s)</span>
           </div>
           ${corps}
           ${revueCopieFaite ? `<p style="margin:6px 0;padding:6px;background:#17301f;border-radius:6px;color:#7ee0a0">
                ✓ Résumé copié — collez-le où vous voulez.</p>` : ""}
           <div style="margin-top:10px;border-top:1px solid #2a3352;padding-top:8px">
             ${revueCorrection
               ? revueBouton("✓ Meilleur", "validerMeilleur")
                 + revueBouton("≈ Incertain", "validerIncertain")
                 + revueBouton("✗ Moins bon", "validerMoinsBon")
                 + revueBouton("Abandonner", "annulerCoup")
               : revueBouton(enPause ? "▶ Reprendre" : "⏸ Pause", enPause ? "reprendre" : "pause")}
             ${revueBouton("◀", "precedent", journal.length > 0)}
             ${revueBouton("▶", "suivant", journal.length > 0)}
             ${revueSaisieOuverte
               ? revueBouton("✓ Valider", "valider") + revueBouton("✗ Annuler", "annuler")
               : revueBouton("⚠ Tour raté", "noter", !!e)}
             ${!revueCorrection && !revueSaisieOuverte && !revueVueRecap
               ? revueBouton(e ? `↺ Revenir au tour ${e.tour}` : "↺ Revenir ici", "revenir", !!e)
                 + revueBouton(e ? `🎮 Jouer le tour ${e.tour}` : "🎮 Jouer ce coup", "jouer", !!e)
               : ""}
             ${revueBouton(revueVueRecap ? "← Décision" : "📋 Récap", "recap")}
             ${revueVueRecap ? revueBouton("⧉ Copier", "copier", annotees + ILYOS_CORRECTIONS.length > 0)
               + revueBouton("⤓ Exporter", "exporter", annotees + ILYOS_CORRECTIONS.length > 0) : ""}
           </div>`;

        // Entrée valide, Échap annule : on ne quitte pas le clavier pour rien.
        const champSaisie = panneau.querySelector("[data-revue-coup]");
        if (champSaisie) {
          champSaisie.addEventListener("keydown", evenement => {
            if (evenement.key === "Enter") {
              const coup = champSaisie.value.trim();
              if (coup) autopsieNoter(coup, "", revueSaisieIndex);
              revueSaisieOuverte = false;
              revueRendre();
            } else if (evenement.key === "Escape") {
              revueSaisieOuverte = false;
              revueRendre();
            }
          });
          if (document.activeElement !== champSaisie) champSaisie.focus();
        }

        panneau.querySelectorAll("[data-revue]").forEach(bouton => {
          bouton.addEventListener("click", () => {
            const quoi = bouton.getAttribute("data-revue");
            if (quoi !== "copier") revueCopieFaite = false;
            if (quoi === "pause") autopsiePause();
            else if (quoi === "reprendre") autopsieReprendre();
            else if (quoi === "precedent") { revueVueRecap = false; autopsiePrecedent(); }
            else if (quoi === "suivant") { revueVueRecap = false; autopsieSuivant(); }
            else if (quoi === "recap") { revueTexteBrut = null; revueVueRecap = !revueVueRecap; }
            else if (quoi === "exporter") { autopsieTelechargerRevue(); }
            else if (quoi === "copier") {
              /* navigator.clipboard échoue silencieusement quand le document
                 n'a pas le focus. On retombe donc sur une zone de texte
                 sélectionnée, et en dernier recours on AFFICHE le résumé
                 dans le panneau : il doit toujours être récupérable. */
              const texte = autopsieResumeRevue();
              const secours = () => {
                const zone = document.createElement("textarea");
                zone.value = texte;
                zone.style.cssText = "position:fixed;left:-9999px;top:0";
                document.body.appendChild(zone);
                zone.select();
                let copie = false;
                try { copie = document.execCommand("copy"); } catch (erreur) { copie = false; }
                zone.remove();
                if (copie) { revueCopieFaite = true; revueRendre(); }
                else { revueTexteBrut = texte; revueRendre(); }
              };
              if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(texte)
                  .then(() => { revueCopieFaite = true; revueRendre(); }, secours);
              } else secours();
              return;
            } else if (quoi === "revenir") { autopsieRevenirIci(i);
            } else if (quoi === "jouer") { revueVueRecap = false; autopsieJouerCoup(i);
            } else if (quoi.startsWith("valider") && quoi !== "valider") {
              const champ = panneau.querySelector("[data-revue-coup]");
              const verdicts = {
                validerMeilleur: "meilleur",
                validerIncertain: "incertain",
                validerMoinsBon: "moins bon"
              };
              autopsieValiderCoup(champ ? champ.value.trim() : "", verdicts[quoi] || "meilleur");
            } else if (quoi === "annulerCoup") { autopsieAnnulerCoup();
            } else if (quoi === "noter") {
              revueSaisieOuverte = true;
              revueSaisieIndex = i;
            } else if (quoi === "annuler") {
              revueSaisieOuverte = false;
            } else if (quoi === "valider") {
              const champ = panneau.querySelector("[data-revue-coup]");
              const coup = champ ? champ.value.trim() : "";
              if (coup) autopsieNoter(coup, "", revueSaisieIndex);
              revueSaisieOuverte = false;
            }
            revueRendre();
          });
        });
      }

      window.ILYOS_AUTOPSIE = {
        /* Sans argument, l'autopsie s'active : c'est l'usage courant. */
        activer: (actif = true) => {
          plannerActiverAutopsie(actif);
          revueRendre();
          console.log(actif
            ? "Autopsie ACTIVE : chaque décision Expert sera enregistrée."
            : "Autopsie arrêtée.");
          return plannerAutopsieActive();
        },
        active: () => plannerAutopsieActive(),
        liste: autopsieResumer,
        detail: autopsieDetailler,
        dernier: () => autopsieDetailler(-1),
        rejouer: autopsieRejouer,
        candidats: (index = -1) => {
          const e = ILYOS_AUTOPSIE_JOURNAL[index < 0 ? ILYOS_AUTOPSIE_JOURNAL.length + index : index];
          return e ? e.candidats : [];
        },
        journal: () => ILYOS_AUTOPSIE_JOURNAL,
        // Réaffiche le panneau s'il a été fermé.
        panneau: revueRendre,

        /* --- Revue de partie --- */
        pause: autopsiePause,
        reprendre: autopsieReprendre,
        aller: autopsieAller,
        precedent: autopsiePrecedent,
        suivant: autopsieSuivant,
        noter: autopsieNoter,
        revenirIci: autopsieRevenirIci,
        jouerCoup: autopsieJouerCoup,
        validerCoup: autopsieValiderCoup,
        annulerCoup: autopsieAnnulerCoup,
        corrections: () => ILYOS_CORRECTIONS,
        oublier: autopsieOublier,
        recap: autopsieRecap,
        exporterRevue: autopsieExporterRevue,
        dossierRevue: autopsieDossierRevue,
        telechargerRevue: autopsieTelechargerRevue,
        resumeRevue: autopsieResumeRevue,
                vider: () => { ILYOS_AUTOPSIE_JOURNAL.length = 0; return 0; },
        /* Export JSON : une position litigieuse doit pouvoir quitter le
           navigateur pour devenir un cas d'étude reproductible. */
        exporter: (index = null) => {
          const donnees = index === null
            ? ILYOS_AUTOPSIE_JOURNAL
            : [ILYOS_AUTOPSIE_JOURNAL[index < 0 ? ILYOS_AUTOPSIE_JOURNAL.length + index : index]];
          return JSON.stringify(donnees, null, 1);
        }
      };
