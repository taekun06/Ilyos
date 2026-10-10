/* Journal des défaites et bouton « Annuler » (js/game/defaites-vue.js).

   Défaite du 09/10, tour 11 : vingt actions consignées pour une dizaine
   réellement jouées. Le bouton Annuler rendait l'état d'avant, mais l'action
   défaite restait au journal, et la visionneuse la rejouait. Ici : un vrai
   déplacement au clic dans une partie solo contre l'Expert, puis Annuler ; le
   tour du journal doit revenir à sa longueur d'avant. */
const { test, expect } = require('@playwright/test');

test("une action annulée disparaît du journal des défaites", async ({ page }) => {
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  await page.addInitScript(() => {
    const descripteur = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    Object.defineProperty(HTMLSelectElement.prototype, 'value', {
      configurable: true,
      get() { return this.id === 'aiDifficultySelect' ? 'expert' : descripteur.get.call(this); },
      set(v) { descripteur.set.call(this, v); }
    });
  });
  await page.goto('/');
  const menu = page.frameLocator('iframe[src*="menu/frame.html"]');
  await menu.locator('[data-mode="solo"]').first().click();
  await menu.locator('text=AFFRONTER LE CPU').first().click();
  await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 40000 });
  const humain = () => page.evaluate(() => {
    const j = window.ILYOS_TEST?.joueurCourant?.();
    return j && !j.ia && window.ILYOS_DEFAITES.journal() ? j.id : null;
  });
  const longueur = () => page.evaluate(() => {
    const j = window.ILYOS_DEFAITES.journal();
    const t = j.tours[j.tours.length - 1];
    const courant = window.ILYOS_TEST.joueurCourant();
    return t && t.joueur === courant.id && t.tour === courant.tour ? (t.actions || []).length : 0;
  });

  /* Les tours humains se terminent par la pose automatique, comme au
     minuteur, jusqu'à ce qu'un gardien humain puisse faire un pas. */
  let depart = null, avant = 0;
  const limite = Date.now() + 8 * 60 * 1000;
  while (!depart && Date.now() < limite) {
    const id = await humain();
    if (id === null) { await page.waitForTimeout(1000); continue; }
    await page.waitForTimeout(800);
    const essais = await page.evaluate(id => {
      const p = window.ILYOS_TEST.plateau();
      const terre = new Set(p.iles.flatMap(i => i.cases.map(([r, c]) => `${r},${c}`)));
      const occupe = new Set(p.gardiens.map(g => `${g.r},${g.c}`));
      return p.gardiens.filter(g => g.joueur === id).flatMap(g => [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .map(([dr, dc]) => [g.r + dr, g.c + dc])
        .filter(([r, c]) => terre.has(`${r},${c}`) && !occupe.has(`${r},${c}`))
        .map(cible => ({ g, cible })));
    }, id);
    for (const { g, cible } of essais) {
      avant = await longueur();
      await page.locator(`.cell[data-r="${g.r}"][data-c="${g.c}"]`).dispatchEvent('click');
      await page.locator(`.cell[data-r="${cible[0]}"][data-c="${cible[1]}"]`).dispatchEvent('click');
      await page.waitForTimeout(300);
      if (await longueur() === avant + 1) { depart = g; break; }
    }
    if (!depart) {
      await page.evaluate(() => window.ILYOS_TEST.terminerTourHumain());
      await page.waitForTimeout(1000);
    }
  }
  expect(depart).not.toBeNull();

  await page.locator('#cancelCardBtn').dispatchEvent('click');
  await expect.poll(() => page.evaluate(d =>
    window.ILYOS_TEST.plateau().gardiens.some(g => g.r === d.r && g.c === d.c), depart)).toBe(true);
  await expect.poll(longueur).toBe(avant);
  expect(erreurs).toEqual([]);
});
