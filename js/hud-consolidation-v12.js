/* ILYOS — HUD CONSOLIDATION V12
   Réunit uniquement les comportements HUD validés mais perdus/désactivés.
   Réutilise les contrôles DOM existants ; aucune règle de jeu n'est recréée. */
(function(){
  if (window.__ILYOS_HUD_CONSOLIDATION_V12__) return;
  window.__ILYOS_HUD_CONSOLIDATION_V12__ = true;

  const byId = id => document.getElementById(id);
  const LOCAL_SAVE_KEY = 'ilyos-local-session-v22';
  const CELL_SPACING = .925;
  const BOARD_CENTER = 5;
  let scheduled = false;
  let drawerCloseLockUntil = 0;
  let drawerCloseUnlockTimer = 0;
  let reserveTailTimer = 0;
  let polishTailTimer = 0;
  let last3DPolishAt = 0;

  /* Proposition 1 validée : empreintes plus grandes, orientées vers le haut
     (du bas-gauche vers le haut-droit), dans la même famille dorée du HUD. */
  const moveFootprintsSvg = `
    <svg class="ov2-ico ov2-move-footprints" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <g fill="#f3d27f">
        <g transform="rotate(18 16 31)">
          <ellipse cx="16" cy="31" rx="5.8" ry="8.2"/>
          <circle cx="11.8" cy="21.1" r="2.35"/>
          <circle cx="15.9" cy="20.0" r="2.45"/>
          <circle cx="20.0" cy="20.8" r="2.15"/>
        </g>
        <g transform="rotate(18 31 16)">
          <ellipse cx="31" cy="16.5" rx="5.8" ry="8.2"/>
          <circle cx="26.8" cy="6.9" r="2.35"/>
          <circle cx="30.9" cy="5.8" r="2.45"/>
          <circle cx="35.0" cy="6.6" r="2.15"/>
        </g>
      </g>
    </svg>`;

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

  function releaseDrawerCloseLock(){
    drawerCloseLockUntil = 0;
    if (drawerCloseUnlockTimer) {
      clearTimeout(drawerCloseUnlockTimer);
      drawerCloseUnlockTimer = 0;
    }
    byId('gameScreen')?.classList.remove('ov2-v12-force-close');
  }

  function forceCloseAfterUndo(){
    const game = byId('gameScreen');
    drawerCloseLockUntil = performance.now() + 420;
    game?.classList.add('ov2-v12-force-close');
    closeIslandDrawer();

    if (drawerCloseUnlockTimer) clearTimeout(drawerCloseUnlockTimer);
    drawerCloseUnlockTimer = setTimeout(()=>{
      closeIslandDrawer();
      releaseDrawerCloseLock();
    },430);
  }

  function maintainDrawerCloseLock(){
    if (!drawerCloseLockUntil) return;
    if (performance.now() < drawerCloseLockUntil) {
      closeIslandDrawer();
      byId('gameScreen')?.classList.add('ov2-v12-force-close');
    } else {
      closeIslandDrawer();
      releaseDrawerCloseLock();
    }
  }

  function installUndoFix(){
    [byId('ov2Undo'), byId('cancelCardBtn')].forEach(btn=>{
      if (!btn || btn.dataset.v12DrawerFix === '1') return;
      btn.dataset.v12DrawerFix = '1';
      btn.addEventListener('click',forceCloseAfterUndo,true);
    });

    const islandButton = byId('ov2Island');
    if (islandButton && islandButton.dataset.v12DrawerReopen !== '1') {
      islandButton.dataset.v12DrawerReopen = '1';
      islandButton.addEventListener('click',releaseDrawerCloseLock,true);
    }
  }

  function installRightClickClose(){
    if (document.documentElement.dataset.ov2V12RightClickClose === '1') return;
    document.documentElement.dataset.ov2V12RightClickClose = '1';

    document.addEventListener('contextmenu',event=>{
      const drawer = byId('hudV2IslandDrawer');
      const rotation = byId('ov2IslandRotationV12');
      const drawerOpen = !!drawer && !drawer.classList.contains('hidden');
      const rotationOpen = !!rotation && !rotation.classList.contains('hidden');
      if (!drawerOpen && !rotationOpen) return;
      if (drawer?.contains(event.target) || rotation?.contains(event.target)) return;
      event.preventDefault();
      releaseDrawerCloseLock();
      closeIslandDrawer();
      schedule();
    },true);
  }

  function installMoveIcon(){
    const move = byId('ov2Move');
    if (!move || move.dataset.v12MoveIcon === 'footprints-up') return;
    const icon = move.querySelector('svg.ov2-ico');
    if (!icon) return;
    icon.outerHTML = moveFootprintsSvg;
    move.dataset.v12MoveIcon = 'footprints-up';
  }

  function ensureIslandHalo(){
    const island = byId('ov2Island');
    if (!island || island.querySelector('.ov2-island-required-halo')) return;
    const halo = document.createElement('span');
    halo.className = 'ov2-island-required-halo';
    halo.setAttribute('aria-hidden','true');
    island.prepend(halo);
  }

  function syncIslandRequiredState(){
    const island = byId('ov2Island');
    if (!island) return;
    ensureIslandHalo();

    /* Le HUD direct masque complètement le bouton une fois l'île faite. C'est
       donc le signal le plus robuste pour l'état obligatoire, sans dépendre du
       timing du HUD historique. */
    const required = !island.classList.contains('ov2-off') && !island.disabled;
    island.classList.toggle('ov2-island-required',required);
  }

  /* ---------- RÉSERVE D'ACTIONS DANS LE RUBAN JOUEUR ---------- */
  function ensureReserveBadges(){
    [['ov2LeftName','ov2LeftReserve'],['ov2RightName','ov2RightReserve']].forEach(([nameId,reserveId])=>{
      const name = byId(nameId);
      if (!name || byId(reserveId)) return;
      const badge = document.createElement('span');
      badge.id = reserveId;
      badge.className = 'ov2-reserve ov2-off';
      badge.textContent = 'RÉSERVE 0';
      name.insertAdjacentElement('afterend',badge);
    });
  }

  function readSavedGameState(){
    try {
      const raw = localStorage.getItem(LOCAL_SAVE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed?.state || null;
    } catch (_) {
      return null;
    }
  }

  function reserveTotal(player){
    const stash = player?.stash || {};
    return ['MOVE','PUSH','MAGIC'].reduce((sum,type)=>sum + Math.max(0,Number(stash[type]) || 0),0);
  }

  function sameName(a,b){
    return String(a || '').trim().toLocaleUpperCase('fr-FR') === String(b || '').trim().toLocaleUpperCase('fr-FR');
  }

  function syncReserveBadges(){
    ensureReserveBadges();
    const snapshot = readSavedGameState();
    const players = snapshot?.players;
    if (!Array.isArray(players) || !players.length) {
      byId('ov2LeftReserve')?.classList.add('ov2-off');
      byId('ov2RightReserve')?.classList.add('ov2-off');
      return;
    }

    const currentIndex = Math.max(0,Math.min(players.length - 1,Number(snapshot.currentPlayer) || 0));
    const leftLabel = byId('ov2LeftName')?.textContent;
    const rightLabel = byId('ov2RightName')?.textContent;
    const left = players.find(player=>sameName(player?.name,leftLabel)) || players[currentIndex];
    const right = players.find(player=>player !== left && sameName(player?.name,rightLabel))
      || players.find(player=>player !== left)
      || null;

    [[byId('ov2LeftReserve'),left],[byId('ov2RightReserve'),right]].forEach(([badge,player])=>{
      if (!badge) return;
      badge.classList.toggle('ov2-off',!player);
      if (player) badge.textContent = `RÉSERVE ${reserveTotal(player)}`;
    });
  }

  /* ---------- NETTOYAGE 3D SANS TOUCHER AUX RÈGLES ---------- */
  function hideLegacyIslandSeams(){
    const dynamic = window.kaykit3D?.dynamicGroup;
    if (!dynamic?.traverse) return;
    dynamic.traverse(object=>{
      if (!object?.isMesh || !object.geometry || !object.material?.color?.getHex) return;
      if (object.material.color.getHex() !== 0x183027) return;
      const p = object.geometry.parameters || {};
      const thinWidth = Math.abs(Number(p.width) - .018) < .008;
      const thinDepth = Math.abs(Number(p.depth) - .018) < .008;
      const seamHeight = Math.abs(Number(p.height) - .010) < .008;
      if (seamHeight && (thinWidth || thinDepth)) object.visible = false;
    });
  }

  function syncVillageFlags(){
    const dynamic = window.kaykit3D?.dynamicGroup;
    if (!dynamic?.children?.length || !window.THREE) return;

    /* Le fanion historique est l'enfant du château à (.48,0,.34). On le cache
       et on réutilise son vrai modèle deux fois, sur les deux cases adjacentes. */
    const originals = [];
    dynamic.children.forEach(parent=>{
      if (!parent?.children?.length || parent.userData?.ov2VillageFlagV12) return;
      const flag = parent.children.find(child=>
        Math.abs((child?.position?.x ?? 99) - .48) < .025 &&
        Math.abs((child?.position?.z ?? 99) - .34) < .025 &&
        Math.abs(child?.position?.y ?? 99) < .025
      );
      if (flag) originals.push({ castle:parent, flag });
    });

    const owners = new Set(originals.map(item=>item.castle.uuid));
    [...dynamic.children].forEach(object=>{
      if (!object?.userData?.ov2VillageFlagV12) return;
      if (owners.has(object.userData.ov2VillageFlagOwner)) return;
      dynamic.remove(object);
    });

    originals.forEach(({castle,flag})=>{
      flag.visible = false;
      const owner = castle.uuid;
      let clones = dynamic.children.filter(object=>object?.userData?.ov2VillageFlagV12 && object.userData.ov2VillageFlagOwner === owner);
      while (clones.length < 2) {
        const clone = flag.clone(true);
        clone.visible = true;
        clone.userData = { ...(clone.userData || {}), ov2VillageFlagV12:true, ov2VillageFlagOwner:owner };
        dynamic.add(clone);
        clones.push(clone);
      }
      while (clones.length > 2) {
        const extra = clones.pop();
        dynamic.remove(extra);
      }

      const c0 = Math.round(castle.position.x / CELL_SPACING + BOARD_CENTER);
      const r0 = Math.round(castle.position.z / CELL_SPACING + BOARD_CENTER);
      const dc = castle.position.x <= 0 ? 1 : -1;
      const dr = castle.position.z <= 0 ? 1 : -1;
      const outwardX = castle.position.x <= 0 ? -1 : 1;
      const outwardZ = castle.position.z <= 0 ? -1 : 1;
      const cornerOffset = .34;
      const targets = [
        { r:r0, c:c0 + dc },
        { r:r0 + dr, c:c0 }
      ];

      targets.forEach((target,index)=>{
        const clone = clones[index];
        const x = (target.c - BOARD_CENTER) * CELL_SPACING + outwardX * cornerOffset;
        const z = (target.r - BOARD_CENTER) * CELL_SPACING + outwardZ * cornerOffset;
        // Même niveau de base que le château/village, quelle que soit la case.
        clone.position.set(x,castle.position.y,z);
        clone.quaternion.copy(castle.quaternion).multiply(flag.quaternion);
        clone.visible = true;
      });
    });
  }

  function sync3DPolish(force=false){
    const now = performance.now();
    if (!force && now - last3DPolishAt < 100) return;
    last3DPolishAt = now;
    hideLegacyIslandSeams();
    syncVillageFlags();
  }

  function scheduleTailSync(){
    if (reserveTailTimer) clearTimeout(reserveTailTimer);
    reserveTailTimer = setTimeout(syncReserveBadges,180);
    if (polishTailTimer) clearTimeout(polishTailTimer);
    polishTailTimer = setTimeout(()=>sync3DPolish(true),90);
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
    installMoveIcon();
    ensureIslandHalo();
    ensureReserveBadges();
    syncReserveBadges();
    syncIslandRequiredState();
    syncPlacementRotation();
    positionContextRows();
    maintainDrawerCloseLock();
    sync3DPolish();
    scheduleTailSync();
  }

  function schedule(){
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(sync);
  }

  function boot(){
    installRightClickClose();
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
    window.addEventListener('pointerup',scheduleTailSync,{passive:true});
    console.info('[ILYOS HUD] consolidation V12 active');
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();