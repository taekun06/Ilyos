/* ILYOS — Manette dans le menu.

   Le menu vit dans une iframe isolee (menu/frame.html) : la couche manette du
   jeu, qui est un fragment du bundle, ne s'y execute pas et ne peut pas y
   toucher. D'ou ce second lecteur, minuscule et independant.

   Il ne connait rien au menu : il parcourt les elements cliquables visibles
   dans l'ordre du document et clique celui qui est designe. Aucun raccourci
   propre a un ecran, donc rien a maintenir quand le menu change. */
(function () {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;

  const DEADZONE = 0.35;
  const STEP_FIRST_MS = 280;
  const STEP_REPEAT_MS = 140;
  const BOUTON = { A: 0, B: 1, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
  const CIBLES = 'button, [data-mode], [data-action], a[href], [role="button"], input, select';

  let vise = null;
  let precedents = [];
  let prochainPas = 0;

  /* offsetParent vaut null pour tout element en position:fixed — courant dans
     ce menu. On mesure donc la boite et on lit le style calcule. */
  function visible(element) {
    if (!element) return false;
    const boite = element.getBoundingClientRect();
    if (boite.width <= 0 || boite.height <= 0) return false;
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    return Number(style.opacity) !== 0;
  }

  function cliquables() {
    return [...document.querySelectorAll(CIBLES)].filter(element => {
      if (!visible(element)) return false;
      if (element.disabled) return false;
      if (element.getAttribute('aria-hidden') === 'true') return false;
      // Un conteneur qui contient lui-meme une cible n'est pas une cible :
      // sinon la meme action apparaitrait deux fois dans le parcours.
      return !element.querySelector(CIBLES);
    });
  }

  function designer(element) {
    if (vise && vise !== element) vise.classList.remove('ilyos-pad-vise');
    vise = element || null;
    if (!vise) return;
    vise.classList.add('ilyos-pad-vise');
    vise.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    // Le focus reel rend aussi le clavier coherent avec la manette.
    if (typeof vise.focus === 'function') vise.focus({ preventScroll: true });
  }

  function deplacer(sens) {
    const liste = cliquables();
    if (!liste.length) { designer(null); return; }
    const index = liste.indexOf(vise);
    if (index < 0) { designer(liste[sens > 0 ? 0 : liste.length - 1]); return; }
    designer(liste[(index + sens + liste.length) % liste.length]);
  }

  function style() {
    if (document.getElementById('ilyosMenuPadStyle')) return;
    const balise = document.createElement('style');
    balise.id = 'ilyosMenuPadStyle';
    balise.textContent =
      '.ilyos-pad-vise{outline:3px solid #ffd879;outline-offset:4px;'
      + 'border-radius:10px;box-shadow:0 0 18px rgba(255,216,121,.6);}';
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

    let dx = axe(manette, 0), dy = axe(manette, 1);
    if (appuye(manette, BOUTON.LEFT)) dx = -1;
    if (appuye(manette, BOUTON.RIGHT)) dx = 1;
    if (appuye(manette, BOUTON.UP)) dy = -1;
    if (appuye(manette, BOUTON.DOWN)) dy = 1;

    if (dx || dy) {
      const premier = !prochainPas;
      if (premier || maintenant >= prochainPas) {
        // Le menu est une liste : les deux axes avancent dans le meme parcours.
        deplacer(Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : Math.sign(dy));
        prochainPas = maintenant + (premier ? STEP_FIRST_MS : STEP_REPEAT_MS);
      }
    } else prochainPas = 0;

    if (vientDEtreAppuye(manette, BOUTON.A)) {
      // La liste a pu changer entre-temps (sous-menu referme) : on ne clique
      // que ce qui est encore la.
      if (vise && cliquables().includes(vise)) vise.click();
      else deplacer(1);
    }
    if (vientDEtreAppuye(manette, BOUTON.B) || vientDEtreAppuye(manette, BOUTON.START)) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      designer(null);
    }

    // Un element designe peut disparaitre avec son ecran.
    if (vise && !cliquables().includes(vise)) designer(null);

    precedents = manette.buttons.map(bouton => !!bouton.pressed);
  }

  style();
  requestAnimationFrame(lire);
})();
