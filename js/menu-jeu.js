/* ILYOS — MENU DE JEU (en partie)

   Remplace le petit popover ⚙ par un vrai menu plein écran : colonne de
   navigation (Reprendre, onglets de réglages, Règles, Revue IA, Quitter) et
   panneau d'onglets (Partie, Caméra, Audio, Graphismes).

   Rien n'est recréé : le menu EST #hudV2GearPopover, restructuré une fois au
   démarrage. Les contrôles réels (boutons data-hud-render / data-hud-camera,
   #rulesBtn, #newGameBtn, #revueIaBtn, #soundMenu et ses curseurs, sélecteurs
   de ciel, réglages de pioche) sont DÉPLACÉS dans la nouvelle mise en page avec
   leurs identifiants et leurs écouteurs. Conséquences voulues :
   - la délégation de clics posée sur #hudV2GearPopover (js/game/diagnostics.js)
     continue de piloter rendu, caméra, ciel et infos techniques ;
   - les règles de masquage du tutoriel et des énigmes (#gameScreen.puzzle-on
     #newGameBtn, [data-hud-render]…) s'appliquent toujours, le menu restant
     dans #gameScreen ;
   - ouvrir/fermer passe toujours par #hudV2GearBtn (toggleHudV2Drawer), relayé
     par le bouton MENU du HUD organique (#ov2Gear).
   Aucune règle de jeu ici. Styles : css/menu-jeu.css. */
