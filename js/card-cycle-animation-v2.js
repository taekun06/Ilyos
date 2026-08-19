/* ILYOS — cycle visuel des cartes V5
   Flux physique : PIOCHE -> MAIN -> ACTION ; puis DÉFAUSSE si jouée,
   ou RÉSERVE si conservée. Une carte de réserve jouée finit en DÉFAUSSE.
   Les trajectoires utilisent uniquement les éléments réellement visibles du HUD. */
(() => {
  'use strict';

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;

  const META = {
    MOVE:  { label: 'DÉPLACER', symbol: '↟' },
    PUSH:  { label: 'POUSSER',  symbol: '➜' },
    MAGIC: { label: 'MAGIE',    symbol: '✦' }
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const byId = id => document.getElementById(id);
  const deckRoot = () => byId('deckDisplay');
  const miniCards = () => [...(deckRoot()?.querySelectorAll('.v64-mini-card') || [])];

  let dealActive = false;
  let observer = null;
  let interceptingEndTurn = false;
  let bypassEndTurn = false;
  let actionAnimationQueue = Promise.resolve();

  function cardType(card) {
    if (card?.classList.contains('action-move')) return 'MOVE';
    if (card?.classList.contains('action-push')) return 'PUSH';
    if (card?.classList.contains('action-magic')) return 'MAGIC';
    return null;
  }

  function parseCount(text) {
    const match = String(text || '').match(/-?\d+/);
    return match ? Math.max(0, Number(match[0]) || 0) : 0;
  }

  function bottomTarget(type) {
    return byId({ MOVE: 'ov2Move', PUSH: 'ov2Push', MAGIC: 'ov2Magic' }[type])
      || byId({ MOVE: 'hudV2MoveCount', PUSH: 'hudV2PushCount', MAGIC: 'hudV2MagicCount' }[type]);
  }

  function deckTarget() {
    return byId('ov2DeckHud');
  }

  function discardTarget() {
    return byId('ov2DiscardHud') || byId('ov2End') || byId('endTurnBtn');
  }

  function endTarget() {
    return byId('ov2End') || byId('endTurnBtn');
  }

  function activeReserveBadge() {
    const leftActive = byId('ov2LeftActive');
    const rightActive = byId('ov2RightActive');
    if (leftActive && !leftActive.classList.contains('ov2-off')) return byId('ov2LeftReserve');
    if (rightActive && !rightActive.classList.contains('ov2-off')) return byId('ov2RightReserve');
    return [byId('ov2LeftReserve'), byId('ov2RightReserve')]
      .find(node => node && !node.classList.contains('ov2-off')) || null;
  }

  function reserveTarget(type) {
    const badge = activeReserveBadge();
    if (!badge) return null;
    const key = type.toLowerCase();
    return badge.querySelector(`.ov2-reserve-${key}`)
      || badge.querySelector(`[data-reserve-${key}]`)?.closest('.ov2-reserve-action')
      || badge;
  }

  function reserveCountNode(type) {
    const badge = activeReserveBadge();
    return badge?.querySelector(`[data-reserve-${type.toLowerCase()}]`) || null;
  }

  function rectOf(node) {
    if (!node) return null;
    const r = node.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }

  function center(rect) {
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function syntheticRect(cx, cy, width = 76, height = 104) {
    return { left: cx - width / 2, top: cy - height / 2, width, height };
  }

  function dockGeometry() {
    const targets = ['MOVE', 'PUSH', 'MAGIC'].map(bottomTarget).map(rectOf).filter(Boolean);
    if (!targets.length) return { cx: innerWidth / 2, top: innerHeight - 120 };
    const centers = targets.map(center);
    return {
      cx: centers.reduce((sum, p) => sum + p.x, 0) / centers.length,
      top: Math.min(...targets.map(r => r.top))
    };
  }

  function makeFlyingCard(type, extraClass = '') {
    const meta = META[type] || META.MOVE;
    const el = document.createElement('div');
    el.className = `card-cycle-flying-card type-${type.toLowerCase()} ${extraClass}`.trim();
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<span>${meta.symbol}</span><b>${meta.label}</b>`;
    document.body.appendChild(el);
    return el;
  }

  async function fly(el, fromRect, toRect, {
    duration = 460,
    delay = 0,
    arc = 28,
    startScale = 1,
    endScale = .42,
    startOpacity = 1,
    endOpacity = .10,
    startRotate = -2,
    endRotate = 0
  } = {}) {
    if (!el || !fromRect || !toRect) return;
    const from = center(fromRect);
    const to = center(toRect);
    const dx = to.x - from.x;
    const dy = to.y - from.y;

    el.style.left = `${fromRect.left}px`;
    el.style.top = `${fromRect.top}px`;
    el.style.width = `${fromRect.width}px`;
    el.style.height = `${fromRect.height}px`;

    const animation = el.animate([
      { transform: `translate(0,0) scale(${startScale}) rotate(${startRotate}deg)`, opacity: startOpacity },
      {
        transform: `translate(${dx * .48}px,${dy * .43 - arc}px) scale(${(startScale + endScale) / 2 + .08}) rotate(${startRotate * -.6}deg)`,
        opacity: 1,
        offset: .52
      },
      { transform: `translate(${dx}px,${dy}px) scale(${endScale}) rotate(${endRotate}deg)`, opacity: endOpacity }
    ], {
      duration,
      delay,
      easing: 'cubic-bezier(.18,.74,.18,1)',
      fill: 'forwards'
    });

    try { await animation.finished; } catch (_) { }
  }

  function pulse(node, className = 'card-cycle-target-hit') {
    if (!node) return;
    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);
    setTimeout(() => node.classList.remove(className), 620);
  }

  function plusOne(node, text = '+1') {
    const rect = rectOf(node);
    if (!rect) return;
    const p = document.createElement('div');
    p.className = 'card-cycle-plus-one';
    p.textContent = text;
    p.style.left = `${rect.left + rect.width / 2}px`;
    p.style.top = `${rect.top}px`;
    document.body.appendChild(p);
    const a = p.animate([
      { opacity: 0, transform: 'translate(-50%,6px) scale(.82)' },
      { opacity: 1, transform: 'translate(-50%,-14px) scale(1.08)', offset: .35 },
      { opacity: 0, transform: 'translate(-50%,-34px) scale(.92)' }
    ], { duration: 620, easing: 'ease-out', fill: 'forwards' });
    a.onfinish = () => p.remove();
  }

  function fallbackDrawSource(rect) {
    const source = document.createElement('div');
    source.className = 'card-cycle-draw-source';
    source.setAttribute('aria-hidden', 'true');
    source.innerHTML = '<i></i><i></i><i></i><b>PIOCHE</b>';
    source.style.left = `${rect.left}px`;
    source.style.top = `${rect.top}px`;
    source.style.width = `${rect.width}px`;
    source.style.height = `${rect.height}px`;
    document.body.appendChild(source);
    return source;
  }

  async function runDealAnimation(cards) {
    const types = cards.slice(0, 5).map(cardType).filter(Boolean);
    if (!types.length) return;

    const dock = dockGeometry();
    const visibleDeckRect = rectOf(deckTarget());
    const sourceRect = visibleDeckRect
      || syntheticRect(Math.max(70, dock.cx - 340), Math.max(120, dock.top - 30), 68, 92);
    const fallback = visibleDeckRect ? null : fallbackDrawSource(sourceRect);
    pulse(deckTarget(), 'ov2-pile-hit');

    /* Les 5 cartes occupent volontairement une large zone lisible : environ
       400 px au total sur desktop. Aucun chevauchement entre leurs libellés. */
    const cardW = innerWidth < 900 ? 64 : 80;
    const cardH = innerWidth < 900 ? 88 : 108;
    const spacing = innerWidth < 900 ? 68 : 88;
    const fanY = Math.max(118, dock.top - (innerHeight < 700 ? 124 : 162));
    const mid = (types.length - 1) / 2;
    const fanRects = types.map((_, index) => {
      const distance = index - mid;
      return syntheticRect(
        dock.cx + distance * spacing,
        fanY + Math.abs(distance) * 7,
        cardW,
        cardH
      );
    });
    const ghosts = types.map(type => makeFlyingCard(type, 'card-cycle-draw-card card-cycle-showcase-card'));

    /* 1. Sortie de la vraie pile PIOCHE vers un éventail large. */
    await Promise.all(ghosts.map((ghost, index) =>
      fly(ghost, sourceRect, fanRects[index], {
        duration: 440,
        delay: index * 90,
        arc: 34,
        startScale: .58,
        endScale: 1,
        startOpacity: .20,
        endOpacity: 1,
        startRotate: (index - mid) * 2,
        endRotate: (index - mid) * 3
      })
    ));

    /* 2. Temps de lecture réel : les cinq cartes restent toutes visibles. */
    await sleep(innerHeight < 700 ? 520 : 760);

    /* 3. Chaque carte descend dans son action exacte. */
    await Promise.all(ghosts.map(async (ghost, index) => {
      const target = bottomTarget(types[index]);
      const targetRect = rectOf(target);
      if (!targetRect) { ghost.remove(); return; }
      await fly(ghost, fanRects[index], targetRect, {
        duration: 480,
        delay: index * 72,
        arc: 30,
        startScale: 1,
        endScale: .24,
        endOpacity: .05,
        startRotate: (index - mid) * 3,
        endRotate: 0
      });
      pulse(target);
      plusOne(target);
      ghost.remove();
    }));

    fallback?.classList.add('is-leaving');
    if (fallback) setTimeout(() => fallback.remove(), 260);
  }

  function reserveCurrent(type) {
    return parseCount(reserveCountNode(type)?.textContent);
  }

  function incrementReserveVisual(type) {
    const node = reserveCountNode(type);
    if (!node) return;
    node.textContent = String(Math.min(5, parseCount(node.textContent) + 1));
  }

  async function animateToDiscard(type, fromNode, count = 1, {fromReserve = false} = {}) {
    const discard = discardTarget();
    const discardRect = rectOf(discard);
    if (!discardRect) return;

    for (let i = 0; i < count; i++) {
      const startNode = fromNode || (fromReserve ? reserveTarget(type) : bottomTarget(type));
      const startRect = rectOf(startNode);
      if (!startRect) continue;
      const ghost = makeFlyingCard(type, 'card-cycle-used-card');
      await fly(ghost, startRect, discardRect, {
        duration: 430,
        delay: i * 55,
        arc: 34,
        startScale: .58,
        endScale: .22,
        startOpacity: .96,
        endOpacity: .05
      });
      ghost.remove();
      pulse(discard, 'ov2-pile-hit');
    }
  }

  async function animateReserveUse(type, count = 1) {
    const reserve = reserveTarget(type);
    const action = bottomTarget(type);
    const discard = discardTarget();
    const reserveRect = rectOf(reserve);
    const actionRect = rectOf(action);
    const discardRect = rectOf(discard);
    if (!reserveRect || !actionRect || !discardRect) return;

    for (let i = 0; i < count; i++) {
      const ghost = makeFlyingCard(type, 'card-cycle-reserve-use-card');
      await fly(ghost, reserveRect, actionRect, {
        duration: 360,
        delay: i * 60,
        arc: 38,
        startScale: .42,
        endScale: .55,
        startOpacity: .88,
        endOpacity: .95
      });
      pulse(action);
      await fly(ghost, actionRect, discardRect, {
        duration: 390,
        arc: 28,
        startScale: .55,
        endScale: .22,
        startOpacity: .95,
        endOpacity: .05
      });
      ghost.remove();
      pulse(discard, 'ov2-pile-hit');
    }
  }

  async function runEndTurnAnimation(cards) {
    /* Avec la règle physique V1, une carte déjà jouée quitte immédiatement la
       main. Les cartes encore visibles ici sont donc les cartes réellement
       inutilisées, candidates à la réserve. */
    const entries = cards.slice(0, 5).map(card => ({ type: cardType(card) || 'MOVE' }));
    if (!entries.length) {
      pulse(endTarget(), 'card-cycle-end-hit');
      return;
    }

    const capacity = {
      MOVE: Math.max(0, 5 - reserveCurrent('MOVE')),
      PUSH: Math.max(0, 5 - reserveCurrent('PUSH')),
      MAGIC: Math.max(0, 5 - reserveCurrent('MAGIC'))
    };
    const banked = { MOVE: 0, PUSH: 0, MAGIC: 0 };
    const discard = discardTarget();
    const discardRect = rectOf(discard);

    for (let index = 0; index < entries.length; index++) {
      const { type } = entries[index];
      const from = rectOf(bottomTarget(type));
      if (!from) continue;

      if (banked[type] < capacity[type]) {
        const reserve = reserveTarget(type);
        const to = rectOf(reserve);
        if (!to) continue;
        banked[type]++;
        const ghost = makeFlyingCard(type, 'card-cycle-bank-card');
        await fly(ghost, from, to, {
          duration: 500,
          arc: 42,
          startScale: .62,
          endScale: .32,
          startOpacity: .96,
          endOpacity: .10
        });
        ghost.remove();
        incrementReserveVisual(type);
        pulse(reserve, 'card-cycle-reserve-hit');
        plusOne(reserve, '+1 RÉSERVE');
      } else if (discardRect) {
        /* Réserve de ce type déjà à 5 : la carte ne peut pas être stockée et
           rejoint directement la défausse. */
        const ghost = makeFlyingCard(type, 'card-cycle-overflow-card');
        await fly(ghost, from, discardRect, {
          duration: 450,
          arc: 34,
          startScale: .60,
          endScale: .22,
          startOpacity: .95,
          endOpacity: .05
        });
        ghost.remove();
        pulse(discard, 'ov2-pile-hit');
      }
      await sleep(45);
    }

    /* La réserve est une destination finale : aucune carte réservée ne repart
       vers Fin du tour ou vers la défausse. Le bouton ne reçoit qu'un léger
       signal de conclusion de la séquence. */
    pulse(endTarget(), 'card-cycle-end-hit');
    await sleep(100);
  }

  function inspectDeck() {
    const cards = miniCards();
    const hasDeal = cards.some(card => card.classList.contains('deal-card'));
    if (hasDeal && !dealActive) {
      dealActive = true;
      requestAnimationFrame(() => runDealAnimation(miniCards()));
    } else if (!hasDeal) {
      dealActive = false;
    }
  }

  function bindPhysicalCardEvents() {
    window.addEventListener('ilyos:fresh-card-used', event => {
      const type = event.detail?.type;
      const count = Math.max(1, Number(event.detail?.count) || 1);
      if (!META[type]) return;
      actionAnimationQueue = actionAnimationQueue.then(() => animateToDiscard(type, bottomTarget(type), count));
    });

    window.addEventListener('ilyos:reserve-card-used', event => {
      const type = event.detail?.type;
      const count = Math.max(1, Number(event.detail?.count) || 1);
      if (!META[type]) return;
      actionAnimationQueue = actionAnimationQueue.then(() => animateReserveUse(type, count));
    });
  }

  function bindEndTurnInterception() {
    document.addEventListener('click', async event => {
      const button = event.target?.closest?.('#endTurnBtn');
      if (!button || button.disabled || bypassEndTurn || interceptingEndTurn) return;

      const cards = miniCards();
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      interceptingEndTurn = true;
      byId('ov2End')?.classList.add('card-cycle-locked');

      try {
        await actionAnimationQueue;
        await runEndTurnAnimation(cards);
      } finally {
        interceptingEndTurn = false;
        byId('ov2End')?.classList.remove('card-cycle-locked');
        bypassEndTurn = true;
        button.click();
        queueMicrotask(() => { bypassEndTurn = false; });
      }
    }, true);
  }

  function start() {
    const root = deckRoot();
    if (!root) {
      setTimeout(start, 120);
      return;
    }

    bindPhysicalCardEvents();
    bindEndTurnInterception();
    observer = new MutationObserver(inspectDeck);
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
    inspectDeck();

    window.ILYOS_CARD_CYCLE_V5 = {
      inspect: inspectDeck,
      animateReserveUse,
      stop: () => observer?.disconnect()
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
