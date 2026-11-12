/* Le jeu se charge-t-il encore sans écran ?

     node scripts/check-moteur.js        (aucun serveur, quelques secondes)

   Le CPU Expert réfléchit dans un Worker, qui charge js/game.js derrière un
   écran factice (js/moteur/ecran-factice.js). Un fragment qui appelle, dès le
   chargement, une API du navigateur absente de cet écran n'empêche pas de
   jouer — la réflexion retombe dans la page — mais éteint le Worker sans rien
   dire. Ce contrôle le dit : il charge le bundle sous Node par le même écran
   et joue un tour simulé. */

const sortie = console;
try {
  const moteur = require('./moteur-sans-ecran').charger();
  const depart = moteur.selfplay.departMelange(7100);
  const r = moteur.selfplay.tour(depart, { graine: 1, budget: { etatsMax: 300, largeurFaisceau: 8 } });
  if (!r || !r.etat) throw new Error('le tour simulé n\'a rien rendu');
  sortie.log('Moteur sans écran : bundle chargé, un tour simulé joué.');
  process.exit(0);
} catch (erreur) {
  sortie.error('Moteur sans écran : ÉCHEC. Le Worker du CPU Expert ne démarrerait pas.');
  sortie.error(String(erreur && erreur.stack || erreur).split('\n').slice(0, 6).join('\n'));
  sortie.error('Piste : ajouter le substitut manquant dans js/moteur/ecran-factice.js,');
  sortie.error('ou garder l\'appel sous ilyosSimulationActive / hors du chargement.');
  process.exit(1);
}
