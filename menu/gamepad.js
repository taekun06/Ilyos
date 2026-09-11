/* ILYOS — Manette dans le menu.

   Le menu vit dans une iframe isolee (menu/frame.html) : la couche manette du
   jeu, qui est un fragment du bundle, ne s'y execute pas et ne peut pas y
   toucher. D'ou ce second lecteur. Il partage avec elle le socle
   js/gamepad-navigation.js — visibilite, identite stable, choix directionnel
   geometrique — et n'ajoute ici que la grammaire propre au menu.

   GRAMMAIRE
     Accueil       stick = naviguer entre modes et raccourcis, A = entrer.
     Configuration haut/bas = passer d'un reglage au suivant,
                   gauche/droite = CHANGER SA VALEUR,
                   A = entrer dans un champ ou lancer, B = revenir.

   Deux choix expliquent presque tout le fichier.

   1. Un reglage est UN objet, pas trois. Le menu construit « ‹ valeur › » avec
      deux boutons distincts autour du texte. Les focaliser separement obligeait
      a viser une fleche avant de pouvoir changer quoi que ce soit : trois
      mouvements pour un reglage. Ici, la ligne entiere est la cible, et
      gauche/droite actionne la bonne fleche sans jamais la designer.

   2. Le focus est retenu par IDENTITE, jamais par reference. render() refait
      tout le DOM du panneau a chaque changement de valeur : une reference
      gardee d'une image sur l'autre designe un noeud detache, et le focus
      retombe au depart des qu'on touche a un reglage. */
