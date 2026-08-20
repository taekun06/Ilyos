/* ILYOS — HUD Organique V2 DIRECT
   Le DOM/CSS est celui du prototype validé. Les anciens #hudV2* ne servent
   plus que de source de données et de cibles d'action. Aucune règle de jeu. */
(function(){
  if (window.__ILYOS_HUD_ORGANIQUE_V2_DIRECT__) return;
  window.__ILYOS_HUD_ORGANIQUE_V2_DIRECT__ = true;

  const crownSvg = (empty=false) => `<svg class="ov2-crown${empty ? ' ov2-empty' : ''}" viewBox="0 0 36 25" aria-hidden="true"><path d="M3 18L6 6l9 7 4-10 6 10 7-7 1 12H3Z" fill="currentColor"/><path d="M5 20h27v3H5z" fill="currentColor"/></svg>`;
  /* Portraits du Chevalier et du Mage : illustrations fournies par l'utilisateur
     (badge blason/étoile déjà encadré), placées telles quelles dans le HUD. */
  const knightSvg = `<img class="ov2-portrait-img" src="./assets/hud/knight-portrait.png" alt="Chevalier" loading="eager">`;
  const mageSvg = `<img class="ov2-portrait-img" src="./assets/hud/mage-portrait.png" alt="Mage" loading="eager">`;
  const islandSvg = `<svg class="ov2-ico" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M8 19 24 10l16 9-16 9L8 19Z" fill="#8fe26f" stroke="#ffd879" stroke-width="2"/><path d="M8 19v10l16 9 16-9V19M24 28v10" stroke="#d1a04b" stroke-width="2"/></svg>`;
  const moveSvg = `<svg class="ov2-ico" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M16 7h13l2 16 9 5-4 10H13l-5-6 7-9 1-16Z" stroke="#f0d383" stroke-width="3"/><path d="M11 34h25" stroke="#f0d383" stroke-width="3"/></svg>`;
  const pushSvg = `<svg class="ov2-ico" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M6 24h23M23 14l10 10-10 10" stroke="#ff9b38" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M39 11l2.2 7 6.8 2.2-6.8 2.2-2.2 7-2.2-7-6.8-2.2 6.8-2.2 2.2-7Z" fill="#ff9b38"/></svg>`;
  const magicSvg = `<svg class="ov2-ico" viewBox="0 0 48 48" fill="none" aria-hidden="true"><circle cx="24" cy="24" r="13" stroke="#c69aff" stroke-width="2.5"/><path d="m24 6 4.5 11.5L42 24l-13.5 6.5L24 42l-4.5-11.5L6 24l13.5-6.5L24 6Z" stroke="#c69aff" stroke-width="2.4"/><circle cx="24" cy="24" r="4" fill="#c69aff"/></svg>`;
  const miniMoveSvg = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M16 7h13l2 16 9 5-4 10H13l-5-6 7-9 1-16Z" stroke="#8fe26f" stroke-width="3"/><path d="M11 34h25" stroke="#8fe26f" stroke-width="3"/></svg>`;
  const miniPushSvg = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M6 24h23M23 14l10 10-10 10" stroke="#ff9b38" stroke-width="3.4" stroke-linecap="round"/><path d="M39 11l2.2 7 6.8 2.2-6.8 2.2-2.2 7-2.2-7-6.8-2.2 6.8-2.2 2.2-7Z" fill="#ff9b38"/></svg>`;

  const legacy = id => document.getElementById(id);
  let root = null;
  let scheduled = false;
  let toastDismissedText = '';

  function installRuntimeFixes(){
    if (legacy('ov2DirectRuntimeFixes')) return;
    const style = document.createElement('style');
    style.id = 'ov2DirectRuntimeFixes';
    style.textContent = `
      body[data-visual-mode="alternative"] #ilyosHudOrganicV2{
        position:fixed!important;
        inset:0!important;
        width:100vw!important;
        height:100vh!important;
        z-index:100000!important;
        visibility:visible!important;
        opacity:1!important;
        overflow:visible!important;
      }
      body[data-visual-mode="alternative"] #ilyosHudOrganicV2 .ov2-top{
        position:fixed!important;
        left:24px!important;
        right:24px!important;
        top:18px!important;
        display:grid!important;
        visibility:visible!important;
        opacity:1!important;
        z-index:4!important;
      }
      body[data-visual-mode="alternative"] #hudV2IslandDrawer{
        position:fixed!important;
        left:50%!important;
        right:auto!important;
        top:auto!important;
        bottom:126px!important;
        transform:translateX(-50%)!important;
        z-index:100020!important;
        max-width:min(94vw,1100px)!important;
        pointer-events:auto!important;
      }
      body[data-visual-mode="alternative"] #hudV2IslandDrawer:not(.hidden){
        display:flex!important;
        visibility:visible!important;
        opacity:1!important;
      }
      body[data-visual-mode="alternative"] #hudV2IslandDrawer.hidden{
        display:none!important;
      }
      body[data-visual-mode="alternative"] #hudV2IslandDrawer #islandSelector,
      body[data-visual-mode="alternative"] #hudV2IslandDrawer button{
        pointer-events:auto!important;
      }
      @media(max-height:800px){
        body[data-visual-mode="alternative"] #ilyosHudOrganicV2 .ov2-top{
          top:8px!important;
        }
        body[data-visual-mode="alternative"] #hudV2IslandDrawer{
          bottom:105px!important;
          transform:translateX(-50%) scale(.90)!important;
          transform-origin:bottom center!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function setIslandDrawerOpen(open){
    const drawer = legacy('hudV2IslandDrawer');
    const trigger = legacy('hudV2IslandStatus');
    if (!drawer) return false;
    drawer.classList.toggle('hidden',!open);
    drawer.setAttribute('aria-hidden',open ? 'false' : 'true');
    if (trigger) trigger.setAttribute('aria-expanded',open ? 'true' : 'false');
    return true;
  }

  function toggleIslandDrawerDirect(){
    const trigger = legacy('hudV2IslandStatus');
    const drawer = legacy('hudV2IslandDrawer');
    if (!trigger || trigger.disabled) return;
    if (!drawer) {
      trigger.click();
      return;
    }

    const wasHidden = drawer.classList.contains('hidden');
    // On laisse d'abord le gestionnaire historique faire son travail.
    trigger.click();

    requestAnimationFrame(()=>{
      // Si l'ancien bouton n'a rien changé (cas produit par le HUD direct),
      // on pilote uniquement l'ouverture visuelle du vrai drawer existant.
      if (drawer.classList.contains('hidden') === wasHidden) {
        setIslandDrawerOpen(wasHidden);
      }
      reparentFunctionalPopovers();
      schedule();
    });
  }

  function build(){
    const game = legacy('gameScreen');
    if (!game || legacy('ilyosHudOrganicV2')) return legacy('ilyosHudOrganicV2');
    root = document.createElement('div');
    root.id = 'ilyosHudOrganicV2';
    root.setAttribute('aria-label','HUD ILYOS');
    root.innerHTML = `
      <div class="ov2-top">
        <div class="ov2-side ov2-left">
          <div class="ov2-avatar">${knightSvg}</div>
          <div class="ov2-ribbon"><div class="ov2-player-main"><span id="ov2LeftName" class="ov2-pname">JOUEUR 1</span><span id="ov2LeftScore" class="ov2-score"></span></div></div>
          <div id="ov2LeftActive" class="ov2-active ov2-off">À VOUS</div>
        </div>
        <div class="ov2-turn"><strong id="ov2Turn">TOUR 1</strong><button id="ov2Gear" class="ov2-gem ov2-interactive" type="button" aria-label="Menu HUD"></button><span id="ov2Timer" class="ov2-timer ov2-off"></span></div>
        <div class="ov2-side ov2-right">
          <div class="ov2-avatar">${mageSvg}</div>
          <div class="ov2-ribbon"><div class="ov2-player-main"><span id="ov2RightName" class="ov2-pname">IA</span><span id="ov2RightScore" class="ov2-score"></span></div></div>
          <div id="ov2RightActive" class="ov2-active ov2-off">À VOUS</div>
        </div>
      </div>

      <aside id="ov2Guardian" class="ov2-guardian ov2-hidden-context" aria-live="polite">
        <div class="ov2-gh"><div class="ov2-gportrait">${knightSvg}</div><div><b>GARDIEN</b><small id="ov2GuardianOwner">Équipe active</small></div></div>
        <div id="ov2GuardianCrown" class="ov2-grow ov2-off"><span>${crownSvg(false)}</span><span>Couronne portée</span><strong>✓</strong></div>
        <div class="ov2-grow"><span>${miniMoveSvg}</span><span>Déplacement</span><strong id="ov2GuardianMove" class="ov2-green">×0</strong></div>
        <div class="ov2-grow"><span>${miniPushSvg}</span><span>Poussée</span><strong id="ov2GuardianPush" class="ov2-orange">×0</strong></div>
      </aside>

      <div id="ov2Instruction" class="ov2-instruction">Choisissez une action.<div class="ov2-instruction-line"></div></div>

      <div class="ov2-dock">
        <button id="ov2Island" class="ov2-action ov2-interactive" type="button">${islandSvg}<strong>ÎLE</strong><small>OBLIGATOIRE</small></button>
        <button id="ov2Move" class="ov2-action ov2-interactive" type="button" data-legacy="hudV2MoveCount">${moveSvg}<strong>DÉPLACER</strong><small id="ov2MoveCount">×0</small></button>
        <button id="ov2Push" class="ov2-action ov2-interactive" type="button" data-legacy="hudV2PushCount">${pushSvg}<strong>POUSSER</strong><small id="ov2PushCount">×0</small></button>
        <button id="ov2Magic" class="ov2-action ov2-interactive ov2-magic" type="button" data-legacy="hudV2MagicCount">${magicSvg}<strong>MAGIE</strong><small id="ov2MagicCount">×0</small></button>
      </div>

      <button id="ov2End" class="ov2-end ov2-interactive" type="button"><svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M12 40V8M14 10h22l-6 8 6 8H14" stroke="#ffd879" stroke-width="3" stroke-linejoin="round"/></svg><b>FIN DU TOUR</b></button>
      <button id="ov2Undo" class="ov2-undo ov2-interactive" type="button" aria-label="Annuler">↶</button>

      <div id="ov2Toast" class="ov2-toast ov2-off" aria-live="polite"><div class="ov2-toasticon">${crownSvg(false)}</div><div><b id="ov2ToastTitle">Information</b><small id="ov2ToastText"></small></div><button id="ov2ToastClose" class="ov2-interactive" type="button" aria-label="Fermer">×</button></div>`;
    game.appendChild(root);

    root.querySelectorAll('[data-legacy]').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = legacy(btn.dataset.legacy);
        if (target && !target.disabled) target.click();
      });
    });
    legacy('ov2Island').addEventListener('click',toggleIslandDrawerDirect);
    legacy('ov2End').addEventListener('click',()=>{ const b=legacy('endTurnBtn'); if(b && !b.disabled) b.click(); });
    legacy('ov2Undo').addEventListener('click',()=>{ const b=legacy('cancelCardBtn'); if(b && !b.disabled) b.click(); });
    legacy('ov2Gear').addEventListener('click',()=>legacy('hudV2GearBtn')?.click());
    /* La roue crantée d'origine reste dans le DOM — c'est elle qui porte la logique du
       popover, et ov2Gear ne fait que lui relayer le clic — mais elle ne doit plus se
       VOIR : les deux boutons se superposaient à quelques pixels près (x 786 contre 805),
       ce qui donnait l'impression d'un bouton menu décalé sur la gauche de la roue.
       opacity + pointer-events plutôt que display:none, pour que le .click() programmé
       ci-dessus continue de fonctionner. */
    const rouePrecedente = legacy('hudV2GearBtn');
    if (rouePrecedente) {
      rouePrecedente.style.opacity = '0';
      rouePrecedente.style.pointerEvents = 'none';
    }
    /* Panneau gardien masqué : il s'ouvrait en surimpression sur le bord gauche et
       recouvrait la scène sans apporter d'information que le HUD ne donne pas déjà. */
    const panneauGardien = legacy('ov2Guardian');
    if (panneauGardien) panneauGardien.style.display = 'none';
    legacy('ov2ToastClose').addEventListener('click',()=>{
      toastDismissedText = (legacy('hudV2Toast')?.textContent || '').trim();
      legacy('ov2Toast')?.classList.add('ov2-off');
    });
    return root;
  }

  function reparentFunctionalPopovers(){
    const game = legacy('gameScreen');
    if (!game) return;
    ['hudV2GearPopover','hudV2IslandDrawer'].forEach(id=>{
      const node = legacy(id);
      if (node && node.parentElement !== game) game.appendChild(node);
    });
  }

  function countFrom(id){
    const node = legacy(id);
    const explicit = node?.querySelector('.hud-v2-pill-count')?.textContent?.trim();
    if (explicit) return explicit;
    const match = (node?.textContent || '').match(/×\s*\d+/i);
    return match ? match[0].replace(/\s+/g,'') : '×0';
  }

  function renderCrowns(targetId, sourceId){
    const target = legacy(targetId);
    const source = legacy(sourceId);
    if (!target) return;
    let filled = source ? source.querySelectorAll('.hud-v2-crown-icon.is-filled').length : 0;
    if (!Number.isFinite(filled)) filled = 0;
    target.innerHTML = [0,1,2].map(i=>crownSvg(i >= filled)).join('');
  }

  function syncTop(){
    const leftName = (legacy('hudV2ActiveName')?.textContent || 'JOUEUR 1').trim();
    const rightName = (legacy('hudV2OpponentName')?.textContent || 'IA').trim();
    legacy('ov2LeftName').textContent = leftName;
    legacy('ov2RightName').textContent = rightName;
    renderCrowns('ov2LeftScore','hudV2ActiveScore');
    renderCrowns('ov2RightScore','hudV2OpponentScore');

    const rawTurn = (legacy('turnLabel')?.textContent || 'Tour 1').trim();
    const turnMatch = rawTurn.match(/tour\s*(\d+)/i);
    legacy('ov2Turn').textContent = `TOUR ${turnMatch ? turnMatch[1] : '1'}`;
    const timerText = (legacy('turnTimer')?.textContent || '').trim();
    const timer = legacy('ov2Timer');
    timer.textContent = timerText ? `◷ ${timerText.replace(/^◷\s*/,'')}` : '';
    timer.classList.toggle('ov2-off',!timerText);

    /* QUI JOUE — deux sources, la seconde en repli.
       La première lit une classe posée sur les portraits du HUD d'origine. Elle est
       parfois absente alors que c'est bien le tour du joueur : constaté en partie solo,
       instruction « Choisissez une action » affichée et pourtant les deux côtés marqués
       inactifs. L'étiquette « À VOUS » disparaissait alors, et avec elle l'anneau.
       Le repli lit `data-player` sur #gameScreen, que le rendu d'en-tête tient à jour
       (voir renderHeader) : c'est la même donnée que le moteur, sans intermédiaire. */
    const portraitGauche = !!legacy('hudV2ActivePortrait')?.classList.contains('hud-v2-portrait-active');
    const portraitDroite = !!legacy('hudV2OpponentPortrait')?.classList.contains('hud-v2-portrait-active');
    let leftActive = portraitGauche;
    let rightActive = portraitDroite;
    if (!portraitGauche && !portraitDroite) {
      const joueur = legacy('gameScreen')?.dataset.player;
      if (joueur !== undefined && joueur !== '') {
        leftActive = String(joueur) === '0';
        rightActive = !leftActive;
      }
    }
    const leftTag = legacy('ov2LeftActive');
    const rightTag = legacy('ov2RightActive');
    leftTag.textContent = /\bIA\b|ordinateur/i.test(leftName) ? 'À L’IA' : 'À VOUS';
    rightTag.textContent = /\bIA\b|ordinateur/i.test(rightName) ? 'À L’IA' : 'À VOUS';
    leftTag.classList.toggle('ov2-off',!leftActive);
    rightTag.classList.toggle('ov2-off',!rightActive);
    /* Marqueur du joueur actif, posé ICI et non ailleurs. `hud-polish-targeted-v1.js`
       pose déjà une classe `is-active` équivalente, mais par un rendu différé qui peut
       ne pas s'être exécuté : constaté sur une partie fraîche, aucun des deux côtés ne
       la portait. Ce marqueur-ci est écrit dans la même fonction, juste après l'étiquette
       « À VOUS » et à partir de la même donnée — il ne peut donc pas se désynchroniser. */
    leftTag.closest('.ov2-side')?.classList.toggle('ov2-side-active', !!leftActive);
    rightTag.closest('.ov2-side')?.classList.toggle('ov2-side-active', !!rightActive);
  }

  function syncActions(){
    const specs = [
      ['ov2Move','hudV2MoveCount','ov2MoveCount'],
      ['ov2Push','hudV2PushCount','ov2PushCount'],
      ['ov2Magic','hudV2MagicCount','ov2MagicCount']
    ];
    specs.forEach(([directId,legacyId,countId])=>{
      const direct = legacy(directId), source = legacy(legacyId);
      if (!direct) return;
      direct.disabled = !source || !!source.disabled;
      direct.classList.toggle('ov2-selected',!!source?.classList.contains('hud-v2-pill-active'));
      legacy(countId).textContent = countFrom(legacyId);
    });
    const island = legacy('ov2Island');
    const oldIsland = legacy('hudV2IslandStatus');
    const drawer = legacy('hudV2IslandDrawer');
    if (island) {
      island.classList.toggle('ov2-off',!oldIsland || oldIsland.classList.contains('hidden'));
      island.disabled = !oldIsland || !!oldIsland.disabled;
      const drawerOpen = !!drawer && !drawer.classList.contains('hidden');
      island.classList.toggle('ov2-selected',drawerOpen || oldIsland?.getAttribute('aria-expanded') === 'true');
    }
    const end = legacy('ov2End'), oldEnd = legacy('endTurnBtn');
    if (end) end.disabled = !oldEnd || !!oldEnd.disabled;
    const undo = legacy('ov2Undo'), oldUndo = legacy('cancelCardBtn');
    if (undo) undo.disabled = !oldUndo || !!oldUndo.disabled;
  }

  function syncInstruction(){
    const text = (legacy('hudV2Instruction')?.textContent || '').replace(/\s+/g,' ').trim();
    legacy('ov2Instruction').childNodes[0].nodeValue = (text || 'Choisissez une action ou terminez votre tour.') + ' ';
  }

  function syncGuardian(){
    const source = legacy('unitCard');
    const panel = legacy('ov2Guardian');
    if (!panel) return;
    const text = (source?.textContent || '').replace(/\s+/g,' ').trim();
    const isGuardian = !!source && !source.classList.contains('empty') && /Gardien/i.test(text);
    panel.classList.toggle('ov2-hidden-context',!isGuardian);
    if (!isGuardian) return;
    const crown = /Porte une couronne/i.test(text);
    const nameMatch = text.match(/Gardien de\s+(.+?)(?:Déplacement|Poussée|Porte|Gardien standard|$)/i);
    legacy('ov2GuardianOwner').textContent = nameMatch?.[1]?.trim() || 'Équipe active';
    legacy('ov2GuardianCrown').classList.toggle('ov2-off',!crown);
    legacy('ov2GuardianMove').textContent = countFrom('hudV2MoveCount');
    legacy('ov2GuardianPush').textContent = countFrom('hudV2PushCount');
  }

  function syncToast(){
    const src = legacy('hudV2Toast');
    const out = legacy('ov2Toast');
    if (!out) return;
    const text = (src?.textContent || '').replace(/\s+/g,' ').trim();
    const sourceVisible = !!text && !src?.classList.contains('hidden');
    if (!sourceVisible || text === toastDismissedText) {
      out.classList.add('ov2-off');
      if (!text) toastDismissedText = '';
      return;
    }
    toastDismissedText = '';
    legacy('ov2ToastTitle').textContent = /couronne/i.test(text) ? 'Couronne' : 'Information';
    legacy('ov2ToastText').textContent = text;
    out.classList.remove('ov2-off');
  }

  function sync(){
    scheduled = false;
    if (!root || document.body.dataset.visualMode !== 'alternative') return;
    syncTop();
    syncActions();
    syncInstruction();
    syncGuardian();
    syncToast();
  }
  function schedule(){
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(sync);
  }

  function observe(node){
    if (!node) return;
    new MutationObserver(schedule).observe(node,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','disabled','aria-expanded','aria-hidden']});
  }

  function boot(){
    installRuntimeFixes();
    root = build();
    if (!root) return;
    reparentFunctionalPopovers();
    ['hudV2Top','hudV2Dock','hudV2IslandDrawer','unitCard','turnLabel','turnTimer','endTurnBtn','cancelCardBtn'].forEach(id=>observe(legacy(id)));
    sync();
    console.info('[ILYOS HUD] Organic V2 DIRECT active');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
