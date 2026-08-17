/* ILYOS — HUD CONSOLIDATION V12
   Réunit uniquement les comportements HUD validés mais perdus/désactivés.
   Réutilise les contrôles DOM existants ; aucune règle de jeu n'est recréée. */
(function(){
  if (window.__ILYOS_HUD_CONSOLIDATION_V12__) return;
  window.__ILYOS_HUD_CONSOLIDATION_V12__ = true;

  const byId = id => document.getElementById(id);
  let scheduled = false;

  function closeIslandDrawer(){
    const drawer = byId('hudV2IslandDrawer');
    const trigger = byId('hudV2IslandStatus');
    const row = byId('ov2IslandRotationV12');
    if (drawer) {
      drawer.classList.add('hidden');
      drawer.classList.remove('ov2-v12-rotation-mode');
      drawer.setAttribute('aria-hidden','true');
    }
    trigger?.setAttribute('aria-expanded','false');
    if (row) {
      row.classList.add('hidden');
      row.setAttribute('aria-hidden','true');
    }
  }

  function forceCloseAfterUndo(){
    // L'ancien HUD peut se re-rendre immédiatement après Undo : fermeture répétée
    // sur quelques ticks pour éviter que le drawer ne réapparaisse visuellement.
    closeIslandDrawer();
    requestAnimationFrame(closeIslandDrawer);
    setTimeout(closeIslandDrawer,0);
    setTimeout(closeIslandDrawer,60);
  }

  function installUndoFix(){
    [byId('ov2Undo'), byId('cancelCardBtn')].forEach(btn=>{
      if (!btn || btn.dataset.v12DrawerFix === '1') return;
      btn.dataset.v12DrawerFix = '1';
      btn.addEventListener('click',forceCloseAfterUndo,true);
    });
  }

  function ensureInstructionMarkup(){
    const instruction = byId('ov2Instruction');
    if (!instruction || instruction.dataset.v12Instruction === '1') return;

    const line = instruction.querySelector('.ov2-instruction-line');
    const text = [...instruction.childNodes]
      .filter(node=>node.nodeType===Node.TEXT_NODE)
      .map(node=>node.nodeValue||'')
      .join(' ')
      .replace(/\s+/g,' ')
      .trim() || 'Choisissez une action ou terminez votre tour.';

    instruction.dataset.v12Instruction = '1';
    instruction.classList.add('ov2-v12-instruction');
    instruction.innerHTML = '';

    const copy = document.createElement('span');
    copy.className = 'ov2-v12-instruction-copy';
    copy.innerHTML = '<span class="ov2-v12-instruction-star" aria-hidden="true">✦</span><span class="ov2-v12-instruction-text"></span><span class="ov2-v12-instruction-star" aria-hidden="true">✦</span>';
    copy.querySelector('.ov2-v12-instruction-text').textContent = text;
    instruction.appendChild(copy);
    instruction.appendChild(line || Object.assign(document.createElement('div'),{className:'ov2-instruction-line'}));
  }

  function syncInstructionText(){
    const source = byId('hudV2Instruction');
    const target = byId('ov2Instruction')?.querySelector('.ov2-v12-instruction-text');
    if (!target) return;
    const text = (source?.textContent || '').replace(/\s+/g,' ').trim() || 'Choisissez une action ou terminez votre tour.';
    if (target.textContent !== text) target.textContent = text;
  }

  function positionContextRows(){
    const game = byId('gameScreen');
    const instruction = byId('ov2Instruction');
    if (!game || !instruction || game.classList.contains('hidden')) return;
    const rect = instruction.getBoundingClientRect();
    if (!rect.height || !window.innerHeight) return;
    const bottom = Math.max(96, window.innerHeight - rect.top + 8);
    game.style.setProperty('--ov2-context-bottom',`${Math.round(bottom)}px`);
  }

  function ensurePlacementRotationRow(){
    let row = byId('ov2IslandRotationV12');
    if (row) return row;
    const game = byId('gameScreen');
    if (!game) return null;

    row = document.createElement('div');
    row.id = 'ov2IslandRotationV12';
    row.className = 'hidden';
    row.setAttribute('aria-hidden','true');
    row.innerHTML = `
      <span class="ov2-v12-rotation-label">ROTATION</span>
      <button id="ov2PlacementRotateLeftV12" type="button" class="hud-v2-magic-btn">↺ 90°</button>
      <button id="ov2PlacementRotateRightV12" type="button" class="hud-v2-magic-btn">↻ 90°</button>
      <button id="ov2PlacementConfirmV12" type="button" class="hud-v2-magic-btn hud-v2-magic-confirm">Confirmer</button>
      <button id="ov2PlacementCancelV12" type="button" class="hud-v2-magic-btn hud-v2-magic-cancel">Annuler</button>`;
    game.appendChild(row);

    byId('ov2PlacementRotateLeftV12')?.addEventListener('click',()=>{
      const btn = byId('rotateLeftBtn');
      if (btn && !btn.disabled) btn.click();
    });
    byId('ov2PlacementRotateRightV12')?.addEventListener('click',()=>{
      const btn = byId('rotateRightBtn');
      if (btn && !btn.disabled) btn.click();
    });
    byId('ov2PlacementConfirmV12')?.addEventListener('click',()=>{
      // Le clic plateau reste la validation réelle de la pose. Ici on ferme
      // seulement la palette d'orientation pour rendre la vue au plateau.
      closeIslandDrawer();
    });
    byId('ov2PlacementCancelV12')?.addEventListener('click',()=>{
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

    // Critère fiable hérité du fix V11 : le conteneur natif de rotation n'est
    // visible que pendant la rotation DE PLACEMENT. On ne se base surtout pas
    // sur l'état enabled des flèches, qui peut aussi changer pendant Magie.
    const active = !nativePlacementRotate.classList.contains('hidden');

    row.classList.toggle('hidden',!active);
    row.setAttribute('aria-hidden',active ? 'false' : 'true');
    drawer.classList.toggle('ov2-v12-rotation-mode',active);

    const left = byId('rotateLeftBtn');
    const right = byId('rotateRightBtn');
    const leftProxy = byId('ov2PlacementRotateLeftV12');
    const rightProxy = byId('ov2PlacementRotateRightV12');
    if (leftProxy) leftProxy.disabled = !active || !!left?.disabled;
    if (rightProxy) rightProxy.disabled = !active || !!right?.disabled;
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
    console.info('[ILYOS HUD] consolidation V12 active');
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
