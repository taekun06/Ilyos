/* Entry point for the autonomous ILYOS menu module. */
(function () {
  function load(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  async function boot() {
    try {
      await load('./menu/menu-config.js');
      await load('./menu/menu.js');
      await load('./menu/menu-bridge.js');
    } catch (err) {
      console.error('[ILYOS menu] chargement impossible', err);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
