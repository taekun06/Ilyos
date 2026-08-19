/* ILYOS — Défausse interactive V9
   Clic sur le HUD DÉFAUSSE => détail des vraies cartes du joueur actif.
   Lecture seule : aucune carte n'est déplacée ni modifiée. */
(() => {
  'use strict';
  if (window.__ILYOS_DISCARD_VIEWER_V9__) return;
  window.__ILYOS_DISCARD_VIEWER_V9__ = true;

  const byId = id => document.getElementById(id);
  const META = {
    MOVE: { label: 'DÉPLACEMENT', symbol: '↟' },
    PUSH: { label: 'POUSSÉE', symbol: '➜' },
    MAGIC: { label: 'MAGIE', symbol: '✦' }
  };
  let viewer = null;
  let boundHud = null;

  function parseStoredState() {
    for (const key of ['ilyos-local-session-v22', 'ilyos-online-session-v1']) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        const candidate = parsed?.state || parsed?.gameState || parsed;
        if (Array.isArray(candidate?.players)) return candidate;
      } catch (_) {}
    }
    return null;
  }

  function currentDiscard() {
    const snapshot = parseStoredState();
    if (!snapshot?.players?.length) return { cards: [], player: null, stale: true };
    const index = Math.max(0, Math.min(snapshot.players.length - 1, Number(snapshot.currentPlayer) || 0));
    const player = snapshot.players[index] || null;
    return {
      cards: Array.isArray(player?.discard) ? player.discard : [],
      player,
      stale: false
    };
  }

  function ensureViewer() {
    if (viewer?.isConnected) return viewer;
    viewer = document.createElement('div');
    viewer.id = 'ov2DiscardViewer';
    viewer.className = 'ov2-discard-viewer ov2-discard-viewer-hidden';
    viewer.setAttribute('aria-hidden', 'true');
    viewer.innerHTML = `
      <div class="ov2-discard-viewer-backdrop" data-discard-close></div>
      <section class="ov2-discard-panel" role="dialog" aria-modal="true" aria-labelledby="ov2DiscardViewerTitle">
        <header class="ov2-discard-head">
          <div>
            <small>DÉFAUSSE</small>
            <h2 id="ov2DiscardViewerTitle">Cartes utilisées</h2>
          </div>
          <button type="button" class="ov2-discard-close" data-discard-close aria-label="Fermer">×</button>
        </header>
        <div class="ov2-discard-summary" data-discard-summary></div>
        <div class="ov2-discard-grid" data-discard-grid></div>
        <p class="ov2-discard-empty" data-discard-empty></p>
      </section>`;
    document.body.appendChild(viewer);
    viewer.querySelectorAll('[data-discard-close]').forEach(node => node.addEventListener('click', close));
    return viewer;
  }

  function cardMarkup(card, index) {
    const type = META[card?.action] ? card.action : 'MOVE';
    const meta = META[type];
    return `<div class="ov2-discard-card type-${type.toLowerCase()}" aria-label="${meta.label}">
      <small>${String(index + 1).padStart(2, '0')}</small>
      <span>${meta.symbol}</span>
      <b>${meta.label}</b>
    </div>`;
  }

  function render() {
    const root = ensureViewer();
    const { cards, player, stale } = currentDiscard();
    const visibleHudCount = Number(byId('ov2DiscardHud')?.querySelector('.ov2-pile-count')?.textContent || 0) || 0;
    const counts = { MOVE: 0, PUSH: 0, MAGIC: 0 };
    cards.forEach(card => { if (counts[card?.action] !== undefined) counts[card.action]++; });

    const title = root.querySelector('#ov2DiscardViewerTitle');
    const summary = root.querySelector('[data-discard-summary]');
    const grid = root.querySelector('[data-discard-grid]');
    const empty = root.querySelector('[data-discard-empty]');

    if (title) title.textContent = player?.name ? `Défausse de ${player.name}` : 'Cartes en défausse';
    if (summary) summary.innerHTML = `
      <span><b>${cards.length || visibleHudCount}</b> carte${(cards.length || visibleHudCount) === 1 ? '' : 's'}</span>
      <span>↟ ${counts.MOVE}</span><span>➜ ${counts.PUSH}</span><span>✦ ${counts.MAGIC}</span>`;

    if (grid) grid.innerHTML = cards.map(cardMarkup).join('');
    if (empty) {
      if (cards.length) empty.textContent = '';
      else if (visibleHudCount > 0 && stale) empty.textContent = 'La défausse est en cours de synchronisation. Recliquez dans un instant.';
      else empty.textContent = 'La défausse est vide.';
    }
  }

  function open() {
    const root = ensureViewer();
    render();
    root.classList.remove('ov2-discard-viewer-hidden');
    root.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => root.classList.add('ov2-discard-viewer-open'));
    root.querySelector('.ov2-discard-close')?.focus({ preventScroll: true });
  }

  function close() {
    if (!viewer) return;
    viewer.classList.remove('ov2-discard-viewer-open');
    viewer.setAttribute('aria-hidden', 'true');
    setTimeout(() => viewer?.classList.add('ov2-discard-viewer-hidden'), 160);
  }

  function bindHud() {
    const hud = byId('ov2DiscardHud');
    if (!hud || hud === boundHud) return !!hud;
    boundHud = hud;
    hud.classList.add('ov2-interactive');
    hud.setAttribute('role', 'button');
    hud.setAttribute('tabindex', '0');
    hud.setAttribute('aria-haspopup', 'dialog');
    hud.title = 'Voir les cartes en défausse';
    hud.style.setProperty('pointer-events','auto','important');
    hud.style.setProperty('cursor','pointer','important');
    hud.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      open();
    }, true);
    hud.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      open();
    });
    return true;
  }

  function boot() {
    ensureViewer();
    if (!bindHud()) setTimeout(boot, 120);
    const game = byId('gameScreen');
    if (game) new MutationObserver(bindHud).observe(game, { childList: true, subtree: true });

    window.addEventListener('ilyos:open-discard-viewer', open);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && viewer && !viewer.classList.contains('ov2-discard-viewer-hidden')) close();
    });
    window.ILYOS_DISCARD_VIEWER = { open, close, render };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();