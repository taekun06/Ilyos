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

/* Caméra FRONT canonique.
   Le moteur fait un auto-fit complet du plateau lors de initKayKit3D(), puis à
   chaque rappel de VUE FACE. Sur un écran 16:9 cela produit le gros dézoom vu
   en jeu. Le preset validé visuellement doit au contraire rester proche du
   zoom minimal : il remplit le cadre tout en gardant les quatre sanctuaires
   périphériques lisibles.

   Le hook est installé AVANT game.js. Lors de l'exposition window.kaykit3D,
   maxZoom est limité à 6.4 uniquement pendant l'initialisation synchrone : le
   resize forcé de démarrage ne peut donc plus dézoomer. La valeur normale de
   maxZoom est restaurée dès la micro-tâche suivante, donc la molette conserve
   toute sa plage ensuite. */
(function installFrontCameraPreset(){
  if (window.__ILYOS_FRONT_CAMERA_PRESET__) return;
  window.__ILYOS_FRONT_CAMERA_PRESET__ = true;

  const FRONT_DISTANCE = 6.4;
  const FRONT_Y = .52;
  const FRONT_Z = .90;
  let currentKaykit = window.kaykit3D || null;

  function applyFrontPreset(k = currentKaykit){
    if (!k?.camera || !k?.viewTarget || !window.THREE) return false;

    const distance = Math.max(
      Number.isFinite(k.minZoom) ? k.minZoom : FRONT_DISTANCE,
      Math.min(FRONT_DISTANCE, Number.isFinite(k.maxZoom) ? k.maxZoom : FRONT_DISTANCE)
    );

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

  /* Intercepte la toute première affectation faite par game.js. */
  try {
    const existing = Object.getOwnPropertyDescriptor(window, 'kaykit3D');
    if (!existing || existing.configurable) {
      Object.defineProperty(window, 'kaykit3D', {
        configurable: true,
        enumerable: true,
        get(){ return currentKaykit; },
        set(value){
          currentKaykit = value;
          if (!value) return;

          const normalMaxZoom = Number.isFinite(value.maxZoom) ? value.maxZoom : 25;
          value.zoomDistance = FRONT_DISTANCE;
          value.maxZoom = Math.min(normalMaxZoom, FRONT_DISTANCE);

          queueMicrotask(() => {
            if (currentKaykit !== value) return;
            value.maxZoom = normalMaxZoom;
            applyFrontPreset(value);
          });
        }
      });
    }
  } catch (_) {
    /* Le fallback ci-dessous suffit si un navigateur refuse de redéfinir la propriété. */
  }

  /* Après un clic VUE FACE, le moteur lance son tween d'auto-fit. On le laisse
     traiter son UI, puis on annule seulement ce tween et on réapplique le
     cadrage de référence. Le clic ISO et les mouvements libres sont intacts. */
  document.addEventListener('click', event => {
    const target = event.target?.closest?.('[data-kay-view-face], [data-hud-camera="front"]');
    if (!target) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => applyFrontPreset(window.kaykit3D || currentKaykit));
    });
  }, true);

  /* Sécurité au passage réel menu -> partie : elle corrige aussi un éventuel
     resize tardif du navigateur sans créer de suivi permanent ni coût par frame. */
  function watchGameVisibility(){
    const game = document.getElementById('gameScreen');
    if (!game) return;
    const applyWhenVisible = () => {
      if (game.classList.contains('hidden')) return;
      requestAnimationFrame(() => applyFrontPreset(window.kaykit3D || currentKaykit));
      setTimeout(() => applyFrontPreset(window.kaykit3D || currentKaykit), 80);
    };
    new MutationObserver(applyWhenVisible).observe(game, { attributes:true, attributeFilter:['class'] });
    applyWhenVisible();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchGameVisibility, { once:true });
  else watchGameVisibility();

  window.ILYOS_applyFrontCameraPreset = () => applyFrontPreset(window.kaykit3D || currentKaykit);
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
