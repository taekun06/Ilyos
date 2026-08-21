/* ILYOS — version canonique.
   Toute version visible doit lire window.ILYOS_BUILD au lieu de recopier un numéro. */
window.ILYOS_BUILD = "V76";
document.title = `ILYOS ${window.ILYOS_BUILD} — Animations`;

/* L'ancien splash contient encore un fallback HTML historique (V64).
   Il n'est plus une source de vérité : avant qu'il puisse être affiché,
   son libellé est reconstruit depuis ILYOS_BUILD. */
(function syncVisibleBuildLabel(){
  function applyBuildLabel(){
    const label = document.querySelector('#altModeIntro .alt-intro-copy strong');
    if (label) label.textContent = `ILYOS · ARCHIPEL CÉLESTE ${window.ILYOS_BUILD}`;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyBuildLabel, { once:true });
  } else {
    applyBuildLabel();
  }
})();

/* Passe visuelle 3D dédiée aux gardiens KayKit.
   Le module est isolé du moteur : il restaure les matériaux Knight/Mage depuis
   les GLB sources et interdit toute teinte globale sur une texture atlas. */
(function loadCharacterMaterialsV1(){
  if (window.__ILYOS_CHARACTER_MATERIALS_V1_LOADER__) return;
  window.__ILYOS_CHARACTER_MATERIALS_V1_LOADER__ = true;
  const script = document.createElement('script');
  script.src = './js/character-materials-v1.js?v=1';
  script.defer = true;
  document.head.appendChild(script);
})();

/* Caméra FRONT — preset non invasif.
   - appliqué UNE SEULE FOIS au vrai passage menu -> partie ;
   - réappliqué ensuite uniquement si le joueur clique explicitement VUE FACE ;
   - jamais sur un changement de tour / classe CSS / qualité / resize ;
   - la molette est désormais considérée comme une prise de contrôle manuelle :
     après un zoom, AUTO ne peut plus ramener la caméra en vue face. */