(function () {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;

  const NAV = window.ILYOS_PAD_NAV;
  if (!NAV) return;

  const DEADZONE = 0.35;
  const PAS_PREMIER_MS = 300;
  const PAS_SUIVANT_MS = 150;
  const BOUTON = { A: 0, B: 1, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

  /* Retenu par ecran : revenir en arriere ne doit pas tout recommencer. */
  const memoire = { accueil: null, config: null };
  let marque = null;      // identite de l'element vise
  let saisie = false;     // mode champ de texte : le stick est rendu au clavier
  let precedents = [];
  let prochainPas = 0;

  function ecranConfig() {
    const duel = document.getElementById('duel');
    return duel && duel.classList.contains('active') ? duel : null;
  }

  function ecranAccueil() {
    const home = document.getElementById('home');
    return home && home.classList.contains('active') ? home : null;
  }

  function cle() { return ecranConfig() ? 'config' : 'accueil'; }

  /* Les cibles de l'ecran courant. En configuration, un reglage entier compte
     pour une seule cible — ses fleches n'existent pas pour la manette. */
  function cibles() {
    const config = ecranConfig();
    if (config) {
      const lignes = [...config.querySelectorAll('.field[data-key], .difficulty-zone[data-key]')];
      const boutons = [config.querySelector('#play'), config.querySelector('#back')]
        .filter(Boolean)
        .filter(NAV.estUtilisable);
      return lignes.filter(NAV.estUtilisable).concat(boutons);
    }
    const accueil = ecranAccueil();
    if (!accueil) return [];
    return [...accueil.querySelectorAll('[data-mode], [data-action], button')]
      .filter(element => !element.querySelector('[data-mode], [data-action]'))
      .filter(NAV.estUtilisable);
  }

  function vise() { return NAV.retrouver(cibles(), marque); }

  function designer(element) {
    document.querySelectorAll('.ilyos-pad-vise').forEach(autre => {
      if (autre !== element) autre.classList.remove('ilyos-pad-vise');
    });
    if (!element) { marque = null; return; }
    element.classList.add('ilyos-pad-vise');
    element.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    marque = NAV.identite(element);
    memoire[cle()] = marque;
  }

  /* Focus initial : l'element principal de l'ecran, pas le premier du document.
     On reprend d'abord ce que le joueur y avait laisse. */
  function focusInitial() {
    const liste = cibles();
    if (!liste.length) { designer(null); return; }
    const retenu = NAV.retrouver(liste, memoire[cle()]);
    if (retenu) { designer(retenu); return; }
    if (ecranConfig()) { designer(liste[0]); return; }
    const defaut = liste.find(element => element.getAttribute('data-mode') === 'solo');
    designer(defaut || liste[0]);
  }

  /* Champ de texte : A y entre, B en sort. Sans ce mode, gauche/droite
     changerait un reglage pendant qu'on tape un nom. */
  function champDe(element) {
    return element ? element.querySelector('input, textarea') : null;
  }

  function entrerEnSaisie(champ) {
    saisie = true;
    champ.focus();
    champ.select?.();
  }

  function quitterLaSaisie() {
    saisie = false;
    document.activeElement?.blur?.();
  }

  /* Changer la valeur d'un reglage sans jamais designer ses fleches : on
     actionne celle qui correspond au sens demande. C'est le meme chemin que le
     clic, donc stepControl() et son rendu restent seuls maitres. */
  function changerValeur(ligne, sens) {
    const fleche = ligne.querySelector(`[data-step="${sens > 0 ? 1 : -1}"]`);
    if (!fleche || fleche.disabled) return false;
    fleche.click();
    return true;
  }

  function deplacer(dx, dy) {
    const liste = cibles();
    if (!liste.length) { designer(null); return; }
    const courant = vise();
    if (!courant) { focusInitial(); return; }
    const suivant = NAV.choisirElementDansDirection(courant, liste, dx, dy);
    if (suivant) designer(suivant);
  }

  function valider() {
    const courant = vise();
    if (!courant) { focusInitial(); return; }
    const champ = champDe(courant);
    if (champ) { entrerEnSaisie(champ); return; }
    // Une ligne de reglage n'a rien a valider : sa valeur se change au stick.
    if (courant.matches('.field[data-key], .difficulty-zone[data-key]')) return;
    courant.click();
  }

  function revenir() {
    if (saisie) { quitterLaSaisie(); return; }
    const retour = ecranConfig()?.querySelector('#back');
    if (retour && NAV.estUtilisable(retour)) { retour.click(); return; }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }

  function style() {
    if (document.getElementById('ilyosMenuPadStyle')) return;
    const balise = document.createElement('style');
    balise.id = 'ilyosMenuPadStyle';
    /* Anneau rentre a l'interieur : pose dehors, il est rogne par les cartes et
       les conteneurs a debordement masque — on ne voyait alors plus ce qui
       etait vise, et la navigation paraissait morte. */
    balise.textContent =
      '.ilyos-pad-vise{outline:3px solid #ffd879;outline-offset:-3px;'
      + 'border-radius:12px;box-shadow:0 0 20px rgba(255,216,121,.55);'
      + 'position:relative;z-index:3;}';
    document.head.appendChild(balise);
  }

  function appuye(manette, index) { return !!manette.buttons[index]?.pressed; }
  function vientDEtreAppuye(manette, index) { return appuye(manette, index) && !precedents[index]; }
  function axe(manette, index) {
    const valeur = manette.axes[index] || 0;
    return Math.abs(valeur) < DEADZONE ? 0 : valeur;
  }

  function lire() {
    requestAnimationFrame(lire);
    const manettes = navigator.getGamepads ? navigator.getGamepads() : [];
    let manette = null;
    for (const candidate of manettes) if (candidate?.connected) { manette = candidate; break; }
    if (!manette) { precedents = []; return; }

    const maintenant = performance.now();

    if (saisie) {
      // Le clavier possede l'ecran : seul B rend la main.
      if (vientDEtreAppuye(manette, BOUTON.B)) quitterLaSaisie();
      precedents = manette.buttons.map(bouton => !!bouton.pressed);
      return;
    }

    /* Rattacher l'anneau a chaque image. L'identite survit bien a la
       reconstruction du panneau — render() refait tout le DOM a chaque
       changement de valeur — mais la CLASSE, elle, part avec l'ancien noeud.
       Sans ce rattachement, le focus continuait d'exister sans plus se voir :
       on changeait une valeur et l'anneau disparaissait. */
    const courant = vise();
    if (!courant) focusInitial();
    else if (!courant.classList.contains('ilyos-pad-vise')) designer(courant);

    let dx = axe(manette, 0), dy = axe(manette, 1);
    if (appuye(manette, BOUTON.LEFT)) dx = -1;
    if (appuye(manette, BOUTON.RIGHT)) dx = 1;
    if (appuye(manette, BOUTON.UP)) dy = -1;
    if (appuye(manette, BOUTON.DOWN)) dy = 1;

    if (dx || dy) {
      const premier = !prochainPas;
      if (premier || maintenant >= prochainPas) {
        const horizontal = Math.abs(dx) >= Math.abs(dy);
        const sens = horizontal ? Math.sign(dx) : Math.sign(dy);
        const courant = vise();
        const reglage = courant && courant.matches('.field[data-key], .difficulty-zone[data-key]');
        /* En configuration, l'horizontale appartient a la VALEUR du reglage
           vise. C'est tout l'interet : un mouvement par changement, au lieu de
           viser une fleche puis de la marteler. */
        if (horizontal && reglage) {
          if (!changerValeur(courant, sens)) deplacer(sens, 0);
        } else {
          deplacer(horizontal ? sens : 0, horizontal ? 0 : sens);
        }
        prochainPas = maintenant + (premier ? PAS_PREMIER_MS : PAS_SUIVANT_MS);
      }
    } else prochainPas = 0;

    if (vientDEtreAppuye(manette, BOUTON.A)) valider();
    if (vientDEtreAppuye(manette, BOUTON.B)) revenir();
    if (vientDEtreAppuye(manette, BOUTON.START)) {
      const lancer = ecranConfig()?.querySelector('#play');
      if (lancer && NAV.estUtilisable(lancer)) lancer.click();
    }

    precedents = manette.buttons.map(bouton => !!bouton.pressed);
  }

  style();
  requestAnimationFrame(lire);
})();
