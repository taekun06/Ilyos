/* ILYOS — HUD context fixes V11
   Tiroir d'île + Undo + rotation de placement + ancrage contextuel.
   Aucun changement de gameplay : réutilise les boutons/handlers existants. */
(function(){
  if (window.__ILYOS_HUD_CONTEXT_FIXES_V11__) return;
  window.__ILYOS_HUD_CONTEXT_FIXES_V11__ = true;

  const byId = id => document.getElementById(id);
  let scheduled = false;

  function closeIslandDrawer(){
    const drawer = byId('hudV2IslandDrawer');
    const trigger = byId('hudV2IslandStatus');
    const row = byId('ov2IslandRotationV11');
    if (drawer) {
      drawer.classList.add('hidden');
      drawer.classList.remove('ov2-v11-rotation-mode');
      drawer.setAttribute('aria-hidden','true');
    }
    if (trigger) trigger.setAttribute('aria-expanded','false');
    if (row) {
      row.classList.add('hidden');
      row.setAttribute('aria-hidden','true');
    }
  }

  function forceCloseAfterUndo(){
    closeIslandDrawer();
    requestAnimationFrame(closeIslandDrawer);
    setTimeout(closeIslandDrawer,0);
    setTimeout(closeIslandDrawer,60);
  }

  function installUndoFix(){
    const directUndo = byId('ov2Undo');
    const legacyUndo = byId('cancelCardBtn');
    if (directUndo && directUndo.dataset.v11DrawerFix !== '1') {
      directUndo.dataset.v11DrawerFix = '1';
      directUndo.addEventListener('click',forceCloseAfterUndo,true);
    }
    if (legacyUndo && legacyUndo.dataset.v11DrawerFix !== '1') {
      legacyUndo.dataset.v11DrawerFix = '1';
      legacyUndo.addEventListener('click',forceCloseAfterUndo,true);
    }
  }

  function ensureInstructionMarkup(){
    const instruction = byId('ov2Instruction');
    if (!instruction || instruction.dataset.v11Instruction === '1') return;
    const line = instruction.querySelector('.ov2-instruction-line');
    const text = [...instruction.childNodes]
      .filter(node=>node.nodeType===Node.TEXT_NODE)
      .map(node=>node.nodeValue||'')
      .join(' ')
      .replace(/\s+/g,' ')
      .trim() || 'Choisissez une action ou terminez votre tour.';
    instruction.dataset.v11Instruction = '1';
    instruction.classList.add('ov2-v11-instruction');
    instruction.innerHTML = '';
    const copy = document.createElement('span');
    copy.className = 'ov2-v11-instruction-copy';
    copy.innerHTML = '<span class="ov2-v11-instruction-star" aria-hidden="true">✦</span><span class="ov2-v11-instruction-text"></span><span class="ov2-v11-instruction-star" aria-hidden="true">✦</span>';
    copy.querySelector('.ov2-v11-instruction-text').textContent = text;
    instruction.appendChild(copy);
    instruction.appendChild(line || Object.assign(document.createElement('div'),{className:'ov2-instruction-line'}));
  }

  function syncInstructionText(){
    const source = byId('hudV2Instruction');
    const target = byId('ov2Instruction')?.querySelector('.ov2-v11-instruction-text');
    if (!target) return;
    const text = (source?.textContent || '').replace(/\s+/g,' ').trim() || 'Choisissez une action ou terminez votre tour.';
    if (target.textContent !== text) target.textContent = text;
  }

  function positionContextRows(){
    const game = byId('gameScreen');
    const instruction = byId('ov2Instruction');
    if (!game || !instruction || game.classList.contains('hidden')) return;
    const rect = instruction.getBoundingClientRect();
    if (!rect.height) return;
    const bottom = Math.max(96, window.innerHeight - rect.top + 8);
    game.style.setProperty('--ov2-context-bottom',`${Math.round(bottom)}px`);
  }

  function ensurePlacementRotationRow(){
    let row = byId('ov2IslandRotationV11');
    if (row) return row;
    const game = byId('gameScreen');
    if (!game) return null;

    row = document.createElement('div');
    row.id = 'ov2IslandRotationV11';
    row.className = 'hidden';
    row.setAttribute('aria-hidden','true');
    row.innerHTML = `
      <span class="ov2-v11-rotation-label">ROTATION</span>
      <button id="ov2PlacementRotateLeft" type="button" class="hud-v2-magic-btn">↺ 90°</button>
      <button id="ov2PlacementRotateRight" type="button" class="hud-v2-magic-btn">↻ 90°</button>
      <button id="ov2PlacementConfirm" type="button" class="hud-v2-magic-btn hud-v2-magic-confirm">Confirmer</button>
      <button id="ov2PlacementCancel" type="button" class="hud-v2-magic-btn hud-v2-magic-cancel">Annuler</button>`;
    game.appendChild(row);

    byId('ov2PlacementRotateLeft')?.addEventListener('click',()=>{
      const btn = byId('rotateLeftBtn');
      if (btn && !btn.disabled) btn.click();
    });
    byId('ov2PlacementRotateRight')?.addEventListener('click',()=>{
      const btn = byId('rotateRightBtn');
      if (btn && !btn.disabled) btn.click();
    });
    byId('ov2PlacementConfirm')?.addEventListener('click',()=>{
      /* La pose elle-même reste confirmée par le clic plateau : on valide ici
         uniquement le choix d'orientation et on libère l'écran. */
      closeIslandDrawer();
    });
    byId('ov2PlacementCancel')?.addEventListener('click',()=>{
      const undo = byId('cancelCardBtn');
      if (undo && !undo.disabled) undo.click();
      forceCloseAfterUndo();
    });
    return row;
  }

  function syncPlacementRotation(){
    const row = ensurePlacementRotationRow();
    const drawer = byId('hudV2IslandDrawer');
    const nativePlacementRotate = byId('hudV2IslandRotate');
    if (!row || !drawer || !nativePlacementRotate) return;

    /* Point crucial : on se base sur la visibilité du conteneur de rotation
       DE PLACEMENT, pas sur l'état enabled des flèches. Les mêmes flèches sont
       aussi activées pendant une magie, ce qui causait le doublon observé. */
    const placementRotationActive = !nativePlacementRotate.classList.contains('hidden');

    row.classList.toggle('hidden',!placementRotationActive);
    row.setAttribute('aria-hidden',placementRotationActive ? 'false' : 'true');
    drawer.classList.toggle('ov2-v11-rotation-mode',placementRotationActive);

    const left = byId('rotateLeftBtn');
    const right = byId('rotateRightBtn');
    const leftProxy = byId('ov2PlacementRotateLeft');
    const rightProxy = byId('ov2PlacementRotateRight');
    if (leftProxy) leftProxy.disabled = !placementRotationActive || !!left?.disabled;
    if (rightProxy) rightProxy.disabled = !placementRotationActive || !!right?.disabled;
  }

  function sync(){
    scheduled = false;
    ensureInstructionMarkup();
    syncInstructionText();
    installUndoFix();
    syncPlacementRotation();
    positionContextRows();
  }

  function schedule(){
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(sync);
  }

  function boot(){
    sync();
    const game = byId('gameScreen');
    if (game && 'MutationObserver' in window) {
      new MutationObserver(schedule).observe(game,{
        subtree:true,
        childList:true,
        characterData:true,
        attributes:true,
        attributeFilter:['class','disabled','aria-expanded','aria-hidden']
      });
    }
    window.addEventListener('resize',schedule,{passive:true});
    window.addEventListener('pageshow',schedule,{passive:true});
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