(function installFrontCameraPreset(){
  if (window.__ILYOS_FRONT_CAMERA_PRESET__) return;
  window.__ILYOS_FRONT_CAMERA_PRESET__ = true;

  /* Recul de la vue FACE. À 13,8 le plateau remplissait le cadre et l'atmosphère
     construite autour (soleil, godrays, archipel, horizon) restait hors champ.
     À 17 la scène respire sans que les pièces deviennent illisibles.
     Ajustable à chaud par ILYOS_SKY.cadrage({ recul }).

     Cette valeur est calibrée sur le plateau 11×11 : un 13×13 cadré au même
     recul déborde de l'image, villages des coins compris. Le facteur suit donc
     la taille réelle, exposée par le moteur via kaykit3D.gridSize. */
  const FRONT_DISTANCE = 17;
  function reculPourPlateau(k) {
    const taille = Number(k?.gridSize) || 11;
    return FRONT_DISTANCE * (taille / 11);
  }
  /* INCLINAISON DE LA VUE FACE, en degrés sous l'horizontale.
     Elle décide seule de ce qui entre dans le cadre : le haut de l'image se situe à
     (inclinaison − 16,5°), la moitié du champ vertical de 33°. À 37,2° — la valeur
     historique, qui est exactement l'angle du couple .63/.83 d'origine — le cadre
     commence à 20,7° sous l'horizon, soit là où la mer de nuages se perd : la bande
     d'horizon reste à la limite supérieure. À 30° le haut du cadre remonte à 13,5° et
     la laisse entrer entièrement, au prix d'un plateau un peu plus plat.
     Sous 16,5° l'horizon géométrique lui-même entrerait dans l'image, mais la lecture
     en volume du plateau serait trop dégradée pour le jeu.
     Réglable à chaud : ILYOS_SKY.cadrage({ inclinaison }). */
  const FRONT_PITCH_DEG = 37.2;
  let initialPresetApplied = false;

  function markManualCameraControl(){
    const k = window.kaykit3D;
    if (!k) return;
    k.autoFit = false;
    k.userRotated = true;
    k.cameraTween = null;
    if (k.cameraMode !== 'free') k.cameraMode = 'free';
  }

  function applyFrontPreset({ explicit = false } = {}){
    const k = window.kaykit3D;
    if (!k?.camera || !k?.viewTarget) return false;

    /* Une action manuelle du joueur prime toujours sur le preset initial.
       Seul un clic explicite sur VUE FACE est autorisé à reprendre la main. */
    if (!explicit && (k.userRotated || k.userInteracting || k.cameraMode === 'free')) {
      return false;
    }

    const min = Number.isFinite(k.minZoom) ? k.minZoom : 6.4;
    const max = Number.isFinite(k.maxZoom) ? k.maxZoom : 25;
    const reculVoulu = Number.isFinite(window.ILYOS_FRONT_DISTANCE)
      ? window.ILYOS_FRONT_DISTANCE : reculPourPlateau(k);
    const distance = Math.max(min, Math.min(reculVoulu, max));

    k.cameraTween = null;
    k.viewMode = 'front';
    k.autoFit = false;
    k.zoomDistance = distance;

    /* HAUTEUR VISÉE — le réglage de cadrage le plus rentable de la scène.
       Viser le plateau lui-même (y = .22) le plaçait au centre de l'image, et laissait
       la moitié haute quasi vide pendant que le soleil, ses rayons et l'archipel
       lointain se retrouvaient hors champ ou masqués derrière le plateau.
       Viser AU-DESSUS de lui le fait descendre dans le cadre. L'inclinaison et la
       distance ne changent pas : la lisibilité du plateau est donc strictement
       identique, on ne fait qu'ouvrir les deux tiers supérieurs sur le décor.
       Ajustable à chaud par ILYOS_SKY.cadrage({ hauteur }). */
    const hauteurVisee = Number.isFinite(window.ILYOS_FRONT_VIEW_HEIGHT)
      ? window.ILYOS_FRONT_VIEW_HEIGHT
      : -0.5;
    if (typeof k.viewTarget.set === 'function') k.viewTarget.set(0, hauteurVisee, .18);
    const target = k.viewTarget;
    const pitch = (Number.isFinite(window.ILYOS_FRONT_PITCH_DEG)
      ? window.ILYOS_FRONT_PITCH_DEG : FRONT_PITCH_DEG) * Math.PI / 180;
    k.camera.position.set(
      target.x,
      target.y + distance * Math.sin(pitch),
      target.z + distance * Math.cos(pitch)
    );
    k.camera.lookAt(target);

    if (k.orbit) {
      k.orbit.target.copy(target);
      k.orbit.update();
    }
    return true;
  }

  function applyInitialWhenReady(){
    if (initialPresetApplied) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      if (initialPresetApplied) {
        clearInterval(timer);
        return;
      }
      if (applyFrontPreset()) {
        initialPresetApplied = true;
        clearInterval(timer);
      } else if (attempts >= 20) {
        clearInterval(timer);
      }
    }, 40);
  }

  /* Au passage menu -> partie, attendre que la scène 3D soit réellement créée.
     Pas de boucle permanente et aucun coût par frame.

     IMPORTANT : #gameScreen change de classe pour bien d'autres raisons
     pendant une partie déjà en cours (ex. "ai-turn" togglée à chaque tour,
     voir js/game/turns.js). Observer *tout* changement de classe et réappliquer
     le preset à chaque fois ramenait la caméra en vue de face à chaque tour de
     l'IA, écrasant la vue iso/manuelle choisie par le joueur. On ne réapplique
     donc plus que sur la vraie transition menu -> partie (hidden -> visible). */
  function watchGameVisibility(){
    const game = document.getElementById('gameScreen');
    if (!game) return;

    let wasVisible = !game.classList.contains('hidden');
    if (wasVisible) applyInitialWhenReady();

    new MutationObserver(() => {
      const visible = !game.classList.contains('hidden');
      /* Important : seules les vraies transitions caché -> visible comptent.
         Les classes ai-turn et autres états du jeu ne doivent jamais rappeler
         applyFrontPreset(). */
      if (visible && !wasVisible && !initialPresetApplied) applyInitialWhenReady();
      wasVisible = visible;
    }).observe(game, {
      attributes:true,
      attributeFilter:['class']
    });
  }

  /* Le moteur historique gardait AUTO lors d'un zoom molette. Pour l'utilisateur,
     zoomer signifie qu'il a choisi son cadrage : on passe donc en LIBRE. */
  document.addEventListener('wheel', event => {
    if (!event.target?.closest?.('#kaykitCanvas')) return;
    markManualCameraControl();
  }, { capture:true, passive:true });

  /* VUE FACE reste disponible, mais uniquement sur demande explicite. */
  document.addEventListener('click', event => {
    const front = event.target?.closest?.('[data-kay-view-face], [data-hud-camera="front"]');
    if (!front) return;
    requestAnimationFrame(() => applyFrontPreset({ explicit:true }));
    setTimeout(() => applyFrontPreset({ explicit:true }), 120);
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchGameVisibility, { once:true });
  } else {
    watchGameVisibility();
  }

  window.ILYOS_applyFrontCameraPreset = () => applyFrontPreset({ explicit:true });
})();

