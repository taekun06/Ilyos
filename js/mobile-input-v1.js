/* ILYOS — Mobile Input V2
   Couche d'entrée uniquement : aucune règle de jeu.

   Le moteur Three.js décide toujours du gameplay. Cette couche ne fait que
   fiabiliser le passage TAP tactile -> click du moteur existant.

   Point important : OrbitControls et bindKayKitInteractions utilisent leur
   propre seuil de drag. Sur mobile, le click natif peut arriver AVANT la frame
   où le moteur remet `dragMoved` à false ; le click est alors silencieusement
   ignoré. La V1 annulait son fallback dès qu'elle voyait ce click natif : une
   action pouvait donc se perdre, notamment pendant une poussée.

   V2 :
   - un tap tactile simple est exécuté après deux frames, quand le moteur a fini
     de distinguer tap / déplacement caméra ;
   - le click natif issu de ce même tap est bloqué, donc jamais de double action ;
   - glissé caméra et pinch ne déclenchent aucune action de jeu ;
   - pose d'île tactile : tap = positionner l'aperçu, Confirmer = vraie pose ;
   - le même chemin fiable sert aux gardiens, déplacements, poussées,
     destinations de poussée/chute, magie, invocation et couronnes.
*/
(function(){
  if (window.__ILYOS_MOBILE_INPUT_V2__) return;
  window.__ILYOS_MOBILE_INPUT_V2__ = true;
  window.__ILYOS_MOBILE_INPUT_V1__ = true;

  /* Même ordre de grandeur que le moteur 3D (DRAG_THRESHOLD=7). Garder les
     deux seuils alignés évite qu'une micro-glissade soit un tap pour une couche
     et un drag pour l'autre. */
  const TAP_MOVE_PX = 7;
  const TOUCH_CLICK_WINDOW_MS = 700;
  const LATE_CLICK_GUARD_MS = 650;
  const pointers = new Map();

  let multiTouch = false;
  let pendingTap = null;
  let pendingToken = 0;
  let lastSynthetic = null;
  let lastTouchRelease = null;
  let lastCanvasPoint = null;
  let placementTouchGuard = null;

  function canvas(){ return document.getElementById('kaykitCanvas'); }
  function isTouchPointer(event){ return event.pointerType && event.pointerType !== 'mouse'; }
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
  function sameTap(a,b,multiplier=2){
    return !!a && !!b && distance(a,b) <= TAP_MOVE_PX * multiplier;
  }
  function markSynthetic(event,name='__ilyosSyntheticTouch'){
    try { Object.defineProperty(event,name,{value:true}); }
    catch (_) { try { event[name] = true; } catch (_) {} }
    return event;
  }

  function dispatchGameplayClick(node,point,placementCommit=false){
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
    if (placementCommit) markSynthetic(event,'__ilyosPlacementCommit');
    lastSynthetic = { x:point.x, y:point.y, at:performance.now() };
    node.dispatchEvent(event);
    return true;
  }

  function dispatchPlacementPreview(node,point){
    if (!node || !point || !insideCanvas(point,node)) return false;
    try {
      const event = markSynthetic(new PointerEvent('pointermove',{
        bubbles:true,
        cancelable:true,
        clientX:point.x,
        clientY:point.y,
        pointerId:987654,
        pointerType:'touch',
        isPrimary:true,
        button:-1,
        buttons:0
      }),'__ilyosPlacementPreview');
      node.dispatchEvent(event);
      return true;
    } catch (_) {
      /* PointerEvent ancien navigateur : un mousemove donne au moins au DOM
         caché la même coordonnée, sans valider la case. */
      const fallback = new MouseEvent('mousemove',{
        bubbles:true,cancelable:true,clientX:point.x,clientY:point.y,view:window
      });
      node.dispatchEvent(fallback);
      return true;
    }
  }

  function cancelPending(){
    pendingToken++;
    pendingTap = null;
  }

  /* Deux frames : bindKayKitInteractions remet dragMoved=false dans un rAF
     après pointerup. Une seule frame est suffisante en théorie ; deux rendent
     le comportement stable sur Safari/Chrome quand la frame est très chargée. */
  function afterInteractionSettled(callback){
    requestAnimationFrame(()=>requestAnimationFrame(callback));
  }

  function queueGameplayTap(node,tap){
    cancelPending();
    const token = pendingToken;
    pendingTap = tap;
    afterInteractionSettled(()=>{
      if (token !== pendingToken || pendingTap !== tap) return;
      pendingTap = null;
      dispatchGameplayClick(node,tap,false);
    });
  }

  /* Une nouvelle forme ne doit jamais réutiliser le point de la précédente. */
  document.addEventListener('click',event=>{
    if (event.target?.closest?.('.island-choice')) {
      lastCanvasPoint = null;
      placementTouchGuard = null;
      cancelPending();
    }
  },true);

  document.addEventListener('pointerdown',event=>{
    const node = canvas();
    if (!node || event.target !== node || !isTouchPointer(event)) return;

    const point = { x:event.clientX, y:event.clientY, at:performance.now() };
    lastCanvasPoint = point;
    pointers.set(event.pointerId,{
      startX:event.clientX,
      startY:event.clientY,
      x:event.clientX,
      y:event.clientY,
      moved:false
    });

    if (pointers.size > 1) {
      multiTouch = true;
      pointers.forEach(pointer=>{ pointer.moved = true; });
      cancelPending();
      placementTouchGuard = null;
    }
  },true);

  document.addEventListener('pointermove',event=>{
    const node = canvas();
    if (!node || event.target !== node || !isTouchPointer(event)) return;

    if (!event.__ilyosPlacementPreview) {
      lastCanvasPoint = { x:event.clientX, y:event.clientY, at:performance.now() };
    }
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (Math.hypot(pointer.x-pointer.startX,pointer.y-pointer.startY) > TAP_MOVE_PX) {
      pointer.moved = true;
      cancelPending();
    }
  },true);

  document.addEventListener('pointercancel',event=>{
    pointers.delete(event.pointerId);
    if (!pointers.size) multiTouch = false;
    cancelPending();
    placementTouchGuard = null;
  },true);

  document.addEventListener('pointerup',event=>{
    const node = canvas();
    const pointer = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);

    if (!pointer || !node || event.target !== node || !isTouchPointer(event)) {
      if (!pointers.size) multiTouch = false;
      return;
    }

    const tap = { x:event.clientX, y:event.clientY, at:performance.now() };
    lastCanvasPoint = tap;
    lastTouchRelease = tap;

    const wasMultiTouch = multiTouch;
    if (!pointers.size) multiTouch = false;
    if (wasMultiTouch || pointer.moved) {
      cancelPending();
      return;
    }

    /* PLACE_ISLAND : le tap remplace seulement le hover souris. Le click natif
       est bloqué plus bas. Confirmer est le seul événement qui validera. */
    if (placementPanelOpen()) {
      cancelPending();
      placementTouchGuard = tap;
      afterInteractionSettled(()=>{
        if (placementTouchGuard !== tap || !placementPanelOpen()) return;
        dispatchPlacementPreview(node,tap);
      });
      return;
    }

    placementTouchGuard = null;
    queueGameplayTap(node,tap);
  },true);

  /* Sur tactile, on NE FAIT PLUS confiance au click natif du canvas : il peut
     être livré avant la frame qui libère dragMoved. On l'arrête et le tap
     synthétique planifié ci-dessus devient l'unique chemin de gameplay.

     Les clicks souris restent totalement inchangés. */
  document.addEventListener('click',event=>{
    const node = canvas();
    if (!node || event.target !== node) return;
    if (event.__ilyosSyntheticTouch) return;

    const point = { x:event.clientX, y:event.clientY };
    const now = performance.now();

    const fromRecentTouch = lastTouchRelease
      && now-lastTouchRelease.at <= TOUCH_CLICK_WINDOW_MS
      && sameTap(point,lastTouchRelease,2.5);

    const placementNative = placementTouchGuard
      && now-placementTouchGuard.at <= TOUCH_CLICK_WINDOW_MS
      && sameTap(point,placementTouchGuard,2.5);

    const duplicateAfterSynthetic = lastSynthetic
      && now-lastSynthetic.at <= LATE_CLICK_GUARD_MS
      && sameTap(point,lastSynthetic,2.5);

    if (fromRecentTouch || placementNative || duplicateAfterSynthetic) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },true);

  /* Confirmer la pose : rejoue le dernier point VISÉ avec un vrai click du
     moteur. Le moteur reste seul responsable de isValidPlacement/placeIsland. */
  document.addEventListener('click',event=>{
    const button = event.target?.closest?.('#ov2PlacementConfirmV12');
    if (!button) return;
    const node = canvas();
    if (!node || !lastCanvasPoint || !insideCanvas(lastCanvasPoint,node)) return;

    placementTouchGuard = null;
    cancelPending();
    dispatchGameplayClick(node,lastCanvasPoint,true);
    /* Ne pas stopImmediatePropagation : le listener V12 du bouton peut ensuite
       fermer proprement le tiroir/contrôle visuel. */
  },true);

  document.addEventListener('click',event=>{
    if (event.target?.closest?.('#ov2PlacementCancelV12,#ov2Undo,#cancelCardBtn')) {
      lastCanvasPoint = null;
      lastTouchRelease = null;
      placementTouchGuard = null;
      cancelPending();
    }
  },true);

  /* Les contrôles contextuels doivent être faciles à toucher. On n'altère pas
     leur taille desktop ni leur logique ; seulement la hitbox sur pointeur
     grossier. Les destinations 3D restent décidées par le raycast du moteur. */
  const style = document.createElement('style');
  style.id = 'ilyos-mobile-input-v2-style';
  style.textContent = `
    @media (pointer:coarse){
      #ov2IslandRotationV12 .hud-v2-magic-btn,
      #hudV2MagicRow .hud-v2-magic-btn,
      #hudV2PushForceRow button,
      #hudV2GearPopover button,
      #hudV2IslandDrawer button{
        min-height:44px!important;
        min-width:44px!important;
        touch-action:manipulation!important;
      }
      #ov2Island,#ov2Move,#ov2Push,#ov2Magic,#ov2End,#ov2Undo{
        touch-action:manipulation!important;
      }
      #hudV2PushForceRow,
      #hudV2MagicRow,
      #ov2IslandRotationV12{
        pointer-events:auto!important;
      }
    }
  `;
  document.head.appendChild(style);

  console.info('[ILYOS] Mobile Input V2 active');
})();