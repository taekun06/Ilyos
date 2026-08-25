/* Collecteur d'incidents : tout ce qu'une page en bonne santé ne produit pas.

   Le pari de ce harnais tient en une phrase : une régression qui casse une
   partie se signale presque toujours d'abord par une exception non rattrapée,
   un `console.error` ou une ressource manquante — bien avant de produire un
   état de jeu incohérent qu'il faudrait décrire règle par règle pour le
   détecter. Surveiller ces trois canaux pendant une partie entière coûte
   quelques lignes et couvre l'essentiel. */

function chemin(url) {
  try {
    const analysee = new URL(url);
    return analysee.origin === '' ? url : analysee.pathname + analysee.search;
  } catch {
    return url;
  }
}

function surveillerIncidents(page, origine) {
  const incidents = [];

  const memeOrigine = url => {
    try { return new URL(url).origin === origine; } catch { return false; }
  };

  page.on('pageerror', erreur => {
    incidents.push(`exception non rattrapée · ${erreur.message}`);
  });

  page.on('console', message => {
    if (message.type() !== 'error') return;
    incidents.push(`console.error · ${message.text()}`);
  });

  /* Les cinq bibliothèques 3D sont servies depuis ./vendor/ avec un repli CDN
     déclaré sur `onerror` (index.html). Un fichier vendor disparu se verrait
     donc ici en HTTP 404, avant que le repli ne le masque en production. */
  page.on('response', reponse => {
    if (!memeOrigine(reponse.url())) return;
    if (reponse.status() >= 400) incidents.push(`HTTP ${reponse.status()} · ${chemin(reponse.url())}`);
  });

  page.on('requestfailed', requete => {
    const cause = requete.failure()?.errorText || 'cause inconnue';
    /* ERR_ABORTED est le bruit normal d'une requête interrompue — navigation en
       cours, média coupé. Ce n'est pas une ressource introuvable. */
    if (cause.includes('ERR_ABORTED')) return;
    incidents.push(`requête en échec · ${chemin(requete.url())} (${cause})`);
  });

  return incidents;
}

function formaterIncidents(incidents) {
  if (!incidents.length) return 'Aucun incident relevé.';
  return `${incidents.length} incident(s) relevé(s) :\n  - ${incidents.join('\n  - ')}`;
}

module.exports = { surveillerIncidents, formaterIncidents };
