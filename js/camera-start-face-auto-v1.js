/* ILYOS — caméra de départ : VUE FACE + AUTO
   Pure couche d'initialisation. Réutilise les vrais boutons caméra du moteur 3D. */
(() => {
  'use strict';
  if (window.__ILYOS_CAMERA_START_FACE_AUTO_V1__) return;
  window.__ILYOS_CAMERA_START_FACE_AUTO_V1__ = true;

  const byId = id => document.getElementById(id);
  let previousVisible = false;
  let applyToken = 0;

  function gameVisible() {
    const game = byId('gameScreen');
    return !!game && !game.classList.contains('hidden');
  }

  /* La première étape du tutoriel Découverte apprend précisément au joueur à
     observer et faire tourner le monde. Elle prend donc possession de la caméra
     dès l'ouverture du jeu. Le preset global FACE/AUTO ne doit pas revenir la
     recadrer quelques centaines de millisecondes plus tard. */
  function discoveryOwnsCamera() {
    return !!byId('gameScreen')?.classList.contains('tutorial-discovery');
  }

  function applyFaceAuto(token, attempt = 0) {
    if (token !== applyToken || !gameVisible() || discoveryOwnsCamera()) return;
    const k = window.kaykit3D;
    const controls = k?.controls;
    const face = controls?.querySelector?.('[data-kay-view-face]');
    const auto = controls?.querySelector?.('[data-kay-camera-auto]');

    if (!k || !controls || !face || !auto) {
      if (attempt < 24) setTimeout(() => applyFaceAuto(token, attempt + 1), 125);
      return;
    }

    /* Valeurs directes = filet de sécurité ; les clics exécutent ensuite la vraie
       logique interne (tween, UI, OrbitControls) du moteur KayKit. */
    k.viewMode = 'front';
    k.cameraMode = 'auto';
    k.autoFit = true;
    k.userRotated = false;
    k.userInteracting = false;

    face.click();
    setTimeout(() => {
      if (token !== applyToken || !gameVisible() || discoveryOwnsCamera()) return;
      auto.click();
    }, 45);

    /* beginTurn() centre historiquement la couronne au tout premier tour après
       renderAll(). Une seconde application courte garantit que la partie finit
       bien en VUE FACE/AUTO, sans empêcher les suivis automatiques ultérieurs. */
    if (attempt === 0) {
      setTimeout(() => {
        if (token !== applyToken || !gameVisible() || discoveryOwnsCamera()) return;
        k.viewMode = 'front';
        k.cameraMode = 'auto';
        k.autoFit = true;
        face.click();
        setTimeout(() => {
          if (token !== applyToken || !gameVisible() || discoveryOwnsCamera()) return;
          auto.click();
        }, 35);
      }, 520);
    }
  }

  function onVisibilityCheck() {
    const visible = gameVisible();
    if (visible && !previousVisible) {
      const token = ++applyToken;
      setTimeout(() => applyFaceAuto(token), 60);
    }
    if (!visible && previousVisible) applyToken++;
    previousVisible = visible;
  }

  function boot() {
    const game = byId('gameScreen');
    if (!game) {
      setTimeout(boot, 100);
      return;
    }
    previousVisible = false;
    const observer = new MutationObserver(onVisibilityCheck);
    observer.observe(game, { attributes: true, attributeFilter: ['class'] });
    onVisibilityCheck();
    window.ILYOS_CAMERA_START_FACE_AUTO = { apply: () => {
      const token = ++applyToken;
      applyFaceAuto(token);
    }};
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();