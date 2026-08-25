/* Test de fumée : une partie entière, IA contre IA, dans un vrai navigateur.

   Ce que ce test couvre, sans écrire une seule règle du jeu : le chargement de
   la page et de ses cinq bibliothèques 3D, la préparation d'une partie depuis
   le menu, la pose automatique d'une île à chaque tour, l'apparition des
   gardiens, les déplacements, les poussées, la magie, le ramassage et le
   transport des couronnes, le décompte des points, l'alternance des tours et la
   détection du vainqueur. Autrement dit : la quasi-totalité de ce qui casse une
   partie.

   Il s'appuie sur `window.ILYOS_TEST`, le harnais déjà présent dans
   js/game/diagnostics.js — rien n'a été ajouté au jeu pour ce test.

   Mesuré en local (Expert contre Expert, plateau classique 11x11) : la partie
   se conclut en 37 tours et 3 min 45 s, sans un seul message d'erreur. */

const { test, expect } = require('@playwright/test');
const { surveillerIncidents, formaterIncidents } = require('./surveillance');

/* Budget de tours confié à l'autoplay. Une partie type en demande 37 ; le
   double et demi laisse de la marge aux parties disputées tout en gardant la
   limite significative : l'atteindre ne veut pas dire « partie un peu longue »,
   mais « l'IA n'arrive plus à conclure ». */
const BUDGET_TOURS = 80;

/* Un tour dure environ six secondes. Passé une minute et demie sans que le
   compteur bouge, la partie est bloquée : autant échouer tout de suite en
   citant le dernier événement connu plutôt que d'attendre l'expiration du
   test un quart d'heure plus tard. */
const BLOCAGE_MS = 90 * 1000;

const SONDAGE_MS = 2 * 1000;
const CHARGEMENT_MS = 45 * 1000;
const DEMARRAGE_MS = 60 * 1000;

/* Instantané de l'autoplay vu depuis la page. Le journal de `ILYOS_AUTOPLAY`
   est la source d'autorité : c'est lui qui observe `state.winner` et qui écrit
   la raison de l'arrêt. */
function lireAutoplay() {
  const autoplay = window.ILYOS_TEST && window.ILYOS_TEST.autoplay;
  if (!autoplay) return null;
  const journal = autoplay.logs || [];
  const dernier = journal[journal.length - 1];
  return {
    active: autoplay.active,
    tour: dernier ? dernier.turn : 0,
    message: dernier ? dernier.message : null
  };
}

async function attendreFinDePartie(page) {
  let dernierTour = -1;
  let dernierMouvement = Date.now();

  for (;;) {
    const etat = await page.evaluate(lireAutoplay);
    if (!etat) throw new Error('Le harnais ILYOS_TEST a disparu de la page en cours de partie.');
    if (!etat.active) return etat;

    if (etat.tour !== dernierTour) {
      dernierTour = etat.tour;
      dernierMouvement = Date.now();
    } else if (Date.now() - dernierMouvement > BLOCAGE_MS) {
      throw new Error(
        `Partie bloquée au tour ${etat.tour} depuis ${BLOCAGE_MS / 1000} s. `
        + `Dernier événement : « ${etat.message} ».`
      );
    }

    await page.waitForTimeout(SONDAGE_MS);
  }
}

async function attendreHarnais(page) {
  await page.waitForFunction(
    () => typeof window.ILYOS_TEST?.playAIvsAI === 'function',
    null,
    { timeout: CHARGEMENT_MS }
  );
}

test.describe('ILYOS de bout en bout', () => {

  test('la page se charge sans ressource manquante et expose son harnais', async ({ page, baseURL }) => {
    const incidents = surveillerIncidents(page, new URL(baseURL).origin);

    await page.goto('/');
    await attendreHarnais(page);

    /* Le menu vit dans une iframe injectée par js/version-bootstrap.js : son
       absence signifierait que le bootstrap n'est pas allé au bout. */
    await expect(page.locator('iframe[src*="menu/frame.html"]')).toHaveCount(1);

    const build = await page.evaluate(() => window.ILYOS_BUILD || null);
    expect(build, "La page n'annonce aucune version de build.").toBeTruthy();

    expect(incidents, formaterIncidents(incidents)).toEqual([]);
  });

  test("une partie IA contre IA se joue jusqu'à la victoire", async ({ page, baseURL }) => {
    const incidents = surveillerIncidents(page, new URL(baseURL).origin);
    const debut = Date.now();

    await page.goto('/');
    await attendreHarnais(page);

    /* playAIvsAI règle le menu (plateau classique, deux joueurs, tous deux en
       IA), lance la partie, puis attend que l'écran de préparation soit
       réellement passé avant de rendre la main aux bots. */
    await page.evaluate(
      budget => window.ILYOS_TEST.playAIvsAI({ difficulty: 'expert', maxTurns: budget }),
      BUDGET_TOURS
    );

    try {
      await page.waitForFunction(
        () => window.ILYOS_TEST.autoplay.active === true,
        null,
        { timeout: DEMARRAGE_MS }
      );
    } catch {
      throw new Error(
        `La partie n'a pas démarré en ${DEMARRAGE_MS / 1000} s. ${formaterIncidents(incidents)}`
      );
    }

    const fin = await attendreFinDePartie(page);

    /* L'autoplay ne s'arrête que pour deux raisons : un vainqueur, ou le budget
       de tours épuisé. Seule la première est un succès. */
    expect(
      fin.message,
      `La partie s'est arrêtée sans vainqueur au tour ${fin.tour} : « ${fin.message} ».`
    ).toMatch(/^Victoire de /);

    expect(incidents, formaterIncidents(incidents)).toEqual([]);

    console.log(`  ${fin.message}, en ${Math.round((Date.now() - debut) / 1000)} s.`);
  });

});
