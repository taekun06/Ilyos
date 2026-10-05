/* CALIBRAGE DES ENJEUX — ce que valent VRAIMENT les situations que
   l'évaluateur note.

     1. Collecte (positions de fin de tour de parties Expert contre Expert) :
          ILYOS_POSITIONS=positions.jsonl node scripts/selfplay-rapide.js 100 7000 3
     2. Analyse (serveur du même build, `npm start`) :
          node scripts/calibrage-enjeux.js positions.jsonl

   Pour chaque position de fin de tour, vue par le joueur X qui vient de jouer,
   on lit ce que l'évaluateur voit (ILYOS_SELFPLAY.caracteristiques) et l'on
   regarde ce qui s'est passé ENSUITE dans la partie :

   A. COURONNES. Par porteur (moi, au sol, lui) et distance à mon village :
      probabilité que X la valide, que Y la valide (dans les 4 demi-tours, et
      d'ici la fin). Sa valeur réelle pour X est alors
      4 000 × (P(X la valide) − P(Y la valide)) — un point vaut 4 000 dans la
      note (PLAN_POIDS.pointValide). On la compare à ce que la note lui donne
      (table de distance + course).
   B. GARDIENS. Gravité d'expulsion estimée par l'évaluateur, contre la
      fréquence réelle d'éjection au demi-tour adverse suivant.
   C. NOTE. Note de fin de tour par tranche, contre le résultat final.

   Une mesure, pas un verdict : la valeur réelle dépend du niveau des deux
   joueurs (ici l'Expert contre lui-même). */

const fs = require('fs');
const { chromium } = require('playwright');

const URL_JEU = process.env.ILYOS_URL || 'http://localhost:8123/';
const fichier = process.argv[2];
if (!fichier) { console.error('usage : node scripts/calibrage-enjeux.js positions.jsonl'); process.exit(2); }
const COURSE = Number(process.env.ILYOS_COURSE ?? 60);
const HORIZON = 4;

