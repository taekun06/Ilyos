/* ILYOS — cycle visuel des cartes V10
   Pure couche d'animation. Aucune règle de jeu modifiée.
   - seulement pendant le tour local
   - cartes affichées dans la même bande verticale que le tiroir d'îles
   - les 5 cartes sortent visiblement de PIOCHE face cachée, puis se révèlent
   - actions xN regroupées en une seule animation
*/
(() => {
  'use strict';

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
  if (window.__ILYOS_CARD_CYCLE_V10__) return;
  window.__ILYOS_CARD_CYCLE_V10__ = true;

  const ICONS = {
    MOVE: `<svg viewBox="0 0 48 48" aria-hidden="true"><g fill="currentColor"><ellipse cx="17" cy="14" rx="5" ry="8"/><circle cx="13" cy="24" r="2"/><circle cx="17" cy="23" r="2"/><ellipse cx="31" cy="32" rx="5" ry="8"/><circle cx="27" cy="41" r="2"/><circle cx="31" cy="40" r="2"/></g></svg>`,
    PUSH: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 24h24M23 14l10 10-10 10" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="m39 10 2.2 7L48 19l-6.8 2.2L39 28l-2.2-6.8L30 19l6.8-2.2L39 10Z" fill="currentColor"/></svg>`,
    MAGIC: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="14" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="m24 5 4.8 13.2L43 24l-14.2 5.8L24 43l-4.8-13.2L5 24l14.2-5.8L24 5Z" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="24" cy="24" r="4.2" fill="currentColor"/></svg>`
  };

  const META = {
    MOVE: { label: 'DÉPLACER', icon: ICONS.MOVE },
    PUSH: { label: 'POUSSER', icon: ICONS.PUSH },
    MAGIC: { label: 'MAGIE', icon: ICONS.MAGIC }
  };

  const byId = id => document.getElementById(id);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const deckRoot = () => byId('deckDisplay');
  const miniCards = () => [...(deckRoot()?.querySelectorAll('.v64-mini-card') || [])];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  let dealActive = false;
  let observer = null;
  let interceptingEndTurn = false;
  let bypassEndTurn = false;
  let actionQueue = Promise.resolve();
  const pendingUsage = new Map();

  function typeOf(card) {
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

  function deckTarget() { return byId('ov2DeckHud'); }
  function discardTarget() { return byId('ov2DiscardHud') || byId('ov2End') || byId('endTurnBtn'); }
  function endTarget() { return byId('ov2End') || byId('endTurnBtn'); }

  function isLocalVisualTurn() {
    const game = byId('gameScreen');
    if (!game || game.classList.contains('hidden') || game.classList.contains('ai-turn')) return false;
    const visibleContext = [
      byId('turnContextKicker')?.textContent,
      byId('turnContextTitle')?.textContent,
      byId('ov2Instruction')?.textContent
    ].filter(Boolean).join(' ').toLocaleUpperCase('fr-FR');
    return !/TOUR DE L[’']ADVERSAIRE|L[’']ADVERSAIRE JOUE|ORDINATEUR/.test(visibleContext);
  }

  function activeReserveBadge() {
    const leftActive = byId('ov2LeftActive');
    const rightActive = byId('ov2RightActive');
    if (leftActive && !leftActive.classList.contains('ov2-off')) return byId('ov2LeftReserve');
    if (rightActive && !rightActive.classList.contains('ov2-off')) return byId('ov2RightReserve');
    return null;
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
    return activeReserveBadge()?.querySelector(`[data-reserve-${type.toLowerCase()}]`) || null;
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

  function syntheticRect(cx, cy, width, height) {
    return { left: cx - width / 2, top: cy - height / 2, width, height };
  }

  function actionTop() {
    const rects = ['MOVE', 'PUSH', 'MAGIC'].map(bottomTarget).map(rectOf).filter(Boolean);
    return rects.length ? Math.min(...rects.map(r => r.top)) : innerHeight - 120;
  }

  /* Même niveau que le tiroir d'îles : on reprend son vrai bottom CSS même
     lorsqu'il est masqué. Le bord inférieur des cartes est aligné sur cette
     ligne, juste au-dessus du dock d'actions. */
  function drawerLevelAnchor(cardH) {
    let bottomOffset = innerHeight < 800 ? 105 : 126;
    const drawer = byId('hudV2IslandDrawer');
    if (drawer) {
      const cssBottom = parseFloat(getComputedStyle(drawer).bottom);
      if (Number.isFinite(cssBottom) && cssBottom >= 70 && cssBottom <= 220) bottomOffset = cssBottom;
    }

    const drawerBottomY = innerHeight - bottomOffset;
    const safeBottomY = Math.min(drawerBottomY, actionTop() - 5);
    const centerY = safeBottomY - cardH / 2;
    return {
      x: innerWidth / 2,
      y: clamp(centerY, cardH / 2 + 72, innerHeight - cardH / 2 - 86)
    };
  }

  function makeCard(type, extraClass = '', count = 1, drawIndex = 0, drawTotal = 0) {
    const meta = META[type] || META.MOVE;
    const isDraw = drawIndex > 0 && drawTotal > 0;
    const el = document.createElement('div');
    el.className = `card-cycle-v7-card card-cycle-v10-card type-${type.toLowerCase()} ${extraClass}${count > 1 ? ' is-stack' : ''}${isDraw ? ' is-draw-back' : ''}`.trim();
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      ${isDraw ? `<span class="card-cycle-v10-backface"><i>✦</i><b>ILYOS</b><small>PIOCHE</small></span>` : ''}
      ${isDraw ? `<span class="card-cycle-v10-index">${String(drawIndex).padStart(2, '0')}/${String(drawTotal).padStart(2, '0')}</span>` : ''}
      <span class="card-cycle-v7-kicker">${isDraw ? 'CARTE ACTION' : 'ACTION'}</span>
      <span class="card-cycle-v7-icon">${meta.icon}</span>
      <b>${meta.label}</b>
      <i class="card-cycle-v7-rune"></i>
      ${isDraw ? `<span class="card-cycle-v10-source">TIRÉE DE LA PIOCHE</span>` : ''}
      ${count > 1 ? `<em>×${count}</em>` : ''}`;
    document.body.appendChild(el);
    return el;
  }

  async function fly(el, fromRect, toRect, {
    duration = 440,
    delay = 0,
    arc = 34,
    startScale = 1,
    endScale = .3,
    startOpacity = 1,
    endOpacity = .05,
    startRotate = 0,
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
    const anim = el.animate([
      { transform: `translate(0,0) scale(${startScale}) rotate(${startRotate}deg)`, opacity: startOpacity },
      { transform: `translate(${dx * .48}px,${dy * .47 - arc}px) scale(${(startScale + endScale) / 2 + .07}) rotate(${startRotate * -.35}deg)`, opacity: 1, offset: .50 },
      { transform: `translate(${dx}px,${dy}px) scale(${endScale}) rotate(${endRotate}deg)`, opacity: endOpacity }
    ], { duration, delay, easing: 'cubic-bezier(.18,.78,.17,1)', fill: 'forwards' });
    try { await anim.finished; } catch (_) {}
  }

  function pulse(node, className = 'card-cycle-v7-hit') {
    if (!node) return;
    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);
    setTimeout(() => node.classList.remove(className), 520);
  }

  function floatCount(node, text) {
    const rect = rectOf(node);
    if (!rect) return;
    const badge = document.createElement('div');
    badge.className = 'card-cycle-v7-count';
    badge.textContent = text;
    badge.style.left = `${rect.left + rect.width / 2}px`;
    badge.style.top = `${rect.top}px`;
    document.body.appendChild(badge);
    const anim = badge.animate([
      { opacity: 0, transform: 'translate(-50%,4px) scale(.86)' },
      { opacity: 1, transform: 'translate(-50%,-16px) scale(1.08)', offset: .34 },
      { opacity: 0, transform: 'translate(-50%,-34px) scale(.96)' }
    ], { duration: 620, easing: 'ease-out', fill: 'forwards' });
    anim.onfinish = () => badge.remove();
  }

  function showDrawOrigin(count) {
    const rect = rectOf(deckTarget());
    if (!rect) return null;
    const badge = document.createElement('div');
    badge.className = 'card-cycle-v10-origin';
    badge.innerHTML = `<b>PIOCHE</b><span>${count} CARTES</span>`;
    badge.style.left = `${rect.left + rect.width / 2}px`;
    badge.style.top = `${rect.top - 7}px`;
    document.body.appendChild(badge);
    badge.animate([
      { opacity: 0, transform: 'translate(-50%,-80%) scale(.92)' },
      { opacity: 1, transform: 'translate(-50%,-100%) scale(1)', offset: .22 },
      { opacity: 1, transform: 'translate(-50%,-100%) scale(1)', offset: .78 },
      { opacity: 0, transform: 'translate(-50%,-118%) scale(.96)' }
    ], { duration: 1500, easing: 'ease-out', fill: 'forwards' }).onfinish = () => badge.remove();
    return badge;
  }

  async function revealDrawCards(cardsGhost) {
    for (let i = 0; i < cardsGhost.length; i++) {
      cardsGhost[i]?.classList.add('is-revealed');
      await sleep(82);
    }
  }

  async function runDeal(cards) {
    if (!isLocalVisualTurn()) return;
    const types = cards.slice(0, 5).map(typeOf).filter(Boolean);
    if (!types.length) return;

    const compact = innerWidth < 980 || innerHeight < 720;
    const cardW = compact ? 70 : 86;
    const cardH = compact ? 108 : 136;
    const spacing = compact ? 78 : 98;
    const mid = (types.length - 1) / 2;
    const anchor = drawerLevelAnchor(cardH);

    const fanRects = types.map((_, index) => {
      const d = index - mid;
      return syntheticRect(anchor.x + d * spacing, anchor.y + Math.abs(d) * 2, cardW, cardH);
    });

    const source = rectOf(deckTarget()) || syntheticRect(72, actionTop() - 60, 62, 96);
    const sourceHud = deckTarget();
    sourceHud?.classList.add('card-cycle-v10-drawing');
    pulse(sourceHud, 'ov2-pile-hit');
    floatCount(sourceHud, `−${types.length}`);
    showDrawOrigin(types.length);

    const cardsGhost = types.map((type, index) => makeCard(type, 'showcase', 1, index + 1, types.length));

    /* Les cartes quittent PIOCHE encore face cachée. */
    await Promise.all(cardsGhost.map((ghost, index) => fly(ghost, source, fanRects[index], {
      duration: 500,
      delay: index * 72,
      arc: 36 + index * 4,
      startScale: .38,
      endScale: 1,
      startOpacity: .10,
      endOpacity: 1,
      startRotate: -7 + index * 1.4,
      endRotate: (index - mid) * 1.25
    })));

    await sleep(120);
    await revealDrawCards(cardsGhost);
    await sleep(compact ? 520 : 690);

    const counts = { MOVE: 0, PUSH: 0, MAGIC: 0 };
    types.forEach(type => counts[type]++);

    await Promise.all(cardsGhost.map(async (ghost, index) => {
      const target = bottomTarget(types[index]);
      const to = rectOf(target);
      if (!to) { ghost.remove(); return; }
      await fly(ghost, fanRects[index], to, {
        duration: 410,
        delay: index * 38,
        arc: 22,
        startScale: 1,
        endScale: .22,
        endOpacity: .03,
        startRotate: (index - mid) * 1.25
      });
      ghost.remove();
    }));

    sourceHud?.classList.remove('card-cycle-v10-drawing');

    Object.entries(counts).forEach(([type, count]) => {
      if (!count) return;
      const target = bottomTarget(type);
      pulse(target);
      floatCount(target, `+${count}`);
    });
  }

  function reserveCurrent(type) {
    return parseCount(reserveCountNode(type)?.textContent);
  }

  function incrementReserveVisual(type, count) {
    const node = reserveCountNode(type);
    if (node) node.textContent = String(Math.min(5, parseCount(node.textContent) + count));
  }

  async function animateActionUse(type, count) {
    if (!isLocalVisualTurn()) return;
    const from = rectOf(bottomTarget(type));
    const to = rectOf(discardTarget());
    if (!from || !to) return;
    const ghost = makeCard(type, 'transfer', count);
    await fly(ghost, from, to, { duration: 430, arc: 42, startScale: .54, endScale: .20 });
    ghost.remove();
    pulse(discardTarget(), 'ov2-pile-hit');
    floatCount(discardTarget(), `+${count}`);
  }

  function queueUsage(type, count) {
    if (!META[type] || !isLocalVisualTurn()) return;
    const current = pendingUsage.get(type) || { count: 0, timer: null };
    current.count += Math.max(1, Number(count) || 1);
    clearTimeout(current.timer);
    current.timer = setTimeout(() => {
      pendingUsage.delete(type);
      actionQueue = actionQueue.then(() => animateActionUse(type, current.count));
    }, 70);
    pendingUsage.set(type, current);
  }

  async function runEndTurn(cards) {
    if (!isLocalVisualTurn()) return;
    const counts = { MOVE: 0, PUSH: 0, MAGIC: 0 };
    cards.slice(0, 5).forEach(card => {
      const type = typeOf(card);
      if (type) counts[type]++;
    });

    for (const type of ['MOVE', 'PUSH', 'MAGIC']) {
      const total = counts[type];
      if (!total) continue;
      const bank = Math.min(total, Math.max(0, 5 - reserveCurrent(type)));
      const overflow = total - bank;

      if (bank > 0) {
        const from = rectOf(bottomTarget(type));
        const to = rectOf(reserveTarget(type));
        if (from && to) {
          const ghost = makeCard(type, 'transfer', bank);
          await fly(ghost, from, to, { duration: 500, arc: 48, startScale: .54, endScale: .22 });
          ghost.remove();
          incrementReserveVisual(type, bank);
          pulse(reserveTarget(type), 'card-cycle-v7-reserve-hit');
          floatCount(reserveTarget(type), `+${bank}`);
        }
      }

      if (overflow > 0) {
        const from = rectOf(bottomTarget(type));
        const to = rectOf(discardTarget());
        if (from && to) {
          const ghost = makeCard(type, 'transfer', overflow);
          await fly(ghost, from, to, { duration: 430, arc: 38, startScale: .54, endScale: .20 });
          ghost.remove();
          pulse(discardTarget(), 'ov2-pile-hit');
          floatCount(discardTarget(), `+${overflow}`);
        }
      }
      await sleep(45);
    }
    pulse(endTarget(), 'card-cycle-v7-end-hit');
  }

  function inspectDeck() {
    const cards = miniCards();
    const dealing = cards.some(card => card.classList.contains('deal-card'));
    if (dealing && !dealActive) {
      dealActive = true;
      requestAnimationFrame(() => runDeal(miniCards()));
    } else if (!dealing) {
      dealActive = false;
    }
  }

  function bindEvents() {
    window.addEventListener('ilyos:fresh-card-used', event => queueUsage(event.detail?.type, event.detail?.count));
    window.addEventListener('ilyos:reserve-card-used', event => queueUsage(event.detail?.type, event.detail?.count));

    document.addEventListener('click', async event => {
      const button = event.target?.closest?.('#endTurnBtn');
      if (!button || button.disabled || bypassEndTurn || interceptingEndTurn || !isLocalVisualTurn()) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      interceptingEndTurn = true;
      byId('ov2End')?.classList.add('card-cycle-v7-locked');
      try {
        await actionQueue;
        await runEndTurn(miniCards());
      } finally {
        interceptingEndTurn = false;
        byId('ov2End')?.classList.remove('card-cycle-v7-locked');
        bypassEndTurn = true;
        button.click();
        queueMicrotask(() => { bypassEndTurn = false; });
      }
    }, true);
  }

  function start() {
    const root = deckRoot();
    if (!root) { setTimeout(start, 120); return; }
    bindEvents();
    observer = new MutationObserver(inspectDeck);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    inspectDeck();
    window.ILYOS_CARD_CYCLE_V10 = { inspect: inspectDeck, stop: () => observer?.disconnect() };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();