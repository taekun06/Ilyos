/* ILYOS — Mobile Input V1
   Couche d'entrée uniquement : aucune règle de jeu.

   Problème visé : le plateau 3D exécute le gameplay sur l'événement `click`
   synthétisé après les Pointer Events. Sur certains navigateurs mobiles,
   OrbitControls / le geste tactile peuvent empêcher ce `click` d'arriver alors
   que pointerdown/pointerup ont bien eu lieu. À la souris tout fonctionne,
   d'où la différence desktop/mobile.

   Cette couche :
   - garantit un click gameplay après un TAP tactile simple si le navigateur
     n'en a pas déjà produit un ;
   - n'émet rien après un glissé caméra ou un pinch ;
   - déduplique un éventuel click natif tardif ;
   - pendant la pose d'île sur écran tactile : 1 tap = positionner l'aperçu,
     puis « Confirmer » = poser réellement. Cela remplace le hover souris qui
     n'existe pas sur téléphone ;
   - rend donc le bouton « Confirmer » V12 réellement fonctionnel au lieu de
     simplement fermer visuellement le tiroir.
*/
(function(){
  if (window.__ILYOS_MOBILE_INPUT_V1__) return;
  window.__ILYOS_MOBILE_INPUT_V1__ = true;

  const TAP_MOVE_PX = 12;
  const NATIVE_CLICK_WAIT_MS = 90;
  const LATE_CLICK_GUARD_MS = 500;
  const pointers = new Map();
  let multiTouch = false;
  let pendingTap = null;
  let pendingTimer = 0;
  let lastSynthetic = null;
  let lastCanvasPoint = null;
  let placementTouchGuard = null;

  function canvas(){ return document.getElementById('kaykitCanvas'); }
  function placementPanelOpen(){
    const row = document.getElementById('ov2IslandRotationV12');
    return !!row && !row.classList.contains('hidden') && row.getAttribute('aria-hidden') !== 'true';
  }
  function distance(a,b){
    const dx = (a?.x || 0) - (b?.x || 0);
    const dy = (a?.y || 0) - (b?.y || 0);
    return Math.hypot(dx,dy);
  }
  function insideCanvas(point,node){
    if (!point || !node) return false;
    const rect = node.getBoundingClientRect();
    return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
  }
  function markSynthetic(event,name='__ilyosSyntheticTouch'){
    try { Object.defineProperty(event,name,{value:true}); }
    catch (_) { try { event[name] = true; } catch (_) {} }
    return event;
  }
  function dispatchGameplayClick(node,point){
    if (!node || !point || !insideCanvas(point,node)) return false;
    const event = markSynthetic(new MouseEvent('click',{
      bubbles:true,
      cancelable:true,
      clientX:point.x,
      clientY:point.y,
      button:0,
      buttons:0,
      view:window
    }));
    lastSynthetic = { x:point.x, y:point.y, at:performance.now() };
    node.dispatchEvent(event);
    return true;
  }
  function dispatchPlacementPreview(node,point){
    if (!node || !point || !insideCanvas(point,node)) return false;
    let event;
    try {
      event = new PointerEvent('pointermove',{
        bubbles:true,
        cancelable:true,
        clientX:point.x,
        clientY:point.y,
        pointerId:987654,
        pointerType:'touch',
        isPrimary:true,
        button:-1,
        buttons:0
      });
    } catch (_) {
      return false;
    }
    markSynthetic(event,'__ilyosPlacementPreview');
    node.dispatchEvent(event);
    return true;
  }
  function cancelPending(){
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = 0;
    pendingTap = null;
  }

  /* Choisir une nouvelle forme invalide naturellement le point de pose de la
     forme précédente. Le joueur doit donc viser de nouveau le plateau avant
     de pouvoir confirmer. */
  document.addEventListener('click',event=>{
    if (event.target?.closest?.('.island-choice')) {
      lastCanvasPoint = null;
      placementTouchGuard = null;
    }
  },true);

  /* Capture globale : le canvas est créé seulement au lancement de la partie,
     donc aucun polling ni MutationObserver n'est nécessaire. */
  document.addEventListener('pointerdown',event=>{
    const node = canvas();
    if (!node || event.target !== node) return;

    lastCanvasPoint = { x:event.clientX, y:event.clientY, at:performance.now() };
    if (event.pointerType === 'mouse') return;

    pointers.set(event.pointerId,{
      x:event.clientX,
      y:event.clientY,
      startX:event.clientX,
      startY:event.clientY,
      moved:false,
      pointerType:event.pointerType
    });
    if (pointers.size > 1) {
      multiTouch = true;
      pointers.forEach(pointer=>{ pointer.moved = true; });
      cancelPending();
    }
  },true);

  document.addEventListener('pointermove',event=>{
    const node = canvas();
    if (!node || event.target !== node) return;
    if (!event.__ilyosPlacementPreview) {
      lastCanvasPoint = { x:event.clientX, y:event.clientY, at:performance.now() };
    }

    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (Math.hypot(pointer.x-pointer.startX,pointer.y-pointer.startY) > TAP_MOVE_PX) pointer.moved = true;
  },true);

  document.addEventListener('pointercancel',event=>{
    pointers.delete(event.pointerId);
    if (!pointers.size) multiTouch = false;
    cancelPending();
  },true);

  document.addEventListener('pointerup',event=>{
    const node = canvas();
    const pointer = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    if (!pointer || !node || event.target !== node) {
      if (!pointers.size) multiTouch = false;
      return;
    }

    lastCanvasPoint = { x:event.clientX, y:event.clientY, at:performance.now() };
    const wasMultiTouch = multiTouch;
    if (!pointers.size) multiTouch = false;

    if (wasMultiTouch || pointer.moved) return;

    const tap = { x:event.clientX, y:event.clientY, at:performance.now() };

    /* Sur tactile il n'y a pas de hover. Pendant PLACE_ISLAND, un tap doit donc
       remplacer le hover souris et POSITIONNER l'aperçu, pas poser tout de suite.
       Le click natif qui suit est bloqué par placementTouchGuard ; Confirmer
       rejouera ensuite exactement ce point sous forme de click gameplay. */
    if (placementPanelOpen()) {
      cancelPending();
      placementTouchGuard = tap;
      setTimeout(()=>{
        if (placementTouchGuard !== tap || !placementPanelOpen()) return;
        dispatchPlacementPreview(node,tap);
      },0);
      return;
    }

    /* Hors pose d'île, laisser d'abord sa chance au click natif. S'il arrive,
       le listener capture ci-dessous annule ce fallback. */
    cancelPending();
    pendingTap = tap;
    pendingTimer = setTimeout(()=>{
      if (pendingTap !== tap) return;
      pendingTap = null;
      pendingTimer = 0;
      dispatchGameplayClick(node,tap);
    },NATIVE_CLICK_WAIT_MS);
  },true);

  /* Déduplication et garde de pose mobile :
     - pendant PLACE_ISLAND, le click natif d'un tap sert seulement à viser ;
     - hors placement, click natif immédiat => fallback annulé et click conservé ;
     - click natif retardé après notre fallback => bloqué pour éviter un double coup. */
  document.addEventListener('click',event=>{
    const node = canvas();
    if (!node || event.target !== node) return;
    if (event.__ilyosSyntheticTouch) return;

    const point = { x:event.clientX, y:event.clientY };
    const now = performance.now();

    if (placementTouchGuard && now-placementTouchGuard.at <= LATE_CLICK_GUARD_MS && distance(point,placementTouchGuard) <= TAP_MOVE_PX*1.5) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (pendingTap && distance(point,pendingTap) <= TAP_MOVE_PX*1.5) {
      cancelPending();
      return;
    }
    if (lastSynthetic && now-lastSynthetic.at <= LATE_CLICK_GUARD_MS && distance(point,lastSynthetic) <= TAP_MOVE_PX*1.5) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },true);

  /* Vrai bouton Confirmer : il rejoue le dernier point visé sur le plateau.
     Le moteur existant décide de la validité et exécute placeIsland via son
     chemin normal ; cette couche ne connaît ni les formes ni les règles. */
  document.addEventListener('click',event=>{
    const button = event.target?.closest?.('#ov2PlacementConfirmV12');
    if (!button) return;
    const node = canvas();
    if (!node || !lastCanvasPoint || !insideCanvas(lastCanvasPoint,node)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    placementTouchGuard = null;
    dispatchGameplayClick(node,lastCanvasPoint);
  },true);

  /* Annuler remet aussi à zéro le point tactile de pose, pour qu'un nouveau
     choix ne puisse jamais réutiliser une ancienne coordonnée par erreur. */
  document.addEventListener('click',event=>{
    if (event.target?.closest?.('#ov2PlacementCancelV12,#ov2Undo,#cancelCardBtn')) {
      lastCanvasPoint = null;
      placementTouchGuard = null;
      cancelPending();
    }
  },true);

  /* Zones tactiles confortables pour les contrôles contextuels, sans agrandir
     visuellement le dock principal sur desktop. */
  const style = document.createElement('style');
  style.id = 'ilyos-mobile-input-v1-style';
  style.textContent = `
    @media (pointer:coarse){
      #ov2IslandRotationV12 .hud-v2-magic-btn,
      #hudV2MagicRow .hud-v2-magic-btn,
      #hudV2PushForceRow button{min-height:44px!important;min-width:44px!important}
      #ov2Island,#ov2Move,#ov2Push,#ov2Magic,#ov2End,#ov2Undo{touch-action:manipulation}
    }
  `;
  document.head.appendChild(style);

  console.info('[ILYOS] Mobile Input V1 active');
})();