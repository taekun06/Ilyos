/* MOTEUR EN ARRIÈRE-PLAN — le bundle du jeu dans un Web Worker.

   Lancé par js/game.js (planner.js, « RÉFLEXION EN ARRIÈRE-PLAN ») avec, en
   paramètre `jeu`, l'adresse exacte du bundle que la page a chargé : même
   fichier, même version, donc mêmes règles et même IA des deux côtés.

   Le bundle attend une page et de la 3D ; on lui donne un écran factice. Il
   ne sert ici qu'à calculer : ILYOS_MOTEUR.planifier(demande) → rapport. */
"use strict";

const ILYOS_ADRESSE_JEU = new URL(self.location.href).searchParams.get("jeu");

importScripts("ecran-factice.js");
(function installerEcranFactice() {
  const { substituts } = self.ILYOS_ECRAN_FACTICE.creer();
  // L'horloge du Worker est la vraie : les filets de temps de la recherche s'y fient.
  delete substituts.performance;
  for (const [cle, valeur] of Object.entries(substituts)) {
    Object.defineProperty(self, cle, { value: valeur, writable: true, configurable: true });
  }
  self.window = self;
})();

importScripts(ILYOS_ADRESSE_JEU);

self.onmessage = evenement => {
  const { id, type, demande } = evenement.data || {};
  if (type !== "planifier") return;
  try {
    self.postMessage({ id, resultat: self.ILYOS_MOTEUR.planifier(demande) });
  } catch (erreur) {
    self.postMessage({ id, erreur: String(erreur && erreur.message || erreur) });
  }
};

self.postMessage({ pret: true });
