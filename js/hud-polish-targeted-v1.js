/* ILYOS — HUD polish ciblé V1
   Ajoute uniquement des classes visuelles au HUD organique existant. */
(() => {
  'use strict';
  if (window.__ILYOS_HUD_POLISH_TARGETED_V1__) return;
  window.__ILYOS_HUD_POLISH_TARGETED_V1__ = true;

  const byId = id => document.getElementById(id);
  let lastActiveSide = null;
  let scheduled = false;
  let observer = null;

  function isTagActive(id) {
    const node = byId(id);
    return !!node && !node.classList.contains('ov2-off');
  }

  function sideNode(which) {
    return document.querySelector(`#ilyosHudOrganicV2 .ov2-side.ov2-${which}`);
  }

  function spawnParticles(side) {
    const avatar = side?.querySelector('.ov2-avatar');
    if (!avatar) return;
    avatar.querySelectorAll('.hud-polish-particle').forEach(node => node.remove());
    ['p1','p2','p3','p4'].forEach(cls => {
      const dot = document.createElement('i');
      dot.className = `hud-polish-particle ${cls}`;
      avatar.appendChild(dot);
      setTimeout(() => dot.remove(), 900);
    });
  }

  function boost(side) {
    if (!side) return;
    side.classList.remove('turn-boost');
    void side.offsetWidth;
    side.classList.add('turn-boost');
    spawnParticles(side);
    setTimeout(() => side.classList.remove('turn-boost'), 760);
  }

  function syncActivePortrait() {
    scheduled = false;
    const left = sideNode('left');
    const right = sideNode('right');
    if (!left || !right) return;

    const leftActive = isTagActive('ov2LeftActive');
    const rightActive = isTagActive('ov2RightActive');

    left.classList.toggle('is-active', leftActive);
    right.classList.toggle('is-active', rightActive);

    const next = leftActive ? 'left' : rightActive ? 'right' : null;
    if (next) {
      if (lastActiveSide && next !== lastActiveSide) boost(next === 'left' ? left : right);
      lastActiveSide = next;
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(syncActivePortrait);
  }

  function boot() {
    const root = byId('ilyosHudOrganicV2');
    if (!root) {
      setTimeout(boot, 100);
      return;
    }

    syncActivePortrait();
    observer = new MutationObserver(schedule);
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class']
    });

    window.ILYOS_HUD_POLISH_TARGETED = {
      sync: syncActivePortrait,
      stop: () => observer?.disconnect()
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();