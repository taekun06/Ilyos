/* ILYOS new menu — visual module only. No game rules live here. */
(function () {
  const HOST_ID = 'ilyos-new-menu';
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement('div');
  host.id = HOST_ID;
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './menu/menu.css';
  root.appendChild(link);

  const shell = document.createElement('div');
  shell.innerHTML = `
<div class="app">
<section class="screen home active" id="home">
 <div class="art"></div><div class="shade"></div><div class="fog"></div><div class="halo"></div><canvas id="particles"></canvas>
 <div class="ui home-layout">
  <img class="logo-home" src="./menu/assets/ilyos-logo.svg" alt="ILYOS">
  <div class="top-icons"><button class="round" data-action="settings" aria-label="Réglages">⚙</button><button class="round" data-action="help" aria-label="Aide">?</button></div>
  <div class="mode-grid">
   <button class="card" data-mode="solo"><div class="card-icon">♙</div><div class="card-title">SOLO</div><div class="card-sub">Affrontez l’IA</div></button>
   <button class="card green" data-mode="duel"><div class="card-icon">♙ ♙</div><div class="card-title">DUEL LOCAL</div><div class="card-sub">2 joueurs</div></button>
   <button class="card violet" data-mode="team"><div class="card-icon">♜ ♜</div><div class="card-title">2 CONTRE 2</div><div class="card-sub">Équipes</div></button>
   <button class="card amber" data-mode="online"><div class="card-icon">◎</div><div class="card-title">EN LIGNE</div><div class="card-sub">Joueurs du monde</div></button>
  </div>
  <div class="home-nav"><button class="pill" data-action="rules">♛ RÈGLES</button><button class="pill" data-action="tutorial">▣ TUTORIEL</button><button class="pill" data-action="credits">★ CRÉDITS</button></div>
 </div>
</section>

<section class="screen duel" id="duel">
 <div class="duel-ambient"></div>
 <div class="duel-art"></div>
 <div class="duel-shade"></div>
 <div class="fog"></div>
 <div class="duel-left"></div><div class="duel-right"></div>
 <div class="duel-ui">
  <img class="logo-duel" src="./menu/assets/ilyos-logo.svg" alt="ILYOS">
  <button class="pill back" id="back">← RETOUR</button>
  <div class="duel-nav"><button class="pill" data-action="rules">RÈGLES</button><button class="pill" data-action="tutorial">TUTORIEL</button><button class="pill" data-action="credits">CRÉDITS</button></div>
  <div class="setup">
   <div class="panel" id="panel"></div>
   <button class="play" id="play">JOUER</button>
   <div class="desc" id="desc"></div>
  </div>
 </div>
</section>
<div class="veil" id="veil"></div>
</div>`;
  root.appendChild(shell);

  const home = root.getElementById('home');
  const duel = root.getElementById('duel');
  const veil = root.getElementById('veil');
  const panel = root.getElementById('panel');
  const desc = root.getElementById('desc');
  const cfg = (window.ILYOS_MENU_CONFIG && window.ILYOS_MENU_CONFIG.modes) || {};
  let selectedMode = window.ILYOS_MENU_CONFIG?.defaultMode || 'solo';

  function setPointer(e) {
    const r = host.getBoundingClientRect();
    const x = ((e.clientX - r.left) / Math.max(r.width, 1) - .5) * 2;
    const y = ((e.clientY - r.top) / Math.max(r.height, 1) - .5) * 2;
    host.style.setProperty('--mx', x.toFixed(3));
    host.style.setProperty('--my', y.toFixed(3));
  }
  window.addEventListener('pointermove', setPointer, { passive:true });

  function render(mode) {
    const c = cfg[mode];
    if (!c) return;
    selectedMode = mode;
    desc.textContent = c.description || '';
    panel.innerHTML = `<div class="mode-name">${c.label}</div>` +
      (c.fields || []).map(([l,v]) => `<div class="field"><div class="label">${l}</div><div class="control"><button type="button" aria-label="Précédent">‹</button><div class="value">${v}</div><button type="button" aria-label="Suivant">›</button></div></div>`).join('') +
      `<div class="dots">${[0,1,2,3].map(i => `<span class="dot ${i===c.dot?'on':''}"></span>`).join('')}</div>`;
    host.dispatchEvent(new CustomEvent('ilyos-menu-mode', { detail: { mode, config:c }, bubbles:true }));
  }

  function flash() { veil.classList.remove('run'); void veil.offsetWidth; veil.classList.add('run'); }
  function openMode(card) {
    root.querySelectorAll('.card').forEach(x => x.classList.remove('selected'));
    card.classList.add('selected'); home.classList.add('launching'); render(card.dataset.mode);
    setTimeout(flash,220);
    setTimeout(() => { home.classList.remove('active'); duel.classList.add('active'); duel.classList.remove('enter'); void duel.offsetWidth; duel.classList.add('enter'); },650);
    setTimeout(() => { home.classList.remove('launching'); card.classList.remove('selected'); },1280);
  }

  root.querySelectorAll('.card').forEach(card => card.addEventListener('click', () => openMode(card)));
  root.getElementById('back').addEventListener('click', () => { flash(); setTimeout(() => { duel.classList.remove('active','enter'); home.classList.add('active'); },430); });
  root.getElementById('play').addEventListener('click', () => host.dispatchEvent(new CustomEvent('ilyos-menu-play', { detail: { mode:selectedMode, config:cfg[selectedMode] }, bubbles:true })));
  root.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', () => host.dispatchEvent(new CustomEvent('ilyos-menu-action', { detail: { action:btn.dataset.action }, bubbles:true })));

  const canvas = root.getElementById('particles');
  const ctx = canvas.getContext('2d');
  let pts=[];
  function resizeParticles() {
    const rect=host.getBoundingClientRect(), w=Math.max(1,rect.width), h=Math.max(1,rect.height), d=Math.min(devicePixelRatio||1,2);
    canvas.width=w*d; canvas.height=h*d; canvas.style.width=w+'px'; canvas.style.height=h+'px'; ctx.setTransform(d,0,0,d,0,0);
    pts=Array.from({length:64},()=>({x:Math.random()*w,y:Math.random()*h,r:.5+Math.random()*1.5,v:.07+Math.random()*.18,a:.14+Math.random()*.46,p:Math.random()*6.28}));
  }
  function drawParticles(t) {
    const rect=host.getBoundingClientRect(), w=rect.width, h=rect.height; ctx.clearRect(0,0,w,h);
    for(const p of pts) { p.y-=p.v; p.x+=Math.sin(t*.00035+p.p)*.07; if(p.y<-8){p.y=h+8;p.x=Math.random()*w} const a=p.a*(.65+.35*Math.sin(t*.002+p.p)); ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,6.28);ctx.fillStyle=`rgba(255,215,125,${a})`;ctx.fill(); }
    requestAnimationFrame(drawParticles);
  }
  window.addEventListener('resize', resizeParticles); resizeParticles(); requestAnimationFrame(drawParticles);

  window.ILYOS_NEW_MENU = { host, root, show(){host.hidden=false;}, hide(){host.hidden=true;}, openHome(){duel.classList.remove('active','enter');home.classList.add('active');}, render };
})();
