/* ILYOS — HUD Organique V2 / FINAL V8
   Complément purement visuel : Undo SVG.
   Aucun gameplay, aucune règle, aucun compteur Undo.
   (Les portraits 3D générés depuis les GLB ont été retirés au profit de
   l'illustration vectorielle stylisée définie dans hud-organique-v2.js.) */
(function(){
  if (window.__ILYOS_HUD_FINAL_V8__) return;
  window.__ILYOS_HUD_FINAL_V8__ = true;

  const undoSvg = `<svg class="ov2-undo-svg" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M17 17H8V8"/><path d="M9 16c5-7 16-10 24-5 8 5 11 15 7 24-4 8-14 12-23 8"/></svg>`;

  function waitForHud(){
    const root = document.getElementById('ilyosHudOrganicV2');
    if (!root) {
      requestAnimationFrame(waitForHud);
      return;
    }
    installUndo(root);
  }

  function installUndo(root){
    const undo = root.querySelector('#ov2Undo');
    if (!undo || undo.dataset.v8Undo === '1') return;
    undo.dataset.v8Undo = '1';
    undo.innerHTML = undoSvg;
    undo.setAttribute('aria-label','Annuler');
    undo.setAttribute('title','Annuler');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',waitForHud,{once:true});
  else waitForHud();
})();
