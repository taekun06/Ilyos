/* ILYOS — cycle visuel des cartes V4
   Animation directement ancree sur le HUD organique visible.
   Aucune regle de jeu n'est modifiee : cette couche observe le HUD historique
   pour connaitre les 5 cartes, puis anime uniquement des fantomes visuels. */
(() => {
  'use strict';

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;

  const META = {
    MOVE:  { label: 'DEPLACER', symbol: '↟' },
    PUSH:  { label: 'POUSSER',  symbol: '➜' },
    MAGIC: { label: 'MAGIE',    symbol: '✦' }
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const byId = id => document.getElementById(id);
  const deckRoot = () => byId('deckDisplay');
  const miniCards = () => [...(deckRoot()?.querySelectorAll('.v64-mini-card') || [])];

  let baseline = null;
  let dealActive = false;
  let observer = null;
  let interceptingEndTurn = false;
  let bypassEndTurn = false;

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

  function bottomCount(type) {
    return byId({ MOVE: 'ov2MoveCount', PUSH: 'ov2PushCount', MAGIC: 'ov2MagicCount' }[type]);
  }

  function endTarget() {
    return byId('ov2End') || byId('endTurnBtn');
  }

  function activeReserveBadge() {
    const leftActive = byId('ov2LeftActive');
    const rightActive = byId('ov2RightActive');
    if (leftActive && !leftActive.classList.contains('ov2-off')) return byId('ov2LeftReserve');
    if (rightActive && !rightActive.classList.contains('ov2-off')) return byId('ov2RightReserve');

    // Fallback : le bouton FIN DU TOUR n'est actif que pour le joueur humain.
    // En cas de synchronisation HUD legerement retardee, le premier badge visible
    // reste une meilleure ancre que les anciens compteurs caches.
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

  function readAvailable() {
    const out = { MOVE: 0, PUSH: 0, MAGIC: 0 };
    Object.keys(out).forEach(type => {
      const organic = bottomCount(type);
      if (organic) {
        out[type] = parseCount(organic.textContent);
        return;
      }
      const legacy = bottomTarget(type);
      const explicit = legacy?.querySelector?.('.hud-v2-pill-count')?.textContent;
      out[type] = parseCount(explicit || legacy?.textContent);
    });
    return out;
  }

  function countFresh(cards = miniCards()) {
    const out = { MOVE: 0, PUSH: 0, MAGIC: 0 };
    cards.forEach(card => {
      const type = cardType(card);
      if (type) out[type]++;
    });
    return out;
  }

  function captureBaseline(cards) {
    baseline = {
      fresh: countFresh(cards),
      available: readAvailable(),
      capturedAt: Date.now()
    };
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

  function syntheticRect(cx, cy, width = 58, height = 78) {
    return { left: cx - width / 2, top: cy - height / 2, width, height };
  }

  function dockGeometry() {
    const targets = ['MOVE', 'PUSH', 'MAGIC'].map(bottomTarget).map(rectOf).filter(Boolean);
    if (!targets.length) {
      return { cx: innerWidth / 2, top: innerHeight - 120 };
    }
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
    duration = 430,
    delay = 0,
    arc = 22,
    startScale = 1,
    endScale = .42,
    startOpacity = 1,
    endOpacity = .12
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
      { transform: `translate(0,0) scale(${startScale}) rotate(-2deg)`, opacity: startOpacity },
      {
        transform: `translate(${dx * .48}px,${dy * .42 - arc}px) scale(${(startScale + endScale) / 2 + .08}) rotate(3deg)`,
        opacity: 1,
        offset: .52
      },
      { transform: `translate(${dx}px,${dy}px) scale(${endScale}) rotate(0deg)`, opacity: endOpacity }
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

  function showDrawSource(rect) {
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
    captureBaseline(cards);

    // Toute la sequence vit juste au-dessus des vraies icones du dock.
    const dock = dockGeometry();
    const sourceRect = syntheticRect(dock.cx, Math.max(110, dock.top - 78), 46, 62);
    const source = showDrawSource(sourceRect);
    const fanY = Math.max(96, dock.top - 128);
    const fanRects = types.map((_, index) =>
      syntheticRect(dock.cx + (index - 2) * 54, fanY + Math.abs(index - 2) * 5, 54, 72)
    );
    const ghosts = types.map(type => makeFlyingCard(type, 'card-cycle-draw-card'));

    // 1) Les cinq cartes sortent visiblement de la pioche et se montrent un instant.
    await Promise.all(ghosts.map((ghost, index) =>
      fly(ghost, sourceRect, fanRects[index], {
        duration: 360,
        delay: index * 72,
        arc: 18,
        startScale: .68,
        endScale: 1,
        startOpacity: .25,
        endOpacity: 1
      })
    ));

    await sleep(180);

    // 2) Chaque carte rejoint l'icone correspondant exactement a son type.
    await Promise.all(ghosts.map(async (ghost, index) => {
      const target = bottomTarget(types[index]);
      const targetRect = rectOf(target);
      if (!targetRect) { ghost.remove(); return; }
      await fly(ghost, fanRects[index], targetRect, {
        duration: 430,
        delay: index * 82,
        arc: 26,
        startScale: 1,
        endScale: .28,
        endOpacity: .08
      });
      pulse(target);
      plusOne(target);
      ghost.remove();
    }));

    source.classList.add('is-leaving');
    setTimeout(() => source.remove(), 260);
  }

  function classifyFreshCards(cards) {
    if (!baseline) {
      return cards.map(card => ({ type: cardType(card) || 'MOVE', unused: false }));
    }

    const now = readAvailable();
    const freshUsed = { MOVE: 0, PUSH: 0, MAGIC: 0 };
    const seen = { MOVE: 0, PUSH: 0, MAGIC: 0 };

    Object.keys(freshUsed).forEach(type => {
      const spent = Math.max(0, (baseline.available[type] || 0) - (now[type] || 0));
      // Le moteur consomme les cartes fraiches avant la reserve : ce calcul
      // reproduit uniquement ce fait pour savoir quelles cartes ANIMER.
      freshUsed[type] = Math.min(baseline.fresh[type] || 0, spent);
    });

    return cards.map(card => {
      const type = cardType(card) || 'MOVE';
      const used = seen[type] < freshUsed[type];
      seen[type]++;
      return { type, unused: !used };
    });
  }

  function reserveCurrent(type) {
    return parseCount(reserveCountNode(type)?.textContent);
  }

  function incrementReserveVisual(type) {
    const node = reserveCountNode(type);
    if (!node) return;
    node.textContent = String(Math.min(5, parseCount(node.textContent) + 1));
  }

  async function runEndTurnAnimation(cards) {
    const entries = classifyFreshCards(cards.slice(0, 5));
    const end = endTarget();
    const endRect = rectOf(end);
    if (!endRect || !entries.length) return;

    const capacity = {
      MOVE: Math.max(0, 5 - reserveCurrent('MOVE')),
      PUSH: Math.max(0, 5 - reserveCurrent('PUSH')),
      MAGIC: Math.max(0, 5 - reserveCurrent('MAGIC'))
    };
    const reservedSoFar = { MOVE: 0, PUSH: 0, MAGIC: 0 };

    // Les cartes inutilisees quittent leurs icones du bas et montent d'abord
    // vers les vrais compteurs RESERVE du joueur actif dans le ruban superieur.
    const banked = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry.unused || reservedSoFar[entry.type] >= capacity[entry.type]) continue;
      const from = rectOf(bottomTarget(entry.type));
      const reserve = reserveTarget(entry.type);
      const to = rectOf(reserve);
      if (!from || !to) continue;

      reservedSoFar[entry.type]++;
      const ghost = makeFlyingCard(entry.type, 'card-cycle-bank-card');
      banked.push({ index: i, type: entry.type, reserve, reserveRect: to });
      await fly(ghost, from, to, {
        duration: 500,
        arc: 34,
        startScale: .62,
        endScale: .34,
        startOpacity: .94,
        endOpacity: .16
      });
      ghost.remove();
      incrementReserveVisual(entry.type);
      pulse(reserve, 'card-cycle-reserve-hit');
      plusOne(reserve, '+1 RESERVE');
      await sleep(55);
    }

    if (banked.length) await sleep(120);

    // Puis les cinq cartes physiques convergent vers FIN DU TOUR.
    // - carte conservee : depart depuis le compteur de reserve qu'elle vient de toucher ;
    // - carte utilisee / reserve pleine : depart depuis son icone d'action en bas.
    const bankedByIndex = new Map(banked.map(item => [item.index, item]));
    await Promise.all(entries.map(async (entry, index) => {
      const bankedEntry = bankedByIndex.get(index);
      const from = bankedEntry?.reserveRect || rectOf(bottomTarget(entry.type));
      if (!from) return;
      const ghost = makeFlyingCard(entry.type, 'card-cycle-end-card');
      await fly(ghost, from, endRect, {
        duration: 460,
        delay: index * 54,
        arc: 28 + index * 2,
        startScale: bankedEntry ? .48 : .58,
        endScale: .20,
        startOpacity: .9,
        endOpacity: .05
      });
      ghost.remove();
    }));

    pulse(end, 'card-cycle-end-hit');
    await sleep(120);
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

  function bindEndTurnInterception() {
    document.addEventListener('click', async event => {
      const button = event.target?.closest?.('#endTurnBtn');
      if (!button || button.disabled || bypassEndTurn || interceptingEndTurn) return;

      const cards = miniCards();
      if (!cards.length) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      interceptingEndTurn = true;
      byId('ov2End')?.classList.add('card-cycle-locked');

      try {
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

    bindEndTurnInterception();
    observer = new MutationObserver(inspectDeck);
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
    inspectDeck();

    window.ILYOS_CARD_CYCLE_V4 = {
      inspect: inspectDeck,
      baseline: () => baseline ? JSON.parse(JSON.stringify(baseline)) : null,
      stop: () => observer?.disconnect()
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