/* HUD Organique V2 DIRECT — overlay autonome issu du prototype validé. */
(function(){
  if (window.__ILYOS_HUD_ORGANIC_LOADER__) return;
  window.__ILYOS_HUD_ORGANIC_LOADER__ = true;

  const styles = [
    './css/hud-organique-v2.css?v=12.7',
    './css/hud-organique-v2-polish-v6.css?v=12.7',
    './css/hud-organique-v2-readability-v7.css?v=12.7',
    './css/hud-organique-v2-final-v8.css?v=12.7',
    './css/hud-organique-v2-depth-v9.css?v=12.7',
    './css/hud-organique-v2-depth-v10.css?v=12.7',
    './css/hud-consolidation-v12.css?v=12.7',
    './css/hud-organique-v2-layout-v10.css?v=1',
    // Chargée en dernier : voir l'en-tête du fichier pour la raison.
    './css/sound-lab.css?v=1'
  ];
  styles.forEach(href=>{
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href=href;
    document.head.appendChild(link);
  });

  const scripts = [
    './js/hud-organique-v2.js?v=12.7',
    './js/hud-organique-v2-final-v8.js?v=12.7',
    './js/hud-organique-v2-depth-v9.js?v=12.7',
    './js/hud-organique-v2-depth-v10.js?v=12.7',
    './js/hud-consolidation-v12.js?v=12.7',
    './js/ai-move-tail-guard-v12.js?v=12.7',
    './js/hud-organique-v2-layout-v10.js?v=1'
  ];
  scripts.forEach(src=>{
    const script=document.createElement('script');
    script.src=src;
    script.defer=true;
    document.head.appendChild(script);
  });
})();

/* ILYOS V11 MENU — isolated iframe integration.
   The visual menu lives entirely in /menu. This file only bridges it to the existing game. */
