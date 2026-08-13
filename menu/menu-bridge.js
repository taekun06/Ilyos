/* ILYOS menu bridge — the ONLY file that connects the visual menu to the existing game. */
(function () {
  function boot() {
    const host = document.getElementById('ilyos-new-menu');
    if (!host || host.dataset.bridgeReady) return;
    host.dataset.bridgeReady = '1';

    const legacySetup = document.getElementById('setupScreen');
    const gameScreen = document.getElementById('gameScreen');
    const playerCount = document.getElementById('playerCount');
    const rulesSetupBtn = document.getElementById('rulesSetupBtn');
    const rulesBtn = document.getElementById('rulesBtn');
    const altStartBtn = document.getElementById('altStartBtn');
    const startBtn = document.getElementById('startBtn');

    let style = document.getElementById('ilyos-menu-legacy-bridge-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'ilyos-menu-legacy-bridge-style';
      style.textContent = `body.ilyos-new-menu-visible > #setupScreen{visibility:hidden!important;pointer-events:none!important}`;
      document.head.appendChild(style);
    }

    function applyMode(mode) {
      const c = window.ILYOS_MENU_CONFIG?.modes?.[mode];
      if (!c || !playerCount) return false;
      playerCount.value = String(c.playerCount);
      playerCount.dispatchEvent(new Event('change', { bubbles:true }));
      return true;
    }

    function syncVisibility() {
      const gameIsVisible = gameScreen && !gameScreen.classList.contains('hidden');
      const setupIsVisible = legacySetup && !legacySetup.classList.contains('hidden');
      if (gameIsVisible) {
        document.body.classList.remove('ilyos-new-menu-visible');
        window.ILYOS_NEW_MENU?.hide();
      } else if (setupIsVisible) {
        document.body.classList.add('ilyos-new-menu-visible');
        if (window.ILYOS_NEW_MENU) { window.ILYOS_NEW_MENU.show(); window.ILYOS_NEW_MENU.openHome(); }
      }
    }

    host.addEventListener('ilyos-menu-mode', e => applyMode(e.detail.mode));
    host.addEventListener('ilyos-menu-play', e => {
      applyMode(e.detail.mode);
      const launch = altStartBtn || startBtn;
      launch?.click();
      setTimeout(syncVisibility, 50);
      setTimeout(syncVisibility, 400);
    });

    host.addEventListener('ilyos-menu-action', e => {
      const action = e.detail.action;
      if (action === 'rules' || action === 'help') (rulesSetupBtn || rulesBtn)?.click();
      if (action === 'settings') document.getElementById('soundBtn')?.click();
      if (action === 'tutorial') window.dispatchEvent(new CustomEvent('ilyos-menu-tutorial-requested'));
      if (action === 'credits') window.dispatchEvent(new CustomEvent('ilyos-menu-credits-requested'));
    });

    const observer = new MutationObserver(syncVisibility);
    if (legacySetup) observer.observe(legacySetup, { attributes:true, attributeFilter:['class'] });
    if (gameScreen) observer.observe(gameScreen, { attributes:true, attributeFilter:['class'] });

    applyMode(window.ILYOS_MENU_CONFIG?.defaultMode || 'solo');
    syncVisibility();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
