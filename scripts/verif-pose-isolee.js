/* Contrôle de la GÉNÉRATION DES POSES.

     node scripts/verif-pose-isolee.js

   Une île se pose n'importe où sur le plateau : elle n'a pas à prolonger une
   île existante, et peut rester entièrement isolée au milieu du vide. C'est une
   propriété majeure du jeu, pas une exception.

   Le pré-classement historique répond pourtant à une question unique — la
   distance à UNE cible automatique, plus la distance à mes propres gardiens.
   Ses meilleures poses se regroupent donc autour du même point, tout près de là
   où je suis déjà. Une pose isolée à l'autre bout du plateau mourait avant
   d'atteindre l'évaluateur, et aucune note ne pouvait le signaler : un coup
   jamais généré ne peut pas être choisi.

   Ce banc ne mesure donc pas un score. Il vérifie qu'une idée EXISTE dans la
   liste soumise à la recherche.                                              */

const { chromium } = require('playwright');
const ORIGINE = process.env.ILYOS_BENCH_URL || 'http://localhost:8123/';

/* Deux îles minuscules aux extrémités : tout le centre du plateau est libre, et
   rien ne relie les deux camps. Toute pose visant le centre est donc isolée. */
const ILE_IA = { shapeKey: 'line3', owner: 0, cells: [[9, 1], [9, 2], [9, 3]] };
const ILE_ADVERSE = { shapeKey: 'line3', owner: 1, cells: [[1, 7], [1, 8], [1, 9]] };

const SCENARIOS = [
  {
    id: 'A',
    nom: 'Pose isolée contre une couronne lointaine',
    /* NON-RÉGRESSION, pas une capacité nouvelle : mesuré familles coupées, ce
       cas passe déjà. La couronne libre EST la cible automatique du classement
       historique, qui vise donc juste ici. Ce sont B et C qui discriminent. */
    /* Un gardien qui apparaît À CÔTÉ d'une couronne libre la ramasse
       gratuitement. C'est la pose la plus forte de la position, et elle est
       nécessairement isolée.

       La couronne repose sur un îlot solitaire, loin des deux camps : le
       sanctuaire ne conviendrait pas, ses quatre voisines étant du terrain, si
       bien qu'aucune île ne peut s'y poser contre. */
    spec: {
      seed: 401, islandPlacedThisTurn: false,
      hands: { 0: ['MOVE'], 1: [] },
      islands: [
        ILE_IA, ILE_ADVERSE,
        { shapeKey: 'line3', owner: 1, cells: [[7, 8], [7, 9], [7, 10]] }
      ],
      characters: [{ id: 'ia-1', player: 0, r: 9, c: 2 }, { id: 'adv-1', player: 1, r: 1, c: 8 }],
      crowns: [{ r: 7, c: 9, active: true }]
    },
    verifier(poses) {
      /* Le critère est « loin de MOI », pas « loin de tout terrain » : c'est la
         distance à mes propres gardiens que le classement historique pénalise,
         et c'est elle qui tuait l'idée. Mon gardien est en (9,2). */
      const contreCouronne = poses.filter(p =>
        Math.abs(p.spawn[0] - 7) + Math.abs(p.spawn[1] - 9) <= 1);
      const loinDeMoi = contreCouronne.filter(p =>
        Math.abs(p.spawn[0] - 9) + Math.abs(p.spawn[1] - 2) >= 6);
      return {
        ok: loinDeMoi.length > 0,
        detail: `${poses.length} pose(s), ${contreCouronne.length} avec apparition`
          + ` contre la couronne, dont ${loinDeMoi.length} à plus de 6 cases de mon gardien`
      };
    }
  },
  {
    id: 'B',
    nom: 'Pose isolée sur le village adverse',
    /* Occuper une des trois cases du village adverse y interdit toute
       validation. Le village est hors d'atteinte de mes gardiens : seule une
       pose isolée peut y placer quelqu'un. */
    spec: {
      seed: 402, islandPlacedThisTurn: false,
      hands: { 0: ['MOVE'], 1: [] },
      islands: [ILE_IA, ILE_ADVERSE],
      characters: [
        { id: 'ia-1', player: 0, r: 9, c: 2 },
        { id: 'adv-1', player: 1, r: 1, c: 8, carriesCrown: true }
      ],
      crowns: [{ r: 1, c: 8, active: true, carrier: 'adv-1' }]
    },
    verifier(poses) {
      /* Villages du joueur 1 : (0,10) et (10,0), trois cases chacun. */
      const zones = [[0, 10], [1, 10], [0, 9], [10, 0], [9, 0], [10, 1]];
      const surVillage = poses.filter(p =>
        zones.some(([r, c]) => p.spawn[0] === r && p.spawn[1] === c));
      return {
        ok: surVillage.length > 0,
        detail: `${poses.length} pose(s), ${surVillage.length} faisant apparaître`
          + ` un gardien sur une case de validation adverse`
      };
    }
  },
  {
    id: 'C',
    nom: 'Familles d’intentions distinctes dans la liste',
    /* Dix variantes d'une même idée ne doivent pas pouvoir évincer une idée
       d'une autre nature. Chaque famille a ses propres places. */
    spec: {
      seed: 403, islandPlacedThisTurn: false,
      hands: { 0: ['MOVE'], 1: [] },
      islands: [ILE_IA, ILE_ADVERSE],
      characters: [
        { id: 'ia-1', player: 0, r: 9, c: 2 },
        { id: 'adv-1', player: 1, r: 1, c: 8, carriesCrown: true }
      ],
      crowns: [
        { r: 1, c: 8, active: true, carrier: 'adv-1' },
        { r: 5, c: 5, active: true }
      ]
    },
    verifier(poses) {
      const familles = [...new Set(poses.map(p => p.but).filter(Boolean))];
      return {
        ok: familles.length >= 3,
        detail: `${familles.length} famille(s) représentée(s) : ${familles.join(', ')}`
      };
    }
  }
];

