/* Couverture des règles par l'IA : chaque action qu'un joueur peut faire dans
   l'interface doit exister dans le planner — générée ET applicable.

     npm start   puis   node scripts/verif-couverture-regles.js   (port 8123)

   Pourquoi : l'IA a longtemps ignoré le VOL de couronne (un gardien à côté
   d'un porteur adverse lui prend sa couronne, gratuitement), et un banc
   comptait le DÉPÔT comme payant. Aucune alerte : un coup jamais généré ne
   peut pas être choisi, et aucune note ne le signale. Toute nouvelle action
   de joueur (ui.js) s'ajoute ici.

   La dissolution d'une île vide (option de partie `allowDissolve`) est
   couverte depuis le 29/09 ; l'IA l'ignorait auparavant. Les îles payantes
   du mode personnalisé (2 cartes, pose facultative) depuis le 09/10. Le
   porteur interdit d'arrêt sur une couronne au sol depuis le 23/10.       */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/js/game.js*', async route => {
      const source = fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8');
      const hook = `window.TEST_COUVERTURE = () => {
        state = state || {};
        /* Rangée 5 : A porte la couronne 1, B est son allié collé, C est collé au
           porteur adverse E (couronne 2). Des îles à part pour la magie. */
        benchPoserPosition({ seed: 7, islandPlacedThisTurn: false, aiPlayer: 0,
          islands: [{ owner: 0, cells: [[5,0],[5,1],[5,2],[5,3],[5,4],[5,5],[5,6],[5,7],[4,1]] }],
          characters: [{ id: 'A', player: 0, r: 5, c: 2 }, { id: 'B', player: 0, r: 5, c: 3 },
                       { id: 'C', player: 0, r: 5, c: 5 }, { id: 'D', player: 0, r: 4, c: 1 },
                       { id: 'E', player: 1, r: 5, c: 6 }],
          crowns: [{ r: 5, c: 2, carrierId: 'A', active: true }, { r: 5, c: 6, carrierId: 'E', active: true }],
          hands: [['MOVE','MOVE','PUSH','PUSH','MAGIC'], []] });
        state.currentPlayer = 0;
        const types = () => avecGrilleTerre(() => [
          ...plannerTransitionsGratuites(0), ...plannerCandidatsMove(0), ...plannerCandidatsPush(0),
          ...plannerCandidatsMagic(0), ...plannerCandidatsPose(0), ...plannerCandidatsLancer(0)]);
        const essayer = action => withSimulatedState(cloneStateForSimulation(), () => !!plannerAppliquerAction(action));
        const racine = types();
        const trouve = (liste, filtre) => liste.find(filtre) || null;
        const cas = {
          MOVE: trouve(racine, a => a.type === 'MOVE'),
          'PUSH gardien': trouve(racine, a => a.type === 'PUSH' && characterAt(a.r, a.c)),
          POSE: trouve(racine, a => a.type === 'POSE'),
          DEPOT: trouve(racine, a => a.type === 'DEPOT'),
          TRANSMISSION: trouve(racine, a => a.type === 'TRANSMISSION'),
          VOL: trouve(racine, a => a.type === 'VOL')
        };
        // Après un dépôt en (5,1) : ramassage et poussée de la couronne au sol.
        const apresDepot = withSimulatedState(cloneStateForSimulation(), () => {
          applyFreeDropCore('A', 5, 1);
          const liste = types();
          return {
            RAMASSAGE: trouve(liste, a => a.type === 'RAMASSAGE'),
            'PUSH couronne': trouve(liste, a => a.type === 'PUSH' && !characterAt(a.r, a.c) && looseArtifactAt(a.r, a.c)),
            etat: structuredClone(state)
          };
        });
        const resultat = {};
        for (const [nom, action] of Object.entries(cas)) resultat[nom] = { genere: !!action, applique: action ? essayer(action) : false };
        for (const nom of ['RAMASSAGE', 'PUSH couronne']) {
          const action = apresDepot[nom];
          resultat[nom] = { genere: !!action,
            applique: action ? withSimulatedState(structuredClone(apresDepot.etat), () => !!plannerAppliquerAction(action)) : false };
        }
        // Ramasser en marchant sur la couronne (règle du déplacement).
        resultat['ramassage en marchant'] = withSimulatedState(cloneStateForSimulation(), () => {
          applyFreeDropCore('A', 5, 1);
          const r = applyMoveCore('D', 5, 1, 1);
          return { genere: true, applique: !!(r && artifactCarriedBy('D')) };
        });
        /* Règle du 23/10 : un porteur ne s'arrête jamais sur une couronne au
           sol (il la traverse), un gardien libre si. La couronne de E est
           posée en (5,1), A la porte toujours en (5,2). */
        resultat['porteur et couronne au sol'] = withSimulatedState(cloneStateForSimulation(), () => {
          const libre = artifactCarriedBy('E');
          libre.carrierId = null; libre.r = 5; libre.c = 1;
          const moves = avecGrilleTerre(() => plannerCandidatsMove(0));
          const porteurRefuse = !moves.some(a => a.charId === 'A' && a.r === 5 && a.c === 1)
            && !movementRange(characterById('A'), 2).has(key(5, 1))
            && !shortestMovementPath(characterById('A'), 5, 1, 2);
          const traverse = movementRange(characterById('A'), 2).has(key(5, 0));
          const libreAccepte = movementRange(characterById('D'), 2).has(key(5, 1));
          return { genere: porteurRefuse && traverse && libreAccepte,
            applique: !applyMoveCore('A', 5, 1, 1) && !!applyMoveCore('D', 5, 1, 1) && artifactCarriedBy('D') === libre };
        });
        /* MAGIE : le porteur sur une île en ligne qu'un quart de tour rapproche
           de son village (0,0). L'IA ne propose que les rotations utiles. */
        benchPoserPosition({ seed: 7, islandPlacedThisTurn: true, aiPlayer: 0,
          islands: [{ owner: 0, cells: [[3,1],[3,2],[3,3]] }, { owner: 1, cells: [[8,8]] }],
          characters: [{ id: 'A', player: 0, r: 3, c: 3 }, { id: 'E', player: 1, r: 8, c: 8 }],
          crowns: [{ r: 3, c: 3, carrierId: 'A', active: true }, null],
          hands: [['MAGIC'], []] });
        state.currentPlayer = 0;
        const magie = avecGrilleTerre(() => plannerCandidatsMagic(0))[0] || null;
        resultat.MAGIC = { genere: !!magie, applique: magie ? essayer(magie) : false };
        /* DISSOLUTION (option allowDissolve) : une île vide, 1 magie. */
        benchPoserPosition({ seed: 7, islandPlacedThisTurn: true, aiPlayer: 0, rules: { allowDissolve: true },
          islands: [{ owner: 0, cells: [[3,1],[3,2]] }, { owner: 1, cells: [[3,4],[3,5]] }, { owner: 1, cells: [[8,8]] }],
          characters: [{ id: 'A', player: 0, r: 3, c: 2 }, { id: 'E', player: 1, r: 8, c: 8 }],
          crowns: [null, null], hands: [['MAGIC'], []] });
        state.currentPlayer = 0;
        const dissolution = plannerCandidatsDissolution(0)[0] || null;
        resultat.DISSOLUTION = { genere: !!dissolution, applique: dissolution ? essayer(dissolution) : false };
        /* ÎLES PAYANTES (mode personnalisé) : poser coûte 2 cartes et n'est plus
           obligatoire. Pose générée et payée avec 2 cartes, aucune pose sans
           elles, fin de tour possible sans île. */
        const posePayante = main => {
          benchPoserPosition({ seed: 7, islandPlacedThisTurn: false, aiPlayer: 0, rules: { ilesPayantes: true },
            islands: [{ owner: 0, cells: [[5,0],[5,1],[5,2]] }, { owner: 1, cells: [[8,8]] }],
            characters: [{ id: 'A', player: 0, r: 5, c: 1 }, { id: 'E', player: 1, r: 8, c: 8 }],
            crowns: [null, null], hands: [main, []] });
          state.currentPlayer = 0;
          const pose = avecGrilleTerre(() => plannerCandidatsPose(0))[0] || null;
          const avant = cartesDisponibles(state.players[0]);
          const apres = pose ? withSimulatedState(cloneStateForSimulation(), () =>
            plannerAppliquerAction(pose) ? cartesDisponibles(state.players[0]) : null) : null;
          return { pose, avant, apres, sansObligation: obligationIleRemplie() };
        };
        const payante = posePayante(['MOVE', 'PUSH', 'MAGIC']);
        resultat['POSE payante (2 cartes)'] = { genere: !!payante.pose && payante.sansObligation,
          applique: payante.apres === payante.avant - 2 };
        const fauchee = posePayante(['MAGIC']);
        resultat['pas de POSE sans 2 cartes'] = { genere: !fauchee.pose, applique: !fauchee.pose };
        /* Paquet et pioche réglables : le moteur suit les règles de la partie. */
        const paquet = compositionPaquet({ paquet: { MOVE: 6, PUSH: 3, MAGIC: 2 } });
        resultat['paquet et pioche réglés'] = {
          genere: paquet.length === 11 && paquet.filter(t => t === 'MAGIC').length === 2,
          applique: cartesPiocheesParTour({ rules: { cartesPiochees: 7 } }) === 7
            && cartesPiocheesParTour({ rules: {} }) === 5 && compositionPaquet({}).length === CARD_BLUEPRINTS.length
        };
        /* ROTATION · DECKBUILDING (01/11) : le marché et les cartes fortes.
           Achat : choisi par l'IA (plannerChoisirAchat), payé 2 cartes,
           carte achetée en défausse. Carte forte : Élan vaut 2 Déplacer,
           et un déplacement de 2 cases généré par le planner la consomme. */
        const marche = main => {
          benchPoserPosition({ seed: 7, islandPlacedThisTurn: true, aiPlayer: 0,
            islands: [{ owner: 0, cells: [[5,0],[5,1],[5,2],[5,3]] }, { owner: 1, cells: [[8,8]] }],
            characters: [{ id: 'A', player: 0, r: 5, c: 0 }, { id: 'E', player: 1, r: 8, c: 8 }],
            crowns: [null, null], hands: [main, []] });
          state.currentPlayer = 0;
          state.phase = 'ACTION_SELECT';
          state.winner = null;
          state.rotation = { but: 'couronnes', couches: { deckbuilding: true },
            marche: { visibles: ['BELIER', 'ELAN', 'MAGIC'], pile: ['PUSH'], achatTour: 0, exils: {}, affiner: {} } };
        };
        marche(['MOVE', 'MOVE', 'PUSH', 'MAGIC', 'MOVE']);
        const achat = plannerChoisirAchat(0);
        resultat['ACHAT au marché'] = { genere: !!achat,
          applique: !!achat && withSimulatedState(cloneStateForSimulation(), () => {
            const avant = cartesDisponibles(state.players[0]);
            const visee = state.rotation.marche.visibles[achat.index];
            return paquetAcheter(achat.index, false) && cartesDisponibles(state.players[0]) === avant - 2
              && state.players[0].discard.some(c => c.action === visee) && !!paquetRefusAchat(state.players[0]);
          }) };
        marche(['ELAN']);
        const elan = avecGrilleTerre(() => plannerCandidatsMove(0)).find(a => a.cost === 2) || null;
        resultat['carte forte (Élan = 2)'] = { genere: availableActionCount('MOVE') === 2 && !!elan,
          applique: !!elan && withSimulatedState(cloneStateForSimulation(), () =>
            !!plannerAppliquerAction(elan) && availableActionCount('MOVE') === 0
            && state.players[0].discard.some(c => c.action === 'ELAN')) };
        /* ROTATION · CHOIX DE DÉPART : l'IA prend une carte révélée, qui
           remplace un Déplacer de son paquet. */
        marche(['MOVE', 'MOVE', 'PUSH', 'MAGIC', 'MOVE']);
        state.players[0].deck = [{ id: 'd1', action: 'MOVE' }, { id: 'd2', action: 'MOVE' }];
        state.rotation.choix = { cartes: ['BELIER', 'MOVE'], ordre: [0, 1], pris: [], fini: false };
        const depart = plannerChoisirDepart(0);
        resultat['CHOIX de départ'] = { genere: !!depart,
          applique: !!depart && withSimulatedState(cloneStateForSimulation(), () => {
            const p = state.players[0];
            const moves = paquetCompte(p, 'MOVE');
            const visee = state.rotation.choix.cartes[depart.index];
            return choixPrendre(depart.index) && paquetCompte(p, 'MOVE') === moves - 1
              && paquetCompte(p, visee) >= 1 && state.rotation.choix.pris.length === 1;
          }) };
        /* ROTATION · CRÉATURES : une créature se pousse comme un gardien, et
           le butin (carte gratuite ou exil) est pris par l'IA. */
        marche(['PUSH', 'MOVE', 'MOVE', 'MOVE', 'MOVE', 'MOVE', 'MOVE', 'MOVE', 'MOVE']);
        state.rotation.couches.creatures = true;
        state.rotation.creatures = { espece: 'loup', oeufs: [], prochainId: 2, butins: { 0: 1 } };
        state.characters.push({ id: 'creature-1', player: -1, creature: 'loup', r: 5, c: 1 });
        const pousseCreature = avecGrilleTerre(() => plannerCandidatsPush(0)).find(a => a.r === 5 && a.c === 1) || null;
        resultat['PUSH créature'] = { genere: !!pousseCreature,
          applique: !!pousseCreature && withSimulatedState(cloneStateForSimulation(), () => {
            const avant = characterById('creature-1');
            return !!plannerAppliquerAction(pousseCreature) && (!characterById('creature-1')
              || characterById('creature-1').c !== 1 || characterById('creature-1').r !== 5) && !!avant;
          }) };
        const butin = plannerChoisirButin(0);
        resultat['BUTIN de créature'] = { genere: butin !== null,
          applique: butin !== null && withSimulatedState(cloneStateForSimulation(), () => {
            const avant = paquetTaille(state.players[0]);
            return creaturesPrendreButin(butin) && creaturesButinEnAttente(0) === 0
              && paquetTaille(state.players[0]) !== avant;
          }) };
        state.characters = state.characters.filter(c => !c.creature);
        state.rotation = null;
        /* MURS ÉTOILÉS (murs.js, 14/11) : un mur bloque le passage et sert de
           garde-fou ; l'IA le pousse et le fait tourner (le mur seul, ou
           l'île avec lui). */
        benchPoserPosition({ seed: 7, islandPlacedThisTurn: true, aiPlayer: 0,
          islands: [{ owner: 0, cells: [[5,0],[5,1],[5,2],[5,3],[5,4]] }, { owner: 1, cells: [[8,8]] }],
          characters: [{ id: 'A', player: 0, r: 5, c: 2 }, { id: 'B', player: 1, r: 5, c: 4 }, { id: 'E', player: 1, r: 8, c: 8 }],
          crowns: [null, null], hands: [['PUSH', 'PUSH', 'MOVE'], []] });
        state.currentPlayer = 0;
        state.murs = [{ id: 'm1', o: 'v', i: 5, j: 3, n: 1 }, { id: 'm2', o: 'v', i: 5, j: 5, n: 1 }];
        const pousseMur = avecGrilleTerre(() => plannerCandidatsPush(0)).find(a => a.type === 'POUSSER_MUR' && a.murId === 'm1') || null;
        resultat['MUR bloque et garde-fou'] = {
          genere: !movementRange(characterById('A'), 1).has(key(5, 3)) && !!movementRange(characterById('A'), 3).size,
          applique: resoudrePousseeBloc(5, 4, 0, 1, 1) === null };
        resultat['POUSSER_MUR'] = { genere: !!pousseMur,
          applique: !!pousseMur && withSimulatedState(cloneStateForSimulation(), () =>
            !!plannerAppliquerAction(pousseMur) && murParId('m1').j === 4 && availableActionCount('PUSH') === 2 - pousseMur.force) };
        benchPoserPosition({ seed: 7, islandPlacedThisTurn: true, aiPlayer: 0,
          islands: [{ owner: 0, cells: [[3,1],[3,2],[3,3]] }, { owner: 1, cells: [[8,8]] }],
          characters: [{ id: 'A', player: 0, r: 3, c: 3 }, { id: 'E', player: 1, r: 8, c: 8 }],
          crowns: [{ r: 3, c: 3, carrierId: 'A', active: true }, null],
          hands: [['MAGIC'], []] });
        state.currentPlayer = 0;
        state.murs = [{ id: 'm1', o: 'h', i: 3, j: 1, n: 2 }];
        const magieMur = avecGrilleTerre(() => plannerCandidatsMagic(0)).find(a => a.mode === 'deux') || null;
        resultat['MAGIC île et mur'] = { genere: !!magieMur,
          applique: !!magieMur && withSimulatedState(cloneStateForSimulation(), () => {
            const avant = JSON.stringify(state.murs);
            return !!plannerAppliquerAction(magieMur) && JSON.stringify(state.murs) !== avant && availableActionCount('MAGIC') === 0;
          }) };
        const murSeul = withSimulatedState(cloneStateForSimulation(), () => {
          const action = { type: 'MAGIC', islandId: state.islands[0].id, pivot: [3, 1], direction: 1, turns: 1, mode: 'mur' };
          const cellules = JSON.stringify(state.islands[0].cells);
          return !!plannerAppliquerAction(action) && JSON.stringify(state.islands[0].cells) === cellules
            && murParId('m1').o === 'v';
        });
        resultat['MAGIC mur seul'] = { genere: murSeul, applique: murSeul };
        state.murs = [];
        // Les gratuites selon le moteur.
        resultat.gratuites = ['RAMASSAGE', 'DEPOT', 'TRANSMISSION', 'VOL']
          .filter(t => !plannerActionGratuite({ type: t }));
        return resultat;
      }; window.ILYOS_BENCH = {`;
      await route.fulfill({ contentType: 'application/javascript', body: source.replace('window.ILYOS_BENCH = {', hook) });
    });
    await page.goto(process.env.ILYOS_BENCH_URL || 'http://localhost:8123/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.TEST_COUVERTURE === 'function', null, { timeout: 60000 });
    const r = await page.evaluate(() => window.TEST_COUVERTURE());
    let ok = 0, total = 0;
    for (const [nom, v] of Object.entries(r)) {
      if (nom === 'gratuites') continue;
      total++;
      const bon = v.genere && v.applique;
      if (bon) ok++;
      console.log(`${bon ? 'ok ' : 'KO '} ${nom.padEnd(22)} générée ${v.genere ? 'oui' : 'NON'} · appliquée ${v.applique ? 'oui' : 'NON'}`);
    }
    assert.deepEqual(r.gratuites, [], `actions gratuites dans le jeu mais payantes pour l'IA : ${r.gratuites}`);
    console.log('ok  ramassage, dépôt, transmission, vol : gratuits pour l’IA comme dans le jeu');
    assert.equal(ok, total, `${total - ok} action(s) de joueur absente(s) de l'IA`);
    console.log(`verif-couverture-regles : ${ok}/${total}`);
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