(function () {
  if (window.__ILYOS_MENU_JEU__) return;
  window.__ILYOS_MENU_JEU__ = true;

  const $ = id => document.getElementById(id);
  const ONGLET_CLE = 'ilyosMenuJeuOnglet';
  const ONGLETS = [
    { id: 'partie', titre: 'Partie', icone: '<path d="M5 19V9l7-5 7 5v10H5Z"/><path d="M10 19v-5h4v5"/>' },
    { id: 'camera', titre: 'Caméra', icone: '<rect x="3" y="7" width="13" height="11" rx="2"/><path d="m16 11 5-3v9l-5-3"/>' },
    { id: 'audio', titre: 'Audio', icone: '<path d="M4 10v4h4l5 4V6L8 10H4Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>' },
    { id: 'graphismes', titre: 'Graphismes', icone: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>' }
  ];
  const svg = contenu => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${contenu}</svg>`;

  let menu = null;
  let construit = false;
  let dernierFocus = null;

  function lireOnglet() {
    try { return localStorage.getItem(ONGLET_CLE) || 'partie'; } catch (_) { return 'partie'; }
  }
  function retenirOnglet(id) {
    try { localStorage.setItem(ONGLET_CLE, id); } catch (_) { /* choix de session seulement */ }
  }

  function section(titre, aide) {
    const bloc = document.createElement('section');
    bloc.className = 'mj-section';
    bloc.innerHTML = `<h3 class="mj-section-titre">${titre}</h3>${aide ? `<p class="mj-aide">${aide}</p>` : ''}`;
    return bloc;
  }

  function deplacer(noeud, cible) {
    if (noeud && cible && noeud.parentElement !== cible) cible.appendChild(noeud);
    return noeud;
  }

  /* Réglages de la pioche détaillée (PR « pioche », js/card-cycle-animation-v10.js).
     Ils sont écrits dans #soundMenu ; on les range dans l'onglet Partie dès
     qu'ils existent. Sans eux, la section reste masquée. */
  function rangerPioche() {
    const page = menu?.querySelector('[data-mj-page="partie"] .mj-section-pioche');
    if (!page) return;
    ['piocheModeSelect', 'piocheStyleSelect'].forEach(id => {
      const label = $(id)?.closest('label');
      if (label) deplacer(label, page).classList.add('mj-champ');
    });
    page.hidden = !page.querySelector('select');
  }

  function construire() {
    menu = $('hudV2GearPopover');
    if (!menu || construit) return !!menu;
    construit = true;

    const renduGrille = menu.querySelector('.hud-v2-popover-render-grid');
    const renduAide = menu.querySelector('.hud-v2-coordinate-help');
    const cameraGrille = menu.querySelector('.hud-v2-popover-camera-grid');
    const techToggle = $('hudV2TechToggle');
    const techInfo = $('hudV2TechInfo');
    const cielToggle = $('hudV2SkyToggle');
    const cielPanneau = $('hudV2SkyPanel');
    const soundMenu = $('soundMenu');
    const actions = ['rulesBtn', 'revueIaBtn', 'newGameBtn'].map($).filter(Boolean);

    menu.classList.add('mj-menu');
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-modal', 'true');
    menu.setAttribute('aria-label', 'Menu de la partie');

    const fond = document.createElement('div');
    fond.className = 'mj-fond';
    fond.dataset.mjFermer = '';

    const coque = document.createElement('div');
    coque.className = 'mj-coque';
    coque.innerHTML = `
      <aside class="mj-nav">
        <header class="mj-entete">
          <span class="mj-marque">ILYOS</span>
          <strong class="mj-titre">Menu</strong>
          <span class="mj-contexte" id="mjContexte"></span>
        </header>
        <button type="button" class="mj-reprendre" data-mj-fermer>
          ${svg('<path d="M8 5v14l11-7L8 5Z" fill="currentColor"/>')}
          <span>Reprendre</span><kbd>Échap</kbd>
        </button>
        <div class="mj-nav-label">Réglages</div>
        <div class="mj-onglets" role="tablist" aria-label="Réglages">
          ${ONGLETS.map(o => `<button type="button" role="tab" class="mj-onglet" id="mjOnglet-${o.id}" data-mj-onglet="${o.id}" aria-controls="mjPage-${o.id}">${svg(o.icone)}<span>${o.titre}</span></button>`).join('')}
        </div>
        <div class="mj-nav-actions"></div>
      </aside>
      <div class="mj-panneau">
        ${ONGLETS.map(o => `<div class="mj-page" role="tabpanel" id="mjPage-${o.id}" data-mj-page="${o.id}" aria-labelledby="mjOnglet-${o.id}" hidden><h2 class="mj-page-titre">${o.titre}</h2></div>`).join('')}
      </div>
      <button type="button" class="mj-fermer" data-mj-fermer aria-label="Fermer le menu">×</button>`;

    const page = id => coque.querySelector(`[data-mj-page="${id}"]`);

    // PARTIE : rendu du plateau, pioche, commandes.
    const rendu = section('Rendu du plateau', 'La 3D montre l’archipel ; la 2D tactique offre une lecture à plat, case par case.');
    rendu.classList.add('mj-section-rendu');
    deplacer(renduGrille, rendu);
    deplacer(renduAide, rendu);
    page('partie').appendChild(rendu);
    const pioche = section('Cartes', 'Présentation de la pioche en début de tour.');
    pioche.classList.add('mj-section-pioche');
    pioche.hidden = true;
    page('partie').appendChild(pioche);
    const commandes = section('Commandes');
    commandes.insertAdjacentHTML('beforeend', `
      <dl class="mj-commandes">
        <div><dt><kbd>Clic</kbd></dt><dd>Jouer une case, une action</dd></div>
        <div><dt><kbd>Q</kbd> <kbd>E</kbd></dt><dd>Tourner l’île à poser</dd></div>
        <div><dt><kbd>Espace</kbd></dt><dd>Revenir à la vue de face</dd></div>
        <div><dt><kbd>Molette</kbd></dt><dd>Zoomer</dd></div>
        <div><dt><kbd>T</kbd></dt><dd>Plateau tactique à plat</dd></div>
        <div><dt><kbd>Échap</kbd></dt><dd>Annuler la sélection, sinon ouvrir ce menu</dd></div>
      </dl>`);
    page('partie').appendChild(commandes);

    // CAMÉRA : AUTO/LIBRE sont des modes, FACE/ISO des recadrages ponctuels.
    const camera = section('Caméra', 'Le choix s’applique aussitôt et referme le menu.');
    deplacer(cameraGrille, camera);
    const descriptions = {
      auto: 'Suit l’action',
      free: 'Vous gardez la main',
      front: 'Recadrer de face',
      iso: 'Recadrer en 3/4'
    };
    cameraGrille?.querySelectorAll('[data-hud-camera]').forEach(bouton => {
      const cle = bouton.dataset.hudCamera;
      const nom = bouton.textContent.trim();
      bouton.innerHTML = `<b>${nom}</b><small>${descriptions[cle] || ''}</small>`;
      bouton.classList.add('mj-choix');
    });
    renduGrille?.querySelectorAll('[data-hud-render]').forEach(bouton => {
      const nom = bouton.textContent.trim();
      const detail = bouton.dataset.hudRender === '2d' ? 'Vue à plat, coordonnées' : 'Archipel en relief';
      bouton.innerHTML = `<b>${nom}</b><small>${detail}</small>`;
      bouton.classList.add('mj-choix');
    });
    page('camera').appendChild(camera);

    // AUDIO : le panneau son existant, avec ses curseurs et son banc d'écoute.
    if (soundMenu) {
      soundMenu.classList.add('mj-son');
      page('audio').appendChild(soundMenu);
    }

    // GRAPHISMES : ciel et horizon, puis infos techniques.
    const ciel = section('Ciel et horizon');
    deplacer(cielToggle, ciel);
    deplacer(cielPanneau, ciel);
    [['hudV2SkyVariant', 'Ciel'], ['hudV2Horizon', 'Horizon lointain']].forEach(([id, nom]) => {
      const champ = ciel.querySelector(`#${id}`);  // pas encore dans le document
      if (!champ || champ.closest('label')) return;
      const label = document.createElement('label');
      label.className = 'mj-champ';
      label.innerHTML = `<span>${nom}</span>`;
      champ.replaceWith(label);
      label.appendChild(champ);
    });
    page('graphismes').appendChild(ciel);
    const tech = section('Infos techniques', 'État du moteur 3D et qualité de rendu.');
    deplacer(techToggle, tech);
    deplacer(techInfo, tech);
    page('graphismes').appendChild(tech);

    // Actions de la colonne : mêmes boutons, même logique.
    const colonne = coque.querySelector('.mj-nav-actions');
    const libelles = { rulesBtn: 'Règles du jeu', revueIaBtn: 'Revue IA', newGameBtn: 'Quitter la partie' };
    actions.forEach(bouton => {
      bouton.classList.add('mj-action');
      if (libelles[bouton.id]) bouton.textContent = libelles[bouton.id];
      colonne.appendChild(bouton);
    });

    // Ce qui reste de l'ancien popover (bouton Son, séparateurs, intitulés) disparaît.
    Array.from(menu.children).forEach(enfant => enfant.remove());
    menu.append(fond, coque);

    coque.querySelectorAll('[data-mj-onglet]').forEach(bouton => {
      bouton.addEventListener('click', () => choisirOnglet(bouton.dataset.mjOnglet, true));
    });
    menu.addEventListener('click', event => {
      if (event.target.closest('[data-mj-fermer]')) fermer();
    });
    menu.addEventListener('keydown', gererClavier);

    rangerPioche();
    choisirOnglet(lireOnglet(), false);
    new MutationObserver(surChangement).observe(menu, { attributes: true, attributeFilter: ['class'] });
    return true;
  }

  function choisirOnglet(id, focus) {
    if (!ONGLETS.some(o => o.id === id)) id = 'partie';
    menu.querySelectorAll('[data-mj-onglet]').forEach(bouton => {
      const actif = bouton.dataset.mjOnglet === id;
      bouton.setAttribute('aria-selected', String(actif));
      bouton.tabIndex = actif ? 0 : -1;
      if (actif && focus) bouton.focus();
    });
    menu.querySelectorAll('[data-mj-page]').forEach(page => { page.hidden = page.dataset.mjPage !== id; });
    retenirOnglet(id);
    if (id === 'graphismes') deplierGraphismes();
  }

  /* Les panneaux Ciel et Infos techniques s'ouvrent par leur bouton d'origine :
     c'est lui qui peuple la liste des ciels à la première ouverture. Le clic
     est relayé une fois, puis les boutons de repli sont masqués en CSS. */
  function deplierGraphismes() {
    [['hudV2SkyToggle', 'hudV2SkyPanel'], ['hudV2TechToggle', 'hudV2TechInfo']].forEach(([bouton, panneau]) => {
      if ($(panneau)?.classList.contains('hidden')) $(bouton)?.click();
    });
  }

  function estOuvert() {
    return !!menu && !menu.classList.contains('hidden');
  }

  function fermer() {
    if (estOuvert()) $('hudV2GearBtn')?.click();
  }

  function actualiser() {
    const rendu = document.body.dataset.boardRender === '2d' ? '2d' : '3d';
    menu.querySelectorAll('[data-hud-render]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.hudRender === rendu)));
    const mode = window.kaykit3D?.cameraMode === 'free' ? 'free' : 'auto';
    menu.querySelectorAll('[data-hud-camera="auto"], [data-hud-camera="free"]').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.hudCamera === mode));
    });
    const tour = ($('turnLabel')?.textContent || '').match(/tour\s*(\d+)/i);
    const contexte = $('mjContexte');
    if (contexte) contexte.textContent = tour ? `Tour ${tour[1]}` : '';
    rangerPioche();
    if (!menu.querySelector('[data-mj-page]:not([hidden])')) choisirOnglet(lireOnglet(), false);
    if (menu.querySelector('[data-mj-page="graphismes"]:not([hidden])')) deplierGraphismes();
  }

  function surChangement() {
    const ouvert = estOuvert();
    document.body.classList.toggle('mj-menu-ouvert', ouvert);
    $('ov2Gear')?.setAttribute('aria-expanded', String(ouvert));
    if (ouvert && !menu.dataset.mjOuvert) {
      menu.dataset.mjOuvert = '1';
      dernierFocus = document.activeElement;
      actualiser();
      requestAnimationFrame(() => menu.querySelector('.mj-reprendre')?.focus({ preventScroll: true }));
    } else if (!ouvert && menu.dataset.mjOuvert) {
      delete menu.dataset.mjOuvert;
      const retour = dernierFocus && document.contains(dernierFocus) ? dernierFocus : $('ov2Gear');
      if (retour && menu.contains(document.activeElement)) retour.focus?.({ preventScroll: true });
    }
  }

  function gererClavier(event) {
    /* Tant que le menu est ouvert, le clavier est à lui : sans ce filtre, T, Q/E
       ou Espace agiraient sur la partie derrière. Échap continue jusqu'au jeu,
       qui referme le menu (js/game/diagnostics.js). */
    if (event.key !== 'Escape') event.stopPropagation();
    const onglet = event.target.closest?.('[data-mj-onglet]');
    if (onglet && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      const ids = ONGLETS.map(o => o.id);
      const i = ids.indexOf(onglet.dataset.mjOnglet);
      choisirOnglet(ids[(i + (event.key === 'ArrowDown' ? 1 : ids.length - 1)) % ids.length], true);
      return;
    }
    if (event.key !== 'Tab') return;
    // Le focus reste dans le menu tant qu'il est ouvert.
    const focusables = Array.from(menu.querySelectorAll('button, select, input, summary, [tabindex="0"]'))
      .filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
    if (!focusables.length) return;
    const premier = focusables[0], dernier = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === premier) { event.preventDefault(); dernier.focus(); }
    else if (!event.shiftKey && document.activeElement === dernier) { event.preventDefault(); premier.focus(); }
  }

  function installerStyle() {
    if (document.querySelector('link[data-menu-jeu]')) return;
    const lien = document.createElement('link');
    lien.rel = 'stylesheet';
    lien.href = './css/menu-jeu.css?v=1';
    lien.dataset.menuJeu = '';
    document.head.appendChild(lien);
  }

  function demarrer() {
    installerStyle();
    if (construire()) return;
    // Le jeu pose le popover au chargement ; on patiente sans boucler indéfiniment.
    let essais = 0;
    const attendre = () => { if (!construire() && ++essais < 60) setTimeout(attendre, 250); };
    attendre();
  }

  window.ILYOS_MENU_JEU = {
    ouvrir: () => { if (!estOuvert()) $('ov2Gear')?.click(); },
    fermer,
    onglet: id => menu && choisirOnglet(id, false),
    estOuvert
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer, { once: true });
  else demarrer();
})();
