/* ILYOS — Runtime polish V13
   Corrections ciblées :
   1) remplace l'ancien libellé visuel "Version V64" par V76 ;
   2) rapproche la vue de départ / vue FRONT du cadrage validé visuellement.
   Aucun gameplay ni HUD n'est modifié ici. */
(function(){
  if (window.__ILYOS_RUNTIME_POLISH_V13__) return;
  window.__ILYOS_RUNTIME_POLISH_V13__ = true;

  function fixLegacyVersionLabel(root){
    const scope = root && root.nodeType ? root : document.documentElement;
    if (!scope || !document.createTreeWalker) return;
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeValue && /Version\s+V64/i.test(node.nodeValue)) nodes.push(node);
    }
    nodes.forEach(node => {
      node.nodeValue = node.nodeValue.replace(/Version\s+V64/gi, 'Version V76');
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

  /* Vue FRONT : angle un peu plus bas, même distance globale. */
  const FRONT_Y = .52;
  const FRONT_Z = .90;
  let lastApplied = '';

  function applyFrontCamera(){
    const k = window.kaykit3D;
    if (!k || k.disposed || k.viewMode !== 'front' || k.userRotated || !k.camera || !k.viewTarget) return;
    const distance = Number(k.zoomDistance) || 12.4;
    const key = `${distance.toFixed(3)}|${k.viewTarget.x.toFixed(3)}|${k.viewTarget.y.toFixed(3)}|${k.viewTarget.z.toFixed(3)}`;
    const expectedX = k.viewTarget.x;
    const expectedY = k.viewTarget.y + distance * FRONT_Y;
    const expectedZ = k.viewTarget.z + distance * FRONT_Z;
    const delta = Math.abs(k.camera.position.x - expectedX) + Math.abs(k.camera.position.y - expectedY) + Math.abs(k.camera.position.z - expectedZ);
    if (lastApplied === key && delta < .015) return;

    k.camera.position.set(expectedX, expectedY, expectedZ);
    k.camera.lookAt(k.viewTarget);
    if (k.orbit) {
      k.orbit.target.copy(k.viewTarget);
      k.orbit.update();
    }
    lastApplied = key;
  }

  /* La scène et les boutons caméra sont créés après le bootstrap. Ce contrôle
     léger ne fait aucun rendu supplémentaire : il ne recadre que si la caméra
     native remet la vue FRONT à son ancien angle. Dès que le joueur tourne la
     caméra (userRotated=true), il cesse complètement d'intervenir. */
  const cameraTimer = setInterval(applyFrontCamera, 180);
  window.addEventListener('pageshow', applyFrontCamera, {passive:true});
  window.addEventListener('resize', applyFrontCamera, {passive:true});

  console.info('[ILYOS] runtime polish V13 loaded');
})();
