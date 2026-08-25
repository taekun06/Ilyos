/* Configuration Playwright — un seul usage aujourd'hui : jouer une partie
   entière dans un vrai navigateur et vérifier qu'elle ne casse rien.

   Deux choix méritent une explication.

   • Port dédié 8124. Le serveur de développement du dépôt écoute sur 8123 ;
     une session de travail ouverte à côté occuperait donc le port, et
     `reuseExistingServer` s'y brancherait sans rien dire — le test mesurerait
     alors une autre copie du dépôt que celle qu'on vient de modifier.

   • Aucune reprise (`retries: 0`). Un test de fumée qui a besoin d'être rejoué
     pour passer ne dit plus rien : soit la partie se joue, soit il y a quelque
     chose à regarder. */

const { defineConfig, devices } = require('@playwright/test');

const PORT = Number(process.env.ILYOS_TEST_PORT) || 8124;
const ORIGINE = `http://127.0.0.1:${PORT}`;

module.exports = defineConfig({
  testDir: './tests',

  /* Une partie Expert contre Expert se conclut en ~4 min sur un poste de
     travail. Le plafond est large : un runner GitHub n'a pas de GPU, chaque
     tour y est plus lent, et le test doit échouer sur ce qu'il observe — pas
     sur le chronomètre. */
  timeout: 15 * 60 * 1000,
  expect: { timeout: 15 * 1000 },

  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,

  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: ORIGINE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    viewport: { width: 1280, height: 800 }
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],

  webServer: {
    command: `node scripts/dev-server.js ${PORT}`,
    url: ORIGINE,
    reuseExistingServer: !process.env.CI,
    timeout: 30 * 1000
  }
});
