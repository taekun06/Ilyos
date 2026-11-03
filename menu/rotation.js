/* ILYOS — écran ROTATION du menu : le recueil des modes de jeu.

   Une partie s'y compose de briques : un BUT (médaillon), des COUCHES, un
   plateau et un adversaire. ALÉATOIRE tire les briques disponibles ; un
   cadenas garde une brique au prochain tirage. LANCER envoie au jeu le même
   message « play » que l'écran de duel, avec la demande Rotation en plus
   (values.rotation, lue par js/version-bootstrap.js).

   Médaillons dessinés à la main en SVG (choix C de Taekun, 01/11) : aucun
   fichier image, rien à télécharger. Disponible aujourd'hui : Couronnes
   (partie classique) et Balises. Le reste est affiché « Bientôt ». */
(function(){
  'use strict';

  /* ---------- Emblèmes ------------------------------------------------ */
  function ile(cx, cy, w) {
    const h = w * .62, t = w * .13;
    return {
      roche: `M${cx - w / 2} ${cy} C${cx - w / 2} ${cy - t} ${cx + w / 2} ${cy - t} ${cx + w / 2} ${cy} L${cx + w * .42} ${cy + h * .25} L${cx + w * .3} ${cy + h * .42} L${cx + w * .16} ${cy + h * .55} L${cx + w * .05} ${cy + h * .82} L${cx - w * .02} ${cy + h} L${cx - w * .1} ${cy + h * .7} L${cx - w * .24} ${cy + h * .5} L${cx - w * .36} ${cy + h * .36} L${cx - w * .46} ${cy + h * .18} Z`,
      herbe: `M${cx - w / 2} ${cy} C${cx - w / 2} ${cy - t} ${cx + w / 2} ${cy - t} ${cx + w / 2} ${cy} C${cx + w * .3} ${cy + t * .55} ${cx - w * .3} ${cy + t * .55} ${cx - w / 2} ${cy} Z`
    };
  }
  const blocIle = (cx, cy, w) => { const i = ile(cx, cy, w); return `<path class="roche" d="${i.roche}"/><path class="herbe" d="${i.herbe}"/>`; };
  const couronne = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-11 6 L-13 -7 L-5 -1 L0 -11 L5 -1 L13 -7 L11 6 Z"/><rect x="-11" y="6" width="22" height="4" rx="1"/><circle cx="0" cy="-12" r="1.8"/><circle cx="-13" cy="-8" r="1.4"/><circle cx="13" cy="-8" r="1.4"/></g>`;
  const balise = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-3 0 L-2 -12 L0 -14 L2 -12 L3 0 Z"/><path d="M0 -24 C3 -20 3 -17 0 -15 C-3 -17 -3 -20 0 -24 Z"/></g>`;
  const cristal = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 -12 L4 -4 L0 0 L-4 -4 Z"/><path d="M5 -8 L8 -3 L5 0 L2 -3 Z"/></g>`;
  const oeuf = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="-6" rx="4.6" ry="6.2"/></g>`;
  const pelerin = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 -16 C-5 -14 -7 -4 -8 0 L7 0 C5 -5 5 -12 0 -16 Z"/><circle cx="0" cy="-17" r="3.2"/><path class="trait" d="M8 1 L5 -20"/><circle cx="5" cy="-21" r="1.8"/></g>`;
  const banniere = (x, y) => `<path class="trait" d="M${x} ${y} v-22"/><path d="M${x} ${y - 22} h11 l-3 4 l3 4 h-11 Z"/>`;
  const EMBLEMES = {
    couronnes: () => couronne(0, 4, 1.8),
    balises: () => balise(-13, 18, 1.15) + balise(0, 14, 1.45) + balise(13, 18, 1.15),
    effondrement: () => `<g transform="scale(.8)"><g transform="rotate(-8 -32 -8)">${blocIle(-34, -8, 58)}</g><g transform="translate(4 14) rotate(10 30 -4)">${blocIle(34, -4, 52)}</g><path d="M-2 6 l5 5 l-3 4 l-5 -3 Z M10 18 l4 3 l-2 4 l-4 -2 Z"/></g>`,
    traversee: () => `<g transform="scale(.42)">${blocIle(-64, -2, 44)}${blocIle(64, -2, 44)}${blocIle(-22, 6, 18)}${blocIle(0, 2, 16)}${blocIle(22, 6, 18)}<path class="trait" d="M-50 -6 Q-22 -4 0 -2 T50 -6" stroke-dasharray="3 2"/></g>`,
    pelerin: () => pelerin(0, 18, 2),
    territoire: () => `<g transform="scale(1.7)">${banniere(-8, 11)}${banniere(5, 11)}</g>`,
    moisson: () => cristal(-5, 16, 2.2) + cristal(10, 14, 1.4),
    maree: () => oeuf(-8, 16, 1.8) + oeuf(8, 14, 2.1)
  };
  const FONDS = { couronnes: '#2f5372', balises: '#1f5f72', effondrement: '#6a3532', traversee: '#2f5372', pelerin: '#4d5866', territoire: '#46397a', moisson: '#52357c', maree: '#2b5c56' };

  /* Lauriers : douze feuilles et deux branches, calculées une fois. */
  const LAURIERS = [-1, 1].map(sx => `<g transform="scale(${sx} 1)">${[...Array(6)].map((_, j) => {
    const a = (-60 + j * 22) * Math.PI / 180, x = Math.cos(a) * 52, y = Math.sin(a) * 44 + 8;
    return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="6" ry="2.4" transform="rotate(${-60 + j * 22 + 70} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
  }).join('')}<path class="branche" d="M30 46 C52 30 56 0 44 -30"/></g>`).join('');

  let uid = 0;
  function medaillon(id) {
    const k = ++uid;
    return `<svg viewBox="0 0 200 120" class="rt-art" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs>
      <radialGradient id="rtm${k}" cx=".5" cy=".38" r=".7"><stop offset="0" stop-color="${FONDS[id]}"/><stop offset=".7" stop-color="#0f2234"/><stop offset="1" stop-color="#060e17"/></radialGradient>
      <linearGradient id="rto${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0c2"/><stop offset=".45" stop-color="#e4b660"/><stop offset="1" stop-color="#8f5a17"/></linearGradient>
      <radialGradient id="rta${k}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#f4d28e" stop-opacity=".3"/><stop offset="1" stop-color="#f4d28e" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="200" height="120" fill="#08131f"/><rect width="200" height="120" fill="url(#rta${k})"/>
    <g transform="translate(100 60)">
      <g class="rt-lauriers">${LAURIERS}</g>
      <circle r="40" fill="url(#rtm${k})" stroke="url(#rto${k})" stroke-width="3"/>
      <circle r="35" fill="none" stroke="url(#rto${k})" stroke-width=".8" stroke-dasharray="1.5 2.5"/>
      <path d="M0 -46 l4 5 h-8 Z M0 46 l4 -5 h-8 Z" fill="url(#rto${k})"/>
      <g class="rt-embleme" style="--or:url(#rto${k})">${EMBLEMES[id]()}</g>
    </g></svg>`;
  }

  /* ---------- Données ------------------------------------------------- */
  const BUTS = [
    { id: 'couronnes', nom: 'Couronnes', ligne: 'Ramène 3 couronnes', dispo: true },
    { id: 'balises', nom: 'Balises', ligne: 'Tiens les balises · 10 points', dispo: true },
    { id: 'effondrement', nom: 'Effondrement', ligne: 'L’archipel coule' },
    { id: 'traversee', nom: 'Traversée', ligne: 'Relie tes deux villages' },
    { id: 'pelerin', nom: 'Pèlerin', ligne: 'Pousse le pèlerin chez toi' },
    { id: 'territoire', nom: 'Territoire', ligne: 'Le plus de cases' },
    { id: 'moisson', nom: 'Moisson', ligne: 'Rapporte 5 cristaux' },
    { id: 'maree', nom: 'Marée', ligne: 'Coopératif contre les créatures' }
  ];
  const COUCHES = [
    { id: 'deckbuilding', dispo: true, nom: 'Deckbuilding', ligne: 'Marché · cartes fortes · affinage', ico: '<rect x="3" y="5" width="11" height="15" rx="2" transform="rotate(-10 8 12)"/><rect x="9" y="4" width="11" height="15" rx="2"/><path d="M14.5 9 l2 2.5 -2 2.5 -2 -2.5 Z"/>' },
    { id: 'creatures', dispo: true, nom: 'Créatures et œufs', ligne: 'Œufs sur la croix · Loup', ico: '<path d="M12 3 C7 3 5 11 5 14 C5 18 8 21 12 21 C16 21 19 18 19 14 C19 11 17 3 12 3 Z"/><path d="M8 13 l2 -2 2 2 2 -2 2 2"/>' },
    { id: 'objectifs', nom: 'Objectifs communs', ligne: '3 courses secondaires', ico: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2"/><path d="M12 1 v4 M12 19 v4 M1 12 h4 M19 12 h4"/>' }
  ];
  const TAILLES = [['11', '11×11'], ['13', '13×13']];
  const ADVERSAIRES = [['duel', 'DUEL LOCAL'], ['solo', 'CONTRE LE CPU']];
  const NIVEAUX = [['easy', 'CPU FACILE'], ['normal', 'CPU NORMAL'], ['hard', 'CPU DIFFICILE'], ['expert', 'CPU EXPERT']];

  const choix = { but: 'balises', taille: '11', adversaire: 'duel', niveau: 'normal' };
  const verrous = new Set();
  const couches = new Set();
  let tirage = false;

  const filet = sens => `<svg class="rt-filet ${sens}" viewBox="0 0 160 20" aria-hidden="true"><path d="M0 10 H120"/><path class="fin" d="M120 10 c8 -9 18 -9 22 -2 c3 6 -4 10 -8 6 c-3 -3 0 -7 3 -5"/><path class="fin" d="M120 10 c8 9 18 9 22 2"/><path class="plein" d="M148 10 l6 -5 l6 5 l-6 5 Z"/></svg>`;
  const coin = pos => `<svg class="rt-coin ${pos}" viewBox="0 0 80 80" aria-hidden="true"><path d="M4 76 V30 C4 14 14 4 30 4 H76"/><path class="fin" d="M12 76 V34 C12 20 20 12 34 12 H76"/><path d="M30 4 C30 18 22 26 8 28 M22 22 c6 -2 10 -8 9 -14 M22 22 c-2 6 -8 10 -14 9"/><circle class="perle" cx="22" cy="22" r="3"/><path class="fin" d="M44 12 c4 -6 10 -6 14 0 M12 44 c-6 4 -6 10 0 14"/></svg>`;
  const de = `<svg viewBox="0 0 34 34" aria-hidden="true"><rect x="5" y="5" width="24" height="24" rx="5" fill="#f4e6c2" stroke="#8f5a17" stroke-width="1.5"/><g fill="#7a1e1e"><circle cx="11" cy="11" r="2.2"/><circle cx="23" cy="11" r="2.2"/><circle cx="17" cy="17" r="2.2"/><circle cx="11" cy="23" r="2.2"/><circle cx="23" cy="23" r="2.2"/></g></svg>`;

  /* ---------- Écran --------------------------------------------------- */
  const ecran = document.createElement('section');
  ecran.className = 'screen rotation';
  ecran.id = 'rotation';
  ecran.innerHTML = `<div class="art"></div><div class="rt-voile"></div>
    <div class="rt-scene"><div class="rt-contenu">
      <div class="rt-haut"><button class="pill" type="button" data-rt="retour">← RETOUR</button></div>
      <div class="rt-tete">${filet('g')}<h1 class="rt-titre">ROTATION</h1>${filet('d')}</div>
      <div class="rt-sous">TOUS LES MODES · MÉLANGE-LES</div>
      <div class="rt-cadre">${['hg', 'hd', 'bg', 'bd'].map(coin).join('')}
        <div class="rt-panneau">
          <div class="rt-col-buts"><div class="rt-lbl">BUT</div><div class="rt-buts"></div></div>
          <div class="rt-col-reglages">
            <div class="rt-lbl">COUCHES</div><div class="rt-couches"></div>
            <div class="rt-lbl">PLATEAU</div><div class="rt-selecteurs"></div>
          </div>
          <div class="rt-tirage" hidden></div>
        </div>
      </div>
      <div class="rt-bas">
        <button class="rt-alea" type="button" data-rt="alea">${de}<span>ALÉATOIRE</span></button>
        <button class="rt-lancer" type="button" data-rt="lancer">LANCER LA PARTIE<small></small></button>
      </div>
    </div></div>`;
  document.querySelector('.app').appendChild(ecran);

  const $ = sel => ecran.querySelector(sel);
  const butCourant = () => BUTS.find(b => b.id === choix.but);
  const libelle = (liste, v) => (liste.find(([k]) => k === v) || liste[0])[1];

  function selecteur(cle, liste, valeur) {
    return `<div class="rt-sel" data-cle="${cle}"><button type="button" data-pas="-1" aria-label="Précédent">‹</button><span>${libelle(liste, valeur)}</span><button type="button" data-pas="1" aria-label="Suivant">›</button></div>`;
  }

  function rendre() {
    $('.rt-buts').innerHTML = BUTS.map(b => `<button type="button" class="rt-but${b.dispo ? '' : ' bientot'}${b.id === choix.but ? ' choisi' : ''}" data-but="${b.id}"${b.dispo ? '' : ' disabled'} aria-pressed="${b.id === choix.but}">
      <span class="rt-img">${medaillon(b.id)}</span>
      <span class="rt-plaque"><b>${b.nom}</b>${b.dispo ? `<i>${b.ligne}</i>` : '<em>BIENTÔT</em>'}</span></button>`).join('');
    $('.rt-couches').innerHTML = COUCHES.map(c => c.dispo
      ? `<button type="button" class="rt-couche${couches.has(c.id) ? ' on' : ''}" data-couche="${c.id}" aria-pressed="${couches.has(c.id)}"><span class="rt-ico"><svg viewBox="0 0 24 24" aria-hidden="true">${c.ico}</svg></span><span class="rt-txt"><b>${c.nom}</b><i>${c.ligne}</i></span><span class="rt-bascule" aria-hidden="true"></span></button>`
      : `<div class="rt-couche bientot"><span class="rt-ico"><svg viewBox="0 0 24 24" aria-hidden="true">${c.ico}</svg></span><span class="rt-txt"><b>${c.nom}</b><i>${c.ligne}</i></span><em>BIENTÔT</em></div>`).join('');
    $('.rt-selecteurs').innerHTML = `<div class="rt-ligne">${selecteur('taille', TAILLES, choix.taille)}${selecteur('adversaire', ADVERSAIRES, choix.adversaire)}</div>`
      + (choix.adversaire === 'solo' ? `<div class="rt-ligne un">${selecteur('niveau', NIVEAUX, choix.niveau)}</div>` : '');
    const t = $('.rt-tirage');
    t.hidden = !tirage;
    if (tirage) {
      const brique = (cle, texte) => `<button type="button" class="rt-brique${verrous.has(cle) ? ' verrou' : ''}" data-verrou="${cle}" aria-pressed="${verrous.has(cle)}" title="Garder au prochain tirage"><span class="rt-cadenas" aria-hidden="true">${verrous.has(cle) ? '🔒' : '🔓'}</span>${texte}</button>`;
      t.innerHTML = `<span class="rt-tirage-titre">PARTIE TIRÉE</span>${brique('but', butCourant().nom)}${brique('taille', libelle(TAILLES, choix.taille))}${brique('couches', couches.size ? COUCHES.filter(c => couches.has(c.id)).map(c => c.nom).join(' + ') : 'Sans couche')}<button type="button" class="rt-relancer" data-rt="alea">↻ RELANCER</button>`;
    }
    $('.rt-lancer small').textContent = [butCourant().nom, ...COUCHES.filter(c => couches.has(c.id)).map(c => c.nom), libelle(TAILLES, choix.taille), choix.adversaire === 'solo' ? libelle(NIVEAUX, choix.niveau) : 'DUEL LOCAL'].join(' · ').toUpperCase();
    ajuster();
  }

  function pas(cle, sens) {
    const liste = { taille: TAILLES, adversaire: ADVERSAIRES, niveau: NIVEAUX }[cle];
    const i = liste.findIndex(([k]) => k === choix[cle]);
    choix[cle] = liste[(i + sens + liste.length) % liste.length][0];
    rendre();
  }

  function aleatoire() {
    const dispo = BUTS.filter(b => b.dispo);
    if (!verrous.has('but')) choix.but = dispo[Math.floor(Math.random() * dispo.length)].id;
    if (!verrous.has('taille')) choix.taille = TAILLES[Math.floor(Math.random() * TAILLES.length)][0];
    if (!verrous.has('couches')) COUCHES.filter(c => c.dispo).forEach(c => Math.random() < .6 ? couches.add(c.id) : couches.delete(c.id));
    tirage = true;
    rendre();
  }

  function lancer() {
    const mode = choix.adversaire === 'solo' ? 'solo' : 'duel';
    const values = { board: 'classic', size: choix.taille, timer: '0', difficulty: choix.niveau };
    if (choix.but !== 'couronnes' || couches.size) values.rotation = { but: choix.but, couches: [...couches] };
    parent.postMessage({ source: 'ilyos-menu', type: 'play', detail: { mode, values } }, location.origin);
  }

  /* Une seule maquette, mise à l'échelle de la fenêtre : 1180 de large à
     plat, 660 en portrait ; la hauteur est mesurée (le tirage l'allonge). */
  function ajuster() {
    const portrait = innerHeight > innerWidth * 1.05;
    ecran.classList.toggle('rt-portrait', portrait);
    const w = portrait ? 660 : 1180;
    const contenu = $('.rt-contenu');
    contenu.style.width = w + 'px';
    contenu.style.height = 'auto';
    const h = Math.max(contenu.scrollHeight + 24, portrait ? 900 : 760);
    const echelle = Math.min(innerWidth / w, innerHeight / h, 1.35);
    contenu.style.height = h + 'px';
    contenu.style.transform = `translate(-50%, -50%) scale(${echelle})`;
  }

  ecran.addEventListener('click', e => {
    const cible = e.target.closest('button');
    if (!cible || !ecran.contains(cible)) return;
    if (cible.dataset.but) { choix.but = cible.dataset.but; rendre(); return; }
    if (cible.dataset.couche) {
      const id = cible.dataset.couche;
      couches.has(id) ? couches.delete(id) : couches.add(id);
      rendre();
      return;
    }
    if (cible.dataset.pas) { pas(cible.closest('.rt-sel').dataset.cle, Number(cible.dataset.pas)); return; }
    if (cible.dataset.verrou) {
      const cle = cible.dataset.verrou;
      verrous.has(cle) ? verrous.delete(cle) : verrous.add(cle);
      rendre();
      return;
    }
    const action = cible.dataset.rt;
    if (action === 'retour') fermer();
    if (action === 'alea') aleatoire();
    if (action === 'lancer') lancer();
  });
  addEventListener('resize', () => { if (ecran.classList.contains('active')) ajuster(); });

  function ouvrir() {
    document.querySelectorAll('.screen.active').forEach(s => s.classList.remove('active'));
    ecran.classList.add('active');
    rendre();
  }
  function fermer() {
    ecran.classList.remove('active');
    document.getElementById('home')?.classList.add('active');
  }

  window.ILYOS_ROTATION_MENU = { ouvrir, fermer, choix: () => ({ ...choix, couches: [...couches] }) };
})();
