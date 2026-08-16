/* ILYOS — HUD Organique V2 visual bridge.
   N'ajoute aucune règle de jeu : il enrichit les éléments HUD V2 existants. */
(function(){
  if (window.__ILYOS_HUD_ORGANIQUE_V2__) return;
  window.__ILYOS_HUD_ORGANIQUE_V2__ = true;

  const ICONS = {
    deck: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="8" y="15" width="24" height="27" rx="3"/><rect x="15" y="7" width="24" height="27" rx="3"/></svg>`,
    island: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M7 19 24 10l17 9-17 9L7 19Z"/><path d="M7 19v10l17 9 17-9V19M24 28v10"/><path d="m18 18 6-8 6 8"/></svg>`,
    move: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M18 7h11l1 16 9 6-4 9H13l-5-6 8-9 2-16Z"/><path d="M11 18 4 13l8-1M11 23l-8-1 7-5"/><path d="M12 35h23"/></svg>`,
    push: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M6 24h23M23 14l10 10-10 10"/><path class="impact" d="M39 11l2.2 7 6.8 2.2-6.8 2.2-2.2 7-2.2-7-6.8-2.2 6.8-2.2 2.2-7Z"/></svg>`,
    magic: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><circle cx="24" cy="24" r="13"/><path d="m24 6 4.5 11.5L42 24l-13.5 6.5L24 42l-4.5-11.5L6 24l13.5-6.5L24 6Z"/><circle class="magic-core" cx="24" cy="24" r="4"/></svg>`
  };

  function actionIcon(id, svg){
    const btn = document.getElementById(id);
    if (!btn) return;
    const slot = btn.querySelector('.hud-v2-pill-icon');
    if (slot && slot.dataset.organicIcon !== id) {
      slot.innerHTML = svg;
      slot.dataset.organicIcon = id;
    }
  }

  function enhanceActions(){
    actionIcon('hudV2HandCount', ICONS.deck);
    actionIcon('hudV2IslandStatus', ICONS.island);
    actionIcon('hudV2MoveCount', ICONS.move);
    actionIcon('hudV2PushCount', ICONS.push);
    actionIcon('hudV2MagicCount', ICONS.magic);
  }

  function enhanceUndo(){
    const btn = document.getElementById('cancelCardBtn');
    if (!btn || btn.dataset.organicUndo === '1') return;
    btn.dataset.organicUndo = '1';
    btn.innerHTML = `<svg class="hud-organic-undo-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M17 17H8V8M9 16c5-7 16-10 24-5 8 5 11 15 7 24-4 8-14 12-23 8"/></svg>`;
  }

  function syncActiveSide(){
    const left = document.querySelector('#hudV2Top .hud-v2-top-left');
    const right = document.querySelector('#hudV2Top .hud-v2-top-right');
    const lp = document.getElementById('hudV2ActivePortrait');
    const rp = document.getElementById('hudV2OpponentPortrait');
    if (left) left.classList.toggle('hud-organic-side-active', !!lp?.classList.contains('hud-v2-portrait-active'));
    if (right) right.classList.toggle('hud-organic-side-active', !!rp?.classList.contains('hud-v2-portrait-active'));
  }

  function ensureContextPanel(){
    if (document.getElementById('hudOrganicContext')) return document.getElementById('hudOrganicContext');
    const panel = document.createElement('aside');
    panel.id = 'hudOrganicContext';
    panel.className = 'hud-organic-context hidden';
    panel.setAttribute('aria-live','polite');
    document.getElementById('gameScreen')?.appendChild(panel);
    return panel;
  }

  function syncContextPanel(){
    const source = document.getElementById('unitCard');
    const panel = ensureContextPanel();
    if (!source || !panel) return;
    const text = (source.textContent || '').replace(/\s+/g,' ').trim();
    const isGuardian = !source.classList.contains('empty') && /Gardien/i.test(text);
    const moveCount = document.querySelector('#hudV2MoveCount .hud-v2-pill-count')?.textContent?.trim() || '—';
    const pushCount = document.querySelector('#hudV2PushCount .hud-v2-pill-count')?.textContent?.trim() || '—';
    if (!isGuardian) {
      if (panel.dataset.signature !== 'hidden') {
        panel.dataset.signature = 'hidden';
        panel.classList.add('hidden');
        panel.innerHTML = '';
      }
      return;
    }
    const crown = /Porte une couronne/i.test(text);
    const nameMatch = text.match(/Gardien de\s+(.+?)(?:Déplacement|Poussée|Porte|Gardien standard|$)/i);
    const owner = nameMatch?.[1]?.trim() || 'Équipe active';
    const signature = [owner,crown?'1':'0',moveCount,pushCount].join('|');
    if (panel.dataset.signature === signature) return;
    panel.dataset.signature = signature;
    panel.innerHTML = `
      <div class="hud-organic-context-head">
        <span class="hud-organic-context-avatar"><svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M15 48V29c0-10 7-18 17-18s17 8 17 18v19"/><path d="M20 30h24M25 24h14"/></svg></span>
        <span><b>GARDIEN</b><small>${owner}</small></span>
      </div>
      ${crown ? '<div class="hud-organic-context-crown"><span>♛</span> Couronne portée</div>' : ''}
      <div class="hud-organic-context-stat"><span>${ICONS.move}</span><em>Déplacement</em><b>${moveCount}</b></div>
      <div class="hud-organic-context-stat"><span>${ICONS.push}</span><em>Poussée</em><b>${pushCount}</b></div>`;
    panel.classList.remove('hidden');
  }

  let scheduled = false;
  function enhance(){
    scheduled = false;
    if (document.body.dataset.visualMode !== 'alternative') return;
    enhanceActions();
    enhanceUndo();
    syncActiveSide();
    syncContextPanel();
  }
  function scheduleEnhance(){
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(enhance);
  }

  function boot(){
    enhance();
    const game = document.getElementById('gameScreen');
    if (!game) return;
    const observer = new MutationObserver(scheduleEnhance);
    observer.observe(game,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','disabled']});
    console.info('[ILYOS HUD] Organic V2 active');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
