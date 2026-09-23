const { test, expect } = require('@playwright/test');
const dir = 'test-results/eveil';
const dbg = page => page.evaluate(() => window.ILYOS_TUTORIAL._debug());
const clickCell = (page, r, c) =>
  page.locator(`.cell[data-r="${r}"][data-c="${c}"]`).dispatchEvent('click');

/* Le parcours dure, par conception : seize etapes, des plans de camera et des
   cycles de tour joues en vrai. Il depasse donc les 120 s que npm run test:smoke
   accorde par defaut, et declare son propre budget. */
test.setTimeout(300000);

test("L'Eveil se joue en entier du bouton Tutoriel", async ({ page }) => {
  const errs = [], cons = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') cons.push(m.text()); });

  await page.goto('/');
  const menu = page.frameLocator('iframe[src*="menu/frame.html"]');
  await menu.locator('[data-action="tutorial"]').first().click();
  await page.waitForFunction(() => window.ILYOS_TUTORIAL?.mode() === 'eveil');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: dir + '/1-sas-noir.png' });

  // Le sas rend la caméra.
  await page.waitForFunction(() => window.ILYOS_TUTORIAL._debug()?.pret, null, { timeout: 25000 });
  let d = await dbg(page);
  console.log('APRES SAS', JSON.stringify({ id: d.id, compagnon: d.compagnon, verbes: d.verbesVisibles }));
  await page.screenshot({ path: dir + '/2-eveil-compagnon.png' });
  expect(d.id).toBe('eveil');
  expect(d.compagnon).toBe(true);
  expect(d.verbesVisibles).toEqual([]);

  // ETAPE 1 — tourner le monde.
  const box = await page.locator('#kaykitCanvas').boundingBox();
  await page.mouse.move(box.x + box.width * .55, box.y + box.height * .45);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .70, box.y + box.height * .57, { steps: 10 });
  await page.mouse.up();

  // ETAPE 2 — le nom : DEPLACER apparait, on désigne le Gardien.
  await page.waitForFunction(() => {
    const d = window.ILYOS_TUTORIAL._debug();
    return d?.id === 'nom' && !d.souffle;
  }, null, { timeout: 25000 });
  d = await dbg(page);
  console.log('ETAPE NOM', JSON.stringify({ verbes: d.verbesVisibles, chars: d.chars }));
  expect(d.verbesVisibles).toEqual(['move']);
  await page.screenshot({ path: dir + '/3-verbe-deplacer.png' });
  await page.locator('#ov2Move').click({ force: true });
  const g = d.chars[0];
  await page.locator(`.cell[data-r="${g.r}"][data-c="${g.c}"]`).dispatchEvent('click');

  // ETAPE 3 — le premier pas.
  await page.waitForFunction(() => {
    const d = window.ILYOS_TUTORIAL._debug();
    return d?.id === 'premier-pas' && !d.souffle;
  }, null, { timeout: 25000 });
  await page.screenshot({ path: dir + '/4-premier-pas.png' });
  d = await dbg(page);
  const gd = d.chars[0];
  await page.locator('#ov2Move').click({ force: true });
  await page.locator(`.cell[data-r="${gd.r}"][data-c="${gd.c}"]`).dispatchEvent('click');
  // La case de terre libre voisine : le caillou est [[6,5],[6,6],[7,5],[7,6]].
  const voisines = [[gd.r - 1, gd.c], [gd.r, gd.c + 1], [gd.r + 1, gd.c], [gd.r, gd.c - 1]];
  for (const [r, c] of voisines) {
    const existe = await page.locator(`.cell[data-r="${r}"][data-c="${c}"]`).count();
    if (!existe) continue;
    await page.locator(`.cell[data-r="${r}"][data-c="${c}"]`).dispatchEvent('click');
    const bouge = await page.evaluate(g0 => {
      const d = window.ILYOS_TUTORIAL._debug();
      const ch = d?.chars?.[0];
      return ch && (ch.r !== g0.r || ch.c !== g0.c);
    }, gd);
    if (bouge) break;
  }

  // ETAPE 4 — la limite : viser le vide.
  await page.waitForFunction(() => {
    const d = window.ILYOS_TUTORIAL._debug();
    return d?.id === 'limite' && !d.souffle;
  }, null, { timeout: 25000 });
  await page.screenshot({ path: dir + '/5-limite.png' });

  /* ON NE DOIT JAMAIS RESTER SANS UN GESTE JOUABLE.
     Signale en jeu : depenser tous ses deplacements au milieu d'une etape
     laissait la main vide, et comme FIN DU TOUR n'est pas encore acquis, plus
     aucune sortie — le parcours se figeait. Le caillou de l'acte I fait 2x2 :
     on y fait la navette bien au-dela d'une main pleine, et la main doit
     toujours repondre. */
  {
    // Les cases de terre du caillou, lues sur l'etat : viser le vide ne
    // deplacerait rien et le test se mentirait a lui-meme.
    const terres = (await dbg(page)).iles.flatMap(i => i.cells);
    const estTerre = (r, c) => terres.some(([tr, tc]) => tr === r && tc === c);
    let pas = 0;
    for (let i = 0; i < 12; i++) {
      const avant = await dbg(page);
      if (avant.id !== 'limite') break;
      expect(avant.main).toBeGreaterThan(0);
      const moi = avant.chars.find(c => c.p === 0);
      const cible = [[moi.r - 1, moi.c], [moi.r, moi.c + 1], [moi.r + 1, moi.c], [moi.r, moi.c - 1]]
        .find(([r, c]) => estTerre(r, c)
          && !avant.chars.some(ch => ch.r === r && ch.c === c));
      if (!cible) break;
      await page.locator('#ov2Move').click({ force: true });
      await clickCell(page, moi.r, moi.c);
      await clickCell(page, cible[0], cible[1]);
      await page.waitForTimeout(400);
      const apres = (await dbg(page)).chars.find(c => c.p === 0);
      if (apres.r !== moi.r || apres.c !== moi.c) pas++;
    }
    // On a joue plus de pas qu'une seule main n'en contient, sans jamais
    // se retrouver sans carte.
    expect(pas).toBeGreaterThan(5);
    expect((await dbg(page)).main).toBeGreaterThan(0);
  }

  await page.locator('.cell[data-r="9"][data-c="9"]').dispatchEvent('click');

  // ================= ACTE II =================
  // 5. BATIR : le verbe ILE apparait, on pose une terre dans le vide.
  await page.waitForFunction(() => {
    const d = window.ILYOS_TUTORIAL._debug();
    return d?.id === 'batir' && !d.souffle;
  }, null, { timeout: 25000 });
  d = await dbg(page);
  console.log('ETAPE BATIR', JSON.stringify({ verbes: d.verbesVisibles }));
  expect(d.verbesVisibles.sort()).toEqual(['ile', 'move']);
  await page.screenshot({ path: dir + '/6-verbe-ile.png' });

  await page.locator('#ov2Island').click({ force: true });
  await page.locator('.island-choice:not([disabled])').first().click({ force: true });
  /* La forme choisie s'etend vers le bas/la droite depuis son ancre : tous les
     ancrages ne sont pas valides (chevauchement du caillou, bord du ciel). On
     en essaie plusieurs, a l'ecart du caillou (8,2)-(9,3) et du sanctuaire
     central (5,5), jusqu'a ce qu'une ile existe. */
  for (const [r, c] of [[6, 0], [6, 1], [7, 0], [5, 0], [6, 6], [7, 6], [4, 0]]) {
    await clickCell(page, r, c);
    await clickCell(page, r, c);
    if (await page.evaluate(() => !!window.ILYOS_TUTORIAL._debug()?.ilePosee)) break;
  }
  expect(await page.evaluate(() => !!window.ILYOS_TUTORIAL._debug()?.ilePosee)).toBe(true);

  // 6. LE SECOND : le monde demande ou eveiller le nouveau Gardien.
  await page.waitForFunction(() => {
    const d = window.ILYOS_TUTORIAL._debug();
    return d?.id === 'second';
  }, null, { timeout: 25000 });
  await page.screenshot({ path: dir + '/7-invocation.png' });
  d = await dbg(page);
  if (d.chars.length < 2) {
    // Phase PLACE_SPAWN : designer une case de l'ile neuve.
    const libre = await page.evaluate(() => {
      const st = window.ILYOS_TUTORIAL._debug();
      return st.spawnCells?.[0] || null;
    });
    if (libre) await clickCell(page, libre[0], libre[1]);
    else await clickCell(page, 7, 2);
  }
  await page.waitForFunction(() => window.ILYOS_TUTORIAL._debug()?.chars?.length >= 2, null, { timeout: 15000 });

  // 7. LA LUEUR : la Couronne descend sur la terre neuve, on va la prendre.
  await page.waitForFunction(() => {
    const d = window.ILYOS_TUTORIAL._debug();
    return d?.id === 'lueur' && !d.souffle;
  }, null, { timeout: 25000 });
  await page.screenshot({ path: dir + '/8-la-lueur.png' });
  d = await dbg(page);
  expect(d.couronne).toBeTruthy();
  const cr = d.couronne;
  const proche = d.chars.filter(c => c.p === 0)
    .sort((a, b) => (Math.abs(a.r - cr[0]) + Math.abs(a.c - cr[1])) - (Math.abs(b.r - cr[0]) + Math.abs(b.c - cr[1])))[0];
  await page.locator('#ov2Move').click({ force: true });
  await clickCell(page, proche.r, proche.c);
  await clickCell(page, cr[0], cr[1]);
  await page.waitForFunction(() => !!window.ILYOS_TUTORIAL._debug()?.porteur, null, { timeout: 15000 });

  // 8. LE RELAIS : la Couronne passe d'un Gardien a l'autre.
  await page.waitForFunction(() => {
    const d = window.ILYOS_TUTORIAL._debug();
    return d?.id === 'relais' && !d.souffle;
  }, null, { timeout: 25000 });
  await page.screenshot({ path: dir + '/9-le-relais.png' });
  d = await dbg(page);
  const porteur = d.chars.find(c => String(c.id) === String(d.porteur));
  const allie = d.chars.find(c => c.p === 0 && String(c.id) !== String(d.porteur));
  expect(porteur && allie).toBeTruthy();
  /* Deux relais possibles, et le tutoriel doit tenir les deux :
       - cote a cote : on donne la Couronne directement a l'allie ;
       - en diagonale : on la POSE sur la case commune, et l'allie vient l'y
         reprendre. C'est la regle du jeu (handleCrownClick propose les allies
         adjacents ET les cases libres voisines).
     L'etape garantit qu'une de ces deux routes existe — sinon le geste serait
     sans effet et l'etape, un mur. */
  const route = d.relais;
  expect(route).toBeTruthy();
  console.log('RELAIS', route.colle ? 'direct' : 'par la case commune ' + JSON.stringify(route.commune));

  const saisirCouronne = async () => {
    for (let essai = 0; essai < 3; essai++) {
      await page.locator('.carrier-crown').waitFor({ state: 'attached', timeout: 8000 });
      await page.locator('.carrier-crown').dispatchEvent('click');
      await page.waitForTimeout(300);
      if (await page.evaluate(() => window.ILYOS_TUTORIAL._debug()?.phase === 'DROP_TREASURE')) return true;
    }
    return false;
  };

  expect(await saisirCouronne()).toBe(true);
  if (route.colle) {
    await clickCell(page, allie.r, allie.c);
  } else {
    // On la pose sur la case commune...
    await clickCell(page, route.commune[0], route.commune[1]);
    await page.waitForTimeout(700);
    // ...puis le second Gardien vient l'y reprendre.
    await page.locator('#ov2Move').click({ force: true });
    await clickCell(page, allie.r, allie.c);
    await clickCell(page, route.commune[0], route.commune[1]);
  }

  // ================= ACTE III =================
  const attendre = async id => page.waitForFunction(v => {
    const d = window.ILYOS_TUTORIAL._debug();
    return d?.id === v && !d.souffle;
  }, id, { timeout: 30000 });

  // 9. LE RIVAL : POUSSER apparait, on ecarte l'intrus.
  await attendre('rival');
  d = await dbg(page);
  expect(d.verbesVisibles).toContain('push');
  expect(d.rivaux.length).toBe(1);
  await page.screenshot({ path: dir + '/11-le-rival.png' });

  /* La poussee se joue en trois temps : choisir le verbe, designer le
     pousseur et sa cible, puis la DESTINATION — le jeu propose plusieurs
     options (force 1 ou 2, recul ou chute) et attend qu'on tranche. */
  const pousser = async () => {
    const st = await dbg(page);
    const rival = st.rivaux[0];
    if (!rival) return true;
    const moi = st.chars.filter(c => c.p === 0)
      .find(c => Math.abs(c.r - rival.r) + Math.abs(c.c - rival.c) === 1);
    if (!moi) return false;
    const derriere = [rival.r + (rival.r - moi.r), rival.c + (rival.c - moi.c)];
    const bouge = () => page.evaluate(d => {
      const r = window.ILYOS_TUTORIAL._debug()?.rivaux?.[0];
      return !r || r.r !== d.r || r.c !== d.c;
    }, rival);

    await page.locator('#ov2Push').click({ force: true });
    await clickCell(page, moi.r, moi.c);
    await clickCell(page, rival.r, rival.c);
    await page.waitForTimeout(500);
    if (await bouge()) return true;
    await clickCell(page, derriere[0], derriere[1]);
    await page.waitForTimeout(900);
    if (await bouge()) return true;
    // Dernier essai : certaines poussees se declenchent depuis la seule
    // destination, le jeu resolvant lui-meme pousseur et cible.
    await page.locator('#ov2Push').click({ force: true });
    await clickCell(page, derriere[0], derriere[1]);
    await page.waitForTimeout(900);
    return bouge();
  };
  expect(await pousser()).toBe(true);
  /* A cette etape on ECARTE : le rival doit avoir recule sur de la terre, pas
     disparu. Lui voler sa chute ici ruinerait l'etape suivante. */
  expect((await dbg(page)).rivaux.length).toBe(1);

  // 10. LA CHUTE : le rival revient dos au vide, la poussee le fait tomber.
  await attendre('chute');
  await page.screenshot({ path: dir + '/12-la-chute.png' });
  expect(await pousser()).toBe(true);
  await page.waitForFunction(() => window.ILYOS_TUTORIAL._debug()?.rivaux?.length === 0, null, { timeout: 20000 });

  // 11. LE REPENTIR : ANNULER apparait ; on joue un coup, on le reprend.
  await attendre('repentir');
  d = await dbg(page);
  expect(d.verbesVisibles).toContain('undo');
  await page.screenshot({ path: dir + '/13-le-repentir.png' });
  // Un pas, n'importe lequel.
  {
    const st = await dbg(page);
    const g = st.chars.find(c => c.p === 0);
    await page.locator('#ov2Move').click({ force: true });
    await clickCell(page, g.r, g.c);
    const voisines = [[g.r - 1, g.c], [g.r, g.c + 1], [g.r + 1, g.c], [g.r, g.c - 1]];
    for (const [r, c] of voisines) {
      await clickCell(page, r, c);
      await page.waitForTimeout(400);
      if (await page.evaluate(() => window.ILYOS_TUTORIAL._debug()?.undo > 0)) break;
    }
  }
  expect(await page.evaluate(() => window.ILYOS_TUTORIAL._debug()?.undo)).toBeGreaterThan(0);
  // Puis on le reprend.
  await page.locator('#ov2Undo').click({ force: true });
  await page.waitForTimeout(500);

  // 12. LE CIEL SE PLIE : pivoter la barre pour franchir le gouffre.
  await attendre('pivot');
  d = await dbg(page);
  expect(d.verbesVisibles).toContain('magic');
  expect(d.corniche).toBeTruthy();
  await page.screenshot({ path: dir + '/14-le-pivot.png' });

  /* Le pivot du HAUT + demi-tour couche la barre par-dessus le gouffre et
     emporte le Gardien quatre cases plus loin. C'est la decouverte de
     l'etape : le tutoriel ne la souffle jamais, mais le harnais doit la
     jouer pour prouver qu'elle est atteignable. */
  const haut = d.corniche.cells[2];
  await page.locator('#ov2Magic').click({ force: true });
  await clickCell(page, haut[0], haut[1]);
  await page.waitForTimeout(400);
  for (let i = 0; i < 2; i++) {
    await page.locator('#hudV2MagicRotateRight').click({ force: true });
    await page.waitForTimeout(300);
  }
  // La validation est au joueur : on reclique la case pivot.
  await clickCell(page, haut[0], haut[1]);
  await page.waitForTimeout(1200);


  // ================= ACTE IV =================
  // 13. LE VILLAGE : on y amene la Couronne... et il ne se passe rien.
  await attendre('village');
  d = await dbg(page);
  expect(d.zoneVillage).toBeTruthy();
  // Un seul village materialise : celui du porteur, pas le coin oppose.
  expect(d.zoneVillage.length).toBeLessThanOrEqual(3);
  await page.screenshot({ path: dir + '/15-le-village.png' });
  {
    const cible = d.zoneVillage[0];
    for (let essai = 0; essai < 14; essai++) {
      const st = await dbg(page);
      if (st.id !== 'village') break;
      const porteur = st.chars.find(c => String(c.id) === String(st.porteur));
      if (!porteur) break;
      if (porteur.r === cible[0] && porteur.c === cible[1]) break;
      // Un pas a la fois vers le village : le chemin est garanti par l'etape.
      const dr = Math.sign(cible[0] - porteur.r);
      const dc = dr === 0 ? Math.sign(cible[1] - porteur.c) : 0;
      await page.locator('#ov2Move').click({ force: true });
      await clickCell(page, porteur.r, porteur.c);
      await clickCell(page, porteur.r + dr, porteur.c + dc);
      await page.waitForTimeout(500);
    }
  }

  // 14. LE SABLIER : le tour passe, puis la Couronne s'ancre.
  await page.waitForFunction(() => window.ILYOS_TUTORIAL._debug()?.id === 'sablier', null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: dir + '/16-le-sablier.png' });
  await page.waitForFunction(() => window.ILYOS_TUTORIAL._debug()?.score >= 1, null, { timeout: 40000 });

  // 15. LA MAIN QUI S'EPUISE : les piles apparaissent, on depense une carte.
  await attendre('main');
  d = await dbg(page);
  expect(d.main).toBe(3);
  await page.screenshot({ path: dir + '/17-la-main.png' });
  {
    const st = await dbg(page);
    const g = st.chars.find(c => c.p === 0);
    await page.locator('#ov2Move').click({ force: true });
    await clickCell(page, g.r, g.c);
    for (const [r, c] of [[g.r - 1, g.c], [g.r, g.c + 1], [g.r + 1, g.c], [g.r, g.c - 1]]) {
      await clickCell(page, r, c);
      await page.waitForTimeout(400);
      if (await page.evaluate(() => window.ILYOS_TUTORIAL._debug()?.id !== 'main')) break;
    }
  }

  // 16. LA RESERVE : FIN DU TOUR apparait, la carte non jouee est gardee.
  await attendre('reserve');
  d = await dbg(page);
  expect(d.verbesVisibles).toContain('end');
  await page.screenshot({ path: dir + '/18-la-reserve.png' });
  await page.locator('#ov2End').click({ force: true });
  await page.waitForTimeout(1500);

  // Le seuil : les lumieres du parcours s'eteignent.
  await page.waitForSelector('.tuto-end', { timeout: 40000 });
  await page.screenshot({ path: dir + '/19-le-seuil.png' });
  d = await dbg(page);
  console.log('TRACE', JSON.stringify(d.trace));
  console.log('ERREURS', JSON.stringify(errs), JSON.stringify(cons.slice(0, 3)));
  // Huit etapes, franchies une seule fois chacune.
  expect(d.trace.map(t => t.id)).toEqual([
    'eveil', 'nom', 'premier-pas', 'limite',
    'batir', 'second', 'lueur', 'relais',
    'rival', 'chute', 'repentir', 'pivot',
    'village', 'sablier', 'main', 'reserve'
  ]);
  expect(errs).toEqual([]);

  // Aucun texte de consigne nulle part.
  const texte = await page.evaluate(() => {
    const l = document.getElementById('tutorialLayer');
    return [...l.querySelectorAll('.tuto-bubble,.tuto-objective')]
      .map(e => e.textContent.trim()).filter(Boolean);
  });
  expect(texte).toEqual([]);
});
