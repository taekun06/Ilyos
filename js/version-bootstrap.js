window.ILYOS_BUILD = "V75.1"; document.title = "ILYOS V75.1 — Stable Netlify";

/* New menu integration hook. The menu itself stays isolated in /menu. */
(function () {
  const script = document.createElement('script');
  script.src = './menu/menu-loader.js';
  script.async = false;
  document.head.appendChild(script);
})();
