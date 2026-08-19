/* ILYOS — cycle visuel des cartes V3
   Animation centrale indépendante du layout du HUD.
   Aucune règle de jeu n'est modifiée : cette couche observe uniquement le rendu existant. */
(() => {
  'use strict';

  const REDUCED = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if (REDUCED) return;

  const META = {
    MOVE:  { label: 'DÉPLACEMENT', short: 'D', icon: '➜' },
    PUSH:  { label: 'POUSSÉE', short: 'P', icon: '✹' },
    MAGIC: { label: 'MAGIE', short: 'M', icon: '✦' }
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const deckRoot = () => document.getElementById('deckDisplay');
  const miniCards = () => [...(deckRoot()?.querySelectorAll('.v64-mini-card') || [])];
  const byType = type => document.querySelector(`.v60-action-btn[data-type="${type}"]`);

  let baseline = null;
  let dealActive = false;
  let interceptingEndTurn = false;
  let bypassEndTurn = false;
  let observer = null;
  let stage = null;

  function cardType(card) {
    if (card?.classList.contains('action-move')) return 'MOVE';
    if (card?.classList.contains('action-push')) return 'PUSH';
    if (card?.classList.contains('action-magic')) return 'MAGIC';
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
      const raw = byType(type)?.querySelector('b')?.textContent || '';
      const value = Number.parseInt(raw.replace(/[^0-9-]/g, ''), 10);
      result[type] = Number.isFinite(value) ? value : 0;
    });
    return result;
  }

  function removeStage() {
    stage?.remove();
    stage = null;
  }

  function createStage(kind, eyebrow, title, subtitle = '') {
    removeStage();
    const root = document.createElement('div');
    root.className = `card-cycle-stage card-cycle-${kind}`;
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `
      <div class="card-cycle-scene">
        <div class="card-cycle-heading">
          <span class="card-cycle-eyebrow">${eyebrow}</span>
          <strong>${title}</strong>
          ${subtitle ? `<small>${subtitle}</small>` : ''}
        </div>
        <div class="card-cycle-content"></div>
      </div>
    `;
    document.body.appendChild(root);
    stage = root;
    requestAnimationFrame(() => root.classList.add('is-visible'));
    return root;
  }

  function bigCardHTML(type, index, extra = '') {
    const meta = META[type] || META.MOVE;
    return `
      <div class="card-cycle-big-card type-${type.toLowerCase()} ${extra}" data-type="${type}" style="--i:${index}">
        <span class="card-cycle-card-glyph">${meta.icon}</span>
        <b>${meta.label}</b>
        <small>ACTION</small>
      </div>
    `;
  }

  function captureBaseline(cards) {
    baseline = {
      fresh: countCards(cards),
      available: readAvailable(),
      capturedAt: Date.now()
    };
  }

  async function runDealAnimation(cards) {
    const types = cards.slice(0, 5).map(cardType).filter(Boolean);
    if (!types.length) return;
    captureBaseline(cards);

    const root = createStage('deal', 'NOUVEAU TOUR', `${types.length} CARTES PIOCHÉES`, 'Votre main d’actions pour ce tour');
    const content = root.querySelector('.card-cycle-content');
    content.innerHTML = `
      <div class="card-cycle-deal-layout">
        <div class="card-cycle-deck-visual" aria-hidden="true">
          <i></i><i></i><i></i>
          <span>PIOCHE</span>
        </div>
        <div class="card-cycle-deal-arrow"><span>›</span><span>›</span><span>›</span></div>
        <div class="card-cycle-hand-fan">
          ${types.map((type, index) => bigCardHTML(type, index, 'deal-big-card')).join('')}
        </div>
      </div>
    `;

    const bigCards = [...content.querySelectorAll('.deal-big-card')];
    await sleep(120);
    bigCards.forEach((card, index) => {
      setTimeout(() => card.classList.add('is-dealt'), index * 120);
    });

    await sleep(1180);
    root.classList.add('is-leaving');
    await sleep(260);
    if (stage === root) removeStage();
  }

  function classifyFreshCards(cards) {
    if (!baseline) return cards.map(card => ({ type: cardType(card), unused: false }));

    const now = readAvailable();
    const freshUsed = { MOVE: 0, PUSH: 0, MAGIC: 0 };
    const seen = { MOVE: 0, PUSH: 0, MAGIC: 0 };

    Object.keys(freshUsed).forEach(type => {
      const spent = Math.max(0, (baseline.available[type] || 0) - (now[type] || 0));
      freshUsed[type] = Math.min(baseline.fresh[type] || 0, spent);
    });

    return cards.map(card => {
      const type = cardType(card);
      if (!type) return { type: 'MOVE', unused: false };
      const used = seen[type] < freshUsed[type];
      seen[type]++;
      return { type, unused: !used };
    });
  }

  function reserveTotals(classified) {
    const totals = { MOVE: 0, PUSH: 0, MAGIC: 0 };
    classified.forEach(entry => {
      if (entry.unused && entry.type) totals[entry.type]++;
    });
    return totals;
  }

  function pulseLiveHud(type) {
    const target = byType(type);
    if (!target) return;
    target.classList.remove('card-cycle-live-pulse');
    void target.offsetWidth;
    target.classList.add('card-cycle-live-pulse');
    setTimeout(() => target.classList.remove('card-cycle-live-pulse'), 720);
  }

  async function runEndTurnAnimation(cards) {
    const classified = classifyFreshCards(cards.slice(0, 5));
    const totals = reserveTotals(classified);
    const unusedCount = Object.values(totals).reduce((sum, value) => sum + value, 0);

    const root = createStage(
      'end',
      'FIN DU TOUR',
      unusedCount ? 'LES ACTIONS INUTILISÉES SONT CONSERVÉES' : 'TOUTES LES ACTIONS ONT ÉTÉ UTILISÉES',
      unusedCount ? 'Leur énergie rejoint la réserve, puis les cartes vont à la défausse.' : 'Les cartes jouées rejoignent maintenant la défausse.'
    );
    const content = root.querySelector('.card-cycle-content');

    content.innerHTML = `
      <div class="card-cycle-end-layout">
        <div class="card-cycle-end-hand">
          ${classified.map((entry, index) => bigCardHTML(entry.type, index, `end-big-card ${entry.unused ? 'is-unused' : 'is-used'}`)).join('')}
        </div>

        <div class="card-cycle-reserve-block">
          <span class="card-cycle-flow-label">RÉSERVE</span>
          <div class="card-cycle-reserve-row">
            ${Object.keys(META).map(type => `
              <div class="card-cycle-reserve-slot type-${type.toLowerCase()}" data-reserve="${type}">
                <span>${META[type].icon}</span>
                <b>${META[type].label}</b>
                <em>+${totals[type]}</em>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="card-cycle-discard-zone">
          <div class="card-cycle-discard-stack"><i></i><i></i><i></i></div>
          <b>DÉFAUSSE</b>
        </div>
      </div>
    `;

    const bigCards = [...content.querySelectorAll('.end-big-card')];
    await sleep(120);
    bigCards.forEach((card, index) => setTimeout(() => card.classList.add('is-shown'), index * 75));
    await sleep(520);

    if (unusedCount) {
      root.classList.add('phase-reserve');
      const counters = { MOVE: 0, PUSH: 0, MAGIC: 0 };
      const unusedCards = bigCards.filter(card => card.classList.contains('is-unused'));

      unusedCards.forEach((card, index) => {
        const type = card.dataset.type;
        setTimeout(() => {
          card.classList.add('send-energy');
          const slot = content.querySelector(`[data-reserve="${type}"]`);
          counters[type]++;
          slot?.classList.add('is-receiving');
          const counter = slot?.querySelector('em');
          if (counter) counter.textContent = `+${counters[type]}`;
          pulseLiveHud(type);
          setTimeout(() => slot?.classList.remove('is-receiving'), 470);
        }, index * 170);
      });

      await sleep(520 + Math.max(0, unusedCards.length - 1) * 170);
    } else {
      await sleep(140);
    }

    root.classList.add('phase-discard');
    bigCards.forEach((card, index) => {
      setTimeout(() => card.classList.add('to-discard'), index * 55);
    });
    await sleep(680);

    root.classList.add('is-leaving');
    await sleep(240);
    if (stage === root) removeStage();
  }

  function inspectDeck() {
    const cards = miniCards();
    const hasDeal = cards.some(card => card.classList.contains('deal-card'));

    if (hasDeal && !dealActive) {
      dealActive = true;
      runDealAnimation(cards);
    } else if (!hasDeal) {
      dealActive = false;
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
        await runEndTurnAnimation(cards);
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

    window.ILYOS_CARD_CYCLE_V3 = {
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