async function main() {
  const navigateur = await chromium.launch({ headless: true });
  const page = await navigateur.newPage({ viewport: { width: 1280, height: 800 } });
  const incidents = [];
  page.on('pageerror', e => incidents.push('exception: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') incidents.push('console.error: ' + m.text()); });

  await page.goto(ORIGINE);
  await page.waitForFunction(() => typeof window.ILYOS_TEST?.playAIvsAI === 'function', null, { timeout: 45000 });
  await page.evaluate(() => window.ILYOS_TEST.playAIvsAI({ difficulty: 'expert', maxTurns: 1 }));
  await page.waitForFunction(() => window.ILYOS_TEST.autoplay?.active === true, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.ILYOS_TEST.stopAutoplay?.());
  await page.waitForFunction(() => typeof window.ILYOS_BENCH?.candidatsPose === 'function', null, { timeout: 15000 });
  await page.evaluate(() => window.ILYOS_BENCH.reinitialiser());
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.ILYOS_BENCH.reinitialiser());

  console.log('');
  console.log('POSES ISOLÉES — CE QUE LA RECHERCHE SE VOIT PROPOSER');
  console.log('='.repeat(72));

  let reussis = 0;
  for (const s of SCENARIOS) {
    let resultat;
    try {
      const poses = await page.evaluate(spec => window.ILYOS_BENCH.candidatsPose(spec), s.spec);
      resultat = s.verifier(poses);
    } catch (erreur) {
      resultat = { ok: false, detail: 'erreur : ' + (erreur && erreur.message || erreur) };
    }
    if (resultat.ok) reussis++;
    console.log(`${s.id} ${s.nom}`.padEnd(58, '.') + ` ${resultat.ok ? 'OK' : 'ÉCHEC'}`);
    console.log(`      ${resultat.detail}`);
  }

  console.log('='.repeat(72));
  console.log(`${reussis} / ${SCENARIOS.length} capacités présentes`);
  console.log(`Incidents console : ${incidents.length ? incidents.join(' | ') : 'aucun'}`);

  await navigateur.close();
  process.exitCode = reussis === SCENARIOS.length && incidents.length === 0 ? 0 : 1;
}

main().catch(e => { console.error(e); process.exit(1); });
