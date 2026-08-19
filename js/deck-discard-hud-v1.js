/* ILYOS — HUD Pioche / Défausse V11
   Lit les compteurs réels déjà rendus par le moteur et les ancre aux
   contrôles organiques visibles. Aucune règle de jeu n'est recréée ici.
   V11 : piles nues, compteur sur les cartes, positionnement bord à bord symétrique. */
(function(){
  'use strict';
  if (window.__ILYOS_DECK_DISCARD_HUD_V11__) return;
  window.__ILYOS_DECK_DISCARD_HUD_V11__ = true;

  const byId = id => document.getElementById(id);
  const BASE_OPACITY = '.78';
  const ACTIVE_OPACITY = '.98';
  const PULSE_OPACITY = '1';
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

  function setOpacity(node, value){
    node?.style?.setProperty('opacity', String(value), 'important');
  }

  function openDiscard(){
    if (window.ILYOS_DISCARD_VIEWER?.toggle) {
      window.ILYOS_DISCARD_VIEWER.toggle();
      return;
    }
    if (window.ILYOS_DISCARD_VIEWER?.open) {
      window.ILYOS_DISCARD_VIEWER.open();
      return;
    }
    window.dispatchEvent(new CustomEvent('ilyos:toggle-discard-viewer'));
  }

  function makeDiscardInteractive(discard){
    if (!discard) return;
    discard.classList.add('ov2-interactive');
    discard.setAttribute('role','button');
    discard.setAttribute('tabindex','0');
    discard.setAttribute('aria-expanded', discard.getAttribute('aria-expanded') || 'false');
    discard.setAttribute('aria-controls','ov2DiscardViewer');
    discard.title = 'Afficher ou masquer la défausse';
    discard.style.setProperty('pointer-events','auto','important');
    discard.style.setProperty('cursor','pointer','important');
    discard.style.setProperty('z-index','100160','important');

    if (discard.dataset.v11Interactive === '1') return;
    discard.dataset.v11Interactive = '1';

    discard.addEventListener('mouseenter',()=>setOpacity(discard,ACTIVE_OPACITY));
    discard.addEventListener('mouseleave',()=>setOpacity(discard,BASE_OPACITY));
    discard.addEventListener('focus',()=>setOpacity(discard,ACTIVE_OPACITY));
    discard.addEventListener('blur',()=>setOpacity(discard,BASE_OPACITY));
    discard.addEventListener('click',event=>{
      event.preventDefault();
      event.stopPropagation();
      openDiscard();
    });
    discard.addEventListener('keydown',event=>{
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openDiscard();
    });
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
      discard.className = 'ov2-pile-hud ov2-discard-hud ov2-interactive';
      discard.setAttribute('aria-label','Défausse');
      discard.innerHTML = pileMarkup('DÉFAUSSE', 0);
      root.appendChild(discard);
    }

    const deckHud = byId('ov2DeckHud');
    const discardHud = byId('ov2DiscardHud');
    setOpacity(deckHud, BASE_OPACITY);
    setOpacity(discardHud, BASE_OPACITY);
    deckHud?.style?.setProperty('z-index','100150','important');
    makeDiscardInteractive(discardHud);
    return true;
  }

  function pulse(node){
    if (!node) return;
    node.classList.remove('ov2-pile-hit');
    void node.offsetWidth;
    node.classList.add('ov2-pile-hit');
    setOpacity(node,PULSE_OPACITY);
    setTimeout(()=>{
      node.classList.remove('ov2-pile-hit');
      if (!node.matches(':hover,:focus')) setOpacity(node,BASE_OPACITY);
    },430);
  }

  function placeHudPair(deckHud, discardHud, gap = 12){
    if (!deckHud || !discardHud) return;
    const undoRect = byId('ov2Undo')?.getBoundingClientRect();
    const endRect = byId('ov2End')?.getBoundingClientRect();
    const tops = [undoRect?.top, endRect?.top].filter(Number.isFinite);
    const anchorTop = tops.length ? Math.min(...tops) : window.innerHeight - 70;
    const top = Math.max(86, anchorTop - gap);
    const edge = Math.max(12, Math.min(20, Math.round(window.innerWidth * .0125)));

    deckHud.style.left = `${edge}px`;
    deckHud.style.right = 'auto';
    deckHud.style.top = `${top}px`;

    discardHud.style.left = 'auto';
    discardHud.style.right = `${edge}px`;
    discardHud.style.top = `${top}px`;
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
    discardHud?.setAttribute('aria-label', `Défausse : ${discard} carte${discard === 1 ? '' : 's'} — cliquer pour consulter`);

    if (previousDeck !== null && deck !== previousDeck) pulse(deckHud);
    if (previousDiscard !== null && discard !== previousDiscard) pulse(discardHud);
    previousDeck = deck;
    previousDiscard = discard;

    placeHudPair(deckHud, discardHud, 10);
    makeDiscardInteractive(discardHud);
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
    window.ILYOS_DECK_DISCARD_HUD = {
      sync,
      pulseDeck:()=>pulse(byId('ov2DeckHud')),
      pulseDiscard:()=>pulse(byId('ov2DiscardHud')),
      openDiscard
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();