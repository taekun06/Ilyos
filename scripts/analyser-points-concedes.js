/* POINTS CONCÉDÉS — pourquoi une variante de l'IA perd ses parties.

     1. Rejouer les parties perdues d'un match en relevant les positions :
          ILYOS_PARTIES="14000/0,14003/1" ILYOS_POSITIONS=pos.jsonl \
          ILYOS_POIDS_A='{…}' ILYOS_POIDS_B='{…}' node scripts/selfplay-rapide.js 2 14000 2
     2. Analyser (serveur du même build) :
          ILYOS_POIDS_A='{…}' ILYOS_POIDS_B='{…}' node scripts/analyser-points-concedes.js pos.jsonl

   Pour chaque point marqué par B, on reprend la décision de A au demi-tour
   précédent — le dernier où il pouvait l'empêcher — et l'on demande ce que B
   (l'autre réglage) aurait joué à sa place. Les deux plans sont jugés par la
   même riposte, avec les poids de B : la variante a-t-elle laissé passer un
   point que l'autre réglage parait ?

   Une mesure, pas un verdict : le jugement emprunte l'évaluateur de B. */

const fs = require('fs');
const { chromium } = require('playwright');

const URL_JEU = process.env.ILYOS_URL || 'http://localhost:8127/';
const POIDS = {
  A: process.env.ILYOS_POIDS_A ? JSON.parse(process.env.ILYOS_POIDS_A) : null,
  B: process.env.ILYOS_POIDS_B ? JSON.parse(process.env.ILYOS_POIDS_B) : null
};

(async () => {
  const lignes = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n').map(l => JSON.parse(l))
    .filter(l => l.debut && l.fin);
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
  await page.waitForFunction(() => typeof window.ILYOS_SELFPLAY?.analyser === 'function', null, { timeout: 60000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });

  const decrire = (plan, etat) => page.evaluate(([p, e]) => window.ILYOS_DEFAITES.decrire(p, e), [plan, etat]);
  const juger = (etat, plan) => page.evaluate(([e, p, po]) =>
    window.ILYOS_SELFPLAY.robustesse(e, p, { graine: 1, poids: po }), [etat, plan, POIDS.B]);

  const bilan = { points: 0, pareB: 0, ecarts: [] };
  for (const [cle, plis] of parties) {
    plis.sort((a, b) => a.i - b.i);
    const campA = plis[0].campA;
    const score = l => JSON.parse(l.fin).players.map(p => p.score || 0);
    console.log(`\n=== partie ${cle} (A = J${campA})`);
    for (let k = 1; k < plis.length; k++) {
      const joueurB = 1 - campA;
      if (plis[k].joueur !== joueurB) continue;
      if (score(plis[k])[joueurB] <= score(plis[k - 1])[joueurB]) continue;
      // B vient de marquer au début de ce demi-tour : la dernière décision de A est k − 1.
      const decisionA = plis[k - 1];
      if (decisionA.qui !== 'A') continue;
      bilan.points++;
      const etat = decisionA.debut;
      /* Le plan joué par A, reconstitué : sans coupure par le temps
         (securiteFacteur), la décision se reproduit à l'identique. On le
         vérifie contre la position réellement obtenue. */
      const rejoue = await page.evaluate(([e, po]) => window.ILYOS_SELFPLAY.analyser(e, { graine: 1, poids: po }), [etat, POIDS.A]);
      const joue = rejoue.detail;
      const fidele = await page.evaluate(([e, p, fin]) => {
        const r = window.ILYOS_SELFPLAY.jouer(e, p, { apercu: true });
        if (r.erreur) return false;
        const cle = j => { const x = JSON.parse(j); return JSON.stringify([x.characters.map(c => [c.id, c.r, c.c]).sort(),
          [x.artifact, x.secondArtifact].map(a => a && [a.id, a.carrierId, a.carrierId ? null : a.r, a.carrierId ? null : a.c])]); };
        return cle(r.etat) === cle(fin);
      }, [etat, joue, decisionA.fin]);
      const alt = await page.evaluate(([e, po]) => window.ILYOS_SELFPLAY.analyser(e, { graine: 1, poids: po }), [etat, POIDS.B]);
      const jugeJoue = await juger(etat, joue);
      const jugeAlt = await juger(etat, alt.detail);
      const ecart = (jugeAlt.noteRobuste ?? 0) - (jugeJoue.noteRobuste ?? 0);
      bilan.ecarts.push(ecart);
      console.log(`point de B au demi-tour ${k} (tour ${JSON.parse(plis[k].debut).turn})`);
      console.log(`  A a joué  [${jugeJoue.noteRobuste}]${fidele ? '' : ' (reconstitution INFIDÈLE)'} : ${await decrire(joue, etat)}`);
      console.log(`  B aurait  [${jugeAlt.noteRobuste}] : ${await decrire(alt.detail, etat)}`);
      console.log(`  riposte prévue contre A : ${(jugeJoue.riposte || []).join('+')}`);
    }
  }
  await navigateur.close();
  const moy = bilan.ecarts.length ? Math.round(bilan.ecarts.reduce((a, b) => a + b, 0) / bilan.ecarts.length) : 0;
  console.log(`\n${bilan.points} points concédés analysés ; plan de B mieux jugé dans `
    + `${bilan.ecarts.filter(e => e > 200).length} cas, moins bien dans ${bilan.ecarts.filter(e => e < -200).length} ; écart moyen ${moy}`);
})().catch(e => { console.error(e); process.exit(1); });
