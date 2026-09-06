/* ILYOS — Camera System V2
   Couche de navigation uniquement : aucune règle de jeu, aucun changement HUD.

   Objectifs :
   - une rotation 360° fluide autour du plateau ;
   - un zoom plus précis et moins nerveux ;
   - empêcher les angles quasi horizontaux / quasi verticaux qui nuisent au jeu ;
   - conserver AUTO/LIBRE et les presets FACE/ISO du moteur existant ;
   - ne jamais reprendre la caméra au tutoriel Découverte ;
   - fournir une petite API stable pour les futures cinématiques/tutoriels.

   IMPORTANT : la position de départ reste la responsabilité du preset canonique
   de js/version-bootstrap.js. Cette couche ne réapplique jamais FACE/AUTO toute
   seule : elle règle OrbitControls une fois qu'il existe puis laisse le joueur
   et le moteur décider du cadrage.
*/
(() => {
  'use strict';
  if (window.__ILYOS_CAMERA_SYSTEM_V2__) return;
  window.__ILYOS_CAMERA_SYSTEM_V2__ = true;

  const CONFIG = Object.freeze({
    dampingFactor: 0.10,
    rotateSpeed: 0.64,
    zoomSpeed: 0.72,
    panSpeed: 0.58,
    // OrbitControls mesure l'angle polaire depuis le zénith.
    // 24° conserve une vraie vue tactique ; 74° garde de la profondeur sans
    // laisser la caméra descendre au ras du plateau.
    minPolarAngle: 24 * Math.PI / 180,
    maxPolarAngle: 74 * Math.PI / 180,
    rotateStep: Math.PI / 4,
    rotateDuration: 300
  });

  let installedOrbit = null;
  let readyTimer = 0;

  function gameVisible() {
    const game = document.getElementById('gameScreen');
    return !!game && !game.classList.contains('hidden');
  }

  function discoveryOwnsCamera() {
    return !!document.getElementById('gameScreen')?.classList.contains('tutorial-discovery');
  }

  function reducedMotion() {
    return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }

  function setFreeMode(k) {
    if (!k) return;
    k.autoFit = false;
    k.userRotated = true;
    k.cameraTween = null;

    // Réutilise la vraie logique du moteur afin que l'état et le HUD restent
    // synchronisés. Si le bouton n'existe pas encore, le filet de sécurité
    // direct suffit ; apply() repassera une fois la scène totalement prête.
    const freeButton = k.controls?.querySelector?.('[data-kay-camera-free]');
    if (k.cameraMode !== 'free' && freeButton) freeButton.click();
    else k.cameraMode = 'free';
  }

  function configureOrbit(k) {
    const orbit = k?.orbit;
    if (!orbit || orbit === installedOrbit) return !!orbit;

    orbit.enableDamping = true;
    orbit.dampingFactor = CONFIG.dampingFactor;
    orbit.enableRotate = true;
    orbit.enableZoom = true;
    orbit.enablePan = true;

    // Le pan dans le plan du monde évite de faire dériver verticalement le point
    // visé et conserve la sensation de tourner autour d'un plateau physique.
    orbit.screenSpacePanning = false;
    orbit.panSpeed = CONFIG.panSpeed;
    orbit.rotateSpeed = CONFIG.rotateSpeed;
    orbit.zoomSpeed = CONFIG.zoomSpeed;

    orbit.minDistance = Number.isFinite(k.minZoom) ? k.minZoom : orbit.minDistance;
    orbit.maxDistance = Number.isFinite(k.maxZoom) ? k.maxZoom : orbit.maxDistance;
    orbit.minPolarAngle = CONFIG.minPolarAngle;
    orbit.maxPolarAngle = CONFIG.maxPolarAngle;

    // Le clic gauche reste compatible avec le raycast de gameplay : le moteur
    // possède déjà son seuil de drag et Mobile Input V2 désambiguïse tap/glissé.
    if (window.THREE?.MOUSE) {
      orbit.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
      orbit.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
      orbit.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    }
    if (window.THREE?.TOUCH && orbit.touches) {
      orbit.touches.ONE = THREE.TOUCH.ROTATE;
      orbit.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    }

    orbit.update();
    installedOrbit = orbit;
    return true;
  }

  function rotateBy(direction) {
    const k = window.kaykit3D;
    if (!k?.camera || discoveryOwnsCamera()) return false;

    configureOrbit(k);
    const target = k.orbit?.target?.clone?.() || k.viewTarget?.clone?.();
    if (!target) return false;

    const offset = new THREE.Vector3().subVectors(k.camera.position, target);
    const radius = Math.hypot(offset.x, offset.z);
    if (radius < 1e-3) return false;

    setFreeMode(k);

    const azimuth = Math.atan2(offset.x, offset.z) + direction * CONFIG.rotateStep;
    const destination = new THREE.Vector3(
      target.x + Math.sin(azimuth) * radius,
      k.camera.position.y,
      target.z + Math.cos(azimuth) * radius
    );

    // Même structure de tween que le moteur KayKit : la boucle de rendu
    // existante anime caméra + OrbitControls sans seconde boucle rAF.
    k.cameraTween = {
      started: performance.now(),
      duration: reducedMotion() ? 90 : CONFIG.rotateDuration,
      startPosition: k.camera.position.clone(),
      endPosition: destination,
      startTarget: target.clone(),
      endTarget: target.clone()
    };
    return true;
  }

  function center() {
    if (discoveryOwnsCamera()) return false;
    const k = window.kaykit3D;
    if (!k?.camera) return false;

    // Le preset canonique connaît le cadrage atmosphérique exact de la vue FACE
    // (distance, pitch, hauteur visée). On le réutilise au lieu de le dupliquer.
    if (typeof window.ILYOS_applyFrontCameraPreset === 'function') {
      setFreeMode(k);
      window.ILYOS_applyFrontCameraPreset();
      configureOrbit(k);
      return true;
    }
    return false;
  }

  function installKeyboard() {
    if (window.__ILYOS_CAMERA_V2_KEYS__) return;
    window.__ILYOS_CAMERA_V2_KEYS__ = true;
    document.addEventListener('keydown', event => {
      if (!gameVisible() || discoveryOwnsCamera() || event.ctrlKey || event.metaKey || event.altKey) return;
      const tag = event.target?.tagName?.toLowerCase?.();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || event.target?.isContentEditable) return;

      const key = String(event.key || '').toLowerCase();
      if (key === 'q') {
        if (rotateBy(-1)) event.preventDefault();
      } else if (key === 'e') {
        if (rotateBy(1)) event.preventDefault();
      }
    }, { passive: false });
  }

  function apply() {
    const k = window.kaykit3D;
    if (!k?.orbit) return false;
    configureOrbit(k);
    return true;
  }

  function waitForScene() {
    clearTimeout(readyTimer);
    let attempts = 0;
    const check = () => {
      attempts++;
      if (apply() || attempts >= 80) return;
      readyTimer = setTimeout(check, 75);
    };
    check();
  }

  function watchGameVisibility() {
    const game = document.getElementById('gameScreen');
    if (!game) {
      readyTimer = setTimeout(watchGameVisibility, 100);
      return;
    }

    let wasVisible = !game.classList.contains('hidden');
    if (wasVisible) waitForScene();

    new MutationObserver(() => {
      const visible = !game.classList.contains('hidden');
      if (visible && !wasVisible) waitForScene();
      wasVisible = visible;
    }).observe(game, { attributes: true, attributeFilter: ['class'] });
  }

  installKeyboard();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchGameVisibility, { once: true });
  } else {
    watchGameVisibility();
  }

  window.ILYOS_CAMERA_V2 = {
    version: '2.0.0',
    config: CONFIG,
    apply,
    rotateLeft: () => rotateBy(-1),
    rotateRight: () => rotateBy(1),
    center
  };

  console.info('[ILYOS] Camera System V2 active');
})();
