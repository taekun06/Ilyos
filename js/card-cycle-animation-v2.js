/* ILYOS — cycle visuel des cartes V2
   Cette couche n'écrit jamais dans le state du jeu. Elle observe le HUD rendu
   par game.js et ajoute uniquement des fantômes visuels temporaires. */
(() => {
  'use strict';

  const REDUCED = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if (REDUCED) return;

  const COLORS = {
    MOVE: '#44c8ff',
    PUSH: '#ff9b55',
    MAGIC: '#b68cff'
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const byType = type => document.querySelector(`.v60-action-btn[data-type="${type}"]`);
  const deckRoot = () => document.getElementById('deckDisplay');
  const miniCards = () => [...(deckRoot()?.querySelectorAll('.v64-mini-card') || [])];
  const deckPile = () => deckRoot()?.querySelector('.v64-deck-summary > .v64-deck-count:first-child');
  const discardPile = () => deckRoot()?.querySelector('.v64-deck-summary > .v64-deck-count:last-child');

  let dealActive = false;
  let discardActive = false;
  let baseline = null;
  let interceptingEndTurn = false;
  let bypassEndTurn = false;
  let observer = null;

  function cardType(card) {
    if (card.classList.contains('action-move')) return 'MOVE';
    if (card.classList.contains('action-push')) return 'PUSH';
    if (card.classList.contains('action-magic')) return 'MAGIC';
    return null;
  }

  function countCards(cards = miniCards()) {
    const counts = { MOVE: 0, PUSH: 0, MAGIC: 0 };
    cards.forEach(card => {
      const type = cardType(card);
      if (type) counts[type]++;
    });
    return counts;
  }

  function readAvailable() {
    const result = { MOVE: 0, PUSH: 0, MAGIC: 0 };
    Object.keys(result).forEach(type => {
      const button = byType(type);
      const raw = button?.querySelector('b')?.textContent || '';
      const value = Number.parseInt(raw.replace(/[^0-9-]/g, ''), 10);
      result[type] = Number.isFinite(value) ? value : 0;
    });
    return result;
  }

  function center(rect) {
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function addPulse(target, className, color) {
    if (!target) return;
    if (color) target.style.setProperty('--cycle-color', color);
    target.classList.remove(className);
    void target.offsetWidth;
    target.classList.add(className);
    setTimeout(() => {
      target.classList.remove(className);
      target.style.removeProperty('--cycle-color');
    }, 520);
  }

  function spawnCaption(text, anchor) {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'card-cycle-caption';
    el.textContent = text;
    el.style.left = `${rect.left + rect.width / 2}px`;
    el.style.top = `${Math.max(24, rect.top - 18)}px`;
    document.body.appendChild(el);
    el.animate([
      { opacity: 0, transform: 'translate(-50%,-36%) scale(.92)' },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: .22 },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: .72 },
      { opacity: 0, transform: 'translate(-50%,-68%) scale(.98)' }
    ], { duration: 1050, easing: 'ease-out', fill: 'forwards' }).onfinish = () => el.remove();
  }

  function spawnBurstLabel(target, text, color) {
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'card-cycle-burst-label';
    el.textContent = text;
    el.style.setProperty('--cycle-color', color || '#fff');
    el.style.left = `${rect.left + rect.width / 2}px`;
    el.style.top = `${rect.top + 4}px`;
    document.body.appendChild(el);
    el.animate([
      { opacity: 0, transform: 'translate(-50%,-25%) scale(.82)' },
      { opacity: 1, transform: 'translate(-50%,-85%) scale(1.05)', offset: .28 },
      { opacity: 0, transform: 'translate(-50%,-150%) scale(.95)' }
    ], { duration: 760, easing: 'cubic-bezier(.18,.72,.2,1)', fill: 'forwards' }).onfinish = () => el.remove();
  }

  function cloneCard(card) {
    const rect = card.getBoundingClientRect();
    const ghost = card.cloneNode(true);
    ghost.classList.add('card-cycle-ghost');
    ghost.classList.remove('deal-card', 'discard-card', 'card-cycle-arrival', 'card-cycle-pre-end');
    ghost.removeAttribute('style');
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    document.body.appendChild(ghost);
    return { ghost, rect };
  }

  function animateDealCard(card, index, sourceRect) {
    const { ghost, rect } = cloneCard(card);
    const source = center(sourceRect);
    const target = center(rect);
    const startX = source.x - target.x;
    const startY = source.y - target.y;
    const rotation = -10 + index * 5;

    card.classList.add('card-cycle-arrival');
    const anim = ghost.animate([
      {
        transform: `translate(${startX}px,${startY}px) scale(.64) rotate(${rotation - 7}deg)`,
        opacity: .12,
        filter: 'brightness(.9)'
      },
      {
        transform: `translate(${startX * .42}px,${startY * .38 - 13}px) scale(.9) rotate(${rotation}deg)`,
        opacity: 1,
        filter: 'brightness(1.2)',
        offset: .58
      },
      {
        transform: 'translate(0,0) scale(1.04) rotate(0deg)',
        opacity: 1,
        filter: 'brightness(1.15)',
        offset: .9
      },
      { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 0 }
    ], {
      duration: 500,
      delay: index * 82,
      easing: 'cubic-bezier(.18,.72,.18,1)',
      fill: 'forwards'
    });
    anim.onfinish = () => ghost.remove();
  }

  function runDealAnimation(cards) {
    const source = deckPile();
    if (!source || !cards.length) return;
    const sourceRect = source.getBoundingClientRect();
    addPulse(source, 'card-cycle-deck-pulse');
    spawnCaption(`${cards.length} CARTES PIOCHÉES`, deckRoot());
    cards.slice(0, 5).forEach((card, index) => animateDealCard(card, index, sourceRect));

    baseline = {
      fresh: countCards(cards),
      available: readAvailable(),
      capturedAt: Date.now()
    };
  }

  function animateEnergy(card, target, index, type) {
    if (!target) return Promise.resolve();
    const fromRect = card.getBoundingClientRect();
    const toRect = target.getBoundingClientRect();
    const from = center(fromRect);
    const to = center(toRect);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const color = COLORS[type] || '#fff';

    return new Promise(resolve => {
      setTimeout(() => {
        const orb = document.createElement('div');
        orb.className = 'card-cycle-energy';
        orb.style.setProperty('--cycle-color', color);
        orb.style.left = `${from.x}px`;
        orb.style.top = `${from.y}px`;
        document.body.appendChild(orb);

        const anim = orb.animate([
          { transform: 'translate(0,0) scale(.45)', opacity: 0 },
          { transform: `translate(${dx * .12}px,${dy * .08 - 12}px) scale(1.2)`, opacity: 1, offset: .2 },
          { transform: `translate(${dx * .63}px,${dy * .48 - 18}px) scale(.9)`, opacity: 1, offset: .67 },
          { transform: `translate(${dx}px,${dy}px) scale(.3)`, opacity: .15 }
        ], {
          duration: 470,
          easing: 'cubic-bezier(.16,.72,.18,1)',
          fill: 'forwards'
        });

        anim.onfinish = () => {
          orb.remove();
          addPulse(target, 'card-cycle-reserve-pulse', color);
          spawnBurstLabel(target, '+1 RÉSERVE', color);
          resolve();
        };
      }, index * 62);
    });
  }

  function classifyFreshCards(cards) {
    if (!baseline) return cards.map(card => ({ card, type: cardType(card), unused: false }));

    const now = readAvailable();
    const spent = { MOVE: 0, PUSH: 0, MAGIC: 0 };
    const freshUsed = { MOVE: 0, PUSH: 0, MAGIC: 0 };
    const consumedPerType = { MOVE: 0, PUSH: 0, MAGIC: 0 };

    Object.keys(spent).forEach(type => {
      spent[type] = Math.max(0, (baseline.available[type] || 0) - (now[type] || 0));
      freshUsed[type] = Math.min(baseline.fresh[type] || 0, spent[type]);
    });

    return cards.map(card => {
      const type = cardType(card);
      if (!type) return { card, type: null, unused: false };
      const used = consumedPerType[type] < freshUsed[type];
      consumedPerType[type]++;
      return { card, type, unused: !used };
    });
  }

  async function runReservePrelude(cards) {
    if (!cards.length || !baseline) return;
    cards.forEach(card => card.classList.add('card-cycle-pre-end'));

    const classified = classifyFreshCards(cards);
    const unused = classified.filter(entry => entry.unused && entry.type);
    if (!unused.length) {
      await sleep(240);
      return;
    }

    spawnCaption('ACTIONS INUTILISÉES → RÉSERVE', deckRoot());
    await Promise.all(unused.map((entry, index) =>
      animateEnergy(entry.card, byType(entry.type), index, entry.type)
    ));
    await sleep(70);
  }

  function animateDiscardCard(card, index, targetRect) {
    const { ghost, rect } = cloneCard(card);
    const start = center(rect);
    const target = center(targetRect);
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    const bend = 12 + (index % 2) * 8;

    const anim = ghost.animate([
      { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
      {
        transform: `translate(${dx * .38}px,${dy * .28 - bend}px) scale(.9) rotate(${index % 2 ? 7 : -7}deg)`,
        opacity: 1,
        offset: .48
      },
      {
        transform: `translate(${dx}px,${dy}px) scale(.44) rotate(${index % 2 ? 16 : -16}deg)`,
        opacity: .12
      }
    ], {
      duration: 450,
      delay: index * 28,
      easing: 'cubic-bezier(.2,.66,.22,1)',
      fill: 'forwards'
    });
    anim.onfinish = () => ghost.remove();
  }

  function runDiscardAnimation(cards) {
    const target = discardPile();
    if (!target || !cards.length) return;
    const targetRect = target.getBoundingClientRect();
    spawnCaption('CARTES → DÉFAUSSE', deckRoot());
    cards.slice(0, 5).forEach((card, index) => animateDiscardCard(card, index, targetRect));
    setTimeout(() => addPulse(target, 'card-cycle-discard-pulse'), 390);
  }

  function inspectDeck() {
    const root = deckRoot();
    if (!root) return;
    const cards = miniCards();
    const hasDeal = cards.some(card => card.classList.contains('deal-card'));
    const hasDiscard = cards.some(card => card.classList.contains('discard-card'));

    if (hasDeal && !dealActive) {
      dealActive = true;
      requestAnimationFrame(() => runDealAnimation(miniCards()));
    } else if (!hasDeal) {
      dealActive = false;
    }

    if (hasDiscard && !discardActive) {
      discardActive = true;
      requestAnimationFrame(() => runDiscardAnimation(miniCards()));
    } else if (!hasDiscard) {
      discardActive = false;
    }
  }

  function bindEndTurnInterception() {
    document.addEventListener('click', async event => {
      const button = event.target?.closest?.('#endTurnBtn');
      if (!button || button.disabled || bypassEndTurn || interceptingEndTurn) return;

      const cards = miniCards();
      if (!cards.length || !baseline) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      interceptingEndTurn = true;
      button.classList.add('card-cycle-locked');

      try {
        await runReservePrelude(cards);
      } finally {
        interceptingEndTurn = false;
        button.classList.remove('card-cycle-locked');
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
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    inspectDeck();
    window.ILYOS_CARD_CYCLE_V2 = {
      inspect: inspectDeck,
      getBaseline: () => baseline ? JSON.parse(JSON.stringify(baseline)) : null,
      stop: () => observer?.disconnect()
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
