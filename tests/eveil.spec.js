const { test, expect } = require('@playwright/test');
const dir = 'test-results/eveil';
const dbg = page => page.evaluate(() => window.ILYOS_TUTORIAL._debug());
const clickCell = (page, r, c) =>
  page.locator(`.cell[data-r="${r}"][data-c="${c}"]`).dispatchEvent('click');

test('Actes I et II se jouent du bouton Tutoriel', async ({ page }) => {
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

  // Fin de l'acte II.
  await page.waitForSelector('.tuto-end', { timeout: 30000 });
  await page.screenshot({ path: dir + '/10-fin-acte-II.png' });
  d = await dbg(page);
  console.log('TRACE', JSON.stringify(d.trace));
  console.log('ERREURS', JSON.stringify(errs), JSON.stringify(cons.slice(0, 3)));
  // Huit etapes, franchies une seule fois chacune.
  expect(d.trace.map(t => t.id)).toEqual([
    'eveil', 'nom', 'premier-pas', 'limite', 'batir', 'second', 'lueur', 'relais'
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
