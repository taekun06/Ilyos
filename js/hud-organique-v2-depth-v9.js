/* ILYOS — DEPTH V9 / ajustement visuel 3D léger
   Réutilise uniquement l'éclairage et les ombres Three.js déjà existants.
   Aucun mesh, aucune règle, aucun raycast, aucun timing de jeu modifié. */
(function(){
  if (window.__ILYOS_DEPTH_V9__) return;
  window.__ILYOS_DEPTH_V9__ = true;

  let attempts = 0;
  function apply(){
    attempts++;
    const scene = window.kaykit3D?.scene;
    if (!scene) {
      if (attempts < 100) setTimeout(apply,150);
      return;
    }

    let ambient = null;
    let hemi = null;
    let sun = null;
    scene.traverse(obj=>{
      if (!ambient && obj.isAmbientLight) ambient = obj;
      if (!hemi && obj.isHemisphereLight) hemi = obj;
      if (!sun && obj.isDirectionalLight && obj.castShadow) sun = obj;
    });

    // Valeurs volontairement très proches de l'existant : juste assez pour
    // rendre les contacts sous objets/reliefs plus présents face au ciel clair.
    if (ambient && !ambient.userData?.ov2DepthV9) {
      ambient.userData.ov2DepthV9 = true;
      ambient.intensity = Math.min(ambient.intensity, .26);
    }
    if (hemi && !hemi.userData?.ov2DepthV9) {
      hemi.userData.ov2DepthV9 = true;
      hemi.intensity = Math.min(hemi.intensity, .76);
    }
    if (sun && !sun.userData?.ov2DepthV9) {
      sun.userData.ov2DepthV9 = true;
      sun.intensity = Math.max(sun.intensity, 1.82);
      if (sun.shadow) {
        sun.shadow.radius = Math.max(sun.shadow.radius || 0, 1.55);
        sun.shadow.normalBias = Math.max(sun.shadow.normalBias || 0, .013);
      }
    }
    console.info('[ILYOS] Depth V9 active');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',apply,{once:true});
  else apply();
})();
