/* ILYOS — cycle visuel des cartes V6
   Flux physique inchangé : PIOCHE -> MAIN -> ACTION ; puis DÉFAUSSE si jouée,
   ou RÉSERVE si conservée. Cette couche ne modifie aucune règle de jeu.
   V6 : animation uniquement pour le joueur local, cartes de pioche plus lisibles,
   centrage strict au-dessus des actions et animation groupée pour les actions xN. */
(() => {
  'use strict';

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;

  const ICONS = {
    MOVE: `<svg viewBox="0 0 48 48" aria-hidden="true"><g fill="currentColor"><ellipse cx="17" cy="14" rx="5" ry="8"/><circle cx="13" cy="24" r="2"/><circle cx="17" cy="23" r="2"/><ellipse cx="31" cy="32" rx="5" ry="8"/><circle cx="27" cy="41" r="2"/><circle cx="31" cy="40" r="2"/></g></svg>`,
    PUSH: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 24h24M23 14l10 10-10 10" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="m39 10 2.2 7L48 19l-6.8 2.2L39 28l-2.2-6.8L30 19l6.8-2.2L39 10Z" fill="currentColor"/></svg>`,
    MAGIC: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="14" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="m24 5 4.8 13.2L43 24l-14.2 5.8L24 43l-4.8-13.2L5 24l14.2-5.8L24 5Z" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="24" cy="24" r="4.2" fill="currentColor"/></svg>`
  };

  const META = {
    MOVE:  { label: 'DÉPLACER', icon: ICONS.MOVE },
    PUSH:  { label: 'POUSSER',  icon: ICONS.PUSH },
    MAGIC: { label: 'MAGIE',    icon: ICONS.MAGIC }
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
  const pendingUsage = new Map();

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

  /* Le moteur applique déjà .ai-turn pendant le tour IA. En ligne, les trois
     boutons legacy sont verrouillés quand ce n'est pas le tour local. Cette
     garde évite donc la pioche et les transferts pendant le tour adverse sans
     introduire de dépendance au state interne de game.js. */
  function isLocalVisualTurn() {
    const game = byId('gameScreen');
    if (!game || game.classList.contains('hidden') || game.classList.contains('ai-turn')) return false;

    const visibleContext = [
      byId('turnContextKicker')?.textContent,
      byId('turnContextTitle')?.textContent,
      byId('ov2Instruction')?.textContent
    ].filter(Boolean).join(' ').toLocaleUpperCase('fr-FR');
    if (/TOUR DE L[’']ADVERSAIRE|L[’']ADVERSAIRE JOUE|ORDINATEUR/.test(visibleContext)) return false;

    const legacyActions = ['hudV2MoveCount', 'hudV2PushCount', 'hudV2MagicCount']
      .map(byId)
      .filter(Boolean);
    const cardsPresent = miniCards().length > 0;
    if (cardsPresent && legacyActions.length === 3 && legacyActions.every(button => button.disabled)) return false;

    return true;
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

  function syntheticRect(cx, cy, width = 84, height = 118) {
    return { left: cx - width / 2, top: cy - height / 2, width, height };
  }

  function actionGeometry() {
    const rects = ['MOVE', 'PUSH', 'MAGIC'].map(bottomTarget).map(rectOf).filter(Boolean);
    if (!rects.length) return { cx: innerWidth / 2, top: innerHeight - 120, left: innerWidth * .35, right: innerWidth * .65 };
    const left = Math.min(...rects.map(r => r.left));
    const right = Math.max(...rects.map(r => r.left + r.width));
    return {
      left,
      right,
      cx: (left + right) / 2,
      top: Math.min(...rects.map(r => r.top))
    };
  }

  function makeFlyingCard(type, extraClass = '', count = 1) {
    const meta = META[type] || META.MOVE;
    const el = document.createElement('div');
    el.className = `card-cycle-flying-card type-${type.toLowerCase()} ${extraClass}${count > 1 ? ' card-cycle-stack-card' : ''}`.trim();
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <span class="card-cycle-card-kicker">ACTION</span>
      <span class="card-cycle-card-icon">${meta.icon}</span>
      <b>${meta.label}</b>
      <i class="card-cycle-card-rune" aria-hidden="true"></i>
      ${count > 1 ? `<em class="card-cycle-batch">×${count}</em>` : ''}`;
    document.body.appendChild(el);
    return el;
  }

  async function fly(el, fromRect, toRect, {
    duration = 440,
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
        transform: `translate(${dx * .48}px,${dy * .43 - arc}px) scale(${(startScale + endScale) / 2 + .075}) rotate(${startRotate * -.55}deg)`,
        opacity: 1,
        offset: .52
      },
      { transform: `translate(${dx}px,${dy}px) scale(${endScale}) rotate(${endRotate}deg)`, opacity: endOpacity }
    ], {
      duration,
      delay,
      easing: 'cubic-bezier(.18,.78,.17,1)',
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

  function floatCount(node, text = '+1') {
    const rect = rectOf(node);
    if (!rect) return;
    const p = document.createElement('div');
    p.className = 'card-cycle-plus-one';
    p.textContent = text;
    p.style.left = `${rect.left + rect.width / 2}px`;
    p.style.top = `${rect.top}px`;
    document.body.appendChild(p);
    const a = p.animate([
      { opacity: 0, transform: 'translate(-50%,5px) scale(.84)' },
      { opacity: 1, transform: 'translate(-50%,-13px) scale(1.08)', offset: .32 },
      { opacity: 0, transform: 'translate(-50%,-31px) scale(.94)' }
    ], { duration: 580, easing: 'ease-out', fill: 'forwards' });
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
    if (!isLocalVisualTurn()) return;
    const types = cards.slice(0, 5).map(cardType).filter(Boolean);
    if (!types.length) return;

    const actions = actionGeometry();
    const cardW = innerWidth < 900 ? 70 : (innerWidth < 1250 ? 82 : 94);
    const cardH = innerWidth < 900 ? 98 : (innerWidth < 1250 ? 114 : 132);
    const maxSpan = Math.min(innerWidth - 52, 560);
    const spacing = Math.min(cardW + 16, (maxSpan - cardW) / Math.max(1, types.length - 1));
    const fanCenterY = Math.max(cardH / 2 + 76, actions.top - cardH / 2 - 34);
    const mid = (types.length - 1) / 2;

    /* Le centre de la main est exactement celui des trois actions MOVE/PUSH/MAGIC. */
    const fanRects = types.map((_, index) => {
      const distance = index - mid;
      return syntheticRect(
        actions.cx + distance * spacing,
        fanCenterY + Math.abs(distance) * 5,
        cardW,
        cardH
      );
    });

    const visibleDeckRect = rectOf(deckTarget());
    const sourceRect = visibleDeckRect
      || syntheticRect(Math.max(66, actions.left - 100), Math.max(100, actions.top - 54), 66, 90);
    const fallback = visibleDeckRect ? null : fallbackDrawSource(sourceRect);
    pulse(deckTarget(), 'ov2-pile-hit');

    const ghosts = types.map(type => makeFlyingCard(type, 'card-cycle-draw-card card-cycle-showcase-card'));

    /* Sortie séquentielle de la pioche, puis vraie pause de lecture. */
    await Promise.all(ghosts.map((ghost, index) =>
      fly(ghost, sourceRect, fanRects[index], {
        duration: 500,
        delay: index * 88,
        arc: 42,
        startScale: .48,
        endScale: 1,
        startOpacity: .12,
        endOpacity: 1,
        startRotate: -6 + index * 1.5,
        endRotate: (index - mid) * 2.2
      })
    ));

    await sleep(innerHeight < 700 ? 700 : 980);

    /* Les cinq cartes rejoignent leurs actions. Les compteurs sont regroupés :
       une main 3 MOVE / 1 PUSH / 1 MAGIC affiche +3, +1, +1 au lieu de 5 labels. */
    const drawnCounts = { MOVE: 0, PUSH: 0, MAGIC: 0 };
    types.forEach(type => drawnCounts[type]++);

    await Promise.all(ghosts.map(async (ghost, index) => {
      const target = bottomTarget(types[index]);
      const targetRect = rectOf(target);
      if (!targetRect) { ghost.remove(); return; }
      await fly(ghost, fanRects[index], targetRect, {
        duration: 460,
        delay: index * 48,
        arc: 26,
        startScale: 1,
        endScale: .22,
        endOpacity: .04,
        startRotate: (index - mid) * 2.2,
        endRotate: 0
      });
      ghost.remove();
    }));

    Object.entries(drawnCounts).forEach(([type, count]) => {
      if (!count) return;
      const target = bottomTarget(type);
      pulse(target);
      floatCount(target, `+${count}`);
    });

    fallback?.classList.add('is-leaving');
    if (fallback) setTimeout(() => fallback.remove(), 240);
  }

  function reserveCurrent(type) {
    return parseCount(reserveCountNode(type)?.textContent);
  }

  function incrementReserveVisual(type, count = 1) {
    const node = reserveCountNode(type);
    if (!node) return;
    node.textContent = String(Math.min(5, parseCount(node.textContent) + count));
  }

  async function animateActionUse(type, count = 1, freshUsed = 0, reserveUsed = 0) {
    if (!isLocalVisualTurn() || !META[type]) return;
    const action = bottomTarget(type);
    const discard = discardTarget();
    const actionRect = rectOf(action);
    const discardRect = rectOf(discard);
    if (!actionRect || !discardRect) return;

    /* Une action consommant plusieurs cartes produit UNE animation, matérialisée
       par une petite pile avec badge ×N. */
    if (count === 1 && reserveUsed === 1 && freshUsed === 0) {
      const reserve = reserveTarget(type);
      const reserveRect = rectOf(reserve);
      if (reserveRect) {
        const ghost = makeFlyingCard(type, 'card-cycle-reserve-use-card', 1);
        await fly(ghost, reserveRect, actionRect, {
          duration: 330,
          arc: 34,
          startScale: .38,
          endScale: .56,
          startOpacity: .84,
          endOpacity: .98
        });
        pulse(action);
        await fly(ghost, actionRect, discardRect, {
          duration: 390,
          arc: 26,
          startScale: .56,
          endScale: .20,
          startOpacity: .98,
          endOpacity: .04
        });
        ghost.remove();
        pulse(discard, 'ov2-pile-hit');
        floatCount(discard, '+1');
        return;
      }
    }

    if (reserveUsed > 0) {
      pulse(reserveTarget(type), 'card-cycle-reserve-hit');
      floatCount(reserveTarget(type), `−${reserveUsed}`);
    }

    const ghost = makeFlyingCard(type, 'card-cycle-used-card card-cycle-batch-use', count);
    await fly(ghost, actionRect, discardRect, {
      duration: count > 1 ? 470 : 410,
      arc: count > 1 ? 38 : 28,
      startScale: count > 1 ? .70 : .58,
      endScale: .20,
      startOpacity: .98,
      endOpacity: .04
    });
    ghost.remove();
    pulse(action);
    pulse(discard, 'ov2-pile-hit');
    floatCount(discard, `+${count}`);
  }

  function queueUsage(type, { fresh = 0, reserve = 0 } = {}) {
    if (!META[type] || !isLocalVisualTurn()) return;
    const current = pendingUsage.get(type) || { fresh: 0, reserve: 0, timer: null };
    current.fresh += Math.max(0, Number(fresh) || 0);
    current.reserve += Math.max(0, Number(reserve) || 0);
    if (current.timer) clearTimeout(current.timer);
    current.timer = setTimeout(() => {
      pendingUsage.delete(type);
      const total = current.fresh + current.reserve;
      if (!total) return;
      actionAnimationQueue = actionAnimationQueue.then(() =>
        animateActionUse(type, total, current.fresh, current.reserve)
      );
    }, 72);
    pendingUsage.set(type, current);
  }

  async function runEndTurnAnimation(cards) {
    if (!isLocalVisualTurn()) return;

    const grouped = { MOVE: 0, PUSH: 0, MAGIC: 0 };
    cards.slice(0, 5).forEach(card => {
      const type = cardType(card);
      if (type) grouped[type]++;
    });

    const jobs = [];
    let order = 0;
    for (const type of ['MOVE', 'PUSH', 'MAGIC']) {
      const count = grouped[type];
      if (!count) continue;

      const capacity = Math.max(0, 5 - reserveCurrent(type));
      const bankCount = Math.min(count, capacity);
      const overflow = count - bankCount;
      const from = rectOf(bottomTarget(type));
      if (!from) continue;
      const delay = order++ * 90;

      if (bankCount > 0) {
        const reserve = reserveTarget(type);
        const to = rectOf(reserve);
        if (to) {
          jobs.push((async () => {
            await sleep(delay);
            const ghost = makeFlyingCard(type, 'card-cycle-bank-card', bankCount);
            await fly(ghost, from, to, {
              duration: 500,
              arc: 44,
              startScale: bankCount > 1 ? .70 : .60,
              endScale: .30,
              startOpacity: .98,
              endOpacity: .06
            });
            ghost.remove();
            incrementReserveVisual(type, bankCount);
            pulse(reserve, 'card-cycle-reserve-hit');
            floatCount(reserve, `+${bankCount} RÉSERVE`);
          })());
        }
      }

      if (overflow > 0) {
        const discard = discardTarget();
        const to = rectOf(discard);
        if (to) {
          jobs.push((async () => {
            await sleep(delay + (bankCount ? 110 : 0));
            const ghost = makeFlyingCard(type, 'card-cycle-overflow-card', overflow);
            await fly(ghost, from, to, {
              duration: 430,
              arc: 32,
              startScale: overflow > 1 ? .68 : .58,
              endScale: .20,
              startOpacity: .96,
              endOpacity: .04
            });
            ghost.remove();
            pulse(discard, 'ov2-pile-hit');
            floatCount(discard, `+${overflow}`);
          })());
        }
      }
    }

    if (jobs.length) await Promise.all(jobs);
    pulse(endTarget(), 'card-cycle-end-hit');
    await sleep(90);
  }

  function inspectDeck() {
    const cards = miniCards();
    const hasDeal = cards.some(card => card.classList.contains('deal-card'));
    if (hasDeal && !dealActive) {
      dealActive = true;
      /* Le HUD et .ai-turn peuvent être mis à jour quelques ms après la main. */
      setTimeout(() => {
        if (isLocalVisualTurn()) runDealAnimation(miniCards());
      }, 80);
    } else if (!hasDeal) {
      dealActive = false;
    }
  }

  function bindPhysicalCardEvents() {
    window.addEventListener('ilyos:fresh-card-used', event => {
      const type = event.detail?.type;
      const count = Math.max(1, Number(event.detail?.count) || 1);
      queueUsage(type, { fresh: count });
    });

    window.addEventListener('ilyos:reserve-card-used', event => {
      const type = event.detail?.type;
      const count = Math.max(1, Number(event.detail?.count) || 1);
      queueUsage(type, { reserve: count });
    });
  }

  function bindEndTurnInterception() {
    document.addEventListener('click', async event => {
      const button = event.target?.closest?.('#endTurnBtn');
      if (!button || button.disabled || bypassEndTurn || interceptingEndTurn) return;
      if (!isLocalVisualTurn()) return;

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

    window.ILYOS_CARD_CYCLE_V6 = {
      inspect: inspectDeck,
      isLocalVisualTurn,
      stop: () => observer?.disconnect()
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
