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
   du mode personnalisé (2 cartes, pose facultative) depuis le 09/10.      */

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
