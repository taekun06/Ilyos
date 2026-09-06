/* ILYOS — Camera System V2
   Couche de navigation uniquement : aucune règle de jeu, aucun changement HUD.

   Objectifs :
   - une rotation 360° fluide autour du plateau ;
   - un zoom plus précis et moins nerveux ;
   - empêcher les angles quasi horizontaux qui nuisent au jeu ;
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
    // 24° reste la limite de navigation libre habituelle. La vue de dessus est
    // un preset explicite qui ouvre temporairement la limite jusqu'à 6°.
    minPolarAngle: 24 * Math.PI / 180,
    maxPolarAngle: 74 * Math.PI / 180,
    topPolarAngle: 6 * Math.PI / 180,
    rotateStep: Math.PI / 4,
    rotateDuration: 300,
    tiltDuration: 360
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

  function syncModeUI(k) {
    const autoButton = k?.controls?.querySelector?.('[data-kay-camera-auto]');
    const freeButton = k?.controls?.querySelector?.('[data-kay-camera-free]');
    autoButton?.classList.toggle('kaykit-mode-active', k?.cameraMode === 'auto');
    freeButton?.classList.toggle('kaykit-mode-active', k?.cameraMode !== 'auto');
  }

  function setFreeMode(k) {
    if (!k) return;
    k.autoFit = false;
    k.userRotated = true;
    k.cameraTween = null;
    k.cameraMode = 'free';
    syncModeUI(k);
  }

  function setAutoModeWithoutFollow(k) {
    if (!k) return;
    // Espace doit rendre exactement la vue FACE canonique. On ne clique pas sur
    // le bouton AUTO car setKayKitCameraMode('auto') déclenche immédiatement
    // kaykitFollowCurrentPlayer(true), ce qui déplacerait de nouveau la cible.
    k.cameraMode = 'auto';
    k.userRotated = false;
    k.userInteracting = false;
    syncModeUI(k);
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

  function polarForBaseAngle() {
    const pitchDeg = Number.isFinite(window.ILYOS_FRONT_PITCH_DEG)
      ? window.ILYOS_FRONT_PITCH_DEG
      : 37.2;
    return THREE.MathUtils.clamp(
      Math.PI / 2 - pitchDeg * Math.PI / 180,
      CONFIG.minPolarAngle,
      CONFIG.maxPolarAngle
    );
  }

  function tiltTo(polar, { top = false } = {}) {
    const k = window.kaykit3D;
    if (!k?.camera || discoveryOwnsCamera()) return false;
    configureOrbit(k);

    const target = k.orbit?.target?.clone?.() || k.viewTarget?.clone?.();
    if (!target) return false;
    const offset = new THREE.Vector3().subVectors(k.camera.position, target);
    const distance = offset.length();
    if (distance < 1e-3) return false;

    // Conserver le sens dans lequel le joueur regardait : ↑/↓ ne font varier
    // que l'inclinaison, jamais l'azimut, le zoom ou la cible.
    let azimuth = Math.atan2(offset.x, offset.z);
    if (!Number.isFinite(azimuth)) azimuth = 0;

    if (k.orbit) {
      // La vue de dessus est volontairement plus verticale que la limite de
      // navigation libre. ↓ ou Espace restaurent immédiatement la limite 24°.
      k.orbit.minPolarAngle = top ? CONFIG.topPolarAngle : CONFIG.minPolarAngle;
      k.orbit.maxPolarAngle = CONFIG.maxPolarAngle;
    }

    const safePolar = THREE.MathUtils.clamp(
      polar,
      top ? CONFIG.topPolarAngle : CONFIG.minPolarAngle,
      CONFIG.maxPolarAngle
    );
    const horizontal = Math.sin(safePolar) * distance;
    const destination = new THREE.Vector3(
      target.x + Math.sin(azimuth) * horizontal,
      target.y + Math.cos(safePolar) * distance,
      target.z + Math.cos(azimuth) * horizontal
    );

    setFreeMode(k);
    k.cameraTween = {
      started: performance.now(),
      duration: reducedMotion() ? 90 : CONFIG.tiltDuration,
      startPosition: k.camera.position.clone(),
      endPosition: destination,
      startTarget: target.clone(),
      endTarget: target.clone()
    };
    return true;
  }

  function topView() {
    return tiltTo(CONFIG.topPolarAngle, { top: true });
  }

  function baseAngle() {
    return tiltTo(polarForBaseAngle(), { top: false });
  }

  function face() {
    if (discoveryOwnsCamera()) return false;
    const k = window.kaykit3D;
    if (!k?.camera) return false;
    configureOrbit(k);

    // Restaurer d'abord les limites normales si l'on vient de la vue de dessus.
    if (k.orbit) {
      k.orbit.minPolarAngle = CONFIG.minPolarAngle;
      k.orbit.maxPolarAngle = CONFIG.maxPolarAngle;
    }

    // Le preset canonique connaît le cadrage atmosphérique exact de la vue FACE
    // (distance 17 sur 11×11, pitch 37,2°, hauteur visée et centre du plateau).
    if (typeof window.ILYOS_applyFrontCameraPreset !== 'function') return false;
    window.ILYOS_applyFrontCameraPreset();
    setAutoModeWithoutFollow(k);
    configureOrbit(k);
    return true;
  }

  function center() {
    return face();
  }

  function installKeyboard() {
    if (window.__ILYOS_CAMERA_V2_KEYS__) return;
    window.__ILYOS_CAMERA_V2_KEYS__ = true;

    // Capture : Espace doit passer avant le raccourci historique de core.js,
    // qui appelle encore snapKayKitView('front') et produisait un autre cadrage.
    document.addEventListener('keydown', event => {
      if (!gameVisible() || discoveryOwnsCamera() || event.ctrlKey || event.metaKey || event.altKey) return;
      const tag = event.target?.tagName?.toLowerCase?.();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || event.target?.isContentEditable) return;

      // Q/E restent exclusivement au gameplay (rotation d'île). ←/→ sont déjà
      // gérés par core.js : rotation d'île quand elle est disponible, sinon
      // rotation caméra. Camera System V2 ne les intercepte donc pas ici.
      if (event.key === 'ArrowUp') {
        if (topView()) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      if (event.key === 'ArrowDown') {
        if (baseAngle()) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      if (event.key === ' ' || event.key === 'Spacebar') {
        if (tag === 'button' || tag === 'a') return;
        if (face()) {
          event.preventDefault();
          event.stopPropagation();
        }
      }
    }, { capture: true, passive: false });
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
    version: '2.1.0',
    config: CONFIG,
    apply,
    rotateLeft: () => rotateBy(-1),
    rotateRight: () => rotateBy(1),
    top: topView,
    baseAngle,
    face,
    center
  };

  console.info('[ILYOS] Camera System V2.1 active');
})();
