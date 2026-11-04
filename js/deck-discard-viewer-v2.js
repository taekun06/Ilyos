/* ILYOS — consultation de défausse V11, et de la pioche
   Clic sur la pile DÉFAUSSE => les 3 types d'action glissent vers la gauche.
   Clic sur la PIOCHE => même panneau, pour les cartes qui restent dans le
   paquet (demande de Taekun, 2026-10-16) : le compte par type, jamais l'ordre.
   Lecture seule : aucune carte n'est déplacée ni modifiée. */
(() => {
  'use strict';
  if (window.__ILYOS_DISCARD_VIEWER_V11__) return;
  window.__ILYOS_DISCARD_VIEWER_V11__ = true;

  const byId = id => document.getElementById(id);
  const META = {
    MOVE:  { label: 'DÉPLACER', symbol: '↟' },
    PUSH:  { label: 'POUSSER',  symbol: '➜' },
    MAGIC: { label: 'MAGIE',    symbol: '✦' }
  };

  /* Une visionneuse par pile ; ouvrir l'une referme l'autre. */
  const visionneuses = [];
  function creerVisionneuse(pile) {
    let viewer = null;
    let opened = false;
    let outsideBound = false;
    let positionTimer = 0;

    function parseStoredState() {
      for (const key of ['ilyos-local-session-v22', 'ilyos-online-session-v1']) {
        try {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          const parsed = JSON.parse(raw);
          const candidate = parsed?.state || parsed?.gameState || parsed;
          if (Array.isArray(candidate?.players)) return candidate;
        } catch (_) {}
      }
      return null;
    }

    function currentDiscard() {
      const snapshot = parseStoredState();
      if (!snapshot?.players?.length) return { cards: [], player: null, stale: true };
      let index = Math.max(0, Math.min(snapshot.players.length - 1, Number(snapshot.currentPlayer) || 0));
      /* La pioche et la défausse montrées sont les siennes : pendant le tour
         de l'IA, celles du premier joueur humain plutôt que de l'adversaire
         (le dock garde ses infos, Taekun 2026-11-04). */
      if (snapshot.players[index]?.isAI) {
        const humain = snapshot.players.findIndex(joueur => joueur && !joueur.isAI);
        if (humain >= 0) index = humain;
      }
      const player = snapshot.players[index] || null;
      return {
        cards: Array.isArray(player?.[pile.champ]) ? player[pile.champ] : [],
        player,
        stale: false
      };
    }

    function typeCard(type) {
      const meta = META[type];
      return `<article class="ov2-discard-type-card type-${type.toLowerCase()}" data-discard-type="${type}" aria-label="${meta.label}">
        <small>${meta.label}</small>
        <span class="ov2-discard-type-icon" aria-hidden="true">${meta.symbol}</span>
        <b class="ov2-discard-type-count" data-discard-count="${type}">×0</b>
      </article>`;
    }

    function ensureViewer() {
      if (viewer?.isConnected) return viewer;
      viewer = document.createElement('div');
      viewer.id = pile.viewerId;
      viewer.className = 'ov2-discard-viewer ov2-discard-viewer-hidden';
      viewer.setAttribute('aria-hidden', 'true');
      viewer.innerHTML = `<div class="ov2-discard-strip" role="group" aria-label="${pile.titre}">
        ${typeCard('MOVE')}${typeCard('PUSH')}${typeCard('MAGIC')}
      </div>`;
      viewer.addEventListener('pointerdown', event => event.stopPropagation());
      viewer.addEventListener('click', event => event.stopPropagation());
      document.body.appendChild(viewer);
      return viewer;
    }

    function countsFromDiscard(cards) {
      const counts = { MOVE: 0, PUSH: 0, MAGIC: 0 };
      cards.forEach(card => {
        const type = card?.action;
        if (counts[type] !== undefined) counts[type]++;
      });
      return counts;
    }

    /* Cartes du marché (mode Rotation : Élan, Bélier, Boue…). Leur nom et
       leur type viennent du jeu (window.ILYOS_CARTES_SPECIALES) ; chacune a
       sa propre carte dans le panneau, après les trois types de base. */
    function specialesPresentes(cards) {
      const catalogue = window.ILYOS_CARTES_SPECIALES || {};
      const n = new Map();
      cards.forEach(card => {
        const action = card?.action;
        if (action && !META[action] && catalogue[action]) n.set(action, (n.get(action) || 0) + 1);
      });
      return [...n.entries()].map(([action, count]) => ({ action, count, def: catalogue[action] }));
    }

    function specialeCard({ action, count, def }) {
      const base = META[def.type];
      const classe = def.type ? `type-${def.type.toLowerCase()}` : 'type-boue';
      const nom = String(def.nom || action).toUpperCase().replace(/[<>&"]/g, '');
      return `<article class="ov2-discard-type-card ov2-discard-speciale ${classe}${def.valeur > 1 ? ' is-forte' : ''}" data-discard-speciale="${action}" aria-label="${nom}">
        <small>${nom}</small>
        <span class="ov2-discard-type-icon" aria-hidden="true">${base ? base.symbol : '◆'}${def.valeur > 1 ? `<em>×${def.valeur}</em>` : ''}</span>
        <b class="ov2-discard-type-count">×${count}</b>
      </article>`;
    }

    function render() {
      const root = ensureViewer();
      const { cards, stale } = currentDiscard();
      const counts = countsFromDiscard(cards);
      const visibleTotal = Number(byId(pile.hudId)?.querySelector('.ov2-pile-count')?.textContent || 0) || 0;

      Object.keys(META).forEach(type => {
        const card = root.querySelector(`[data-discard-type="${type}"]`);
        const count = counts[type];
        const countNode = root.querySelector(`[data-discard-count="${type}"]`);
        if (countNode) countNode.textContent = stale && visibleTotal > 0 && !cards.length ? '×–' : `×${count}`;
        card?.classList.toggle('is-empty', count === 0);
      });

      const strip = root.querySelector('.ov2-discard-strip');
      strip?.querySelectorAll('[data-discard-speciale]').forEach(node => node.remove());
      const speciales = specialesPresentes(cards);
      speciales.forEach(speciale => {
        if (!strip) return;
        /* Même habillage que la carte de base de son type (la défausse est
           illustrée par js/hud-islands-reserve-discard-v13.js) : on la copie,
           puis on change le nom et le compte. */
        const modele = speciale.def.type && strip.querySelector(`[data-discard-type="${speciale.def.type}"]`);
        if (!modele) { strip.insertAdjacentHTML('beforeend', specialeCard(speciale)); return; }
        const copie = modele.cloneNode(true);
        const nom = String(speciale.def.nom || speciale.action).toUpperCase();
        copie.removeAttribute('data-discard-type');
        copie.dataset.discardSpeciale = speciale.action;
        copie.classList.remove('is-empty');
        copie.classList.add('ov2-discard-speciale');
        if (speciale.def.valeur > 1) copie.classList.add('is-forte');
        copie.setAttribute('aria-label', nom);
        const titre = copie.querySelector('b:not(.ov2-discard-type-count), small');
        if (titre) titre.textContent = nom;
        const compte = copie.querySelector('.ov2-discard-type-count');
        if (compte) { compte.removeAttribute('data-discard-count'); compte.textContent = `×${speciale.count}`; }
        if (speciale.def.valeur > 1) {
          const badge = document.createElement('em');
          badge.className = 'ov2-discard-badge';
          badge.textContent = `×${speciale.def.valeur}`;
          copie.appendChild(badge);
        }
        strip.appendChild(copie);
      });
      strip?.classList.toggle('has-speciales', speciales.length > 0);

      root.setAttribute('aria-label', stale && visibleTotal > 0
        ? `${pile.nom} : ${visibleTotal} cartes, détail en synchronisation`
        : `${pile.nom} : ${cards.length} carte${cards.length === 1 ? '' : 's'}`);
    }

    function position() {
      const root = ensureViewer();
      const hud = byId(pile.hudId);
      if (!hud || !opened) return;
      if (root.parentElement !== document.body) document.body.appendChild(root);
      const rect = hud.getBoundingClientRect();
      const width = root.offsetWidth || root.getBoundingClientRect().width || 225;
      const gap = 14;
      /* Le panneau s'ouvre AU-DESSUS de la pile, centré sur elle.
         Il s'ouvrait vers la gauche, ce qui était juste tant que la défausse était
         plaquée dans l'angle inférieur droit de la fenêtre. Depuis qu'elle flanque
         le dock (voir placeHudPair dans js/deck-discard-hud-v1.js), la même
         ouverture viendrait recouvrir les boutons d'action. Au-dessus, le ciel est
         libre. `top` désigne le bord BAS du panneau : la couche V11 le remonte par
         translateY(-100%). */
      const left = Math.max(8, Math.min(
        rect.left + rect.width / 2 - width / 2,
        window.innerWidth - width - 8
      ));
      const top = Math.max(8 + gap, rect.top - gap);
      root.style.setProperty('right', 'auto', 'important');
      root.style.setProperty('bottom', 'auto', 'important');
      root.style.setProperty('left', `${left}px`, 'important');
      root.style.setProperty('top', `${top}px`, 'important');
    }

    function settlePosition() {
      cancelAnimationFrame(positionTimer);
      positionTimer = requestAnimationFrame(() => {
        position();
        requestAnimationFrame(position);
      });
      setTimeout(() => { if (opened) position(); }, 120);
    }

    function open() {
      const root = ensureViewer();
      render();
      opened = true;
      root.classList.remove('ov2-discard-viewer-hidden');
      root.setAttribute('aria-hidden', 'false');
      const hud = byId(pile.hudId);
      hud?.setAttribute('aria-expanded', 'true');
      hud?.style.setProperty('opacity', '.98', 'important');
      requestAnimationFrame(() => {
        settlePosition();
        root.classList.add('ov2-discard-viewer-open');
      });
    }

    function close() {
      if (!viewer || !opened) return;
      opened = false;
      viewer.classList.remove('ov2-discard-viewer-open');
      viewer.setAttribute('aria-hidden', 'true');
      const hud = byId(pile.hudId);
      hud?.setAttribute('aria-expanded', 'false');
      hud?.style.setProperty('opacity', '.78', 'important');
      setTimeout(() => {
        if (!opened) viewer?.classList.add('ov2-discard-viewer-hidden');
      }, 180);
    }

    function toggle() {
      if (opened) close();
      else open();
    }

    function bindOutside() {
      if (outsideBound) return;
      outsideBound = true;
      document.addEventListener('pointerdown', event => {
        if (!opened) return;
        if (viewer?.contains(event.target) || byId(pile.hudId)?.contains(event.target)) return;
        close();
      });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && opened) close();
      });
      window.addEventListener('resize', () => { if (opened) settlePosition(); }, { passive: true });
      window.addEventListener('orientationchange', () => { if (opened) settlePosition(); }, { passive: true });
    }

    const api = { open, close, toggle, render, position, bindOutside, ensureViewer };
    visionneuses.push(api);
    const ouvrirSeul = () => { visionneuses.forEach(autre => { if (autre !== api) autre.close(); }); open(); };
    api.open = ouvrirSeul;
    api.toggle = () => { if (opened) close(); else ouvrirSeul(); };
    return api;
  }

  function boot() {
    const defausse = creerVisionneuse({ champ: 'discard', hudId: 'ov2DiscardHud', viewerId: 'ov2DiscardViewer', nom: 'Défausse', titre: 'Cartes en défausse' });
    const pioche = creerVisionneuse({ champ: 'deck', hudId: 'ov2DeckHud', viewerId: 'ov2DeckViewer', nom: 'Pioche', titre: 'Cartes restant dans la pioche' });
    [defausse, pioche].forEach(v => { v.ensureViewer(); v.bindOutside(); });
    window.addEventListener('ilyos:open-discard-viewer', () => defausse.open());
    window.addEventListener('ilyos:toggle-discard-viewer', () => defausse.toggle());
    window.addEventListener('ilyos:toggle-deck-viewer', () => pioche.toggle());
    window.ILYOS_DISCARD_VIEWER = defausse;
    window.ILYOS_DECK_VIEWER = pioche;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();