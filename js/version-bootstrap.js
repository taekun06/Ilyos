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

  const FRONT_DISTANCE = 13.8;
  const FRONT_Y = .63;
  const FRONT_Z = .83;
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
    const distance = Math.max(min, Math.min(FRONT_DISTANCE, max));

    k.cameraTween = null;
    k.viewMode = 'front';
    k.autoFit = false;
    k.zoomDistance = distance;

    if (typeof k.viewTarget.set === 'function') k.viewTarget.set(0, .22, .18);
    const target = k.viewTarget;
    k.camera.position.set(
      target.x,
      target.y + distance * FRONT_Y,
      target.z + distance * FRONT_Z
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
    './css/hud-consolidation-v12.css?v=12.7'
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
    './js/ai-move-tail-guard-v12.js?v=12.7'
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
        setTimeout(() => syncFrame(frame), 100);
        setTimeout(() => syncFrame(frame), 700);
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
