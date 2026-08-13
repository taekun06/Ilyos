window.ILYOS_BUILD = "V75.1"; document.title = "ILYOS V75.1 — Stable Netlify";

/* Robust bootstrap for the isolated /menu module. */
(function () {
  if (window.__ILYOS_MENU_BOOTSTRAP__) return;
  window.__ILYOS_MENU_BOOTSTRAP__ = true;

  function load(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src + '?v=menu-v11-2';
      s.async = false;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Unable to load ' + src));
      document.head.appendChild(s);
    });
  }

  async function bootMenu() {
    try {
      await load('./menu/menu-config.js');
      await load('./menu/menu.js');
      await load('./menu/menu-bridge.js');
      console.info('[ILYOS menu] module loaded');
    } catch (err) {
      console.error('[ILYOS menu] bootstrap failed', err);
    }
  }

  if (document.readyState === 'complete') bootMenu();
  else window.addEventListener('load', bootMenu, { once: true });
})();
