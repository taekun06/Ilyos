/* ILYOS — HUD Pioche / Défausse V1
   Lit les compteurs réels déjà rendus par le moteur et les ancre aux
   contrôles organiques visibles. Aucune règle de jeu n'est recréée ici. */
(function(){
  'use strict';
  if (window.__ILYOS_DECK_DISCARD_HUD_V1__) return;
  window.__ILYOS_DECK_DISCARD_HUD_V1__ = true;

  const byId = id => document.getElementById(id);
  let scheduled = false;
  let observer = null;
  let previousDeck = null;
  let previousDiscard = null;

  function parseCount(node){
    if (!node) return 0;
    const match = String(node.textContent || '').match(/\d+/);
    return match ? Math.max(0, Number(match[0]) || 0) : 0;
  }

  function sourceCount(kind){
    if (kind === 'deck') {
      return parseCount(byId('hudV2HandPopoverDeck') || byId('deckCount'));
    }
    return parseCount(byId('hudV2HandPopoverDiscard') || byId('discardCount'));
  }

  function pileMarkup(label, count){
    return `<span class="ov2-pile-visual" aria-hidden="true">
      <i class="ov2-pile-card"></i><i class="ov2-pile-card"></i><i class="ov2-pile-card"></i>
    </span>
    <b class="ov2-pile-count">${count}</b>
    <span class="ov2-pile-label">${label}</span>`;
  }

  function ensureHud(){
    const root = byId('ilyosHudOrganicV2') || byId('gameScreen');
    if (!root) return false;

    if (!byId('ov2DeckHud')) {
      const deck = document.createElement('div');
      deck.id = 'ov2DeckHud';
      deck.className = 'ov2-pile-hud ov2-deck-hud';
      deck.setAttribute('aria-label','Pioche');
      deck.innerHTML = pileMarkup('PIOCHE', 0);
      root.appendChild(deck);
    }

    if (!byId('ov2DiscardHud')) {
      const discard = document.createElement('div');
      discard.id = 'ov2DiscardHud';
      discard.className = 'ov2-pile-hud ov2-discard-hud';
      discard.setAttribute('aria-label','Défausse');
      discard.innerHTML = pileMarkup('DÉFAUSSE', 0);
      root.appendChild(discard);
    }
    return true;
  }

  function pulse(node){
    if (!node) return;
    node.classList.remove('ov2-pile-hit');
    void node.offsetWidth;
    node.classList.add('ov2-pile-hit');
    setTimeout(()=>node.classList.remove('ov2-pile-hit'), 430);
  }

  function placeHud(hud, anchor, gap = 12){
    if (!hud || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    hud.style.left = `${rect.left + rect.width / 2}px`;
    hud.style.top = `${Math.max(62, rect.top - gap)}px`;
  }

  function sync(){
    scheduled = false;
    if (!ensureHud()) return;

    const deckHud = byId('ov2DeckHud');
    const discardHud = byId('ov2DiscardHud');
    const deck = sourceCount('deck');
    const discard = sourceCount('discard');

    const deckCount = deckHud?.querySelector('.ov2-pile-count');
    const discardCount = discardHud?.querySelector('.ov2-pile-count');
    if (deckCount) deckCount.textContent = String(deck);
    if (discardCount) discardCount.textContent = String(discard);
    deckHud?.setAttribute('aria-label', `Pioche : ${deck} carte${deck === 1 ? '' : 's'}`);
    discardHud?.setAttribute('aria-label', `Défausse : ${discard} carte${discard === 1 ? '' : 's'}`);

    if (previousDeck !== null && deck !== previousDeck) pulse(deckHud);
    if (previousDiscard !== null && discard !== previousDiscard) pulse(discardHud);
    previousDeck = deck;
    previousDiscard = discard;

    placeHud(deckHud, byId('ov2Undo'), 13);
    placeHud(discardHud, byId('ov2End'), 13);
  }

  function schedule(){
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(sync);
  }

  function boot(){
    if (!ensureHud()) {
      setTimeout(boot, 120);
      return;
    }
    const game = byId('gameScreen');
    observer = new MutationObserver(schedule);
    if (game) observer.observe(game, {
      subtree:true,
      childList:true,
      characterData:true,
      attributes:true,
      attributeFilter:['class','style','hidden']
    });
    window.addEventListener('resize', schedule, {passive:true});
    window.addEventListener('orientationchange', schedule, {passive:true});
    sync();
    window.ILYOS_DECK_DISCARD_HUD = { sync, pulseDeck:()=>pulse(byId('ov2DeckHud')), pulseDiscard:()=>pulse(byId('ov2DiscardHud')) };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
