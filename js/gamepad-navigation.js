/* ILYOS — Navigation manette : le socle commun, et rien de plus.

   Ce fichier ne connait ni le jeu ni le menu. Il ne repond qu'a trois
   questions, celles que les deux couches manette se posaient chacune de leur
   cote et resolvaient chacune a sa facon :

     1. cet element est-il reellement offert au joueur ?
     2. comment le designer de maniere STABLE, alors que son noeud DOM peut
        etre reconstruit a l'image suivante ?
     3. lequel de ces candidats se trouve dans la direction poussee ?

   Les regles contextuelles — quelles actions existent, quelles cases sont
   valides, quel ecran suit lequel — restent chez l'appelant. Ce module est
   charge tel quel par la page du jeu ET par l'iframe du menu, qui sont deux
   contextes JavaScript separes ; il est sans etat, donc chaque copie est
   interchangeable. */
(function (portee) {
  'use strict';

  /* Ne PAS tester offsetParent : il vaut null pour tout element en
     position:fixed — ce qu'est le HUD organique, et une bonne part du menu.
     S'y fier renvoyait une liste vide en silence, et le stick n'avait plus
     rien a parcourir sans qu'aucune erreur ne le signale. */
  function estVisible(element) {
    if (!element || !element.getBoundingClientRect) return false;
    const boite = element.getBoundingClientRect();
    if (boite.width <= 0 || boite.height <= 0) return false;
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    if (Number(style.opacity) === 0) return false;
    // Un ancetre masque a l'accessibilite n'est pas offert au joueur, meme si
    // ses boutons mesurent encore quelque chose (cas du panneau gauche legacy).
    return !element.closest('[aria-hidden="true"]');
  }

  function estUtilisable(element) {
    if (!estVisible(element)) return false;
    if (element.disabled) return false;
    if (element.getAttribute('aria-disabled') === 'true') return false;
    return !element.classList.contains('disabled');
  }

  function centre(element) {
    const boite = element.getBoundingClientRect();
    return { x: boite.left + boite.width / 2, y: boite.top + boite.height / 2 };
  }

  /* Choix directionnel GEOMETRIQUE : on prend l'element reellement situe dans
     la direction poussee et le plus proche a l'oeil, pas le suivant dans
     l'ordre du document. Un menu qui change de mise en page reste alors
     navigable sans qu'on retouche quoi que ce soit.

     `alignementMinimum` est le cosinus du demi-angle accepte autour de la
     direction : .35 laisse passer une cible legerement en biais — frequent dans
     une grille — sans jamais choisir ce qui est de cote. */
  function choisirDansDirection(origine, candidats, dx, dy, options) {
    const reglages = options || {};
    const alignementMinimum = reglages.alignementMinimum != null ? reglages.alignementMinimum : .35;
    const echelle = reglages.echelle != null ? reglages.echelle : 240;
    if (!origine || (!dx && !dy)) return null;

    let meilleur = null;
    let meilleurScore = 0;
    for (const candidat of candidats) {
      const point = candidat && candidat.point;
      if (!point) continue;
      const vx = point.x - origine.x;
      const vy = point.y - origine.y;
      const distance = Math.hypot(vx, vy);
      if (distance < 1) continue;
      const alignement = (vx / distance) * dx + (vy / distance) * dy;
      if (alignement < alignementMinimum) continue;
      // Cap d'abord, distance ensuite : a cap egal, la plus proche l'emporte.
      const score = alignement / (1 + distance / echelle);
      if (score > meilleurScore) { meilleurScore = score; meilleur = candidat; }
    }
    return meilleur;
  }

  /* Meme chose, directement sur des elements DOM. */
  function choisirElementDansDirection(origine, elements, dx, dy, options) {
    const candidats = elements
      .filter(element => element !== origine)
      .map(element => ({ element, point: centre(element) }));
    const choisi = choisirDansDirection(centre(origine), candidats, dx, dy, options);
    return choisi ? choisi.element : null;
  }

  /* IDENTITE STABLE. renderIslandSelector() vide et reconstruit ses neuf
     boutons, et le menu refait tout son DOM a chaque changement de valeur :
     garder une reference d'une image sur l'autre designe un noeud detache. On
     retient donc une chaine, et on la reresout a chaque fois. */
  function identite(element) {
    if (!element) return null;
    return element.id
      || element.getAttribute('data-key')
      || element.getAttribute('data-mode')
      || element.getAttribute('data-action')
      || null;
  }

  function retrouver(elements, marque) {
    if (!marque) return null;
    return elements.find(element => identite(element) === marque) || null;
  }

  portee.ILYOS_PAD_NAV = {
    estVisible,
    estUtilisable,
    centre,
    choisirDansDirection,
    choisirElementDansDirection,
    identite,
    retrouver
  };
})(typeof window !== 'undefined' ? window : globalThis);
