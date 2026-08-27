
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
        /* Le tour d'IA en cours doit être ANNULÉ, pas seulement ignoré : sans
           cela il continuait à s'exécuter pendant la pause, et la reprise en
           lançait un second par-dessus — deux tours simultanés, d'où les
           animations incohérentes. Chaque étape de runAITurn compare son jeton
           à aiRunToken et abandonne dès qu'il a changé. */
        aiRunToken++;
        autopsieViderAnimations();
        if (typeof stopIlyosAutoplay === "function") stopIlyosAutoplay("Pause pour revue");
        if (state) {
          state.aiThinking = false;
          state.inputLocked = false;
          state.turnTransitioning = false;
        }
        autopsieCurseur = ILYOS_AUTOPSIE_JOURNAL.length - 1;
        console.log(`Partie en pause. ${ILYOS_AUTOPSIE_JOURNAL.length} décision(s) enregistrée(s).`);
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
        state.players.forEach(j => { j.isAI = true; });
        state.inputLocked = false;
        state.aiThinking = false;
        state.turnTransitioning = false;
        if (typeof ILYOS_AUTOPLAY === "object" && ILYOS_AUTOPLAY) ILYOS_AUTOPLAY.active = true;
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
      function autopsieNoter(coupAttendu, pourquoi = "") {
        const i = autopsieIndexReel();
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
        if (!notes.length) return "Aucun tour signalé.";
        const lignes = [`REVUE ILYOS — ${notes.length} tour(s) signalé(s) sur ${ILYOS_AUTOPSIE_JOURNAL.length}`, ""];
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

      function autopsieExporterRevue() {
        return JSON.stringify(ILYOS_AUTOPSIE_JOURNAL.filter(e => e.annotation), null, 1);
      }

      /* ---------------------------------------------------------------------
         Panneau. Cinq boutons, aucun effet sur la partie.
         ------------------------------------------------------------------- */

      let revueVueRecap = false;

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
        const i = autopsieIndexReel();
        const e = journal[i];
        const annotees = journal.filter(x => x.annotation).length;

        let corps;
        if (revueVueRecap) {
          const notes = journal.filter(x => x.annotation);
          corps = notes.length
            ? notes.map(x => `<div style="margin:0 0 8px;padding:8px;background:#1a2136;border-radius:6px">
                 <b>tour ${x.tour}</b> · ${revueEchapper(x.nomJoueur)}<br>
                 <span style="color:#8f9ab8">l'IA :</span> ${revueEchapper(x.planLisible)}<br>
                 <span style="color:#7ee0a0">vous :</span> ${revueEchapper(x.annotation.coupAttendu)}
                 ${x.annotation.pourquoi ? `<br><span style="color:#8f9ab8">car :</span> ${revueEchapper(x.annotation.pourquoi)}` : ""}
               </div>`).join("")
            : `<p style="color:#8f9ab8">Aucun tour signalé.</p>`;
        } else if (!e) {
          corps = `<p style="color:#8f9ab8">Aucune décision enregistrée. Lancez une partie.</p>`;
        } else {
          corps = `<p style="margin:6px 0 4px;color:#8f9ab8">décision ${i + 1} / ${journal.length}
              · tour ${e.tour} · ${revueEchapper(e.nomJoueur)}</p>
            <p style="margin:0 0 6px">${revueEchapper(e.planLisible)}</p>
            ${e.annotation ? `<p style="margin:0 0 6px;padding:6px;background:#17301f;border-radius:6px">
                 <span style="color:#7ee0a0">vous auriez :</span> ${revueEchapper(e.annotation.coupAttendu)}
               </p>` : ""}`;
        }

        panneau.innerHTML =
          `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
             <b style="letter-spacing:.06em">REVUE IA</b>
             <span style="color:#8f9ab8">${annotees} signalé(s)</span>
           </div>
           ${corps}
           <div style="margin-top:10px;border-top:1px solid #2a3352;padding-top:8px">
             ${revueBouton(enPause ? "▶ Reprendre" : "⏸ Pause", enPause ? "reprendre" : "pause")}
             ${revueBouton("◀", "precedent", journal.length > 0)}
             ${revueBouton("▶", "suivant", journal.length > 0)}
             ${revueBouton("⚠ Tour raté", "noter", !!e)}
             ${revueBouton(revueVueRecap ? "← Décision" : "📋 Récap", "recap")}
             ${revueVueRecap ? revueBouton("⧉ Copier", "copier", annotees > 0) : ""}
           </div>`;

        panneau.querySelectorAll("[data-revue]").forEach(bouton => {
          bouton.addEventListener("click", () => {
            const quoi = bouton.getAttribute("data-revue");
            if (quoi === "pause") autopsiePause();
            else if (quoi === "reprendre") autopsieReprendre();
            else if (quoi === "precedent") { revueVueRecap = false; autopsiePrecedent(); }
            else if (quoi === "suivant") { revueVueRecap = false; autopsieSuivant(); }
            else if (quoi === "recap") { revueVueRecap = !revueVueRecap; }
            else if (quoi === "copier") {
              const texte = autopsieResumeRevue();
              navigator.clipboard?.writeText(texte).then(
                () => { bouton.textContent = "✓ Copié"; },
                () => { console.log(texte); bouton.textContent = "→ console"; }
              );
              return;
            } else if (quoi === "noter") {
              const coup = window.prompt("Qu'auriez-vous joué à ce tour ?", e?.annotation?.coupAttendu || "");
              if (coup === null) return;
              const pourquoi = window.prompt("Pourquoi ? (facultatif)", e?.annotation?.pourquoi || "");
              autopsieNoter(coup, pourquoi || "");
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
        oublier: autopsieOublier,
        recap: autopsieRecap,
        exporterRevue: autopsieExporterRevue,
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
