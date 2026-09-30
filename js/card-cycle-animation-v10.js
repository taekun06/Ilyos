/* ILYOS — cycle visuel des cartes V10
   Pure couche d'animation. Aucune règle de jeu modifiée.
   - seulement pendant le tour local
   - les 5 cartes sortent visiblement de PIOCHE face cachée, puis se révèlent
   - éventail ouvert AU-DESSUS de la ligne d'instruction et du dock, jamais dessus
   - séquence bornée à ≈ 1,2 s et interruptible au premier geste du joueur
   - actions xN regroupées en une seule animation
   - PIOCHE DÉTAILLÉE (premiers tours, ou sur demande dans les réglages) :
     cartes tirées une par une, compteur de pioche qui descend, un son par
     carte, grand éventail ou zoom carte par carte, cartes empilées dans les
     boutons d'action, et rangement en réserve expliqué en fin de tour.
*/
(() => {
  'use strict';

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
  if (window.__ILYOS_CARD_CYCLE_V10__) return;
  window.__ILYOS_CARD_CYCLE_V10__ = true;

  const ICONS = {
    MOVE: `<svg viewBox="0 0 48 48" aria-hidden="true"><g fill="currentColor"><ellipse cx="17" cy="14" rx="5" ry="8"/><circle cx="13" cy="24" r="2"/><circle cx="17" cy="23" r="2"/><ellipse cx="31" cy="32" rx="5" ry="8"/><circle cx="27" cy="41" r="2"/><circle cx="31" cy="40" r="2"/></g></svg>`,
    PUSH: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 24h24M23 14l10 10-10 10" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="m39 10 2.2 7L48 19l-6.8 2.2L39 28l-2.2-6.8L30 19l6.8-2.2L39 10Z" fill="currentColor"/></svg>`,
    MAGIC: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="14" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="m24 5 4.8 13.2L43 24l-14.2 5.8L24 43l-4.8-13.2L5 24l14.2-5.8L24 5Z" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="24" cy="24" r="4.2" fill="currentColor"/></svg>`
  };

  const META = {
    MOVE: { label: 'DÉPLACER', icon: ICONS.MOVE },
    PUSH: { label: 'POUSSER', icon: ICONS.PUSH },
    MAGIC: { label: 'MAGIE', icon: ICONS.MAGIC }
  };

  const byId = id => document.getElementById(id);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const deckRoot = () => byId('deckDisplay');
  const miniCards = () => [...(deckRoot()?.querySelectorAll('.v64-mini-card') || [])];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  let dealActive = false;
  let observer = null;
  let interceptingEndTurn = false;
  let bypassEndTurn = false;
  let actionQueue = Promise.resolve();
  const pendingUsage = new Map();

  /* BUDGET DE LA SÉQUENCE DE PIOCHE — total ≈ 1,2 s.
     La version précédente en demandait près de 2,6 s (500 ms de vol, 4 × 72 ms
     de décalage, 5 × 82 ms de révélation, 690 ms de pause, puis 410 ms de
     retour). Cette séquence se rejoue à CHAQUE tour : passé la seconde et
     demie, elle cesse d'être un plaisir pour devenir une attente. */
  const DEAL = {
    out: 340, outStagger: 40,   // sortie de la pioche vers l'éventail
    reveal: 40,                 // cascade de retournement, par carte
    hold: 650,                  // temps de lecture de l'éventail — voir ci-dessous
    back: 280, backStagger: 22  // rangement dans le dock
  };

  /* POURQUOI `hold` VAUT 650 ET NON 150.
     `hold` n'est pas le temps pendant lequel une carte est lisible : il ne
     commence à courir qu'à la fin de la cascade de révélation, et le
     retournement lui-même (css/card-cycle-animation-v10.css :
     `cardCycleV10FrontReveal`, 30 ms de retard + 170 ms) mange encore ~200 ms
     avant que la face soit à pleine opacité.

     Mesuré dans le navigateur avec hold = 150 : la première carte restait
     lisible 224 ms, la DERNIÈRE seulement 126 ms — la cascade la révèle en
     dernier alors que le rangement les emporte presque ensemble. En pratique on
     n'avait pas le temps de lire les cinq cartes.

     Relation empirique : lisibilité de la pire carte ≈ hold − 25 ms.
     650 donne donc ≈ 620 ms sur la dernière carte, et porte la séquence à
     ≈ 1,75 s. C'est plus long que la cible initiale de 1,2 s, et c'est le bon
     arbitrage : la séquence est interruptible au premier geste (139 ms de queue
     mesurés, voir skipDeal), donc ce temps de lecture ne coûte rien au joueur
     qui a déjà décidé de son coup. */

  /* Un « ticket » par distribution : il porte les animations en cours et les
     attentes en sommeil, ce qui permet d'abréger la séquence d'un seul geste
     quand le joueur veut jouer tout de suite (voir skipDeal). */
  let dealTicket = null;

  function openTicket() {
    dealTicket = { skipped: false, anims: new Set(), waiters: new Set() };
    return dealTicket;
  }

  /* Abrège la distribution en cours. Les animations sautent à leur image finale
     — elles sont toutes en `fill: forwards`, donc l'état d'arrivée est celui
     qu'elles auraient atteint — et les attentes restantes se résolvent aussitôt.
     Aucun `preventDefault` : le clic qui interrompt doit continuer sa route
     jusqu'au jeu, sinon on volerait au joueur le coup qu'il vient de tenter. */
  function skipDeal() {
    const ticket = dealTicket;
    if (!ticket || ticket.skipped || ticket.bloquant) return;
    ticket.skipped = true;
    ticket.anims.forEach(anim => { try { anim.finish(); } catch (_) {} });
    ticket.waiters.forEach(resume => resume());
  }

  function wait(ms, ticket) {
    if (!ticket) return sleep(ms);
    if (ticket.skipped) return Promise.resolve();
    return new Promise(resolve => {
      const resume = () => {
        clearTimeout(timer);
        ticket.waiters.delete(resume);
        resolve();
      };
      const timer = setTimeout(resume, ms);
      ticket.waiters.add(resume);
    });
  }


  /* ---------- PIOCHE DÉTAILLÉE ----------
     Le joueur qui découvre le jeu ne voit pas, en 1,75 s, que cinq cartes
     viennent d'être tirées de SA pioche, ni lesquelles. Pendant les premiers
     tours on prend donc le temps : les cartes sortent une par une (un son,
     le compteur de la pioche qui descend), restent en grand avec leur effet,
     puis rejoignent des boutons qui montrent les cartes empilées.

     Réglage (menu ⚙ → Pioche des cartes), gardé dans localStorage :
       mode  : 'auto' (6 premiers tours de ses 3 premières parties),
               'toujours' ou 'jamais' ;
       style : 'eventail' (les cinq cartes en grand, ensemble) ou 'zoom'
               (chaque carte passe en grand au centre, puis rejoint les autres).
     `?pioche=eventail` ou `?pioche=zoom` dans l'adresse impose le style et
     active la pioche détaillée, pour comparer les deux. */
  const PIOCHE_CLE = 'ilyosPiocheDetaillee';
  const PIOCHE_PARTIES_CLE = 'ilyosPiocheParties';
  const PIOCHE_TOURS_AUTO = 6;
  const PIOCHE_PARTIES_AUTO = 3;
  const PIOCHE_EFFETS = {
    MOVE: 'Avance un gardien d’une case',
    PUSH: 'Pousse un voisin d’une case par carte',
    MAGIC: 'Fait tourner une île'
  };

  function lireStockage(cle, repli) {
    try { const v = localStorage.getItem(cle); return v == null ? repli : JSON.parse(v); } catch (_) { return repli; }
  }
  function ecrireStockage(cle, valeur) {
    try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch (_) {}
  }

  function styleImposeParAdresse() {
    try {
      const v = new URLSearchParams(location.search).get('pioche');
      return v === 'eventail' || v === 'zoom' ? v : null;
    } catch (_) { return null; }
  }

  function reglagesPioche() {
    const lu = lireStockage(PIOCHE_CLE, {}) || {};
    const r = {
      mode: ['auto', 'toujours', 'jamais'].includes(lu.mode) ? lu.mode : 'auto',
      style: lu.style === 'zoom' ? 'zoom' : 'eventail'
    };
    const impose = styleImposeParAdresse();
    if (impose) { r.style = impose; r.mode = 'toujours'; }
    return r;
  }

  function enregistrerReglagesPioche(changes) {
    const actuel = lireStockage(PIOCHE_CLE, {}) || {};
    ecrireStockage(PIOCHE_CLE, { ...actuel, ...changes });
    majPiles();
  }

  function tourDuJoueur() {
    try { return Number(window.ILYOS_PIOCHE?.tourJoueur?.()) || 0; } catch (_) { return 0; }
  }

  /* Une partie compte au premier tour du joueur. `partieComptee` évite de la
     compter deux fois (plusieurs distributions au tour 1 en duel local). */
  let partieComptee = false;
  function compterPartieSiNouvelle() {
    const tour = tourDuJoueur();
    if (tour > 1) { partieComptee = false; return; }
    if (tour === 1 && !partieComptee) {
      partieComptee = true;
      ecrireStockage(PIOCHE_PARTIES_CLE, (Number(lireStockage(PIOCHE_PARTIES_CLE, 0)) || 0) + 1);
    }
  }

  /* Tutoriels et énigmes ont leur propre mise en scène (et leurs tests
     pilotent des clics) : une pioche détaillée bloquante s'y intercalerait. */
  function sequenceScenarisee() {
    try {
      if (window.ILYOS_TUTORIAL?.mode?.()) return true;
      if (window.ILYOS_PUZZLE?._debug?.()?.active) return true;
    } catch (_) {}
    return false;
  }

  function piocheDetaillee() {
    if (sequenceScenarisee()) return false;
    const { mode } = reglagesPioche();
    if (mode === 'toujours') return true;
    if (mode === 'jamais') return false;
    const tour = tourDuJoueur();
    const parties = Number(lireStockage(PIOCHE_PARTIES_CLE, 0)) || 0;
    return tour > 0 && tour <= PIOCHE_TOURS_AUTO && parties <= PIOCHE_PARTIES_AUTO;
  }

  function sonCarte() {
    try { window.ILYOS_PIOCHE?.son?.('card'); } catch (_) {}
  }

  /* Compteur de la pile PIOCHE : on le fait descendre carte après carte.
     Le rendu du HUD a déjà écrit la valeur d'arrivée ; on part donc de
     « arrivée + cartes encore à tirer », puis on revient à l'arrivée. */
  function compteurPioche() { return deckTarget()?.querySelector('.ov2-pile-count') || null; }

  /* ---------- CARTES EMPILÉES DANS LES BOUTONS ----------
     Le « ×3 » d'un bouton est une abstraction ; trois cartes dos contre dos
     qui dépassent du bouton se comprennent sans lire. Actif avec la pioche
     détaillée (premiers tours, ou réglage « toujours »). */
  const PILE_BOUTONS = { MOVE: ['ov2Move', 'ov2MoveCount'], PUSH: ['ov2Push', 'ov2PushCount'], MAGIC: ['ov2Magic', 'ov2MagicCount'] };
  const PILE_MAX = 6;
  let pilesPlanifiees = false;

  function majPiles() {
    pilesPlanifiees = false;
    const actif = piocheDetaillee();
    document.body.classList.toggle('cc-piles-actives', actif);
    Object.entries(PILE_BOUTONS).forEach(([type, [boutonId, compteId]]) => {
      const bouton = byId(boutonId);
      if (!bouton) return;
      let pile = bouton.querySelector(':scope > .cc-pile');
      const n = actif ? parseCount(byId(compteId)?.textContent) : 0;
      if (!n) { pile?.remove(); return; }
      if (!pile) {
        pile = document.createElement('span');
        pile.className = `cc-pile type-${type.toLowerCase()}`;
        pile.setAttribute('aria-hidden', 'true');
        bouton.appendChild(pile);
      }
      const visibles = Math.min(n, PILE_MAX);
      if (pile.childElementCount !== visibles || pile.dataset.n !== String(n)) {
        pile.dataset.n = String(n);
        pile.innerHTML = '';
        const milieu = (visibles - 1) / 2;
        for (let i = 0; i < visibles; i++) {
          const carte = document.createElement('i');
          carte.style.setProperty('--cc-d', String(i - milieu));
          pile.appendChild(carte);
        }
        if (n > PILE_MAX) {
          const plus = document.createElement('b');
          plus.textContent = `+${n - PILE_MAX}`;
          pile.appendChild(plus);
        }
      }
    });
  }

  function planifierPiles() {
    if (pilesPlanifiees) return;
    pilesPlanifiees = true;
    requestAnimationFrame(majPiles);
  }

  function typeOf(card) {
    if (card?.classList.contains('action-move')) return 'MOVE';
    if (card?.classList.contains('action-push')) return 'PUSH';
    if (card?.classList.contains('action-magic')) return 'MAGIC';
    return null;
  }

  function parseCount(text) {
    const match = String(text || '').match(/-?\d+/);
    return match ? Math.max(0, Number(match[0]) || 0) : 0;
  }

  function bottomTarget(type) {
    return byId({ MOVE: 'ov2Move', PUSH: 'ov2Push', MAGIC: 'ov2Magic' }[type])
      || byId({ MOVE: 'hudV2MoveCount', PUSH: 'hudV2PushCount', MAGIC: 'hudV2MagicCount' }[type]);
  }

  function deckTarget() { return byId('ov2DeckHud'); }
  function discardTarget() { return byId('ov2DiscardHud') || byId('ov2End') || byId('endTurnBtn'); }
  function endTarget() { return byId('ov2End') || byId('endTurnBtn'); }

  function isLocalVisualTurn() {
    const game = byId('gameScreen');
    if (!game || game.classList.contains('hidden') || game.classList.contains('ai-turn')) return false;
    const visibleContext = [
      byId('turnContextKicker')?.textContent,
      byId('turnContextTitle')?.textContent,
      byId('ov2Instruction')?.textContent
    ].filter(Boolean).join(' ').toLocaleUpperCase('fr-FR');
    return !/TOUR DE L[’']ADVERSAIRE|L[’']ADVERSAIRE JOUE|ORDINATEUR/.test(visibleContext);
  }

  function activeReserveBadge() {
    const leftActive = byId('ov2LeftActive');
    const rightActive = byId('ov2RightActive');
    if (leftActive && !leftActive.classList.contains('ov2-off')) return byId('ov2LeftReserve');
    if (rightActive && !rightActive.classList.contains('ov2-off')) return byId('ov2RightReserve');
    return null;
  }

  function reserveTarget(type) {
    const badge = activeReserveBadge();
    if (!badge) return null;
    const key = type.toLowerCase();
    return badge.querySelector(`.ov2-reserve-${key}`)
      || badge.querySelector(`[data-reserve-${key}]`)?.closest('.ov2-reserve-action')
      || badge;
  }

  function reserveCountNode(type) {
    return activeReserveBadge()?.querySelector(`[data-reserve-${type.toLowerCase()}]`) || null;
  }

  function rectOf(node) {
    if (!node) return null;
    const r = node.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }

  function center(rect) {
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function syntheticRect(cx, cy, width, height) {
    return { left: cx - width / 2, top: cy - height / 2, width, height };
  }

  function actionTop() {
    const rects = ['MOVE', 'PUSH', 'MAGIC'].map(bottomTarget).map(rectOf).filter(Boolean);
    return rects.length ? Math.min(...rects.map(r => r.top)) : innerHeight - 120;
  }

  /* Ligne de l'éventail : au-dessus de la ligne d'instruction ET du dock.
     L'ancien repère (le bottom CSS du tiroir d'îles, ≈ innerHeight − 126) posait
     les cinq cartes exactement sur le dock d'actions et sur la phrase
     d'instruction — on ne lisait alors ni les cartes, ni les boutons qu'elles
     allaient rejoindre, ni le texte qui dit au joueur quoi faire. */
  function fanAnchor(cardH) {
    const instruction = rectOf(byId('ov2Instruction')) || rectOf(byId('hudV2Instruction'));
    // 22 et non 14 : la rotation de chaque carte agrandit sa boîte englobante
    // d'une demi-douzaine de pixels, et 14 ne laissait plus que 8 px mesurés
    // au-dessus de la ligne d'instruction.
    const floor = Math.min(instruction ? instruction.top : Infinity, actionTop()) - 22;
    return {
      x: innerWidth / 2,
      y: clamp(floor - cardH / 2, cardH / 2 + 64, innerHeight - cardH / 2 - 40)
    };
  }

  /* Point de départ des cartes. Il doit être la pile PIOCHE elle-même : c'est
     tout le propos de l'animation. Le repli n'est plus un point fixe arbitraire
     (l'ancien `syntheticRect(72, actionTop() - 60, …)` faisait sortir les cartes
     du bord gauche de la fenêtre, là où il n'y a rien à voir) mais le flanc
     gauche du dock, c'est-à-dire l'endroit où la pile se trouve désormais. */
  function deckSourceRect(cardW, cardH) {
    const hud = rectOf(deckTarget());
    if (hud) return hud;
    const rects = ['MOVE', 'PUSH', 'MAGIC'].map(bottomTarget).map(rectOf).filter(Boolean);
    const w = cardW * .62;
    const h = cardH * .62;
    if (!rects.length) return syntheticRect(innerWidth / 2, innerHeight - 96, w, h);
    const left = Math.min(...rects.map(r => r.left));
    const bottom = Math.max(...rects.map(r => r.top + r.height));
    return syntheticRect(left - 44, bottom - h / 2 - 6, w, h);
  }

  /* Les cartes de l'animation ne portent plus de chiffres : ni l'index « 01/05 » ni le
     « ×N » d'empilement. Elles défilent en moins d'une seconde, souvent superposées et
     en rotation — un chiffre n'y est pas lisible, il ne fait qu'encombrer la carte et
     brouiller son icône, qui est la seule information réellement utile à cette vitesse.
     Le compte exact reste affiché en permanence sur les boutons d'action du HUD. */
  function makeCard(type, extraClass = '', count = 1, drawIndex = 0, drawTotal = 0) {
    const meta = META[type] || META.MOVE;
    const isDraw = drawIndex > 0 && drawTotal > 0;
    const el = document.createElement('div');
    el.className = `card-cycle-v7-card card-cycle-v10-card type-${type.toLowerCase()} ${extraClass}${count > 1 ? ' is-stack' : ''}${isDraw ? ' is-draw-back' : ''}`.trim();
    el.setAttribute('aria-hidden', 'true');
    /* Le dos ne porte plus un mot : un dos de carte est un MOTIF, pas une
       étiquette. « ILYOS » et « PIOCHE » y étaient gravés en 10 px et 6 px sur
       86 px de large ; dès que deux cartes se recouvraient pendant le vol, les
       deux textes se superposaient en bouillie illisible. Ne reste que le
       filigrane : le losange doré et son étoile, qui se lisent à toute échelle
       et supportent le chevauchement. Même raison pour la mention « TIRÉE DE LA
       PIOCHE » sur la face : à cette vitesse, seuls l'icône et le verbe portent. */
    el.innerHTML = `
      ${isDraw ? `<span class="card-cycle-v10-backface"><i>✦</i></span>` : ''}
      <span class="card-cycle-v7-kicker">ACTION</span>
      <span class="card-cycle-v7-icon">${meta.icon}</span>
      <b>${meta.label}</b>
      ${extraClass.includes('cc-detail') ? `<small class="cc-effet">${PIOCHE_EFFETS[type] || ''}</small>` : ''}
      <i class="card-cycle-v7-rune"></i>
`;
    document.body.appendChild(el);
    return el;
  }

  async function fly(el, fromRect, toRect, {
    duration = 440,
    delay = 0,
    arc = 34,
    startScale = 1,
    endScale = .3,
    startOpacity = 1,
    endOpacity = .05,
    startRotate = 0,
    endRotate = 0,
    ticket = null,
    size = null
  } = {}) {
    if (!el || !fromRect || !toRect) return;
    const from = center(fromRect);
    const to = center(toRect);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    /* `size` impose les proportions de la carte au lieu d'hériter celles du
       rectangle de départ. Sans lui, une carte tirée de la pioche adoptait la
       taille de la PILE — 68 × 67 px, un carré — alors que sa face est dessinée
       pour un portrait 86 × 136 (voir css/card-art-v12.css) : l'icône, le verbe
       et le sceau du dos étaient comprimés dans un format qui n'est pas le leur.
       L'élément est alors posé par son CENTRE sur celui du rectangle de départ,
       sinon changer sa taille le décalerait. */
    const w = size ? size.width : fromRect.width;
    const h = size ? size.height : fromRect.height;
    el.style.left = `${size ? from.x - w / 2 : fromRect.left}px`;
    el.style.top = `${size ? from.y - h / 2 : fromRect.top}px`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    const anim = el.animate([
      { transform: `translate(0,0) scale(${startScale}) rotate(${startRotate}deg)`, opacity: startOpacity },
      { transform: `translate(${dx * .48}px,${dy * .47 - arc}px) scale(${(startScale + endScale) / 2 + .07}) rotate(${startRotate * -.35}deg)`, opacity: 1, offset: .50 },
      { transform: `translate(${dx}px,${dy}px) scale(${endScale}) rotate(${endRotate}deg)`, opacity: endOpacity }
    ], { duration, delay, easing: 'cubic-bezier(.18,.78,.17,1)', fill: 'forwards' });
    /* Séquence déjà abrégée : ce vol a été créé APRÈS le geste du joueur (le
       rangement dans le dock, typiquement). On ne le supprime pas — les cartes
       doivent visiblement rejoindre leur bouton, sans quoi elles disparaîtraient
       d'un coup — mais on le fait filer. Mesuré : la queue de séquence tombe de
       ≈ 370 ms à ≈ 120 ms après le clic. */
    if (ticket?.skipped) { try { anim.playbackRate = 3; } catch (_) {} }
    ticket?.anims.add(anim);
    try { await anim.finished; } catch (_) {}
    ticket?.anims.delete(anim);
  }

  function pulse(node, className = 'card-cycle-v7-hit') {
    if (!node) return;
    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);
    setTimeout(() => node.classList.remove(className), 520);
  }

  function floatCount(node, text) {
    const rect = rectOf(node);
    if (!rect) return;
    const badge = document.createElement('div');
    badge.className = 'card-cycle-v7-count';
    badge.textContent = text;
    badge.style.left = `${rect.left + rect.width / 2}px`;
    badge.style.top = `${rect.top}px`;
    document.body.appendChild(badge);
    const anim = badge.animate([
      { opacity: 0, transform: 'translate(-50%,4px) scale(.86)' },
      { opacity: 1, transform: 'translate(-50%,-16px) scale(1.08)', offset: .34 },
      { opacity: 0, transform: 'translate(-50%,-34px) scale(.96)' }
    ], { duration: 620, easing: 'ease-out', fill: 'forwards' });
    anim.onfinish = () => badge.remove();
  }

  /* Retournement en cascade. Le décalage descend de 82 à 40 ms : à 82 ms, la
     dernière carte se révélait 330 ms après la première, ce qui se lisait comme
     cinq gestes séparés au lieu d'un seul éventail qui s'ouvre. */
  async function revealDrawCards(cardsGhost, ticket) {
    for (let i = 0; i < cardsGhost.length; i++) {
      cardsGhost[i]?.classList.add('is-revealed');
      if (i < cardsGhost.length - 1) await wait(DEAL.reveal, ticket);
    }
  }

  async function runDeal(cards) {
    if (!isLocalVisualTurn()) return;
    const types = cards.slice(0, 5).map(typeOf).filter(Boolean);
    if (!types.length) return;
    compterPartieSiNouvelle();
    if (piocheDetaillee()) {
      await runDealDetaille(types);
      majPiles();
      return;
    }

    const compact = innerWidth < 980 || innerHeight < 720;
    const cardW = compact ? 70 : 86;
    const cardH = compact ? 108 : 136;
    /* Écartement de l'éventail. L'ancien pas (98 pour 86 px de carte) ne laissait
       que 12 px entre deux cartes : additionné à la rotation et aux échelles
       inégales du vol, l'éventail se refermait sur lui-même et les cinq cartes
       se recouvraient. Un pas au moins égal à la largeur + 26 garantit qu'on
       voit cinq cartes distinctes, ce qui est la seule chose que cette
       animation a à dire. */
    const spacing = cardW + (compact ? 20 : 26);
    const tilt = compact ? 3.5 : 4.5;
    const mid = (types.length - 1) / 2;
    const anchor = fanAnchor(cardH);

    const fanRects = types.map((_, index) => {
      const d = index - mid;
      // Courbe d'éventail : la carte centrale est la plus haute.
      const lift = (mid - Math.abs(d)) * (compact ? 5 : 7);
      return syntheticRect(anchor.x + d * spacing, anchor.y - lift, cardW, cardH);
    });

    const source = deckSourceRect(cardW, cardH);
    const sourceHud = deckTarget();
    const ticket = openTicket();
    const cardsGhost = types.map((type, index) => makeCard(type, 'showcase', 1, index + 1, types.length));

    sourceHud?.classList.add('card-cycle-v10-drawing');
    pulse(sourceHud, 'ov2-pile-hit');
    floatCount(sourceHud, `−${types.length}`);

    try {
      /* Les cartes quittent PIOCHE encore face cachée.
         `startScale` remonte de .38 à .62 et le décalage descend de 72 à 40 ms :
         c'est leur combinaison qui donnait à chaque instant cinq cartes de
         tailles franchement différentes — un défaut lu comme « cassé » plutôt
         que comme une distribution. L'arc passe de ~40 à ~95 px : le vol
         redevient un geste au lieu d'un glissement plat. */
      await Promise.all(cardsGhost.map((ghost, index) => fly(ghost, source, fanRects[index], {
        ticket,
        size: { width: cardW, height: cardH },
        duration: DEAL.out,
        delay: index * DEAL.outStagger,
        arc: 92 + index * 5,
        // .5 ≈ largeur de la pile (68) / largeur de la carte (86) : la carte
        // sort donc exactement à la taille du paquet dont elle est tirée.
        startScale: .5,
        endScale: 1,
        startOpacity: .18,
        endOpacity: 1,
        startRotate: -6,
        endRotate: (index - mid) * tilt
      })));

      await revealDrawCards(cardsGhost, ticket);
      await wait(DEAL.hold, ticket);

      await Promise.all(cardsGhost.map(async (ghost, index) => {
        const to = rectOf(bottomTarget(types[index]));
        if (!to) return;
        await fly(ghost, fanRects[index], to, {
          ticket,
          size: { width: cardW, height: cardH },
          duration: DEAL.back,
          delay: index * DEAL.backStagger,
          arc: 34,
          startScale: 1,
          endScale: .26,
          endOpacity: .04,
          startRotate: (index - mid) * tilt
        });
      }));
    } finally {
      /* Balayage inconditionnel. Une carte dont la cible avait disparu en cours
         de route restait auparavant à l'écran indéfiniment — on en voyait
         traîner sous forme de pastille au milieu du dock. */
      cardsGhost.forEach(ghost => ghost.remove());
      sourceHud?.classList.remove('card-cycle-v10-drawing');
      if (dealTicket === ticket) dealTicket = null;
    }

    const counts = { MOVE: 0, PUSH: 0, MAGIC: 0 };
    types.forEach(type => counts[type]++);
    Object.entries(counts).forEach(([type, count]) => {
      if (!count) return;
      const target = bottomTarget(type);
      pulse(target);
      floatCount(target, `+${count}`);
    });
  }


  /* Séquence détaillée. Durées choisies pour être lues, pas subies :
     ≈ 0,3 s entre deux cartes (on les compte), 3 s de lecture, et au tout
     premier tour les cartes attendent « Compris ». Toujours interruptible au
     premier geste, sauf au tour 1 où seul « Compris » ferme la présentation. */
  const DETAIL = {
    sortie: 520, ecart: 300,         // vol pioche → place, et écart entre deux cartes
    zoom: 460, zoomLecture: 700,     // style « zoom » : arrivée au centre, puis lecture
    versPlace: 380,                  // style « zoom » : du centre vers l'éventail
    lecture: 3000,                   // tours 2 à 6
    rangement: 560, rangementEcart: 90
  };

  function creerCouche(html, classe) {
    const el = document.createElement('div');
    el.className = classe;
    el.innerHTML = html;
    document.body.appendChild(el);
    return el;
  }

  function resumeTypes(types) {
    const n = { MOVE: 0, PUSH: 0, MAGIC: 0 };
    types.forEach(t => n[t]++);
    return ['MOVE', 'PUSH', 'MAGIC'].filter(t => n[t]).map(t => `${n[t]} ${META[t].label.toLowerCase()}`).join(' · ');
  }

  function attendreCompris(bouton, ticket) {
    return new Promise(resolve => {
      const fin = () => { ticket.waiters.delete(fin); resolve(); };
      ticket.waiters.add(fin);
      bouton.addEventListener('click', event => { event.stopPropagation(); fin(); }, { once: true });
    });
  }

  async function runDealDetaille(types) {
    const zoom = reglagesPioche().style === 'zoom';
    const premierTour = tourDuJoueur() === 1;
    const n = types.length;
    const compact = innerWidth < 980 || innerHeight < 720;
    const cardH = Math.round(clamp(innerHeight * .26, 120, 210));
    const cardW = Math.round(cardH * .63);
    // Écartement : la place disponible décide, et les cartes se chevauchent
    // plutôt que de sortir de l'écran sur un téléphone.
    const marge = 16;
    const pasIdeal = cardW + (compact ? 14 : 22);
    const pasMax = n > 1 ? (innerWidth - 2 * marge - cardW) / (n - 1) : pasIdeal;
    const spacing = Math.min(pasIdeal, pasMax);
    const tilt = 3;
    const mid = (n - 1) / 2;
    const centreY = Math.round(innerHeight * .46);
    const fanRects = types.map((_, i) => {
      const d = i - mid;
      const lift = (mid - Math.abs(d)) * 8;
      return syntheticRect(innerWidth / 2 + d * spacing, centreY - lift, cardW, cardH);
    });
    const zoomH = Math.round(Math.min(innerHeight * .46, 340));
    const zoomRect = syntheticRect(innerWidth / 2, centreY - 10, Math.round(zoomH * .63), zoomH);

    const source = deckSourceRect(cardW, cardH);
    const sourceHud = deckTarget();
    const compteur = compteurPioche();
    const compteurFinal = compteur ? parseCount(compteur.textContent) : null;
    const ticket = openTicket();
    ticket.bloquant = premierTour;

    const voile = creerCouche('', 'cc-pioche-voile');
    const titre = creerCouche(`<b>PIOCHE</b><span>+<em>0</em> carte</span>`, 'cc-pioche-titre');
    // Au-dessus de la plus grande carte affichée : l'éventail, ou la carte
    // zoomée au centre dans le style « zoom ».
    const hautCartes = zoom ? zoomRect.top : centreY - cardH / 2;
    titre.style.top = `${Math.max(12, hautCartes - 78)}px`;
    const bas = creerCouche('', 'cc-pioche-bas');
    bas.style.top = `${centreY + cardH / 2 + 22}px`;
    const compteTitre = titre.querySelector('em');
    const libelle = titre.querySelector('span');
    const ghosts = [];
    sourceHud?.classList.add('card-cycle-v10-drawing', 'cc-pioche-source');
    requestAnimationFrame(() => { voile.classList.add('is-on'); titre.classList.add('is-on'); });

    try {
      for (let i = 0; i < n; i++) {
        const ghost = makeCard(types[i], 'showcase cc-detail', 1, i + 1, n);
        ghosts.push(ghost);
        pulse(sourceHud, 'ov2-pile-hit');
        sonCarte();
        if (compteur && compteurFinal != null) compteur.textContent = String(compteurFinal + (n - i - 1));
        compteTitre.textContent = String(i + 1);
        libelle.lastChild.textContent = i ? ' cartes' : ' carte';
        const arrivee = zoom ? zoomRect : fanRects[i];
        const vol = fly(ghost, source, arrivee, {
          ticket,
          size: zoom ? { width: zoomRect.width, height: zoomRect.height } : { width: cardW, height: cardH },
          duration: zoom ? DETAIL.zoom : DETAIL.sortie,
          arc: 70,
          startScale: .32,
          endScale: 1,
          startOpacity: .3,
          endOpacity: 1,
          startRotate: -8,
          endRotate: zoom ? 0 : (i - mid) * tilt
        });
        setTimeout(() => ghost.classList.add('is-revealed'), (ticket.skipped ? 0 : (zoom ? DETAIL.zoom : DETAIL.sortie) * .55));
        if (zoom) {
          await vol;
          ghost.classList.add('is-revealed');
          await wait(DETAIL.zoomLecture, ticket);
          await fly(ghost, zoomRect, fanRects[i], {
            ticket,
            size: { width: cardW, height: cardH },
            duration: DETAIL.versPlace,
            arc: 20,
            startScale: zoomRect.width / cardW,
            endScale: 1,
            startOpacity: 1,
            endOpacity: 1,
            endRotate: (i - mid) * tilt
          });
        } else {
          await wait(DETAIL.ecart, ticket);
          if (i === n - 1) await vol;
        }
      }
      ghosts.forEach(g => g.classList.add('is-revealed'));
      if (compteur && compteurFinal != null) compteur.textContent = String(compteurFinal);

      bas.innerHTML = `<span class="cc-pioche-resume">${resumeTypes(types)}</span>`
        + (premierTour
          ? `<small>Ces 5 cartes sont tes actions de ce tour. Elles vont dans les boutons du bas.</small><button type="button" class="cc-pioche-compris">Compris</button>`
          : `<small>Touche l’écran pour continuer</small>`);
      bas.classList.add('is-on');
      if (premierTour) {
        voile.classList.add('is-bloquant');
        await attendreCompris(bas.querySelector('.cc-pioche-compris'), ticket);
        ticket.bloquant = false;
      } else {
        await wait(DETAIL.lecture, ticket);
      }

      bas.classList.remove('is-on');
      titre.classList.remove('is-on');
      voile.classList.remove('is-on', 'is-bloquant');
      await Promise.all(ghosts.map(async (ghost, i) => {
        const to = rectOf(bottomTarget(types[i]));
        if (!to) return;
        await fly(ghost, fanRects[i], to, {
          ticket,
          size: { width: cardW, height: cardH },
          duration: DETAIL.rangement,
          delay: i * DETAIL.rangementEcart,
          arc: 40,
          startScale: 1,
          endScale: .24,
          endOpacity: .05,
          startRotate: (i - mid) * tilt
        });
      }));
    } finally {
      ghosts.forEach(g => g.remove());
      [voile, titre, bas].forEach(el => el.remove());
      sourceHud?.classList.remove('card-cycle-v10-drawing', 'cc-pioche-source');
      if (compteur && compteurFinal != null) compteur.textContent = String(compteurFinal);
      if (dealTicket === ticket) dealTicket = null;
    }

    const counts = { MOVE: 0, PUSH: 0, MAGIC: 0 };
    types.forEach(type => counts[type]++);
    Object.entries(counts).forEach(([type, count]) => {
      if (!count) return;
      const target = bottomTarget(type);
      pulse(target);
      floatCount(target, `+${count}`);
    });
  }

  function reserveCurrent(type) {
    return parseCount(reserveCountNode(type)?.textContent);
  }

  function incrementReserveVisual(type, count) {
    const node = reserveCountNode(type);
    if (node) node.textContent = String(Math.min(5, parseCount(node.textContent) + count));
  }

  async function animateActionUse(type, count) {
    if (!isLocalVisualTurn()) return;
    const from = rectOf(bottomTarget(type));
    const to = rectOf(discardTarget());
    if (!from || !to) return;
    const ghost = makeCard(type, 'transfer', count);
    await fly(ghost, from, to, { duration: 430, arc: 42, startScale: .54, endScale: .20 });
    ghost.remove();
    pulse(discardTarget(), 'ov2-pile-hit');
    floatCount(discardTarget(), `+${count}`);
  }

  function queueUsage(type, count) {
    if (!META[type] || !isLocalVisualTurn()) return;
    const current = pendingUsage.get(type) || { count: 0, timer: null };
    current.count += Math.max(1, Number(count) || 1);
    clearTimeout(current.timer);
    current.timer = setTimeout(() => {
      pendingUsage.delete(type);
      actionQueue = actionQueue.then(() => animateActionUse(type, current.count));
    }, 70);
    pendingUsage.set(type, current);
  }

  async function runEndTurn(cards) {
    if (!isLocalVisualTurn()) return;
    const counts = { MOVE: 0, PUSH: 0, MAGIC: 0 };
    cards.slice(0, 5).forEach(card => {
      const type = typeOf(card);
      if (type) counts[type]++;
    });

    /* Pioche détaillée : le rangement se lit aussi. Vols plus lents et une
       phrase près de la réserve, qui dit où vont les cartes non jouées. */
    const detail = piocheDetaillee() && Object.values(counts).some(Boolean);
    const lent = detail ? 1.9 : 1;
    let legende = null;
    if (detail) {
      const cible = rectOf(activeReserveBadge()) || rectOf(discardTarget());
      legende = creerCouche('<b>Fin du tour</b><span>Tes cartes non jouées vont dans ta <em>réserve</em> (5 par type au plus) : tu les retrouveras au prochain tour. Le surplus va à la défausse.</span>', 'cc-reserve-legende');
      if (cible) {
        legende.style.left = `${clamp(cible.left + cible.width / 2, 170, innerWidth - 170)}px`;
        legende.style.top = `${cible.top + cible.height + 12}px`;
      }
      requestAnimationFrame(() => legende.classList.add('is-on'));
      await sleep(700);
    }

    for (const type of ['MOVE', 'PUSH', 'MAGIC']) {
      const total = counts[type];
      if (!total) continue;
      const bank = Math.min(total, Math.max(0, 5 - reserveCurrent(type)));
      const overflow = total - bank;

      if (bank > 0) {
        const from = rectOf(bottomTarget(type));
        const to = rectOf(reserveTarget(type));
        if (from && to) {
          const ghost = makeCard(type, 'transfer', bank);
          await fly(ghost, from, to, { duration: 500 * lent, arc: 48, startScale: .54, endScale: .22 });
          ghost.remove();
          incrementReserveVisual(type, bank);
          pulse(reserveTarget(type), 'card-cycle-v7-reserve-hit');
          floatCount(reserveTarget(type), `+${bank}`);
        }
      }

      if (overflow > 0) {
        const from = rectOf(bottomTarget(type));
        const to = rectOf(discardTarget());
        if (from && to) {
          const ghost = makeCard(type, 'transfer', overflow);
          await fly(ghost, from, to, { duration: 430 * lent, arc: 38, startScale: .54, endScale: .20 });
          ghost.remove();
          pulse(discardTarget(), 'ov2-pile-hit');
          floatCount(discardTarget(), `+${overflow}`);
        }
      }
      await sleep(detail ? 220 : 45);
    }
    if (legende) {
      await sleep(1400);
      legende.classList.remove('is-on');
      setTimeout(() => legende.remove(), 400);
    }
    pulse(endTarget(), 'card-cycle-v7-end-hit');
  }

  function inspectDeck() {
    const cards = miniCards();
    const dealing = cards.some(card => card.classList.contains('deal-card'));
    if (dealing && !dealActive) {
      dealActive = true;
      requestAnimationFrame(() => runDeal(miniCards()));
    } else if (!dealing) {
      dealActive = false;
    }
  }

  function bindEvents() {
    window.addEventListener('ilyos:fresh-card-used', event => queueUsage(event.detail?.type, event.detail?.count));
    window.addEventListener('ilyos:reserve-card-used', event => queueUsage(event.detail?.type, event.detail?.count));

    /* La distribution est interruptible. Un joueur qui a déjà décidé de son coup
       ne doit pas attendre la fin d'une animation décorative : le premier geste
       l'abrège. Écouteurs passifs, en phase de capture, sans `preventDefault` —
       le geste continue sa route jusqu'au jeu et le coup tenté est bien joué. */
    document.addEventListener('pointerdown', skipDeal, { capture: true, passive: true });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' || event.key === ' ' || event.key === 'Enter') skipDeal();
    }, true);

    document.addEventListener('click', async event => {
      const button = event.target?.closest?.('#endTurnBtn');
      if (!button || button.disabled || bypassEndTurn || interceptingEndTurn || !isLocalVisualTurn()) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      interceptingEndTurn = true;
      byId('ov2End')?.classList.add('card-cycle-v7-locked');
      try {
        await actionQueue;
        await runEndTurn(miniCards());
      } finally {
        interceptingEndTurn = false;
        byId('ov2End')?.classList.remove('card-cycle-v7-locked');
        bypassEndTurn = true;
        button.click();
        queueMicrotask(() => { bypassEndTurn = false; });
      }
    }, true);
  }

  function brancherReglages() {
    const mode = byId('piocheModeSelect');
    const style = byId('piocheStyleSelect');
    if (!mode || !style) return;
    const r = reglagesPioche();
    mode.value = r.mode;
    style.value = r.style;
    mode.addEventListener('change', () => enregistrerReglagesPioche({ mode: mode.value }));
    style.addEventListener('change', () => enregistrerReglagesPioche({ style: style.value }));
  }

  function start() {
    const root = deckRoot();
    if (!root) { setTimeout(start, 120); return; }
    bindEvents();
    brancherReglages();
    observer = new MutationObserver(inspectDeck);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    inspectDeck();
    // Les compteurs ×N des boutons sont réécrits par le HUD à chaque rendu :
    // les piles de cartes suivent.
    const hud = byId('ilyosHudOrganicV2') || byId('gameScreen');
    if (hud) new MutationObserver(planifierPiles).observe(hud, { childList: true, subtree: true, characterData: true });
    planifierPiles();
    window.ILYOS_CARD_CYCLE_V10 = {
      inspect: inspectDeck,
      stop: () => observer?.disconnect(),
      reglages: reglagesPioche,
      regler: enregistrerReglagesPioche,
      detaillee: piocheDetaillee
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();