(async () => {
  const lignes = fs.readFileSync(fichier, 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(l => l.fin);
  const parties = new Map();
  for (const l of lignes) {
    const cle = `${l.graine}/${l.campA}`;
    if (!parties.has(cle)) parties.set(cle, []);
    parties.get(cle).push(l);
  }

  const navigateur = await chromium.launch({ headless: true });
  const page = await navigateur.newPage({ viewport: { width: 640, height: 400 } });
  page.on('pageerror', e => console.error('[page]', e.message));
  await page.goto(URL_JEU, { timeout: 120000 });
  await page.waitForFunction(() => typeof window.ILYOS_SELFPLAY?.caracteristiques === 'function', null, { timeout: 60000 });
  await page.evaluate(() => { window.ILYOS_BENCH.vitesse(0.05); window.ILYOS_TEST.playAIvsAI({ difficulty: 'expert', maxTurns: 1 }); });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { window.ILYOS_TEST.stopAutoplay?.(); window.ILYOS_BENCH.reinitialiser(); window.requestAnimationFrame = () => 0; });

  const couronnes = [], gardiens = [], notes = [], prets = [];
  // Contrôle : validations détectées contre points réellement marqués.
  const controle = { detectees: 0, marques: 0 };
  let n = 0;
  for (const [, plis] of parties) {
    plis.sort((a, b) => a.i - b.i);
    const vues = [];
    for (const p of plis) {
      vues.push(await page.evaluate(([j, x]) => window.ILYOS_SELFPLAY.caracteristiques(j, x), [p.fin, p.joueur]));
      if (++n % 200 === 0) console.error(`${n} positions lues`);
    }
    /* Validations : le score de P augmente au début de son tour, donc entre la
       fin du demi-tour adverse (k−1) et la fin du sien (k). La couronne est
       celle que P portait, prête, à la fin du demi-tour k−1. */
    const validations = [];
    for (let k = 1; k < vues.length; k++) {
      const P = plis[k].joueur;
      const gain = vues[k].scores[P] - vues[k - 1].scores[P];
      if (gain <= 0) continue;
      const pretes = vues[k - 1].couronnes.filter(c => c.porteurId && c.surValidation
        && vues[k - 1].gardiens.find(g => g.id === c.porteurId)?.player === P);
      for (const c of pretes.slice(0, gain)) validations.push({ k, P, id: c.id });
    }
    const final = vues[vues.length - 1].scores;
    controle.detectees += validations.length;
    controle.marques += final[0] + final[1];

    for (let t = 0; t < vues.length; t++) {
      const X = plis[t].joueur, Y = 1 - X, v = vues[t];
      const apres = (P, id, h) => validations.some(e => e.P === P && e.id === id && e.k > t && e.k <= t + h);
      for (const c of v.couronnes) {
        couronnes.push({
          porteur: c.porteur || 'sol', dm: c.dm, dl: c.dl, prete: c.surValidation,
          moiH: apres(X, c.id, HORIZON), luiH: apres(Y, c.id, HORIZON),
          moiFin: apres(X, c.id, 1e9), luiFin: apres(Y, c.id, 1e9),
          note: c.valeur + COURSE * (eff(c.dl) - eff(c.dm))
        });
      }
      // Éjections au demi-tour adverse suivant (pas de validation possible pour X entre-temps).
      if (t + 1 < vues.length) {
        const restants = new Set(vues[t + 1].gardiens.map(g => g.id));
        for (const g of v.gardiens.filter(g => g.player === X)) {
          gardiens.push({ gravite: g.gravite, porteur: g.porteur, ejecte: !restants.has(g.id) });
        }
      }
      notes.push({ note: v.note, resultat: Math.sign(final[X] - final[Y]) });
      // D. Porteurs prêts : que devient le point au tour suivant ?
      if (t + 2 < vues.length) {
        for (const c of v.couronnes.filter(c => c.porteur === 'moi' && c.surValidation)) {
          const w = vues[t + 1], z = vues[t + 2];
          const g = w.gardiens.find(x => x.id === c.porteurId);
          const cw = w.couronnes.find(x => x.id === c.id);
          const issue = z.scores[X] > w.scores[X] ? 'marqué'
            : !g ? 'porteur éjecté'
            : !cw || cw.porteurId !== c.porteurId ? 'couronne volée ou perdue'
            : g.r !== c.r || g.c !== c.c ? 'porteur déplacé (pivot, poussée)'
            : 'village bloqué ou autre';
          prets.push({ issue, gravite: c.gravite });
        }
      }
    }
  }
  await navigateur.close();

  console.log(`\n${parties.size} parties, ${n} positions de fin de tour`);
  console.log(`validations attribuées à une couronne : ${controle.detectees} sur ${controle.marques} points marqués\n`);

  console.log(`A. COURONNES — vue par X qui vient de jouer ; « prête » = porteur sur une case de validation libre`);
  console.log(`   valeur réelle = 4000 × (P(X valide d'ici la fin) − P(Y valide d'ici la fin)) ; note = table + course ${COURSE}`);
  console.log('porteur  dist.moi  n     X≤4   Y≤4   X fin  Y fin   réelle   note');
  const tranche = d => !Number.isFinite(d) || d >= 30 ? '30+' : d >= 7 ? '7-29' : d >= 4 ? '4-6' : String(Math.round(d));
  const ordreT = ['0', '1', '2', '3', '4-6', '7-29', '30+'];
  for (const porteur of ['moi', 'sol', 'lui']) {
    for (const t of ordreT) {
      const lot = couronnes.filter(c => c.porteur === porteur && tranche(c.dm) === t);
      if (lot.length < 5) continue;
      const p = f => lot.filter(f).length / lot.length;
      const reelle = 4000 * (p(c => c.moiFin) - p(c => c.luiFin));
      const note = lot.reduce((s, c) => s + c.note, 0) / lot.length;
      console.log(`${porteur.padEnd(8)} ${t.padStart(6)}  ${String(lot.length).padStart(5)} ${pct(p(c => c.moiH))} ${pct(p(c => c.luiH))} ${pct(p(c => c.moiFin))} ${pct(p(c => c.luiFin))} ${String(Math.round(reelle)).padStart(8)} ${String(Math.round(note)).padStart(6)}`);
    }
  }
  const pretes = couronnes.filter(c => c.porteur === 'moi' && c.prete);
  if (pretes.length) {
    const p = f => pretes.filter(f).length / pretes.length;
    console.log(`porteur PRÊT (moi, sur validation libre) : n ${pretes.length}, validée au tour suivant ${pct(p(c => c.moiH))}, reprise par lui ${pct(p(c => c.luiFin))}`);
  }

  console.log(`\nD. PORTEURS PRÊTS en fin de tour (${prets.length}) : issue au tour suivant`);
  const issues = {};
  prets.forEach(x => { issues[x.issue] = (issues[x.issue] || 0) + 1; });
  for (const [k, v] of Object.entries(issues).sort((a, b) => b[1] - a[1])) {
    const g = prets.filter(x => x.issue === k).reduce((s, x) => s + x.gravite, 0) / v;
    console.log(`  ${k.padEnd(34)} ${String(v).padStart(4)}  ${pct(v / prets.length)}   gravité estimée moyenne ${g.toFixed(2)}`);
  }

  console.log('\nB. GARDIENS DE X — gravité d\'expulsion estimée contre éjection réelle au demi-tour adverse');
  console.log('gravité        n      éjecté (porteurs)  éjecté (autres)');
  for (const [nom, lo, hi] of [['0', 0, 0], ['0–0,3', 1e-9, 0.3], ['0,3–0,7', 0.3, 0.7], ['≥ 0,7', 0.7, 9]]) {
    const lot = gardiens.filter(g => g.gravite >= lo && (hi === 0 ? g.gravite === 0 : g.gravite < hi));
    const por = lot.filter(g => g.porteur), aut = lot.filter(g => !g.porteur);
    const f = l => l.length ? `${pct(l.filter(g => g.ejecte).length / l.length)} (${l.length})` : '   —';
    console.log(`${nom.padEnd(12)} ${String(lot.length).padStart(5)}   ${f(por).padStart(14)}   ${f(aut).padStart(14)}`);
  }

  console.log('\nC. NOTE DE FIN DE TOUR (vue par X) contre RÉSULTAT FINAL de X');
  console.log('note              n     gagne  nul   perd');
  for (const [nom, lo, hi] of [['< −6000', -1e9, -6000], ['−6000…−2000', -6000, -2000], ['−2000…2000', -2000, 2000],
    ['2000…6000', 2000, 6000], ['> 6000', 6000, 1e9]]) {
    const lot = notes.filter(x => x.note >= lo && x.note < hi);
    if (!lot.length) continue;
    const p = r => lot.filter(x => x.resultat === r).length / lot.length;
    console.log(`${nom.padEnd(15)} ${String(lot.length).padStart(5)}  ${pct(p(1))} ${pct(p(0))} ${pct(p(-1))}`);
  }
})().catch(e => { console.error(e); process.exit(1); });

function eff(d) { return !Number.isFinite(d) || d >= 99 ? 16 : Math.min(16, d >= 30 ? d - 30 + 2 : d); }
function pct(x) { return `${(100 * x).toFixed(0).padStart(4)}%`; }
