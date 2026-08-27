
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

      /** Décrit une action de façon lisible en termes de jeu, pas de structure. */
      function autopsieDecrireAction(action) {
        if (!action) return "—";
        switch (action.type) {
          case "MOVE": return `MOVE ${action.charId} → (${action.r},${action.c}) coût ${action.cost}`;
          case "PUSH": return `PUSH ${action.pusherId} → (${action.r},${action.c}) force ${action.force}`;
          case "MAGIC": return `MAGIC île ${action.islandId} pivot (${action.pivot}) ${action.turns} pas`;
          case "POSE": return `POSE ${action.shapeKey} en ${JSON.stringify(action.cells)}`
            + (action.spawn ? ` gardien en (${action.spawn})` : "");
          case "RAMASSAGE": return `RAMASSAGE ${action.charId} prend ${action.artifactId}`;
          case "TRANSMISSION": return `TRANSMISSION ${action.deId} → ${action.versId}`;
          default: return action.type;
        }
      }

      function autopsieDecrirePlan(plan) {
        if (!plan || !plan.length) return "aucune action";
        return plan.map(autopsieDecrireAction).join(" · ");
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
          planLisible: rapport ? autopsieDecrirePlan(rapport.plan) : null,
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
            planLisible: autopsieDecrirePlan(noeud.plan),
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
            + `${autopsieDecrireAction(c.action)}`);
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
         REVUE DE PARTIE

         Mettre en pause, remonter les derniers coups, désigner l'erreur et dire
         quel coup aurait été juste. Les annotations s'accumulent et ressortent
         en fin de partie.

         C'est le complément indispensable du reste de ce module : l'autopsie
         dit ce que l'IA a calculé, la revue dit ce qu'elle AURAIT DÛ jouer. La
         seconde information ne peut venir que d'un humain qui regarde la
         partie ; aucun banc d'essai ne la produira.
         ===================================================================== */

      // Position vivante mise de côté pendant la revue, pour pouvoir reprendre
      // la partie exactement où elle en était malgré les retours en arrière.
      let autopsieEtatVivant = null;
      let autopsieCurseur = -1;
      /* Suivi de la partie automatique mis de côté pendant la revue. Sans lui,
         reprendre relançait l'autoplay à zéro : compteur de tours, journal et
         minuteur réinitialisés — autrement dit, la revue CHANGEAIT la partie
         qu'elle était censée seulement observer. */
      let autopsieSuiviAutoplay = null;

      function autopsieIndexReel(index) {
        const n = ILYOS_AUTOPSIE_JOURNAL.length;
        if (!n) return -1;
        if (index === undefined || index === null) return autopsieCurseur >= 0 ? autopsieCurseur : n - 1;
        return index < 0 ? n + index : index;
      }

      function autopsiePause() {
        try {
          autopsieEtatVivant = snapshotState();
        } catch (erreur) {
          autopsieEtatVivant = null;
          console.warn("[ILYOS] revue : position vivante non conservée", erreur);
        }
        autopsieSuiviAutoplay = (typeof ILYOS_AUTOPLAY === "object" && ILYOS_AUTOPLAY)
          ? {
            startedTurn: ILYOS_AUTOPLAY.startedTurn,
            maxTurns: ILYOS_AUTOPLAY.maxTurns,
            logs: ILYOS_AUTOPLAY.logs,
            difficulte: (state && state.aiDifficulty) || "expert"
          }
          : null;
        if (typeof stopIlyosAutoplay === "function") stopIlyosAutoplay("Pause pour revue");
        autopsieCurseur = ILYOS_AUTOPSIE_JOURNAL.length - 1;
        console.log(`Partie en pause. ${ILYOS_AUTOPSIE_JOURNAL.length} décision(s) enregistrée(s).`);
        console.log("  .precedent() / .suivant() pour parcourir · .noter(\"coup\", \"pourquoi\") pour annoter");
        console.log("  .reprendre() pour relancer la partie où elle en était");
        return autopsieCurseur;
      }

      function autopsieReprendre() {
        if (!autopsieEtatVivant) { console.log("Aucune position en attente."); return false; }
        applyStateSnapshot(JSON.parse(autopsieEtatVivant));
        autopsieEtatVivant = null;
        autopsieCurseur = -1;
        state.undoHistory = [];
        state.inputLocked = false;
        state.aiThinking = false;
        state.turnTransitioning = false;
        /* La partie reprend EXACTEMENT où elle en était. On relance la
           surveillance, puis on lui rend son compteur de tours et son journal :
           sans cette restitution, la partie repartait « du tour 1 » et le
           récapitulatif ne correspondait plus à ce qui s'était joué. */
        if (typeof startIlyosAutoplay === "function") {
          startIlyosAutoplay({
            maxTurns: autopsieSuiviAutoplay ? autopsieSuiviAutoplay.maxTurns : 60,
            difficulty: autopsieSuiviAutoplay ? autopsieSuiviAutoplay.difficulte : "expert"
          });
          if (autopsieSuiviAutoplay && typeof ILYOS_AUTOPLAY === "object") {
            ILYOS_AUTOPLAY.startedTurn = autopsieSuiviAutoplay.startedTurn;
            ILYOS_AUTOPLAY.logs = autopsieSuiviAutoplay.logs;
          }
        }
        autopsieSuiviAutoplay = null;
        // Le tour en cours doit être relancé : l'arrêt l'avait interrompu.
        if (typeof runAITurn === "function") {
          aiRunToken++;
          runAITurn(aiRunToken);
        }
        console.log("Partie reprise.");
        return true;
      }

      /** Repose la position d'une décision et l'affiche, sans perdre le fil. */
      function autopsieAller(index) {
        const i = autopsieIndexReel(index);
        if (i < 0 || i >= ILYOS_AUTOPSIE_JOURNAL.length) { console.log("Décision hors journal."); return null; }
        /* Remonter le temps repose le plateau : si la partie tournait encore,
           l'IA repartirait de la position d'AVANT et la partie serait changée.
           On met donc systématiquement en pause d'abord. */
        if (!autopsieEtatVivant) autopsiePause();
        autopsieCurseur = i;
        autopsieRejouer(i);
        const e = ILYOS_AUTOPSIE_JOURNAL[i];
        const note = e.annotation;
        console.log(`[${i}] tour ${e.tour} · ${e.nomJoueur} a joué : ${e.planLisible}`);
        if (note) console.log(`      VOTRE NOTE : ${note.coupAttendu}${note.pourquoi ? " — " + note.pourquoi : ""}`);
        console.log("      .detail() pour le raisonnement · .noter(\"coup\", \"pourquoi\") pour annoter");
        return e;
      }

      function autopsiePrecedent() { return autopsieAller(autopsieIndexReel() - 1); }
      function autopsieSuivant() { return autopsieAller(autopsieIndexReel() + 1); }

      /* Annote la décision en cours de revue. coupAttendu est libre : « poser
         l'île en 2,5 », « bloquer le village », « ne pas lâcher la couronne » —
         c'est le sens qui compte, pas une syntaxe. */
      function autopsieNoter(coupAttendu, pourquoi = "") {
        const i = autopsieIndexReel();
        const e = ILYOS_AUTOPSIE_JOURNAL[i];
        if (!e) { console.log("Aucune décision à annoter."); return null; }
        if (!coupAttendu) { console.log('Précisez le coup attendu : .noter("bloquer le village", "il marquait au tour suivant")'); return null; }
        e.annotation = {
          coupAttendu: String(coupAttendu),
          pourquoi: String(pourquoi || ""),
          horodatage: new Date().toISOString()
        };
        console.log(`Décision [${i}], tour ${e.tour} : annotée.`);
        console.log(`   l'IA a joué  : ${e.planLisible}`);
        console.log(`   vous auriez  : ${e.annotation.coupAttendu}`);
        if (e.annotation.pourquoi) console.log(`   parce que    : ${e.annotation.pourquoi}`);
        return e.annotation;
      }

      function autopsieOublier(index) {
        const e = ILYOS_AUTOPSIE_JOURNAL[autopsieIndexReel(index)];
        if (e) delete e.annotation;
        return !!e;
      }

      /* Récapitulatif de fin de partie : uniquement les décisions annotées,
         chacune avec ce que l'IA a calculé en face. C'est ce bloc qui se
         transmet pour analyse. */
      function autopsieRecap() {
        const notes = ILYOS_AUTOPSIE_JOURNAL
          .map((e, i) => ({ i, e }))
          .filter(x => x.e.annotation || x.e.demonstration);
        console.log("");
        console.log("REVUE DE PARTIE");
        console.log("=".repeat(78));
        if (!notes.length) {
          console.log("Aucune erreur signalée. .pause() puis .precedent() pour en marquer une.");
          console.log("=".repeat(78));
          return [];
        }
        notes.forEach(({ i, e }) => {
          console.log(`[${i}] tour ${e.tour} · ${e.nomJoueur}`);
          console.log(`   l'IA a joué : ${e.planLisible}`);
          console.log(`   vous auriez : ${e.annotation.coupAttendu}`);
          if (e.annotation.pourquoi) console.log(`   parce que   : ${e.annotation.pourquoi}`);
          console.log(`   son calcul  : note ${e.noteDepart} → ${e.noteArrivee},`
            + ` ${e.etatsExplores} états, ${e.candidats.filter(c => !c.retenu).length} candidats écartés`
            + (e.repli ? ` · REPLI : ${e.repli}` : ""));
          const tetes = (e.finalistes || []).slice(0, 3)
            .map(f => `${f.note} ${f.planLisible}`).join("  |  ");
          if (tetes) console.log(`   finalistes  : ${tetes}`);
          console.log("");
        });
        console.log(`${notes.length} erreur(s) signalée(s) sur ${ILYOS_AUTOPSIE_JOURNAL.length} décision(s).`);
        console.log(".exporterRevue() pour transmettre le tout");
        console.log("=".repeat(78));
        return notes.map(x => x.i);
      }

      /* Résumé COMPACT des annotations, fait pour être collé dans une
         conversation. L'export complet embarque les positions rejouables et
         tous les candidats : précieux pour rejouer, illisible à transmettre. */
      function autopsieResumeRevue() {
        const notes = ILYOS_AUTOPSIE_JOURNAL.filter(e => e.annotation || e.demonstration);
        if (!notes.length) return "Aucune erreur signalée.";
        const lignes = [`REVUE ILYOS — ${notes.length} erreur(s) sur ${ILYOS_AUTOPSIE_JOURNAL.length} décisions`, ""];
        notes.forEach(e => {
          const ecartes = (e.candidats || []).filter(c => !c.retenu).length;
          const tetes = (e.finalistes || []).slice(0, 3)
            .map(f => `${f.note} ${f.planLisible}`).join("  |  ");
          lignes.push(`--- tour ${e.tour} · ${e.nomJoueur}`);
          lignes.push(`IA a joué  : ${e.planLisible}`);
          if (e.demonstration) {
            lignes.push(`vous auriez: ${e.demonstration.coups.join(" · ")}`);
            lignes.push(`votre note : ${e.demonstration.noteVous} contre ${e.demonstration.noteIA} pour l'IA`);
            /* L'écart terme à terme : ce que l'évaluateur a mal jugé. */
            const ecarts = (e.demonstration.ecart || []).slice(0, 5)
              .map(x => `${x.terme} ${x.delta > 0 ? "+" : ""}${x.delta} (IA ${x.ia}, vous ${x.vous})`);
            if (ecarts.length) lignes.push(`écart      : ${ecarts.join(" · ")}`);
          }
          if (e.annotation) lignes.push(`vous auriez: ${e.annotation.coupAttendu}`);
          if (e.annotation?.pourquoi) lignes.push(`parce que  : ${e.annotation.pourquoi}`);
          lignes.push(`calcul     : note ${e.noteDepart} → ${e.noteArrivee}, ${e.etatsExplores} états, ${ecartes} candidats écartés${e.repli ? ", REPLI: " + e.repli : ""}`);
          if (tetes) lignes.push(`finalistes : ${tetes}`);
          // Les trois termes qui ont le plus pesé : souvent l'explication.
          const termes = (e.detailArrivee?.termes || []).slice(0, 3)
            .map(t => `${t.terme} ${t.montant > 0 ? "+" : ""}${t.montant}`).join(", ");
          if (termes) lignes.push(`a pesé     : ${termes}`);
          lignes.push("");
        });
        return lignes.join("\n");
      }

      /* Export destiné à l'analyse : les décisions annotées, avec la position
         rejouable et le raisonnement complet de l'IA. */
      function autopsieExporterRevue() {
        return JSON.stringify(
          ILYOS_AUTOPSIE_JOURNAL.filter(e => e.annotation || e.demonstration),
          null,
          1
        );
      }

      /* =====================================================================
         DÉMONSTRATION — jouer soi-même le tour que l'IA aurait dû jouer

         Décrire un coup en mots laisse toute la place à l'interprétation.
         Le JOUER ne laisse aucune ambiguïté : on repose la position d'avant la
         décision, on prend la main, on joue son tour, et les deux positions
         d'arrivée sont comparées terme à terme par l'évaluateur de l'IA.

         C'est cette comparaison qui a de la valeur : elle ne dit pas seulement
         « l'humain a mieux joué », elle dit QUEL TERME de l'évaluateur s'est
         trompé, et de combien. Un banc d'essai ne peut pas produire ça.
         ===================================================================== */

      let revueDemo = null;   // { index, joueur, avant }

      /** Différence lisible entre deux positions, en termes de jeu. */
      function autopsieDiffPositions(avant, apres) {
        const a = typeof avant === "string" ? JSON.parse(avant) : avant;
        const b = typeof apres === "string" ? JSON.parse(apres) : apres;
        const lignes = [];

        const posA = new Map((a.characters || []).map(c => [c.id, c]));
        const posB = new Map((b.characters || []).map(c => [c.id, c]));
        for (const [id, cb] of posB) {
          const ca = posA.get(id);
          if (!ca) { lignes.push(`gardien ${id} apparaît en (${cb.r},${cb.c})`); continue; }
          if (ca.r !== cb.r || ca.c !== cb.c) {
            lignes.push(`gardien ${id} : (${ca.r},${ca.c}) → (${cb.r},${cb.c})`);
          }
        }
        for (const [id, ca] of posA) {
          if (!posB.has(id)) lignes.push(`gardien ${id} quitte le jeu (était en ${ca.r},${ca.c})`);
        }

        const ilesA = (a.islands || []).length;
        const ilesB = (b.islands || []).length;
        if (ilesB > ilesA) {
          (b.islands || []).slice(ilesA).forEach(i =>
            lignes.push(`île ${i.shapeKey} posée en ${JSON.stringify(i.cells)}`));
        }

        const couronne = (etat, index) => {
          const art = index === 0 ? etat.artifact : etat.secondArtifact;
          if (!art || !art.active) return null;
          return art.carrierId ? `portée par ${art.carrierId}` : `au sol (${art.r},${art.c})`;
        };
        [0, 1].forEach(k => {
          const ca = couronne(a, k), cb = couronne(b, k);
          if (ca !== cb) lignes.push(`couronne ${k + 1} : ${ca || "absente"} → ${cb || "absente"}`);
        });

        return lignes.length ? lignes : ["aucun changement"];
      }

      /* Rend la main au joueur sur la position d'avant la décision. */
      function autopsieDemontrer(index) {
        const i = autopsieIndexReel(index);
        const e = ILYOS_AUTOPSIE_JOURNAL[i];
        if (!e || !e.instantane) { console.log("Position indisponible."); return false; }
        // La position vivante doit être mise de côté si ce n'est pas déjà fait.
        if (!autopsieEtatVivant) autopsiePause();

        applyStateSnapshot(JSON.parse(e.instantane));
        revueDemo = { index: i, joueur: e.joueur, avant: e.instantane };

        /* Aucun camp n'est piloté : la démonstration est jouée à la main, et
           un tour d'IA lancé au même moment écraserait la position. */
        aiRunToken++;
        state.players.forEach(j => { j.isAI = false; });
        state.undoHistory = [];
        state.inputLocked = false;
        state.aiThinking = false;
        state.turnTransitioning = false;
        renderAll();
        console.log(`Position du tour ${e.tour} reposée. À vous de jouer ce tour.`);
        console.log("Quand vous avez fini, cliquez « ✓ Terminer » — n'appuyez pas sur FIN DU TOUR.");
        return true;
      }

      /* Capture le tour joué et le compare, terme à terme, à celui de l'IA. */
      function autopsieTerminerDemonstration() {
        if (!revueDemo) { console.log("Aucune démonstration en cours."); return null; }
        const e = ILYOS_AUTOPSIE_JOURNAL[revueDemo.index];
        const apres = snapshotState();

        // Évaluation de VOTRE position d'arrivée, avec le même évaluateur.
        let detail = null;
        try {
          detail = evaluerAvecDetail(revueDemo.joueur);
        } catch (erreur) {
          console.warn("[ILYOS] démonstration : évaluation impossible", erreur);
        }

        /* L'écart terme à terme est le cœur de l'exercice : il désigne ce que
           l'évaluateur a sur- ou sous-estimé, et de combien. */
        const ecart = [];
        if (detail && e.detailArrivee) {
          const noms = new Set([
            ...detail.termes.map(t => t.terme),
            ...e.detailArrivee.termes.map(t => t.terme)
          ]);
          for (const nom of noms) {
            const vous = detail.termes.find(t => t.terme === nom)?.montant || 0;
            const ia = e.detailArrivee.termes.find(t => t.terme === nom)?.montant || 0;
            if (vous !== ia) ecart.push({ terme: nom, ia, vous, delta: vous - ia });
          }
          ecart.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
        }

        e.demonstration = {
          coups: autopsieDiffPositions(revueDemo.avant, apres),
          etatApres: apres,
          detail,
          ecart,
          noteIA: e.detailArrivee ? e.detailArrivee.note : e.noteArrivee,
          noteVous: detail ? detail.note : null,
          horodatage: new Date().toISOString()
        };

        console.log(`Tour démontré et enregistré (décision ${revueDemo.index}, tour ${e.tour}).`);
        console.log(`   votre note : ${e.demonstration.noteVous} · celle de l'IA : ${e.demonstration.noteIA}`);
        e.demonstration.coups.forEach(l => console.log("   " + l));

        revueDemo = null;
        // La partie retrouve sa position réelle ; elle reste en pause.
        if (autopsieEtatVivant) {
          applyStateSnapshot(JSON.parse(autopsieEtatVivant));
          renderAll();
        }
        return e.demonstration;
      }

      function autopsieAnnulerDemonstration() {
        revueDemo = null;
        if (autopsieEtatVivant) {
          applyStateSnapshot(JSON.parse(autopsieEtatVivant));
          renderAll();
        }
        return true;
      }

      /* =====================================================================
         PANNEAU DE REVUE

         La revue ne sert à rien si elle oblige à taper dans une console pendant
         qu'on regarde une partie. Ces boutons donnent accès aux mêmes fonctions
         que l'API : pause, retour arrière, annotation, récapitulatif, reprise.
         ===================================================================== */

      let revueVueRecap = false;

      function revuePanneau() {
        let panneau = document.querySelector(".ilyos-revue-panneau");
        if (!panneau) {
          panneau = document.createElement("aside");
          panneau.className = "ilyos-revue-panneau";
          panneau.style.cssText = [
            "position:fixed", "right:12px", "bottom:12px", "z-index:9999",
            "width:330px", "max-height:60vh", "overflow:auto",
            "background:rgba(14,18,32,.94)", "color:#e8ecf8",
            "border:1px solid #3a4straight", "border-radius:10px",
            "padding:12px 14px", "font:12px/1.45 ui-monospace,Menlo,Consolas,monospace",
            "box-shadow:0 10px 30px rgba(0,0,0,.45)"
          ].join(";").replace("#3a4straight", "#3a4568");
          document.body.appendChild(panneau);
        }
        return panneau;
      }

      function revueBouton(libelle, action, actif = true) {
        return `<button data-revue="${action}" ${actif ? "" : "disabled"} style="
          background:${actif ? "#243055" : "#1a2033"};color:${actif ? "#e8ecf8" : "#5d6580"};
          border:1px solid #3a4568;border-radius:6px;padding:5px 9px;margin:2px 3px 2px 0;
          font:inherit;cursor:${actif ? "pointer" : "default"};">${libelle}</button>`;
      }

      function revueEchapper(texte) {
        return String(texte == null ? "" : texte)
          .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      }

      function revueRendre() {
        if (!plannerAutopsieActive()) {
          document.querySelector(".ilyos-revue-panneau")?.remove();
          return;
        }
        const panneau = revuePanneau();
        const journal = ILYOS_AUTOPSIE_JOURNAL;
        const enPause = !!autopsieEtatVivant;
        const i = autopsieIndexReel();
        const e = journal[i];
        const annotees = journal.filter(x => x.annotation).length;
        const demontrees = journal.filter(x => x.demonstration).length;

        let corps;
        if (revueDemo) {
          const d = ILYOS_AUTOPSIE_JOURNAL[revueDemo.index];
          corps = `<p style="margin:6px 0;padding:8px;background:#2a2416;border-radius:6px">
              <b style="color:#e8c46a">DÉMONSTRATION EN COURS</b><br>
              Position du tour ${d.tour} reposée. Jouez le tour comme vous l'auriez joué,
              puis cliquez <b>✓ Terminer</b>.<br>
              <span style="color:#8f9ab8">N'utilisez pas FIN DU TOUR : la position serait perdue.</span>
            </p>
            <p style="margin:0;color:#8f9ab8">l'IA avait joué : ${revueEchapper(d.planLisible)}</p>`;
        } else if (revueVueRecap) {
          const notes = journal.map((x, k) => ({ x, k })).filter(o => o.x.annotation);
          corps = notes.length
            ? notes.map(o => `<div style="margin:0 0 10px;padding:8px;background:#1a2136;border-radius:6px">
                 <b>tour ${o.x.tour}</b> · ${revueEchapper(o.x.nomJoueur)}<br>
                 <span style="color:#8f9ab8">l'IA :</span> ${revueEchapper(o.x.planLisible)}<br>
                 <span style="color:#7ee0a0">vous :</span> ${revueEchapper(o.x.annotation.coupAttendu)}
                 ${o.x.annotation.pourquoi ? `<br><span style="color:#8f9ab8">car :</span> ${revueEchapper(o.x.annotation.pourquoi)}` : ""}
               </div>`).join("")
            : `<p style="color:#8f9ab8">Aucune erreur signalée pour l'instant.</p>`;
        } else if (!e) {
          corps = `<p style="color:#8f9ab8">Aucune décision enregistrée. Lancez une partie.</p>`;
        } else {
          corps = `<p style="margin:6px 0 4px;color:#8f9ab8">décision ${i + 1} / ${journal.length}
              · tour ${e.tour} · ${revueEchapper(e.nomJoueur)}</p>
            <p style="margin:0 0 6px"><b>l'IA a joué</b><br>${revueEchapper(e.planLisible)}</p>
            <p style="margin:0 0 6px;color:#8f9ab8">note ${e.noteDepart} → ${e.noteArrivee}
              · ${e.etatsExplores} états${e.repli ? " · <span style='color:#e6a15c'>REPLI</span>" : ""}</p>
            ${e.demonstration ? `<p style="margin:0 0 6px;padding:6px;background:#1c2740;border-radius:6px">
                 <span style="color:#8ab6e8">votre tour :</span> ${revueEchapper(e.demonstration.coups.join(" · "))}<br>
                 <span style="color:#8f9ab8">note</span> ${e.demonstration.noteVous} <span style="color:#8f9ab8">contre</span> ${e.demonstration.noteIA} <span style="color:#8f9ab8">pour l'IA</span>
               </p>` : ""}
            ${e.annotation ? `<p style="margin:0 0 6px;padding:6px;background:#17301f;border-radius:6px">
                 <span style="color:#7ee0a0">vous auriez :</span> ${revueEchapper(e.annotation.coupAttendu)}
                 ${e.annotation.pourquoi ? `<br><span style="color:#8f9ab8">car :</span> ${revueEchapper(e.annotation.pourquoi)}` : ""}
               </p>` : ""}`;
        }

        panneau.innerHTML =
          `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
             <b style="letter-spacing:.06em">REVUE IA</b>
             <span style="color:#8f9ab8">${annotees} note(s) · ${demontrees} démo(s)</span>
           </div>
           ${corps}
           <div style="margin-top:10px;border-top:1px solid #2a3352;padding-top:8px">
             ${revueDemo
               ? revueBouton("✓ Terminer", "finDemo") + revueBouton("✗ Annuler", "annuleDemo")
               : revueBouton(enPause ? "▶ Reprendre" : "⏸ Pause", enPause ? "reprendre" : "pause")
                 + revueBouton("◀", "precedent", journal.length > 0)
                 + revueBouton("▶", "suivant", journal.length > 0)
                 + revueBouton("🎮 Jouer ce tour", "demontrer", !!e)
                 + revueBouton("✎ Annoter", "noter", !!e)
                 + revueBouton(revueVueRecap ? "← Décision" : "📋 Récap", "recap")
                 + (revueVueRecap ? revueBouton("⧉ Copier", "copier", annotees + demontrees > 0) : "")}
           </div>`;

        // Un même coup peut avoir été noté ET démontré : les deux coexistent.
        panneau.querySelectorAll("[data-revue]").forEach(bouton => {
          bouton.addEventListener("click", () => {
            const quoi = bouton.getAttribute("data-revue");
            if (quoi === "pause") autopsiePause();
            else if (quoi === "reprendre") autopsieReprendre();
            else if (quoi === "precedent") { revueVueRecap = false; autopsiePrecedent(); }
            else if (quoi === "suivant") { revueVueRecap = false; autopsieSuivant(); }
            else if (quoi === "recap") { revueVueRecap = !revueVueRecap; if (revueVueRecap) autopsieRecap(); }
            else if (quoi === "demontrer") { revueVueRecap = false; autopsieDemontrer(); }
            else if (quoi === "finDemo") autopsieTerminerDemonstration();
            else if (quoi === "annuleDemo") autopsieAnnulerDemonstration();
            else if (quoi === "copier") {
              /* Copié dans le presse-papier : le résumé n'a de valeur que s'il
                 peut être collé sans passer par la console. */
              const texte = autopsieResumeRevue();
              navigator.clipboard?.writeText(texte).then(
                () => { bouton.textContent = "✓ Copié"; },
                () => { console.log(texte); bouton.textContent = "→ console"; }
              );
              return;
            }
            else if (quoi === "noter") {
              /* Deux questions, volontairement libres : ce qui compte est le
                 sens du coup, pas une syntaxe à respecter. */
              const coup = window.prompt("Quel coup auriez-vous joué ?", e?.annotation?.coupAttendu || "");
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

        /* --- Revue de partie : pause, retour arrière, annotations --- */
        pause: autopsiePause,
        reprendre: autopsieReprendre,
        aller: autopsieAller,
        precedent: autopsiePrecedent,
        suivant: autopsieSuivant,
        noter: autopsieNoter,
        /* --- Démonstration : jouer soi-même le tour --- */
        demontrer: autopsieDemontrer,
        terminerDemonstration: autopsieTerminerDemonstration,
        annulerDemonstration: autopsieAnnulerDemonstration,
        oublier: autopsieOublier,
        recap: autopsieRecap,
        exporterRevue: autopsieExporterRevue,
        // Version courte, faite pour être collée telle quelle.
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
