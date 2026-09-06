/* ILYOS — cycle visuel des cartes V10
   Pure couche d'animation. Aucune règle de jeu modifiée.
   - seulement pendant le tour local
   - les 5 cartes sortent visiblement de PIOCHE face cachée, puis se révèlent
   - éventail ouvert AU-DESSUS de la ligne d'instruction et du dock, jamais dessus
   - séquence bornée à ≈ 1,2 s et interruptible au premier geste du joueur
   - actions xN regroupées en une seule animation
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
    if (!ticket || ticket.skipped) return;
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
          await fly(ghost, from, to, { duration: 500, arc: 48, startScale: .54, endScale: .22 });
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
          await fly(ghost, from, to, { duration: 430, arc: 38, startScale: .54, endScale: .20 });
          ghost.remove();
          pulse(discardTarget(), 'ov2-pile-hit');
          floatCount(discardTarget(), `+${overflow}`);
        }
      }
      await sleep(45);
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

  function start() {
    const root = deckRoot();
    if (!root) { setTimeout(start, 120); return; }
    bindEvents();
    observer = new MutationObserver(inspectDeck);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    inspectDeck();
    window.ILYOS_CARD_CYCLE_V10 = { inspect: inspectDeck, stop: () => observer?.disconnect() };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();