/* ILYOS — DEPTH V10 / relief 3D visible mais naturel
   Ajuste uniquement les lumières/ombres existantes. Aucun gameplay. */
(function(){
  if (window.__ILYOS_DEPTH_V10__) return;
  window.__ILYOS_DEPTH_V10__ = true;
  let attempts = 0;
  function apply(){
    attempts++;
    const scene = window.kaykit3D?.scene;
    if (!scene) {
      if (attempts < 120) setTimeout(apply,150);
      return;
    }
    let ambient=null, hemi=null, sun=null;
    scene.traverse(obj=>{
      if (!ambient && obj.isAmbientLight) ambient=obj;
      if (!hemi && obj.isHemisphereLight) hemi=obj;
      if (!sun && obj.isDirectionalLight && obj.castShadow) sun=obj;
    });
    if (ambient) ambient.intensity = Math.min(ambient.intensity,.22);
    if (hemi) hemi.intensity = Math.min(hemi.intensity,.70);
    if (sun) {
      sun.intensity = Math.max(sun.intensity,1.90);
      if (sun.shadow) {
        sun.shadow.radius = Math.max(sun.shadow.radius || 0,1.75);
        sun.shadow.normalBias = Math.max(sun.shadow.normalBias || 0,.014);
        sun.shadow.bias = Math.min(sun.shadow.bias || 0,-.0004);
      }
    }
    console.info('[ILYOS] Depth V10 active');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',apply,{once:true});
  else apply();
})();
