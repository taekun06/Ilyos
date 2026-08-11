    (function () {
      const BUILD = 'V75.1';
      const modeMeta = {
        '1': { title: 'Solo', desc: 'Affrontez une intelligence artificielle.', icon: 'solo' },
        '2': { title: 'Deux joueurs', desc: 'Duel local sur le même écran.', icon: 'duo' },
        '3': { title: 'Trois joueurs', desc: 'Rivalités et alliances locales.', icon: 'trio' },
        '4': { title: 'Quatre joueurs', desc: 'Le grand archipel local.', icon: 'quad' },
        'online': { title: 'Jeu en ligne', desc: 'Créez ou rejoignez un salon.', icon: 'online' }
      };
      const boardMeta = [
        { value: 'classic', title: 'Classique', desc: 'Construction progressive.', kind: 'classic' },
        { value: 'scouts', title: 'Duel des éclaireurs', desc: '4 îles · Construction décisive.', kind: 'scouts' },
        { value: 'open', title: 'Archipels ouverts', desc: '6 îles · Très mobile.', kind: 'open' },
        { value: 'lanes', title: 'Grandes passerelles', desc: '8 îles · Déplacements.', kind: 'lanes' },
        { value: 'spiral', title: 'Spirale des vents', desc: '10 îles · Magie et détours.', kind: 'spiral' },
        { value: 'crossroads', title: 'Carrefours célestes', desc: '10 îles · Tactique.', kind: 'crossroads' },
        { value: 'orbit', title: 'Orbite royale', desc: '10 îles · Offensif.', kind: 'orbit' },
        { value: 'citadels', title: 'Citadelles en mouvement', desc: '12 îles · Grande bataille.', kind: 'citadels' }
      ];
      const difficultyMeta = [
        ['easy', 'Facile', 'Découverte'],
        ['normal', 'Normal', 'Recommandé'],
        ['hard', 'Difficile', 'Expérimenté'],
        ['expert', 'Expert', 'Maîtrise requise']
      ];
      let selectedBoard = 'classic';
      let selectedDifficulty = 'normal';

      function modeIcon(kind) {
        if (kind === 'online') return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16"/></svg>';
        const count = { solo: 1, duo: 2, trio: 3, quad: 4 }[kind] || 1;
        let out = '<svg viewBox="0 0 24 24" aria-hidden="true">';
        const positions = count === 1 ? [[12, 8]] : count === 2 ? [[8, 8], [16, 8]] : count === 3 ? [[6, 9], [12, 6], [18, 9]] : [[7, 7], [17, 7], [7, 16], [17, 16]];
        positions.forEach(([x, y]) => { out += `<circle cx="${x}" cy="${y}" r="2.2"/><path d="M${x - 3} ${y + 6}c.5-3.6 5.5-3.6 6 0"/>`; });
        return out + '</svg>';
      }
      function boardThumb(kind) {
        return '<span class="v64-board-thumb ' + kind + '" aria-hidden="true">' + Array.from({ length: 20 }, () => '<i></i>').join('') + '</span>';
      }
      function nativeSelect(id) { return document.getElementById(id) }
      function applyNativeChoices() {
        const board = nativeSelect('startingBoardSelect');
        if (board) board.value = selectedBoard === 'classic' ? 'classic' : 'symmetric';
        const diff = nativeSelect('aiDifficultySelect');
        if (diff) diff.value = selectedDifficulty;
      }
      function syncModeVisibility() {
        const select = nativeSelect('playerCount');
        const solo = select?.value === '1';
        const online = select?.value === 'online';
        document.querySelector('.v64-difficulty-section')?.toggleAttribute('hidden', !solo);
        document.querySelector('.v64-board-section')?.toggleAttribute('hidden', online);
        const start = nativeSelect('startBtn');
        if (start && !online) start.textContent = 'Jouer';
      }
      function buildSetup() {
        const card = document.querySelector('#setupScreen .setup-card');
        const config = card?.querySelector('.setup-config');
        const actions = card?.querySelector('.setup-actions');
        const logo = card?.querySelector('.logo');
        const subtitle = card?.querySelector('.subtitle');
        const heroGrid = card?.querySelector('.setup-hero-grid');
        const playerSelect = nativeSelect('playerCount');
        if (!card || !config || !actions || !logo || !subtitle || !heroGrid || !playerSelect || card.querySelector('.v64-layout')) return;

        const layout = document.createElement('div'); layout.className = 'v64-layout';
        const hero = document.createElement('section'); hero.className = 'v64-hero-pane';
        const pane = document.createElement('section'); pane.className = 'v64-config-pane';
        const kicker = document.createElement('p'); kicker.className = 'v64-kicker'; kicker.textContent = 'Stratégie · Archipel céleste';
        hero.append(kicker, logo, subtitle, heroGrid);
        const heading = document.createElement('header'); heading.className = 'v64-config-heading'; heading.innerHTML = '<small>Nouvelle partie</small><h2>Préparer l’aventure</h2><p>Choisissez les joueurs, le plateau et la difficulté.</p>';
        pane.append(heading, config, actions); layout.append(hero, pane); card.appendChild(layout);

        const nativeRow = playerSelect.closest('.setup-row'); if (nativeRow) nativeRow.classList.add('v64-native-mode-row');
        const modeSection = document.createElement('section'); modeSection.className = 'v64-mode-section'; modeSection.innerHTML = '<h3 class="v64-section-title">Mode de jeu</h3><div class="v64-mode-grid" role="group" aria-label="Mode de jeu"></div>';
        const modeGrid = modeSection.querySelector('.v64-mode-grid');
        [...playerSelect.options].forEach(option => {
          const meta = modeMeta[option.value] || { title: option.textContent, desc: '', icon: 'solo' };
          const button = document.createElement('button'); button.type = 'button'; button.className = 'v64-mode-card'; button.dataset.value = option.value; button.setAttribute('aria-pressed', String(playerSelect.value === option.value));
          button.innerHTML = '<span class="v64-mode-icon">' + modeIcon(meta.icon) + '</span><strong>' + meta.title + '</strong><small>' + meta.desc + '</small>';
          button.addEventListener('click', () => { playerSelect.value = option.value; playerSelect.dispatchEvent(new Event('change', { bubbles: true })); syncModeCards(); setTimeout(() => { applyNativeChoices(); syncModeVisibility(); }, 0) });
          modeGrid.appendChild(button);
        });
        const syncModeCards = () => modeGrid.querySelectorAll('.v64-mode-card').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.value === playerSelect.value)));
        playerSelect.addEventListener('change', () => { syncModeCards(); syncModeVisibility(); setTimeout(applyNativeChoices, 0) });
        config.prepend(modeSection);

        const options = document.createElement('div'); options.className = 'v64-options-grid';
        const boardSection = document.createElement('section'); boardSection.className = 'v64-board-section'; boardSection.innerHTML = '<h3 class="v64-section-title">Plateau</h3><div class="v64-board-grid" role="group" aria-label="Plateau de départ"></div>';
        const boardGrid = boardSection.querySelector('.v64-board-grid');
        boardMeta.forEach(meta => {
          const button = document.createElement('button'); button.type = 'button'; button.className = 'v64-board-card'; button.dataset.value = meta.value; button.setAttribute('aria-pressed', String(selectedBoard === meta.value)); button.innerHTML = boardThumb(meta.kind) + '<strong>' + meta.title + '</strong><small>' + meta.desc + '</small>';
          button.addEventListener('click', () => { selectedBoard = meta.value; boardGrid.querySelectorAll('button').forEach(node => node.setAttribute('aria-pressed', String(node === button))); applyNativeChoices() }); boardGrid.appendChild(button);
        });
        const difficulty = document.createElement('section'); difficulty.className = 'v64-difficulty-section'; difficulty.innerHTML = '<h3 class="v64-section-title">Difficulté</h3><div class="v64-difficulty-grid" role="group" aria-label="Difficulté de l’ordinateur"></div>';
        const diffGrid = difficulty.querySelector('.v64-difficulty-grid');
        difficultyMeta.forEach(([value, label, hint]) => { const button = document.createElement('button'); button.type = 'button'; button.className = 'v64-difficulty-btn'; button.dataset.value = value; button.setAttribute('aria-pressed', String(value === selectedDifficulty)); button.innerHTML = '<strong>' + label + '</strong><small>' + hint + '</small>'; button.addEventListener('click', () => { selectedDifficulty = value; diffGrid.querySelectorAll('button').forEach(node => node.setAttribute('aria-pressed', String(node === button))); applyNativeChoices() }); diffGrid.appendChild(button) });
        options.append(boardSection, difficulty); modeSection.after(options);

        const tools = document.createElement('details'); tools.className = 'v64-dev-tools'; tools.innerHTML = '<summary>Outils de développement</summary><div><button type="button" class="small-btn" data-v64-diag>Diagnostic Spirale</button><button type="button" class="small-btn" data-v64-auto>Partie automatique</button></div>';
        config.appendChild(tools);
        tools.querySelector('[data-v64-diag]').addEventListener('click', () => window.ILYOS_TEST?.launchSpiral?.());
        tools.querySelector('[data-v64-auto]').addEventListener('click', () => window.ILYOS_API?.launchConfiguredGame?.({ opponent: '2', board: 'spiral', difficulty: selectedDifficulty, autoplay: true }));

        const alt = nativeSelect('altStartBtn'); if (alt) alt.setAttribute('aria-hidden', 'true');
        const test = nativeSelect('ilyosSpiralTestBtn'); if (test) test.setAttribute('aria-hidden', 'true');
        const start = nativeSelect('startBtn');
        if (start) {
          start.textContent = 'Jouer';
          start.addEventListener('click', event => {
            const mode = playerSelect.value;
            if (mode === 'online') return;
            event.preventDefault(); event.stopImmediatePropagation();
            applyNativeChoices();
            const launched = window.ILYOS_API?.launchConfiguredGame?.({ opponent: mode, board: selectedBoard, difficulty: selectedDifficulty, autoplay: false });
            if (!launched) setTimeout(() => start.click(), 0);
          }, true);
        }
        syncModeVisibility(); setTimeout(applyNativeChoices, 0);
      }
      function buildSetupCards() {
        const overlay = nativeSelect('symmetricSetupOverlay'); const select = nativeSelect('symmetricSetupSelect'); const content = overlay?.querySelector('.symmetric-board-content');
        if (!overlay || !select || !content || overlay.querySelector('.v64-setup-grid')) return;
        const grid = document.createElement('div'); grid.className = 'v64-setup-grid'; grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', 'Configurations du duel symétrique'); content.before(grid);
        const rebuild = () => { grid.innerHTML = '';[...select.options].forEach((option, index) => { const button = document.createElement('button'); button.type = 'button'; button.className = 'v64-setup-card'; button.dataset.value = option.value; button.setAttribute('aria-pressed', String(select.value === option.value)); const parts = option.textContent.split('—'); button.innerHTML = '<strong>' + parts[0].trim() + '</strong><small>' + (parts[1]?.trim() || ['Rapide et accessible', 'Très mobile', 'Contrôle territorial'][index % 3]) + '</small>'; button.addEventListener('click', () => { select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true })); sync() }); grid.appendChild(button) }); };
        const sync = () => grid.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.value === select.value)));
        select.addEventListener('change', sync); new MutationObserver(rebuild).observe(select, { childList: true }); rebuild();
      }
      function improveRules() {
        const modal = nativeSelect('rulesModal'); const card = modal?.querySelector('.modal-card'); const list = card?.querySelector('ol'); if (!card || !list || card.querySelector('.v64-rules-nav')) return;
        card.classList.add('v64-rules-card');
        const sections = [['Objectif', 0, 2], ['Tour', 2, 5], ['Déplacement', 5, 9], ['Poussée', 9, 12], ['Magie', 12, 14], ['Couronnes', 14, 18], ['Victoire', 18, 99], ['Tout', 0, 99]];
        const nav = document.createElement('nav'); nav.className = 'v64-rules-nav'; nav.setAttribute('aria-label', 'Sections des règles'); card.insertBefore(nav, list); const items = [...list.children];
        const show = (start, end, button) => { items.forEach((item, index) => item.hidden = !(index >= start && index < end)); nav.querySelectorAll('button').forEach(node => node.classList.toggle('active', node === button)); list.scrollTop = 0 };
        sections.forEach(([label, start, end], index) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.addEventListener('click', () => show(start, end, button)); nav.appendChild(button); if (index === 0) show(start, end, button) });
      }
      function updateVisualState() {
        const game = nativeSelect('gameScreen'); const phase = nativeSelect('phaseLabel')?.textContent?.toLowerCase() || ''; if (!game) return;
        const kind = phase.includes('pouss') ? 'push' : phase.includes('mag') || phase.includes('rotation') ? 'magic' : phase.includes('déplac') || phase.includes('gardien') ? 'move' : phase.includes('île') || phase.includes('invocation') ? 'build' : 'neutral'; game.dataset.context = kind;
        document.querySelectorAll('.portrait').forEach(node => node.setAttribute('aria-label', node.id === 'activePortrait' ? 'Gardien du joueur actif' : 'Gardien'));
      }
      function addGameBuildBadge() {
        const top = document.querySelector('#gameScreen .topbar'); if (!top || top.querySelector('.v64-game-build')) return; const badge = document.createElement('span'); badge.className = 'v64-game-build sr-only'; badge.textContent = 'Version ' + BUILD; top.appendChild(badge);
      }
      function boot() {
        window.ILYOS_BUILD = BUILD; document.title = 'ILYOS V75.1 — Stable Netlify';
        const badge = nativeSelect('ilyosBuildBadge'); if (badge) badge.textContent = 'VERSION V75.1';
        buildSetup(); buildSetupCards(); improveRules(); addGameBuildBadge(); updateVisualState();
        const game = nativeSelect('gameScreen'); if (game) new MutationObserver(updateVisualState).observe(game, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] });
        document.addEventListener('keydown', event => { if (event.key === 'Escape') { nativeSelect('rulesModal')?.classList.add('hidden'); nativeSelect('soundMenu')?.classList.add('hidden') } });
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
    })();
