/* ILYOS — RETOURS DES JOUEURS

   Trois envois vers la fonction Netlify /api/retours (netlify/functions/retours) :
   - « Signaler un bug / donner un avis » : petite fenêtre ouverte depuis le
     menu d'accueil (⚙ › SIGNALER) ou le menu de jeu (Partie › Aider ILYOS) ;
     en partie, la partie en cours peut être jointe pour reproduire le bug ;
   - erreurs JavaScript : remontées seules, regroupées côté serveur, au plus
     5 par session (rien de personnel : message, fichier, ligne, navigateur) ;
   - victoires contre le CPU Expert : la partie gagnée (journal des défaites,
     js/game/defaites.js) part pour améliorer l'IA, sauf si le joueur l'a
     refusé (Partie › Aider ILYOS, clé ilyosEnvoyerVictoires).
   Aucun envoi en simulation / partie automatique : le jeu appelle seulement
   envoyerVictoire pour un humain vainqueur. Aucune animation continue.
   Styles : css/retours.css. */
(function () {
  if (window.ILYOS_RETOURS) return;

  const CLE_VICTOIRES = 'ilyosEnvoyerVictoires';
  /* Même rangement que la sauvegarde en ligne (js/game/progression.js) :
     sur Netlify et en local, la fonction est sur le même site ; ailleurs
     (taekun.fr), la production Netlify d'abord, puis la préversion qui porte
     la fonction tant que la production est figée. */
  const URLS = (() => {
    const hote = location.hostname;
    if (/netlify\.app$/.test(hote) || hote === 'localhost' || hote === '127.0.0.1' || location.protocol === 'file:') return ['/api/retours'];
    return [
      'https://batbat.netlify.app/api/retours',
      'https://deploy-preview-214--batbat.netlify.app/api/retours'
    ];
  })();
  let urlBonne = 0;

  async function appeler(corps, keepalive = false) {
    /* text/plain : requête « simple », sans aller-retour CORS préalable. */
    const texte = JSON.stringify(corps);
    for (let i = 0; i < URLS.length; i++) {
      const indice = (urlBonne + i) % URLS.length;
      try {
        const r = await fetch(URLS[indice], {
          method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: texte, keepalive: keepalive && texte.length < 60000
        });
        if (r.status === 404 || r.status === 405) continue;
        urlBonne = indice;
        const donnees = await r.json().catch(() => null);
        return donnees && typeof donnees === 'object' ? donnees : { ok: false, erreur: 'serveur' };
      } catch (_) { /* adresse suivante */ }
    }
    return { ok: false, erreur: 'indisponible' };
  }

  /* ---------- Contexte de l'appareil ---------- */
  const erreursRecentes = [];
  function contexte() {
    const bundle = (document.querySelector('script[src*="game.js"]') || {}).src || '';
    const v = (bundle.match(/[?&]v=([^&]+)/) || [])[1] || '';
    let pseudo = '';
    try { pseudo = (JSON.parse(localStorage.getItem('ilyos-compte-v1') || 'null') || {}).pseudo || ''; } catch (_) { }
    const jeu = document.getElementById('gameScreen');
    const enPartie = !!(jeu && !jeu.classList.contains('hidden'));
    return {
      version: [window.ILYOS_BUILD, v].filter(Boolean).join(' · '),
      page: location.origin + location.pathname,
      navigateur: navigator.userAgent,
      ecran: `${innerWidth}×${innerHeight} @${Math.round((devicePixelRatio || 1) * 100) / 100}`,
      langue: navigator.language || '',
      mode: enPartie ? (jeu.classList.contains('puzzle-on') ? 'énigme' : 'partie') : 'menu',
      pseudo,
      erreurs: erreursRecentes.slice(-8)
    };
  }

  /* ---------- Erreurs JavaScript ---------- */
  const dejaEnvoyees = new Set();
  let envoisErreurs = 0;
  function erreurUtile(message, source) {
    if (!message || /^Script error\.?$/i.test(message)) return false;           // script d'un autre site
    if (/ResizeObserver loop/i.test(message)) return false;                     // bruit des navigateurs
    if (source && !source.startsWith(location.origin) && !/cdn\.jsdelivr\.net/.test(source)) return false; // extensions
    return true;
  }
  function signalerErreur(message, source, ligne, colonne, pile) {
    const lieu = source ? `${source.replace(location.origin, '')}:${ligne || 0}:${colonne || 0}` : '';
    erreursRecentes.push(`${message}${lieu ? ' @ ' + lieu : ''}`.slice(0, 400));
    if (erreursRecentes.length > 8) erreursRecentes.shift();
    if (!erreurUtile(message, source)) return;
    const cle = message + '|' + lieu;
    if (dejaEnvoyees.has(cle) || envoisErreurs >= 5) return;
    dejaEnvoyees.add(cle);
    envoisErreurs++;
    appeler({ action: 'erreur', message: String(message).slice(0, 500), source: lieu, pile: String(pile || '').slice(0, 4000), contexte: contexte() });
  }
  window.addEventListener('error', e => {
    if (!e || !(e.error || e.message)) return; // erreurs de chargement d'image/son : pas du code
    signalerErreur(e.message || String(e.error), e.filename || '', e.lineno, e.colno, e.error && e.error.stack);
  });
  window.addEventListener('unhandledrejection', e => {
    const r = e && e.reason;
    if (!r || !(r instanceof Error)) return; // refus « silencieux » (réseau, lecture audio…)
    const ligne = String(r.stack || '').split('\n').find(l => l.includes(location.origin)) || '';
    const m = ligne.match(/(https?:\/\/[^\s)]+?):(\d+):(\d+)/);
    signalerErreur(`Promesse rejetée : ${r.message || r}`, m ? m[1] : location.origin + '/', m ? +m[2] : 0, m ? +m[3] : 0, r.stack);
  });

  /* ---------- Petit message en bas de l'écran ---------- */
  function annoncer(texte) {
    let bulle = document.querySelector('.rt-bulle');
    if (!bulle) {
      bulle = document.createElement('div');
      bulle.className = 'rt-bulle';
      bulle.setAttribute('role', 'status');
      document.body.appendChild(bulle);
    }
    bulle.textContent = texte;
    bulle.classList.add('visible');
    clearTimeout(annoncer.minuteur);
    annoncer.minuteur = setTimeout(() => bulle.classList.remove('visible'), 3600);
  }

  /* ---------- Victoires contre l'Expert ---------- */
  function victoiresAutorisees() {
    try { return localStorage.getItem(CLE_VICTOIRES) !== 'off'; } catch (_) { return true; }
  }
  function reglerVictoires(oui) {
    try { localStorage.setItem(CLE_VICTOIRES, oui ? 'on' : 'off'); } catch (_) { }
  }
  async function envoyerVictoire(dossier) {
    if (!dossier || dossier.type !== 'defaite-expert' || !victoiresAutorisees()) return null;
    const r = await appeler({ action: 'victoire', partie: dossier, contexte: contexte() });
    if (r.ok) annoncer('🏆 Victoire envoyée : elle servira à rendre le CPU Expert plus fort.');
    return r;
  }

  /* ---------- Fenêtre « Signaler un bug / donner un avis » ---------- */
  let fenetre = null;
  let focusAvant = null;

  function fermer() {
    if (!fenetre) return;
    fenetre.hidden = true;
    document.removeEventListener('keydown', clavier, true);
    if (focusAvant && focusAvant.focus) try { focusAvant.focus(); } catch (_) { }
  }
  function clavier(e) {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); fermer(); }
  }

  function construire() {
    fenetre = document.createElement('div');
    fenetre.className = 'rt-voile';
    fenetre.hidden = true;
    fenetre.innerHTML = `
      <form class="rt-carte" role="dialog" aria-modal="true" aria-labelledby="rtTitre" novalidate>
        <button type="button" class="rt-fermer" data-rt="fermer" aria-label="Fermer">×</button>
        <h2 id="rtTitre" class="rt-titre">Aider ILYOS</h2>
        <p class="rt-sous-titre">Ton message arrive directement chez Taekun.</p>
        <div class="rt-types" role="radiogroup" aria-label="Type de message">
          <button type="button" role="radio" class="rt-type" data-type="bug" aria-checked="true">
            <span class="rt-type-icone" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 7.5V6a3 3 0 0 1 6 0v1.5"/><rect x="7" y="7.5" width="10" height="12" rx="5"/><path d="M12 11v8.5M3.5 13H7M17 13h3.5M4.5 8.5 7.4 10M19.5 8.5 16.6 10M4.5 18.5 7.4 17M19.5 18.5 16.6 17"/></svg></span>
            <b>Un bug</b><small>Quelque chose ne marche pas</small>
          </button>
          <button type="button" role="radio" class="rt-type" data-type="avis" aria-checked="false">
            <span class="rt-type-icone" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4.5 5.5h15v10h-8l-4.5 3.5v-3.5h-2.5z"/><path d="M8.5 9.5h7M8.5 12.5h4.5"/></svg></span>
            <b>Un avis</b><small>Une idée, une remarque</small>
          </button>
        </div>
        <label class="rt-champ">
          <span data-rt="consigne">Que s'est-il passé ?</span>
          <textarea data-rt="texte" rows="5" maxlength="3000" required></textarea>
        </label>
        <label class="rt-coche" data-rt="ligne-partie" hidden>
          <input type="checkbox" data-rt="partie" checked>
          <span><b>Joindre la partie en cours</b><small>Pour revoir exactement ce qui s'est passé</small></span>
        </label>
        <label class="rt-champ rt-champ-court">
          <span>Pour te répondre <em>(facultatif)</em></span>
          <input type="text" data-rt="contact" maxlength="120" autocomplete="off" placeholder="Pseudo Discord ou e-mail">
        </label>
        <p class="rt-etat" data-rt="etat" role="status"></p>
        <div class="rt-actions">
          <button type="button" class="rt-bouton rt-secondaire" data-rt="fermer">Annuler</button>
          <button type="submit" class="rt-bouton rt-envoyer" data-rt="envoyer">Envoyer</button>
        </div>
        <p class="rt-mention">Partent avec ton message : la version du jeu, ton navigateur, la taille de l'écran et, si tu la joins, la partie.</p>
      </form>`;
    document.body.appendChild(fenetre);
    const q = sel => fenetre.querySelector(sel);
    const types = [...fenetre.querySelectorAll('.rt-type')];
    const choisir = type => {
      types.forEach(b => b.setAttribute('aria-checked', String(b.dataset.type === type)));
      q('[data-rt="consigne"]').textContent = type === 'bug' ? "Que s'est-il passé ?" : 'Ton idée ou ta remarque';
      q('[data-rt="texte"]').placeholder = type === 'bug'
        ? "Ce que tu faisais, ce que tu attendais, ce qui est arrivé à la place…"
        : "Ce qui te plaît, ce qui te gêne, ce que tu aimerais voir…";
    };
    types.forEach(b => b.addEventListener('click', () => choisir(b.dataset.type)));
    fenetre.addEventListener('click', e => {
      if (e.target === fenetre || e.target.closest('[data-rt="fermer"]')) fermer();
    });
    q('form').addEventListener('submit', async e => {
      e.preventDefault();
      const etat = q('[data-rt="etat"]');
      const texte = q('[data-rt="texte"]').value.trim();
      if (texte.length < 3) { etat.textContent = 'Écris quelques mots avant d’envoyer.'; etat.dataset.ton = 'erreur'; q('[data-rt="texte"]').focus(); return; }
      const type = (types.find(b => b.getAttribute('aria-checked') === 'true') || types[0]).dataset.type;
      let partie = null;
      if (!q('[data-rt="ligne-partie"]').hidden && q('[data-rt="partie"]').checked) {
        try { partie = window.ILYOS_DEFAITES && window.ILYOS_DEFAITES.instantanePartie(); } catch (_) { partie = null; }
      }
      const bouton = q('[data-rt="envoyer"]');
      bouton.disabled = true;
      etat.textContent = 'Envoi…'; etat.dataset.ton = '';
      const r = await appeler({ action: 'signaler', type, texte, contact: q('[data-rt="contact"]').value.trim(), partie, contexte: contexte() });
      bouton.disabled = false;
      if (r.ok) {
        fermer();
        annoncer(type === 'bug' ? '🐞 Merci ! Ton signalement est bien arrivé.' : '💬 Merci ! Ton avis est bien arrivé.');
        return;
      }
      etat.dataset.ton = 'erreur';
      etat.textContent = r.erreur === 'trop' ? 'Beaucoup de messages d’un coup : réessaie dans une heure.'
        : r.erreur === 'partie' ? 'La partie est trop lourde : décoche « Joindre la partie » et renvoie.'
        : 'Envoi impossible pour le moment (connexion ?). Ton texte est gardé, réessaie.';
    });
    choisir('bug');
  }

  function ouvrir(type) {
    if (!fenetre) construire();
    focusAvant = document.activeElement;
    const jeu = document.getElementById('gameScreen');
    const enPartie = !!(jeu && !jeu.classList.contains('hidden') && window.ILYOS_DEFAITES && window.ILYOS_DEFAITES.instantanePartie);
    fenetre.querySelector('[data-rt="ligne-partie"]').hidden = !enPartie;
    fenetre.querySelector('[data-rt="etat"]').textContent = '';
    if (type) fenetre.querySelector(`.rt-type[data-type="${type}"]`)?.click();
    fenetre.hidden = false;
    document.addEventListener('keydown', clavier, true);
    setTimeout(() => fenetre.querySelector('[data-rt="texte"]').focus(), 30);
  }

  window.ILYOS_RETOURS = {
    ouvrir, fermer, envoyerVictoire,
    victoiresAutorisees, reglerVictoires,
    // Outils et tests
    contexte, urls: URLS, erreursRecentes: () => erreursRecentes.slice()
  };
})();
