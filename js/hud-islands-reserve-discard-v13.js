/* ILYOS — HUD V13
   Couche visuelle uniquement :
   - compteur de réserve progressif pendant le trajet des cartes
   - consultation de défausse habillée avec les faces V12
   Aucune règle ni donnée de jeu n'est modifiée. */
(() => {
  'use strict';
  if (window.__ILYOS_HUD_ISLANDS_RESERVE_DISCARD_V13__) return;
  window.__ILYOS_HUD_ISLANDS_RESERVE_DISCARD_V13__ = true;

  const byId = id => document.getElementById(id);
  const parseCount = text => {
    const m = String(text || '').match(/-?\d+/);
    return m ? Math.max(0, Number(m[0]) || 0) : 0;
  };

  const ICONS = {
    MOVE: `<svg viewBox="0 0 48 48" aria-hidden="true"><g fill="currentColor"><ellipse cx="17" cy="14" rx="5" ry="8"/><circle cx="13" cy="24" r="2"/><circle cx="17" cy="23" r="2"/><ellipse cx="31" cy="32" rx="5" ry="8"/><circle cx="27" cy="41" r="2"/><circle cx="31" cy="40" r="2"/></g></svg>`,
    PUSH: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 24h24M23 14l10 10-10 10" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="m39 10 2.2 7L48 19l-6.8 2.2L39 28l-2.2-6.8L30 19l6.8-2.2L39 10Z" fill="currentColor"/></svg>`,
    MAGIC: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="14" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="m24 5 4.8 13.2L43 24l-14.2 5.8L24 43l-4.8-13.2L5 24l14.2-5.8L24 5Z" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="24" cy="24" r="4.2" fill="currentColor"/></svg>`
  };

  const LABELS = { MOVE: 'DÉPLACER', PUSH: 'POUSSER', MAGIC: 'MAGIE' };

  function applyIslandPolish() {
    const selector = byId('islandSelector');
    if (!selector || !selector.closest('#hudV2IslandDrawer')) return false;
    selector.style.setProperty('column-gap', innerWidth < 980 || innerHeight < 720 ? '14px' : '20px', 'important');
    selector.style.setProperty('row-gap', innerWidth < 980 || innerHeight < 720 ? '10px' : '14px', 'important');
    selector.style.setProperty('padding', innerWidth < 980 || innerHeight < 720 ? '7px 9px' : '10px 12px', 'important');
    return true;
  }

  function activeReserveBadge() {
    const leftActive = byId('ov2LeftActive');
    const rightActive = byId('ov2RightActive');
    if (leftActive && !leftActive.classList.contains('ov2-off')) return byId('ov2LeftReserve');
    if (rightActive && !rightActive.classList.contains('ov2-off')) return byId('ov2RightReserve');
    return null;
  }

  function reserveCountNode(type) {
    return activeReserveBadge()?.querySelector(`[data-reserve-${type.toLowerCase()}]`) || null;
  }

  function reserveTarget(type) {
    const badge = activeReserveBadge();
    if (!badge) return null;
    const key = type.toLowerCase();
    return badge.querySelector(`.ov2-reserve-${key}`)
      || badge.querySelector(`[data-reserve-${key}]`)?.closest('.ov2-reserve-action')
      || badge;
  }

  function transferType(node) {
    if (node.classList.contains('type-move')) return 'MOVE';
    if (node.classList.contains('type-push')) return 'PUSH';
    if (node.classList.contains('type-magic')) return 'MAGIC';
    return null;
  }

  function transferCount(node) {
    return Math.max(1, parseCount(node.querySelector('em')?.textContent || '1'));
  }

  function targetCenter(node) {
    if (!node) return null;
    const r = node.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function animationEndCenter(node, animation) {
    try {
      const left = parseFloat(node.style.left) || 0;
      const top = parseFloat(node.style.top) || 0;
      const width = parseFloat(node.style.width) || node.getBoundingClientRect().width || 0;
      const height = parseFloat(node.style.height) || node.getBoundingClientRect().height || 0;
      const frames = animation?.effect?.getKeyframes?.() || [];
      const last = frames[frames.length - 1];
      const transform = String(last?.transform || '');
      const match = transform.match(/translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/i);
      if (!match) return null;
      return {
        x: left + width / 2 + Number(match[1]),
        y: top + height / 2 + Number(match[2])
      };
    } catch (_) {
      return null;
    }
  }

  function pulseProgress(node) {
    node.classList.remove('is-step');
    void node.offsetWidth;
    node.classList.add('is-step');
  }

  function startReserveProgress(type, amount, duration) {
    const countNode = reserveCountNode(type);
    if (!countNode || amount < 1) return;
    const rect = countNode.getBoundingClientRect();
    if (!rect.width && !rect.height) return;

    const base = parseCount(countNode.textContent);
    const overlay = document.createElement('span');
    overlay.className = 'v13-reserve-progress';
    overlay.textContent = String(base);
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    document.body.appendChild(overlay);

    const previousOpacity = countNode.style.getPropertyValue('opacity');
    const previousPriority = countNode.style.getPropertyPriority('opacity');
    countNode.style.setProperty('opacity', '0', 'important');

    const safeDuration = Math.max(320, Number(duration) || 500);
    for (let step = 1; step <= amount; step++) {
      const ratio = .18 + (.68 * step / amount);
      setTimeout(() => {
        if (!overlay.isConnected) return;
        overlay.textContent = String(Math.min(5, base + step));
        pulseProgress(overlay);
      }, Math.round(safeDuration * ratio));
    }

    setTimeout(() => {
      if (previousOpacity) countNode.style.setProperty('opacity', previousOpacity, previousPriority || '');
      else countNode.style.removeProperty('opacity');
      overlay.remove();
    }, safeDuration + 70);
  }

  function inspectTransfer(node, attempt = 0) {
    if (!(node instanceof Element) || node.dataset.v13ReserveInspected === '1') return;
    const type = transferType(node);
    if (!type) return;

    const animations = node.getAnimations?.() || [];
    const animation = animations.find(item => item?.effect?.getKeyframes);
    if (!animation) {
      if (attempt < 8) requestAnimationFrame(() => inspectTransfer(node, attempt + 1));
      return;
    }

    const end = animationEndCenter(node, animation);
    const reserve = targetCenter(reserveTarget(type));
    if (!end || !reserve) return;

    const distance = Math.hypot(end.x - reserve.x, end.y - reserve.y);
    if (distance > 70) return;

    node.dataset.v13ReserveInspected = '1';
    const timing = animation.effect?.getTiming?.() || {};
    startReserveProgress(type, transferCount(node), Number(timing.duration) || 500);
  }

  function inspectAddedNode(node) {
    if (!(node instanceof Element)) return;
    if (node.matches?.('.card-cycle-v10-card.transfer')) inspectTransfer(node);
    node.querySelectorAll?.('.card-cycle-v10-card.transfer').forEach(inspectTransfer);
    if (node.id === 'ov2DiscardViewer' || node.querySelector?.('#ov2DiscardViewer')) requestAnimationFrame(upgradeDiscardViewer);
    if (node.id === 'hudV2IslandDrawer' || node.id === 'islandSelector' || node.querySelector?.('#hudV2IslandDrawer, #islandSelector')) requestAnimationFrame(applyIslandPolish);
  }

  function upgradeDiscardViewer() {
    const viewer = byId('ov2DiscardViewer');
    if (!viewer) return false;
    let changed = false;

    ['MOVE', 'PUSH', 'MAGIC'].forEach(type => {
      const card = viewer.querySelector(`[data-discard-type="${type}"]`);
      if (!card || card.dataset.v13CardArt === '1') return;
      const oldCount = card.querySelector(`[data-discard-count="${type}"]`)?.textContent || '×0';
      card.classList.add('card-cycle-v7-card', 'card-cycle-v10-card', 'showcase', 'discard-v12-card');
      card.dataset.v13CardArt = '1';
      card.innerHTML = `
        <span class="card-cycle-v7-icon" aria-hidden="true">${ICONS[type]}</span>
        <b>${LABELS[type]}</b>
        <i class="card-cycle-v7-rune" aria-hidden="true"></i>
        <strong class="ov2-discard-type-count" data-discard-count="${type}">${oldCount}</strong>`;
      changed = true;
    });

    if (changed) requestAnimationFrame(() => window.ILYOS_DISCARD_VIEWER?.render?.());
    return true;
  }

  const observer = new MutationObserver(records => {
    for (const record of records) record.addedNodes.forEach(inspectAddedNode);
  });

  function boot() {
    observer.observe(document.body, { childList: true, subtree: true });
    applyIslandPolish();
    upgradeDiscardViewer();
    setTimeout(applyIslandPolish, 120);
    setTimeout(applyIslandPolish, 600);
    setTimeout(upgradeDiscardViewer, 120);
    setTimeout(upgradeDiscardViewer, 600);
    window.addEventListener('resize', applyIslandPolish, { passive: true });
    window.addEventListener('orientationchange', applyIslandPolish, { passive: true });
    window.addEventListener('ilyos:open-discard-viewer', () => requestAnimationFrame(upgradeDiscardViewer));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
