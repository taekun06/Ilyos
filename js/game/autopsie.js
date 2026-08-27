
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
          dureeTotaleMs: rapport ? rapport.dureeTotaleMs : null,
          anticipation: rapport ? rapport.anticipation || null : null,
          finalistes: [],
          candidats: rapport ? rapport.releveCandidats || [] : [],
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

      window.ILYOS_AUTOPSIE = {
        /* Sans argument, l'autopsie s'active : c'est l'usage courant. */
        activer: (actif = true) => {
          plannerActiverAutopsie(actif);
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
