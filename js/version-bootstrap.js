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

/* Caméra FRONT — preset non invasif.
   IMPORTANT : ne jamais redéfinir window.kaykit3D, minZoom ou maxZoom ici.
   Le précédent essai clampait temporairement maxZoom à 6.4 et provoquait le
   gros zoom + la molette bloquée. On conserve désormais toute la plage native.

   12.4 est la distance FRONT historique du moteur et correspond au cadrage
   souhaité : plateau lisible, villages périphériques visibles, sans auto-fit
   excessif. */
(function installFrontCameraPreset(){
  if (window.__ILYOS_FRONT_CAMERA_PRESET__) return;
  window.__ILYOS_FRONT_CAMERA_PRESET__ = true;

  const FRONT_DISTANCE = 12.4;
  const FRONT_Y = .63;
  const FRONT_Z = .83;

  function applyFrontPreset(){
    const k = window.kaykit3D;
    if (!k?.camera || !k?.viewTarget) return false;

    const min = Number.isFinite(k.minZoom) ? k.minZoom : 6.4;
    const max = Number.isFinite(k.maxZoom) ? k.maxZoom : 25;
    const distance = Math.max(min, Math.min(FRONT_DISTANCE, max));

    /* Annule uniquement un éventuel tween d'auto-fit FRONT en cours.
       On ne touche pas aux bornes de zoom : la molette reste totalement libre. */
    k.cameraTween = null;
    k.viewMode = 'front';
    k.autoFit = false;
    k.userRotated = false;
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

  function applySoon(){
    requestAnimationFrame(() => applyFrontPreset());
    setTimeout(() => applyFrontPreset(), 120);
  }

  /* Au passage menu -> partie, attendre que la scène 3D soit réellement créée.
     Pas de boucle permanente et aucun coût par frame. */
  function watchGameVisibility(){
    const game = document.getElementById('gameScreen');
    if (!game) return;

    const applyWhenVisible = () => {
      if (game.classList.contains('hidden')) return;
      let attempts = 0;
      const timer = setInterval(() => {
        attempts++;
        if (applyFrontPreset() || attempts >= 20) clearInterval(timer);
      }, 40);
    };

    new MutationObserver(applyWhenVisible).observe(game, {
      attributes:true,
      attributeFilter:['class']
    });
    applyWhenVisible();
  }

  /* Le moteur fait encore son auto-fit natif quand on clique VUE FACE.
     On réapplique simplement le preset après ce clic, sans modifier ISO/LIBRE. */
  document.addEventListener('click', event => {
    const front = event.target?.closest?.('[data-kay-view-face], [data-hud-camera="front"]');
    if (!front) return;
    applySoon();
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchGameVisibility, { once:true });
  } else {
    watchGameVisibility();
  }

  window.ILYOS_applyFrontCameraPreset = applyFrontPreset;
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
