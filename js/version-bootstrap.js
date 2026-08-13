window.ILYOS_BUILD = "V75.1"; document.title = "ILYOS V75.1 — Stable Netlify";

/* ILYOS V11 MENU — isolated iframe integration.
   The visual menu lives entirely in /menu. This file only bridges it to the existing game. */
(function () {
  if (window.__ILYOS_MENU_IFRAME_BOOT__) return;
  window.__ILYOS_MENU_IFRAME_BOOT__ = true;

  const guardStyle = document.createElement('style');
  guardStyle.id = 'ilyos-menu-v11-guard';
  guardStyle.textContent = `
    body.ilyos-menu-v11-active > #setupScreen{visibility:hidden!important;pointer-events:none!important}
    #ilyos-menu-v11-frame{position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:2147483000;background:#040a11;display:block}
    #ilyos-menu-v11-frame[hidden]{display:none!important}
  `;
  document.head.appendChild(guardStyle);

  function setLegacyMode(mode) {
    const map = { solo:'1', duel:'2', team:'4', online:'online' };
    const select = document.getElementById('playerCount');
    if (!select || !(mode in map)) return false;
    select.value = map[mode];
    select.dispatchEvent(new Event('change', { bubbles:true }));
    return true;
  }

  function launchGame(mode) {
    setLegacyMode(mode);
    const launch = document.getElementById('altStartBtn') || document.getElementById('startBtn');
    if (launch) launch.click();
  }

  function syncFrame(frame) {
    const setup = document.getElementById('setupScreen');
    const game = document.getElementById('gameScreen');
    const gameVisible = !!game && !game.classList.contains('hidden');
    const setupVisible = !!setup && !setup.classList.contains('hidden');

    if (gameVisible) {
      frame.hidden = true;
      document.body.classList.remove('ilyos-menu-v11-active');
    } else if (setupVisible || !gameVisible) {
      frame.hidden = false;
      document.body.classList.add('ilyos-menu-v11-active');
    }
  }

  function boot() {
    if (document.getElementById('ilyos-menu-v11-frame')) return;

    document.body.classList.add('ilyos-menu-v11-active');
    const frame = document.createElement('iframe');
    frame.id = 'ilyos-menu-v11-frame';
    frame.title = 'Menu ILYOS';
    frame.src = './menu/frame.html?v=menu-v11-frame-2';
    frame.setAttribute('allow', 'autoplay');
    document.body.appendChild(frame);

    window.addEventListener('message', (event) => {
      if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
      const msg = event.data || {};
      if (msg.source !== 'ilyos-menu') return;

      if (msg.type === 'mode') setLegacyMode(msg.detail?.mode);
      if (msg.type === 'play') {
        launchGame(msg.detail?.mode);
        setTimeout(() => syncFrame(frame), 100);
        setTimeout(() => syncFrame(frame), 700);
      }
      if (msg.type === 'action') {
        const action = msg.detail?.action;
        if (action === 'rules' || action === 'help') {
          (document.getElementById('rulesSetupBtn') || document.getElementById('rulesBtn'))?.click();
        } else if (action === 'settings') {
          document.getElementById('soundBtn')?.click();
        } else if (action === 'tutorial') {
          window.dispatchEvent(new CustomEvent('ilyos-menu-tutorial-requested'));
        } else if (action === 'credits') {
          window.dispatchEvent(new CustomEvent('ilyos-menu-credits-requested'));
        }
      }
    });

    const observer = new MutationObserver(() => syncFrame(frame));
    const setup = document.getElementById('setupScreen');
    const game = document.getElementById('gameScreen');
    if (setup) observer.observe(setup, {attributes:true,attributeFilter:['class']});
    if (game) observer.observe(game, {attributes:true,attributeFilter:['class']});
    syncFrame(frame);
    console.info('[ILYOS menu] isolated iframe active');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