(function () {
  if (window.__ILYOS_MENU_IFRAME_BOOT__) return;
  window.__ILYOS_MENU_IFRAME_BOOT__ = true;

  const guardStyle = document.createElement('style');
  guardStyle.id = 'ilyos-menu-v11-guard';
  guardStyle.textContent = `
    body.ilyos-menu-v11-active > #setupScreen{visibility:hidden!important;pointer-events:none!important}
    #ilyos-menu-v11-frame{position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:2147483000;background:#040a11;display:block}
    #ilyos-menu-v11-frame[hidden]{display:none!important}
    .online-menu-back{margin-top:14px;display:inline-flex;align-items:center;gap:6px;padding:10px 18px;border-radius:10px;border:1px solid rgba(216,170,76,.45);background:rgba(216,170,76,.12);color:#f4d28e;font:inherit;font-weight:600;cursor:pointer}
    .online-menu-back:hover{background:rgba(216,170,76,.22)}
  `;
  document.head.appendChild(guardStyle);

  const MODE_MAP = { solo:'1', duel:'2', team:'4', online:'online' };

  function fireChange(node){ if (node) node.dispatchEvent(new Event('change', { bubbles:true })); }
  function setLegacyMode(mode) {
    const select = document.getElementById('playerCount');
    if (!select || !(mode in MODE_MAP)) return false;
    select.value = MODE_MAP[mode]; fireChange(select); return true;
  }
  function setSelect(id, value) {
    const node = document.getElementById(id);
    if (!node || value == null) return false;
    const wanted = String(value);
    if (![...node.options].some(opt => opt.value === wanted)) return false;
    node.value = wanted; fireChange(node); return true;
  }
  function setInputNode(node, value) {
    if (!node) return false;
    node.value = value == null || value === 'AUTO' ? '' : String(value);
    node.dispatchEvent(new Event('input', { bubbles:true }));
    node.dispatchEvent(new Event('change', { bubbles:true }));
    return true;
  }
  function setInput(id, value) { return setInputNode(document.getElementById(id), value); }
  function setPlayerNames(values = {}) {
    const inputs = [...document.querySelectorAll('#playersForm .player-name')];
    inputs.forEach((input, index) => {
      const value = values[`name${index + 1}`];
      if (value) setInputNode(input, value);
    });
  }

  function applySettings(mode, values = {}) {
    setLegacyMode(mode);
    setPlayerNames(values);

    if (mode === 'solo') {
      setSelect('startingBoardSelect', values.board || 'classic');
      setSelect('turnTimerSelect', values.timer || '0');
      setSelect('aiDifficultySelect', values.difficulty || 'normal');
    } else if (mode === 'duel') {
      setSelect('startingBoardSelect', values.board || 'classic');
      setSelect('turnTimerSelect', values.timer || '0');
      setPlayerNames(values);
    } else if (mode === 'team') {
      setSelect('startingBoardSelect', values.board || 'classic');
      setPlayerNames(values);
    } else if (mode === 'online') {
      setSelect('onlineRoleSelect', values.role || 'host');
      setInput('onlineRoomInput', values.roomCode || 'AUTO');
      setSelect('startingBoardSelect', values.board || 'classic');
      setSelect('turnTimerSelect', values.timer || '0');
      setPlayerNames(values);
    }
    return true;
  }

  function launchGame(mode, values) {
    applySettings(mode, values || {});
    requestAnimationFrame(() => {
      applySettings(mode, values || {});
      const launch = document.getElementById('altStartBtn') || document.getElementById('startBtn');
      launch?.click();
    });
  }

  /* Mode EN LIGNE : contrairement aux autres modes, JOUER ne fait pas
     apparaître #gameScreen tout de suite — l'hôte doit d'abord voir son code
     de salon et attendre l'invité (ou l'invité doit se connecter). Cet écran
     d'attente n'existe que dans l'ancien #setupScreen (#onlineSetupStatus,
     code généré, etc.) : sans ce bridge, la partie EN LIGNE se lance bien en
     coulisses mais reste invisible sous l'iframe du menu, qui elle ne se
     cache que quand #gameScreen devient visible. On révèle donc l'ancien
     écran dès que le panneau EN LIGNE existe, avec un bouton de retour. */
  function revealOnlineSetup(frame) {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      const panel = document.querySelector('.online-setup-panel');
      if (panel) {
        clearInterval(timer);
        frame.hidden = true;
        document.body.classList.remove('ilyos-menu-v11-active');
        if (!panel.querySelector('.online-menu-back')) {
          const back = document.createElement('button');
          back.type = 'button';
          back.className = 'online-menu-back';
          back.textContent = '← Retour au menu';
          back.addEventListener('click', () => location.reload());
          panel.appendChild(back);
        }
      } else if (attempts >= 25) {
        clearInterval(timer);
      }
    }, 40);
  }

  function syncFrame(frame) {
    const setup = document.getElementById('setupScreen');
    const game = document.getElementById('gameScreen');
    const gameVisible = !!game && !game.classList.contains('hidden');
    const setupVisible = !!setup && !setup.classList.contains('hidden');
    if (gameVisible) {
      frame.hidden = true;
      document.body.classList.remove('ilyos-menu-v11-active');
    } else if (setupVisible || !gameVisible) {
      frame.hidden = false;
      document.body.classList.add('ilyos-menu-v11-active');
    }
  }

  function boot() {
    if (document.getElementById('ilyos-menu-v11-frame')) return;
    document.body.classList.add('ilyos-menu-v11-active');
    const frame = document.createElement('iframe');
    frame.id = 'ilyos-menu-v11-frame';
    frame.title = 'Menu ILYOS';
    frame.src = `./menu/frame.html?v=${encodeURIComponent(window.ILYOS_BUILD)}`;
    frame.setAttribute('allow', 'autoplay; fullscreen');
    frame.allowFullscreen = true;
    document.body.appendChild(frame);

    window.addEventListener('message', (event) => {
      if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
      const msg = event.data || {};
      if (msg.source !== 'ilyos-menu') return;
      if (msg.type === 'mode') setLegacyMode(msg.detail?.mode);
      if (msg.type === 'settings') applySettings(msg.detail?.mode, msg.detail?.values || {});
      if (msg.type === 'play') {
        launchGame(msg.detail?.mode, msg.detail?.values || {});
        if (msg.detail?.mode === 'online') {
          revealOnlineSetup(frame);
        } else {
          setTimeout(() => syncFrame(frame), 100);
          setTimeout(() => syncFrame(frame), 700);
        }
      }
      if (msg.type === 'action') {
        const action = msg.detail?.action;
        if (action === 'settings') document.getElementById('soundBtn')?.click();
        if (action === 'resume') {
          document.getElementById('resumeLocalBtn')?.click();
          setTimeout(() => syncFrame(frame), 100);
          setTimeout(() => syncFrame(frame), 700);
        }
        if (action === 'aivsai') {
          window.ILYOS_TEST?.playAIvsAI?.();
          setTimeout(() => syncFrame(frame), 700);
          setTimeout(() => syncFrame(frame), 1400);
        }
      }
    });

    const observer = new MutationObserver(() => syncFrame(frame));
    const setup = document.getElementById('setupScreen');
    const game = document.getElementById('gameScreen');
    if (setup) observer.observe(setup, {attributes:true,attributeFilter:['class']});
    if (game) observer.observe(game, {attributes:true,attributeFilter:['class']});
    syncFrame(frame);
    console.info('[ILYOS menu] isolated iframe active');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
