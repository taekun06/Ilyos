/* ILYOS — Runtime polish V13
   Deux corrections ciblées :
   1) remplace l'ancien libellé visuel "Version V64" du splash par la version actuelle V76 ;
   2) rapproche la vue de départ / vue FRONT du cadrage validé visuellement.
   Aucun gameplay ni HUD n'est modifié ici. */
(function(){
  if (window.__ILYOS_RUNTIME_POLISH_V13__) return;
  window.__ILYOS_RUNTIME_POLISH_V13__ = true;

  /* Le splash historique est rendu depuis un ancien bloc inline de index.html.
     On corrige uniquement le texte affiché, sans toucher à son animation. */
  function fixLegacyVersionLabel(root){
    const scope = root && root.nodeType ? root : document.documentElement;
    if (!scope) return;
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeValue && node.nodeValue.includes('Version V64')) nodes.push(node);
    }
    nodes.forEach(node => {
      node.nodeValue = node.nodeValue.replace(/Version V64/g, 'Version V76');
    });
  }

  fixLegacyVersionLabel(document.documentElement);
  const versionObserver = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => fixLegacyVersionLabel(node));
      if (mutation.type === 'characterData') fixLegacyVersionLabel(mutation.target.parentNode || mutation.target);
    });
  });
  versionObserver.observe(document.documentElement, { subtree:true, childList:true, characterData:true });

  /* Vue FRONT : même distance globale que la caméra actuelle, mais angle un peu
     plus bas / cinématique. Le vecteur .52/.90 conserve pratiquement la même
     magnitude que l'ancien .63/.83, donc on ne change pas le zoom automatique. */
  const FRONT_Y = .52;
  const FRONT_Z = .90;

  let attempts = 0;
  const installCameraPolish = setInterval(() => {
    attempts++;
    const THREE = window.THREE;
    const original = window.kaykitPositionForView;
    if (!THREE || typeof original !== 'function') {
      if (attempts > 300) clearInterval(installCameraPolish);
      return;
    }
    if (original.__ilyosV13FrontCamera) {
      clearInterval(installCameraPolish);
      return;
    }

    function v13PositionForView(mode, distance, target){
      if (mode === 'front' && target) {
        return new THREE.Vector3(
          target.x,
          target.y + distance * FRONT_Y,
          target.z + distance * FRONT_Z
        );
      }
      return original(mode, distance, target);
    }
    v13PositionForView.__ilyosV13FrontCamera = true;
    v13PositionForView.__ilyosOriginal = original;
    window.kaykitPositionForView = v13PositionForView;

    /* Si la scène existe déjà, appliquer immédiatement le même cadrage au
       démarrage. On ne reprend jamais la main si le joueur a déjà tourné la caméra. */
    const k = window.kaykit3D;
    if (k && k.viewMode === 'front' && !k.userRotated && k.camera && k.viewTarget) {
      const position = v13PositionForView('front', k.zoomDistance, k.viewTarget);
      k.camera.position.copy(position);
      k.camera.lookAt(k.viewTarget);
      if (k.orbit) {
        k.orbit.target.copy(k.viewTarget);
        k.orbit.update();
      }
    }

    clearInterval(installCameraPolish);
    console.info('[ILYOS] runtime polish V13 active');
  }, 50);
})();
