const { test, expect } = require('@playwright/test');

/* L'ECHELLE D'AIDE, exercee pour de vrai.

   Les autres harnais jouent vite : ils n'ont jamais laisse l'aide monter, si
   bien que le palier 4 — le Fantome, huitieme signe du parcours — n'avait
   jamais ete vu s'executer. Celui-ci ne fait RIEN et regarde monter les quatre
   paliers : le compagnon, l'Appel, la Promesse, puis la silhouette.

   Il verifie aussi que la balise n'efface pas ce qu'elle designe : sa colonne
   de lumiere recouvrait entierement le Gardien pose sur la case eclairee. */
test.setTimeout(240000);

test("l'aide monte jusqu'au Fantome, sans effacer le Gardien", async ({ page }) => {
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('/');
  const menu = page.frameLocator('iframe[src*="menu/frame.html"]');
  await menu.locator('[data-action="tutorial"]').first().click();
  await page.waitForFunction(() => window.ILYOS_TUTORIAL?._debug()?.pret, null, { timeout: 30000 });

  // On franchit « l'eveil » et « le nom » pour atteindre « le premier pas »,
  // seule etape du debut qui declare un fantome.
  const box = await page.locator('#kaykitCanvas').boundingBox();
  await page.mouse.move(box.x + box.width * .55, box.y + box.height * .45);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .72, box.y + box.height * .58, { steps: 10 });
  await page.mouse.up();
  await page.waitForFunction(() => {
    const d = window.ILYOS_TUTORIAL._debug();
    return d?.id === 'nom' && !d.souffle;
  }, null, { timeout: 30000 });
  let d = await page.evaluate(() => window.ILYOS_TUTORIAL._debug());
  const g = d.chars[0];
  await page.locator('#ov2Move').click({ force: true });
  await page.locator(`.cell[data-r="${g.r}"][data-c="${g.c}"]`).dispatchEvent('click');
  await page.waitForFunction(() => {
    const d = window.ILYOS_TUTORIAL._debug();
    return d?.id === 'premier-pas' && !d.souffle;
  }, null, { timeout: 30000 });

  // Puis on ne fait PLUS RIEN. L'aide doit monter jusqu'au palier 4.
  await page.waitForFunction(() => window.ILYOS_TUTORIAL._debug()?.aide >= 3, null, { timeout: 40000 });
  await page.screenshot({ path: 'test-results/fantome/3-promesse.png' });

  // Le fantome ne dure que ~2,5 s : on l'attend au lieu de l'echantillonner.
  await page.waitForFunction(() => window.ILYOS_TUTORIAL._debug()?.fantome === true, null, { timeout: 30000 });
  await page.screenshot({ path: 'test-results/fantome/4-fantome.png' });
  // Au milieu de son trajet : PAUSE 500 + la moitie de ALLER 1700.
  await page.waitForTimeout(1350);
  await page.screenshot({ path: 'test-results/fantome/5-fantome-en-route.png' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/fantome/6-fantome-arrive.png' });
  const gardien = await page.evaluate(() => {
    const k = window.kaykit3D;
    const id = window.ILYOS_TUTORIAL._debug().chars[0].id;
    const v = k.characterVisuals?.get(String(id));
    if (!v) return 'visuel absent';
    const w = v.wrapper;
    let meshes = 0, visibles = 0, opacites = [];
    w.traverse(o => { if (o.isMesh) { meshes++; if (o.visible) visibles++;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      opacites.push(Math.round((m?.opacity ?? 1) * 100) / 100); } });
    return { dansScene: !!w.parent, visible: w.visible, meshes, visibles,
             opacites: [...new Set(opacites)] };
  });
  console.log('GARDIEN REEL', JSON.stringify(gardien));
  // Le Gardien reste entier pendant que son fantome joue : le clone ne lui
  // prend rien.
  expect(gardien.dansScene).toBe(true);
  expect(gardien.visible).toBe(true);
  expect(gardien.visibles).toBe(gardien.meshes);
  expect(gardien.opacites).toEqual([1]);
  d = await page.evaluate(() => window.ILYOS_TUTORIAL._debug());
  console.log('PALIER', d.aide, 'fantome', d.fantome);
  expect(d.aideMax).toBe(4);
  console.log('ERREURS', JSON.stringify(errs));
  expect(errs).toEqual([]);
});
