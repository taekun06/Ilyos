/* ILYOS — HUD Organique V2 / LAYOUT V10
   Corrige l'ancrage des tiroirs, ferme le tiroir d'île sur Undo et remplace
   les deux flèches de rotation par une barre contextuelle cohérente.
   Aucune règle de gameplay n'est modifiée : on appelle uniquement les
   contrôles DOM déjà existants. */
(function(){
  if (window.__ILYOS_HUD_LAYOUT_V10__) return;
  window.__ILYOS_HUD_LAYOUT_V10__ = true;

  const byId = id => document.getElementById(id);
  let scheduled = false;

  function ensureInstructionMarkup(){
    const instruction = byId('ov2Instruction');
    if (!instruction || instruction.dataset.v10Instruction === '1') return;
    /* La V12 s'efface devant personne : si elle a déjà bâti le bandeau, on la
       laisse. Sa typographie — Almendra, l'interlettrage, la triple ombre —
       s'accorde au reste du jeu, là où la reprise ci-dessous retombe sur
       Georgia. Même idiome que pour le panneau de rotation (PR #44).

       Passer par l'ordre de chargement plutôt que par ce garde-fou serait plus
       court, mais coûte cher : mesuré à l'empreinte, remonter ce script avant
       la V12 rend le HUD instable d'un chargement à l'autre — joueur actif,
       panneaux latéraux et ordre des cartes changent alors sans raison. */
    if (instruction.dataset.v12Instruction === '1') return;
    const line = instruction.querySelector('.ov2-instruction-line');
    const text = [...instruction.childNodes]
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.nodeValue || '')
      .join(' ')
      .replace(/\s+/g,' ')
      .trim() || 'Choisissez une action ou terminez votre tour.';
    instruction.dataset.v10Instruction = '1';
    instruction.classList.add('ov2-v10-instruction');
    instruction.innerHTML = '';
    const copy = document.createElement('span');
    copy.className = 'ov2-v10-instruction-copy';
    copy.innerHTML = '<span class="ov2-v10-instruction-star" aria-hidden="true">✦</span><span class="ov2-v10-instruction-text"></span><span class="ov2-v10-instruction-star" aria-hidden="true">✦</span>';
    copy.querySelector('.ov2-v10-instruction-text').textContent = text;
    instruction.appendChild(copy);
    instruction.appendChild(line || Object.assign(document.createElement('div'),{className:'ov2-instruction-line'}));
  }

  function syncInstructionText(){
    const instruction = byId('ov2Instruction');
    const source = byId('hudV2Instruction');
    const target = instruction?.querySelector('.ov2-v10-instruction-text');
    if (!instruction || !target) return;
    const text = (source?.textContent || '').replace(/\s+/g,' ').trim() || 'Choisissez une action ou terminez votre tour.';
    if (target.textContent !== text) target.textContent = text;
  }

  function positionContextRows(){
    const game = byId('gameScreen');
    const instruction = byId('ov2Instruction');
    if (!game || !instruction || game.classList.contains('hidden')) return;
    const rect = instruction.getBoundingClientRect();
    if (!rect.height || !window.innerHeight) return;
    // 8 px au-dessus de la phrase : assez près pour être perçu comme son
    // contrôle contextuel, sans chevaucher les étoiles ni le texte.
    const bottom = Math.max(96, window.innerHeight - rect.top + 8);
    game.style.setProperty('--ov2-context-bottom', `${Math.round(bottom)}px`);
  }

  function ensureIslandRotationRow(){
    /* La passe V12 (hud-consolidation-v12.js) construit son propre panneau de
       rotation, #ov2IslandRotationV12, avec un bouton Miroir en plus, et ne
       retire jamais celui-ci. Les deux se retrouvaient donc rendus en meme
       temps, superposes a quelques pixels pres : celui du dessous
       reapparaissait des que la geometrie du tiroir changeait (taille de
       fenetre, espacement des iles). Ce fichier etant charge APRES le V12 dans
       js/version-bootstrap.js, c'est a lui de ceder.

       Le test porte sur le drapeau du script, pas sur la presence de son
       element : le V12 cree le sien paresseusement, donc le chercher dans le
       DOM donnerait un resultat dependant de l'ordre des synchronisations.

       Le reste de ce fichier continue de fonctionner : barre d'instruction,
       fermeture du tiroir sur Undo, variable --ov2-context-bottom. */
    if (window.__ILYOS_HUD_CONSOLIDATION_V12__) return null;

    let row = byId('ov2IslandRotationRow');
    if (row) return row;
    const game = byId('gameScreen');
    if (!game) return null;
    row = document.createElement('div');
    row.id = 'ov2IslandRotationRow';
    row.className = 'hidden';
    row.setAttribute('aria-hidden','true');
    row.innerHTML = `
      <span class="ov2-v10-rotation-label">ROTATION</span>
      <button id="ov2IslandRotateLeft" type="button" class="hud-v2-magic-btn">↺ 90°</button>
      <button id="ov2IslandRotateRight" type="button" class="hud-v2-magic-btn">↻ 90°</button>
      <button id="ov2IslandRotateConfirm" type="button" class="hud-v2-magic-btn hud-v2-magic-confirm">Confirmer</button>
      <button id="ov2IslandRotateCancel" type="button" class="hud-v2-magic-btn hud-v2-magic-cancel">Annuler</button>`;
    game.appendChild(row);

    byId('ov2IslandRotateLeft')?.addEventListener('click',()=>{
      const btn = byId('rotateLeftBtn');
      if (btn && !btn.disabled) btn.click();
    });
    byId('ov2IslandRotateRight')?.addEventListener('click',()=>{
      const btn = byId('rotateRightBtn');
      if (btn && !btn.disabled) btn.click();
    });
    byId('ov2IslandRotateConfirm')?.addEventListener('click',()=>{
      // La pose reste validée par le clic plateau, comme aujourd'hui. Le bouton
      // Confirmer ferme seulement la palette contextuelle pour libérer la vue.
      const drawer = byId('hudV2IslandDrawer');
      drawer?.classList.add('hidden');
      drawer?.setAttribute('aria-hidden','true');
      byId('hudV2IslandStatus')?.setAttribute('aria-expanded','false');
      row.classList.add('hidden');
      row.setAttribute('aria-hidden','true');
    });
    byId('ov2IslandRotateCancel')?.addEventListener('click',()=>{
      const cancel = byId('cancelCardBtn');
      if (cancel && !cancel.disabled) cancel.click();
      closeIslandDrawer();
    });
    return row;
  }

  function closeIslandDrawer(){
    const drawer = byId('hudV2IslandDrawer');
    const trigger = byId('hudV2IslandStatus');
    const row = byId('ov2IslandRotationRow');
    if (drawer) {
      drawer.classList.add('hidden');
      drawer.classList.remove('ov2-v10-rotation-mode');
      drawer.setAttribute('aria-hidden','true');
    }
    trigger?.setAttribute('aria-expanded','false');
    if (row) {
      row.classList.add('hidden');
      row.setAttribute('aria-hidden','true');
    }
  }

  function syncIslandRotationRow(){
    const row = ensureIslandRotationRow();
    const drawer = byId('hudV2IslandDrawer');
    const left = byId('rotateLeftBtn');
    const right = byId('rotateRightBtn');
    if (!row || !drawer) return;

    const rotationActive = !!left && !!right && !left.disabled && !right.disabled;
    row.classList.toggle('hidden',!rotationActive);
    row.setAttribute('aria-hidden',rotationActive ? 'false' : 'true');
    drawer.classList.toggle('ov2-v10-rotation-mode',rotationActive);

    const leftProxy = byId('ov2IslandRotateLeft');
    const rightProxy = byId('ov2IslandRotateRight');
    if (leftProxy) leftProxy.disabled = !rotationActive;
    if (rightProxy) rightProxy.disabled = !rotationActive;
  }

  function installUndoClose(){
    const undo = byId('ov2Undo');
    if (!undo || undo.dataset.v10CloseDrawer === '1') return;
    undo.dataset.v10CloseDrawer = '1';
    // Capture : le tiroir est fermé avant que l'Undo historique reconstruise le HUD.
    undo.addEventListener('click',closeIslandDrawer,true);
  }

  function sync(){
    scheduled = false;
    ensureInstructionMarkup();
    syncInstructionText();
    installUndoClose();
    syncIslandRotationRow();
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
